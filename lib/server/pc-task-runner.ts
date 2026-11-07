import "server-only";
import { spawn, execFile, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { redactDeep } from "@/lib/secret-patterns";
import { stopOf, type CliEvent } from "./cli-agents";

/**
 * Who runs a bot task on this PC (Settings, Bot tasks on this PC):
 * - "claude": the owner's own Claude plan, through the official Claude Code CLI they signed in to in
 *   AI subscriptions (local-subscriptions.ts). Bops runs `claude -p` in the task's workspace folder, one
 *   run per turn, with only Bops' browser tools and an approve tool that asks the owner in Bops.
 * - "openai": the OpenAI Agents API with `codex exec-server` as its executor (local.ts startExecutor), on
 *   OPENAI_EXECUTOR_API_KEY (or Bops Cloud's key when signed in to Bops Cloud).
 * Unset: the signed in Claude plan when there is one, else the OpenAI key, else a message saying what to do.
 */
export type PcRunner = "claude" | "openai";
export type PcRunnerPick = { runner: PcRunner; chosen: boolean } | { runner: null; error: string };
export type ClaudeSignIn = "connected" | "signed-out" | "connecting" | "missing" | "error";

/** Words the task says when it can't start or stops. No dashes: they're shown as they are. */
export const PC_WORDS = {
  signIn: "Sign in to Claude in Settings, AI subscriptions, This PC, then try again.",
  noClaude: "Claude Code isn't installed on this PC. Install it, sign in to Claude in Settings, AI subscriptions, This PC, then try again.",
  addKey: "Add an OpenAI environment key in Settings, Bot tasks on this PC, then try again. Make it in OpenAI Platform under Agents, Environments, Keys (Create), in the same project as your OPENAI_API_KEY. An ordinary API key won't work.",
  none: "No AI is set up for bot tasks on this PC. Sign in to Claude in Settings, AI subscriptions, This PC (recommended), or add an OpenAI environment key in Settings, Bot tasks on this PC.",
  limit: "Your Claude plan reached its usage limit. Try again once it resets, or switch Bot tasks on this PC to OpenAI key.",
  down: "Claude isn't answering right now. Try again in a few minutes.",
  model: "Your Claude plan can't use the model Claude Code picked. Check Claude Code's model setting, then try again.",
  openaiRejected: "OpenAI turned down the key for bot tasks on this PC. It must be an environment key made in OpenAI Platform under Agents, Environments, Keys (Create), in the same project as your OPENAI_API_KEY, and that project needs credit. An ordinary API key is turned down. Or switch to Your Claude plan (signed in).",
  update: "Claude Code on this PC is too old for bot tasks. Update it (run claude update), then try again.",
  noScreen: "On Your Claude plan, bot tasks on this PC can use files and the bot's own Chrome. They can't control other apps on this PC yet: for that, switch Bot tasks on this PC to OpenAI key.",
} as const;

/**
 * The runner for one task. `choice`: the owner's setting (unset is the default). `claude`: the CLI's sign in
 * as local-subscriptions.ts reports it. `openaiKey`: an executor key is there (OPENAI_EXECUTOR_API_KEY, or
 * Bops Cloud's). `local`: this install may run tasks on the owner's own CLI sign in at all (self hosted, not
 * shared): when it may not, it's the OpenAI path as before. A choice is never quietly swapped for the other.
 */
export function pickPcRunner(o: { choice?: PcRunner; claude: ClaudeSignIn; openaiKey: boolean; local: boolean }): PcRunnerPick {
  if (!o.local) return { runner: "openai", chosen: false };
  if (o.choice === "claude") return o.claude === "connected" ? { runner: "claude", chosen: true } : { runner: null, error: o.claude === "missing" ? PC_WORDS.noClaude : PC_WORDS.signIn };
  if (o.choice === "openai") return o.openaiKey ? { runner: "openai", chosen: true } : { runner: null, error: PC_WORDS.addKey };
  if (o.claude === "connected") return { runner: "claude", chosen: false };
  if (o.openaiKey) return { runner: "openai", chosen: false };
  return { runner: null, error: PC_WORDS.none };
}

/** What an executor failure (executor-lifecycle.ts) says to the owner, when it's one they can fix. */
export function executorWords(message: string) {
  return /authentication rejected/.test(message) ? PC_WORDS.openaiRejected : message;
}

/* ---------------- The setting, and the OpenAI key ---------------- */

/** The setting's file: this PC's and the signed in user's (beside full-access, full-access.ts). */
export function readPcRunnerChoice(file: string): PcRunner | undefined {
  try {
    const v = readFileSync(/*turbopackIgnore: true*/ file, "utf8").trim();
    return v === "claude" || v === "openai" ? v : undefined;
  } catch {
    return undefined;
  }
}
export function writePcRunnerChoice(file: string, choice: PcRunner | null) {
  if (!choice) return rmSync(/*turbopackIgnore: true*/ file, { force: true });
  mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ file, `${choice}\n`, { mode: 0o600 });
}

/** The only key this path writes. */
export const EXECUTOR_KEY = "OPENAI_EXECUTOR_API_KEY";
/**
 * An OpenAI environment key's shape, loosely (its prefix isn't assumed): key characters only, nothing that could end
 * a line or start another setting. Whether it can connect an environment is only known when a task runs.
 */
export const looksLikeOpenAiKey = (v: string) => /^[A-Za-z0-9._-]{20,400}$/.test(v);
/** How a saved key shows: never the key, only that it's there and its last four characters. */
export const maskKey = (v: string | undefined) => (v ? `ends in ${v.slice(-4)}` : "");

/**
 * Set (or with "" remove) OPENAI_EXECUTOR_API_KEY in this PC's .env.local, the file Bops reads its keys from
 * as it starts, and in this server at once (cloud.ts executorKey reads it at each task), so no restart is
 * needed. Every other line stays as it was. Written to a new file and moved over the old one, owner only.
 */
export function saveExecutorKey(file: string, value: string, env: NodeJS.ProcessEnv = process.env) {
  if (value && !looksLikeOpenAiKey(value)) throw new Error("That doesn't look like an OpenAI key. Paste the whole environment key, with no spaces.");
  let lines: string[] = [];
  try {
    lines = readFileSync(/*turbopackIgnore: true*/ file, "utf8").split(/\r?\n/);
  } catch {
    /* no file yet */
  }
  const kept = lines.filter((l) => !new RegExp(`^\\s*(?:export\\s+)?${EXECUTOR_KEY}\\s*=`).test(l));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  if (value) kept.push(`${EXECUTOR_KEY}=${value}`);
  mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(/*turbopackIgnore: true*/ tmp, kept.length ? `${kept.join("\n")}\n` : "", { mode: 0o600 });
    renameSync(/*turbopackIgnore: true*/ tmp, file);
  } finally {
    // A rename that failed leaves no copy of the key behind.
    rmSync(/*turbopackIgnore: true*/ tmp, { force: true });
  }
  if (value) env[EXECUTOR_KEY] = value;
  else delete env[EXECUTOR_KEY];
}

/* ---------------- Claude Code for one task ---------------- */

/**
 * Browser tools that only look at the page already open: they run without asking. Going to a page (navigate, a new
 * tab) asks through the approve tool, which lets an origin this task was already allowed through without a card
 * (pcDecision). A click, typing, a form, a download or an upload always asks.
 */
export const BROWSER_LOOK_TOOLS = ["browser_snapshot", "browser_find", "browser_wait_for", "browser_take_screenshot", "browser_console_messages", "browser_hover", "browser_navigate_back"];
/** Claude Code's own tools a task may have at all (--tools): anything else it has (helpers, worktrees, cron, skills) isn't there. */
export const CLAUDE_TOOLS = ["Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "Bash", "WebSearch", "WebFetch", "TodoWrite"];
/**
 * What Claude Code may do by itself: web search and the looking browser tools. Everything else goes through the
 * approve tool: a file tool is let through there only when its target's real path (junctions and links followed)
 * is inside the task's workspace, a write outside it is refused, a read outside it asks the owner; the shell,
 * WebFetch and going to a new site ask the owner. A no, or no answer, is a no.
 */
export const CLAUDE_AUTO_TOOLS = ["WebSearch", ...BROWSER_LOOK_TOOLS.map((t) => `mcp__browser__${t}`)];
/**
 * Never, even with a yes: running a page's own code, and Bops' approve tool called by the model itself (listing it
 * here hides it from the model; Claude Code still asks through it as its --permission-prompt-tool, checked with the
 * real CLI 2.1.318).
 */
export const CLAUDE_NEVER_TOOLS = ["mcp__browser__browser_run_code_unsafe", "mcp__browser__browser_evaluate", "mcp__bops__approve"];
/** The approve tool Claude Code asks through (vm/pc-approve-mcp.mjs, as the "bops" server). */
export const APPROVE_TOOL = "mcp__bops__approve";
/**
 * The only settings Claude Code runs with (--settings): no hooks, and the same rules again as permission rules, so
 * nothing the user's own settings or a plugin could add applies (no setting files are read: --setting-sources "").
 */
export const CLAUDE_SETTINGS = {
  disableAllHooks: true,
  enableAllProjectMcpServers: false,
  permissions: {
    defaultMode: "default",
    allow: CLAUDE_AUTO_TOOLS,
    // Read, Glob and Grep too: Claude Code lets them run by itself in its folder, and they go through pcDecision's real path check instead.
    ask: ["Bash", "WebFetch", "Read", "Edit", "MultiEdit", "Write", "Glob", "Grep"],
    deny: CLAUDE_NEVER_TOOLS,
  },
};
/** The flags the CLI must know for a task to run on it safely; one that doesn't (an older Claude Code) isn't used. */
export const REQUIRED_FLAGS = ["--restricted", "--setting-sources", "--settings", "--tools", "--permission-prompt-tool", "--strict-mcp-config", "--disallowedTools"];
/**
 * The oldest Claude Code a task may run on: the release these flags and their --settings shape were checked
 * against by hand (2.1.318). Not exact — the CLI updates itself, and anything newer is welcome — but a task
 * never runs on something older than what its safety flags were proven on.
 */
export const MIN_CLAUDE_VERSION = [2, 1, 318];

/** A version string's numbers, where 2.1.318 (and 2.1.318-beta.1) is [2, 1, 318]. */
const versionNumbers = (text: string): number[] => {
  const got = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return got ? [Number(got[1]), Number(got[2]), Number(got[3])] : [];
};
/** Lexicographic: the first part where they differ decides ([3,0,0] > [2,1,318]). */
const atLeast = (version: number[], floor: number[]) => {
  if (version.length !== floor.length) return false;
  for (let i = 0; i < floor.length; i++) {
    if (version[i] !== floor[i]) return version[i] > floor[i];
  }
  return true;
};

const helpChecked = new Map<string, boolean>();
/** Whether this claude is at least MIN_CLAUDE_VERSION and knows every flag in REQUIRED_FLAGS (its --version and
 *  --help, once per binary and its change): each flag as its own word in the help, not a substring of another
 *  flag's name (`--tools` isn't proved by `--toolsets`). */
export function claudeSupportsTasks(claude: string, env: NodeJS.ProcessEnv): boolean {
  let stamp = claude;
  try {
    stamp = `${claude}:${statSync(/*turbopackIgnore: true*/ claude).mtimeMs}`;
  } catch {
    return false;
  }
  const known = helpChecked.get(stamp);
  if (known !== undefined) return known;
  let ok = false;
  try {
    const run = (args: string[]) => execFileSync(claude, args, { env, encoding: "utf8", timeout: 15_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const version = versionNumbers(run(["--version"]));
    if (!atLeast(version, MIN_CLAUDE_VERSION)) throw new Error(`Claude Code ${version.join(".") || "?"} is older than ${MIN_CLAUDE_VERSION.join(".")}`);
    const help = run(["--help"]);
    const words = new Set(help.split(/\s+/).map((w) => w.replace(/^[[("'{]+/, "").replace(/[\])}"'`,.;:]+$/, "")));
    ok = REQUIRED_FLAGS.every((f) => words.has(f));
  } catch {
    ok = false;
  }
  helpChecked.set(stamp, ok);
  return ok;
}

/**
 * The command for one turn: `claude -p` reading its prompt from stdin, its events as stream-json, in the task's
 * workspace folder. --restricted, --setting-sources "" and --settings: no user, project or local settings file is
 * read (so nothing there can allow a tool, add a hook or a plugin, or set a key in its environment), only these
 * settings; --tools: only the tools named; only Bops' MCP servers, Bops' briefing after its own, the permission flags.
 * `resume`: its session from this run's earlier turn. The environment is the allowlist local-subscriptions.ts signs
 * in with, and nothing named like a key or token: it runs on the signed in plan alone.
 */
export function claudeTaskCommand(o: { claude: string; env: NodeJS.ProcessEnv; workspace: string; mcpConfig: string; promptFile: string; session: string; resume: boolean }) {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--restricted",
    "--setting-sources", "",
    "--settings", JSON.stringify(CLAUDE_SETTINGS),
    "--tools", CLAUDE_TOOLS.join(","),
    "--disable-slash-commands",
    "--permission-mode", "default",
    "--strict-mcp-config",
    "--mcp-config", o.mcpConfig,
    "--append-system-prompt-file", o.promptFile,
    "--allowedTools", CLAUDE_AUTO_TOOLS.join(","),
    "--disallowedTools", CLAUDE_NEVER_TOOLS.join(","),
    "--permission-prompt-tool", APPROVE_TOOL,
    ...(o.resume ? ["--resume", o.session] : ["--session-id", o.session]),
  ];
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(o.env)) if (v !== undefined && !/KEY|TOKEN|SECRET|PASSWORD|^ANTHROPIC_|^CLAUDE_CODE_/i.test(k)) env[k] = v;
  return { file: o.claude, args, cwd: o.workspace, env };
}

/* ---------------- What the approve tool decides before asking the owner ---------------- */

/** One running task on Claude Code, as its approve path knows it: its workspace, and the sites the owner allowed it. */
export type PcThread = { workspace: string; origins: Set<string>; note: (text: string) => void };

const FILE_TOOLS: Record<string, { key: string; writes: boolean }> = {
  Read: { key: "file_path", writes: false },
  Glob: { key: "path", writes: false },
  Grep: { key: "path", writes: false },
  Edit: { key: "file_path", writes: true },
  MultiEdit: { key: "file_path", writes: true },
  Write: { key: "file_path", writes: true },
  NotebookEdit: { key: "notebook_path", writes: true },
};

const same = (a: string) => (process.platform === "win32" ? a.toLowerCase() : a);
/**
 * Whether `target` (as a file tool named it, relative to the workspace or not) really is inside `workspace`: its
 * nearest folder that exists, with every link and junction followed (realpath), then the rest of its path, which
 * doesn't exist yet and so can't be a link. Anything that can't be checked is outside.
 */
export function insideWorkspace(workspace: string, target: string): boolean {
  try {
    const root = realpathSync.native(/*turbopackIgnore: true*/ workspace);
    let at = resolve(root, target);
    const rest: string[] = [];
    while (!existsSync(/*turbopackIgnore: true*/ at)) {
      const up = dirname(at);
      if (up === at) return false;
      rest.unshift(basename(at));
      at = up;
    }
    const real = join(realpathSync.native(/*turbopackIgnore: true*/ at), ...rest);
    const rel = relative(same(root), same(real));
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  } catch {
    return false;
  }
}

const originOf = (u: unknown) => {
  try {
    const url = new URL(String(u));
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
};
/** The site a tool would go to: WebFetch's url, the browser's navigate (or a new tab with one). */
export const siteOf = (tool: string, input: Record<string, unknown>) =>
  tool === "WebFetch" || tool === "mcp__browser__browser_navigate" || tool === "mcp__browser__browser_tabs" ? originOf(input.url) : undefined;

/**
 * Glob syntax that can expand to more than its words say: brace lists (`{..,x}/secret*` is `../secret*`; `{.}{.}`
 * and `.{.}` say it without ever spelling `..`) and extglob groups (`@(..)`, `!(..)`, `+(..)`, `*(..)`, `?(..)`).
 * None of it is read as text: a pattern with any of it asks, whatever it seems to say.
 */
const GLOB_CONSTRUCT = /[{}]|\(@|\(!|\(\+|\(\*|\(\?/;

/**
 * Whether a glob pattern stays where it was put (Glob's `pattern`, which says what to find, and Grep's `glob`,
 * which filters the files searched): no `..` segment and no absolute path, either of which would walk the search
 * out of the folder the tool was given, and no brace list or extglob group at all (what those expand to can't be
 * read from the text, so they always ask). Nothing to check counts as staying put (the path itself is still
 * checked).
 */
export const patternStaysPut = (pattern: unknown): boolean => {
  if (typeof pattern !== "string" || !pattern) return true;
  const p = pattern.replace(/\\/g, "/");
  if (p.startsWith("/") || p.startsWith("~") || /^[A-Za-z]:/.test(p)) return false;
  if (GLOB_CONSTRUCT.test(p)) return false;
  return !p.split("/").includes("..");
};

/**
 * What the approve path does for a task's tool before any card: "allow" (a file inside its workspace, a site the
 * owner already allowed in this task), "deny" with why (a write outside its workspace, a site that isn't a web
 * page), or "ask" the owner.
 */
export function pcDecision(t: Pick<PcThread, "workspace" | "origins">, tool: string, input: Record<string, unknown>): { behavior: "allow" } | { behavior: "deny"; message: string } | { behavior: "ask" } {
  const file = FILE_TOOLS[tool];
  if (file) {
    // A search whose pattern walks out of the folder it was given is a read outside it: ask, whichever folder
    // the tool's own path argument named.
    if ((tool === "Glob" || tool === "Grep") && !(patternStaysPut(input.pattern) && patternStaysPut(input.glob))) return { behavior: "ask" };
    const target = typeof input[file.key] === "string" && input[file.key] ? String(input[file.key]) : ".";
    if (insideWorkspace(t.workspace, target)) return { behavior: "allow" };
    return file.writes ? { behavior: "deny", message: "Files outside this task's folder can't be changed. Keep your work in your working folder." } : { behavior: "ask" };
  }
  if (tool === "WebFetch" || tool === "mcp__browser__browser_navigate") {
    const site = siteOf(tool, input);
    if (!site) return { behavior: "deny", message: "Only web pages (http or https) can be opened." };
    return t.origins.has(site) ? { behavior: "allow" } : { behavior: "ask" };
  }
  if (tool === "mcp__browser__browser_tabs") {
    const site = siteOf(tool, input);
    if (input.action !== "new" && !site) return { behavior: "allow" };
    return site && t.origins.has(site) ? { behavior: "allow" } : { behavior: "ask" };
  }
  return { behavior: "ask" };
}

/** The MCP servers a task's Claude Code has: Bops' browser tools for the bot's Chrome, and the approve tool. */
export function claudeMcpConfig(o: { browser: { command: string; args: string[] }; nodeEnv?: Record<string, string>; approveScript: string; node: string; approve: { url: string; session: string; key: string } }) {
  return {
    mcpServers: {
      browser: { type: "stdio", command: o.browser.command, args: o.browser.args, env: { ...(o.nodeEnv ?? {}) } },
      bops: {
        type: "stdio",
        command: o.node,
        args: [o.approveScript],
        env: { ...(o.nodeEnv ?? {}), BOPS_APPROVE_URL: o.approve.url, BOPS_APPROVE_SESSION: o.approve.session, BOPS_APPROVE_KEY: o.approve.key },
      },
    },
  };
}

/** A turn that didn't finish, in words the owner can act on (never the CLI's own output). */
export class PcTaskError extends Error {}
export function claudeFailure(text: string): string {
  const why = stopOf(text);
  if (why === "auth") return PC_WORDS.signIn;
  if (why === "limit") return PC_WORDS.limit;
  if (why === "down") return PC_WORDS.down;
  if (why === "model") return PC_WORDS.model;
  return "Claude Code stopped before it finished this. Try again, or switch Bot tasks on this PC to OpenAI key.";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * On Windows, the turn runs through the launcher (vm/win-job-launcher.cjs): the runner spawns the launcher with
 * the CLI's command, the sitter (vm/win-job-sitter.ps1) puts the LAUNCHER in the job and writes the go file, and
 * only then does the launcher run the CLI as its own child with inherited stdio - so the CLI and everything it
 * ever forks inherit the job from the launcher, with no window after the CLI starts in which a fork escapes. The
 * go file and its wait cap live in the environment the launcher reads; the sitter's compiled assembly is cached
 * per source hash, so it assigns within a moment (the first run on a machine pays one compile). A sitter that
 * can't run says why in its log; the launcher then starts the CLI anyway once the wait is up, and the turn's
 * processes are ended by stopClaude's taskkill of the whole tree, as before the job existed.
 */
function windowsJobTurn(cmd: { file: string; args: string[]; env: NodeJS.ProcessEnv }): { file: string; args: string[]; env: NodeJS.ProcessEnv; started: (launcherPid: number) => void } | null {
  if (process.platform !== "win32") return null;
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  // The install dir as the packaged app knows it (BOPS_SERVER_JS, desktop/main.cjs), else where the repo runs.
  const installDir = process.env.BOPS_SERVER_JS ? dirname(process.env.BOPS_SERVER_JS) : process.cwd();
  const sitterScript = join(installDir, "vm", "win-job-sitter.ps1");
  const launcher = join(installDir, "vm", "win-job-launcher.cjs");
  const goFile = join(process.env.TEMP ?? ".", `bops-job-go-${process.pid}-${Date.now()}`);
  return {
    file: process.execPath,
    args: [launcher, cmd.file, ...cmd.args],
    // The launcher reads the go file and its wait cap from its environment; everything else is the
    // turn's own (the two BOPS_JOB_ names reach the CLI too, and say nothing it can use).
    env: { ...cmd.env, BOPS_JOB_GO: goFile, BOPS_JOB_WAIT_MS: "3000" },
    started: (launcherPid: number) => {
      try {
        const sitter = spawn(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", sitterScript, "-Child", String(launcherPid), "-Parent", String(process.pid), "-GoFile", goFile], {
          stdio: "ignore",
          windowsHide: true,
          detached: true,
        });
        // Said, never swallowed: a sitter that couldn't start or couldn't hold the job means this turn's
        // processes are ended by the tree stop (taskkill) alone. The sitter's own file says which step gave.
        sitter.once("error", (e: Error) => console.warn(`[pc-task] the job sitter couldn't start (${e.message}); the turn's tree stop ends its processes`));
        sitter.once("exit", (code: number | null) => {
          rmSync(/*turbopackIgnore: true*/ goFile, { force: true });
          if (code !== 0 && code !== null) console.warn(`[pc-task] the job sitter left early (exit ${code}); the turn's tree stop ends its processes`);
        });
        sitter.unref();
      } catch (e) {
        console.warn(`[pc-task] the job sitter couldn't start (${(e as Error).message}); the turn's tree stop ends its processes`);
      }
    },
  };
}
/** Whether any process of a POSIX process group is still there. */
const groupAlive = (pid: number) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};
const exited = (child: ChildProcess) => new Promise<void>((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once("exit", () => r())));

/**
 * Stop a turn's Claude Code and whatever it started (its MCP servers, what its shell ran), and resolve only once
 * they're gone: on Windows its whole tree (taskkill /T /F, finished, then Claude Code's own exit; the turn's Job
 * Object, startJobSitter, is the backstop that ends them anyway if Bops goes down first); elsewhere its
 * process group (spawned detached), SIGTERM, then SIGKILL after `graceMs`, until no process of the group is left.
 * Resolves false when something was still there after all that, so the caller says so rather than going on.
 */
export async function stopClaude(child: ChildProcess, graceMs = 5000): Promise<boolean> {
  const pid = child.pid;
  if (!pid) return true;
  if (process.platform === "win32") {
    if (child.exitCode === null && child.signalCode === null)
      await new Promise<void>((r) => execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => r()));
    return Promise.race([exited(child).then(() => true), sleep(graceMs + 5000).then(() => false)]);
  }
  const signal = (sig: NodeJS.Signals) => {
    try {
      process.kill(-pid, sig);
    } catch {
      /* none left */
    }
  };
  if (!groupAlive(pid)) return true;
  signal("SIGTERM");
  for (let waited = 0; waited < graceMs && groupAlive(pid); waited += 50) await sleep(50);
  if (groupAlive(pid)) signal("SIGKILL");
  for (let waited = 0; waited < 5000 && groupAlive(pid); waited += 50) await sleep(50);
  await Promise.race([exited(child), sleep(1000)]);
  return !groupAlive(pid);
}

/** The most a line of Claude Code's output may be, and how long a turn may run at all. */
const LINE_MOST = 4 * 1024 * 1024;

/**
 * One turn on Claude Code: `input` in on stdin, each event out (`parse`: cli-agents.ts claudeDriver's, so its
 * steps read as a cloud brain's do) as it comes, decoded as a stream (a character split across two reads stays
 * whole) and redacted first. It settles only once Claude Code and everything it started are gone (stopClaude),
 * so nothing of it outlives the turn into the task's cleanup or the next task. Resolves with its answer only for
 * a successful result AND a clean exit (code 0); otherwise a PcTaskError in words. Stop (`signal`) ends it.
 */
export function runClaudeTurn(o: {
  cmd: { file: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv };
  input: string;
  parse: (e: Record<string, unknown>) => CliEvent[];
  onEvent: (e: CliEvent) => void;
  /** The tools a turn wasn't let use (its result's permission_denials), by name, for the thread to say. */
  onDenied?: (tools: string[]) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** How long Stop waits after SIGTERM before SIGKILL (POSIX). */
  graceMs?: number;
}): Promise<{ text: string; session?: string }> {
  return new Promise((resolve, reject) => {
    if (o.signal?.aborted) return reject(new PcTaskError("Stopped by you"));
    if (!existsSync(o.cmd.cwd)) return reject(new PcTaskError("The task's folder on this PC is missing. Try again."));
    let child: ChildProcess;
    // Windows: through the launcher, so the whole turn sits in the job before the CLI starts (windowsJobTurn).
    const jobTurn = windowsJobTurn(o.cmd);
    try {
      child = spawn(jobTurn?.file ?? o.cmd.file, jobTurn?.args ?? o.cmd.args, { cwd: o.cmd.cwd, env: jobTurn?.env ?? o.cmd.env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      return reject(new PcTaskError(PC_WORDS.noClaude));
    }
    if (jobTurn && child.pid) jobTurn.started(child.pid);
    const out = new StringDecoder("utf8");
    const err = new StringDecoder("utf8");
    let buf = "";
    let errTail = "";
    let said = "";
    let session: string | undefined;
    let result: { ok: boolean; text?: string } | undefined;
    // Why it's ending before its own end (Stop, too long, couldn't start), once that's known.
    let cut: Error | undefined;
    let settling = false;
    const settle = async (code: number | null, sig: NodeJS.Signals | null) => {
      if (settling) return;
      settling = true;
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", abort);
      // Whatever it left running (an MCP server, a command its shell started) goes too, before the turn is over.
      const gone = await stopClaude(child, o.graceMs);
      if (!gone) return reject(new PcTaskError("Claude Code didn't stop on this PC. Restart Bops before the next task."));
      if (cut) return reject(cut);
      if (result?.ok && code === 0 && !sig) return resolve({ text: (result.text || said).trim(), session });
      if (result?.ok) return reject(new PcTaskError("Claude Code ended with an error after it answered, so this may not be finished. Try again."));
      reject(new PcTaskError(claudeFailure(result?.text ?? errTail)));
    };
    const end = (why: Error) => {
      cut ??= why;
      void settle(null, null);
    };
    const abort = () => end(new PcTaskError("Stopped by you"));
    o.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => end(new PcTaskError("Claude Code took too long on this, so it was stopped. Try again with a smaller task.")), o.timeoutMs ?? 60 * 60_000);
    timer.unref?.();
    const line = (raw: string) => {
      if (!raw.trim()) return;
      let event: Record<string, unknown>;
      try {
        event = redactDeep(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        return;
      }
      if (event.type === "result" && Array.isArray(event.permission_denials) && event.permission_denials.length)
        o.onDenied?.([...new Set(event.permission_denials.map((d) => String((d as { tool_name?: unknown })?.tool_name ?? "a tool").slice(0, 80)))]);
      for (const ev of o.parse(event)) {
        if (ev.type === "started" && ev.session) session = ev.session;
        if (ev.type === "text" && !ev.parent) said = ev.text;
        if (ev.type === "result") result = { ok: ev.ok, text: ev.text };
        o.onEvent(ev);
      }
    };
    const take = (text: string) => {
      buf += text;
      if (buf.length > LINE_MOST) buf = buf.slice(-LINE_MOST);
      let at: number;
      while ((at = buf.indexOf("\n")) >= 0) {
        line(buf.slice(0, at));
        buf = buf.slice(at + 1);
      }
    };
    child.stdout!.on("data", (d: Buffer) => take(out.write(d)));
    // Its errors are only read for why it stopped (a sign in, a limit): never shown or logged.
    child.stderr!.on("data", (d: Buffer) => void (errTail = (errTail + err.write(d)).slice(-4096)));
    child.once("error", () => end(new PcTaskError(PC_WORDS.noClaude)));
    child.once("close", (code: number | null, sig: NodeJS.Signals | null) => {
      take(out.end());
      line(buf);
      buf = "";
      void settle(code, sig);
    });
    child.stdin!.on("error", () => {});
    child.stdin!.end(o.input);
  });
}

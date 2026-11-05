import "server-only";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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
  addKey: "Add an OpenAI key in Settings, Bot tasks on this PC, then try again.",
  none: "No AI is set up for bot tasks on this PC. Sign in to Claude in Settings, AI subscriptions, This PC, or add an OpenAI key in Settings, Bot tasks on this PC.",
  limit: "Your Claude plan reached its usage limit. Try again once it resets, or switch Bot tasks on this PC to OpenAI key.",
  down: "Claude isn't answering right now. Try again in a few minutes.",
  model: "Your Claude plan can't use the model Claude Code picked. Check Claude Code's model setting, then try again.",
  openaiRejected: "OpenAI turned down the key for bot tasks on this PC. Check the OpenAI key in Settings, Bot tasks on this PC, and add credit to your OpenAI account, or switch to Your Claude plan (signed in).",
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
/** An OpenAI key's shape: sk- then key characters, nothing that could end a line or start another setting. */
export const looksLikeOpenAiKey = (v: string) => /^sk-[A-Za-z0-9_-]{20,300}$/.test(v);
/** How a saved key shows: never the key, only that it's there and its last four characters. */
export const maskKey = (v: string | undefined) => (v ? `sk-...${v.slice(-4)}` : "");

/**
 * Set (or with "" remove) OPENAI_EXECUTOR_API_KEY in this PC's .env.local, the file Bops reads its keys from
 * as it starts, and in this server at once (cloud.ts executorKey reads it at each task), so no restart is
 * needed. Every other line stays as it was. Written to a new file and moved over the old one, owner only.
 */
export function saveExecutorKey(file: string, value: string, env: NodeJS.ProcessEnv = process.env) {
  if (value && !looksLikeOpenAiKey(value)) throw new Error("That doesn't look like an OpenAI key. It starts with sk- and has no spaces.");
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
  writeFileSync(/*turbopackIgnore: true*/ tmp, kept.length ? `${kept.join("\n")}\n` : "", { mode: 0o600 });
  renameSync(/*turbopackIgnore: true*/ tmp, file);
  if (value) env[EXECUTOR_KEY] = value;
  else delete env[EXECUTOR_KEY];
}

/* ---------------- Claude Code for one task ---------------- */

/** Browser tools that only look or move between pages: they run without asking. */
export const BROWSER_LOOK_TOOLS = ["browser_navigate", "browser_navigate_back", "browser_snapshot", "browser_find", "browser_tabs", "browser_wait_for", "browser_take_screenshot", "browser_console_messages", "browser_hover"];
/**
 * What Claude Code may do by itself: read and change files in the task's workspace folder only (paths relative to
 * its working folder), its to do list, web search and reading pages, and the looking browser tools. Everything
 * else (the shell, a file outside the folder, a click, typing, a form, a download, an upload) asks the owner in
 * Bops through the approve tool, and a no, or no answer, is a no.
 */
export const CLAUDE_AUTO_TOOLS = ["Read(./**)", "Edit(./**)", "MultiEdit(./**)", "Write(./**)", "TodoWrite", "WebSearch", "WebFetch", ...BROWSER_LOOK_TOOLS.map((t) => `mcp__browser__${t}`)];
/** Never, even with a yes: running a page's own code, and Bops' approve tool called by the model itself. */
export const CLAUDE_NEVER_TOOLS = ["mcp__browser__browser_run_code_unsafe", "mcp__browser__browser_evaluate", "mcp__bops__approve"];
/** The approve tool Claude Code asks through (vm/pc-approve-mcp.mjs, as the "bops" server). */
export const APPROVE_TOOL = "mcp__bops__approve";

/**
 * The command for one turn: `claude -p` reading its prompt from stdin, its events as stream-json, in the task's
 * workspace folder, with only the user's own settings (never a project's: a .claude folder the task wrote in its
 * workspace can't loosen this), only Bops' MCP servers, Bops' briefing after its own, and the permission flags.
 * `resume`: its session from this run's earlier turn. The environment is the allowlist local-subscriptions.ts
 * signs in with: no key of Bops', OpenAI's or Anthropic's, so it runs on the signed in plan alone.
 */
export function claudeTaskCommand(o: { claude: string; env: NodeJS.ProcessEnv; workspace: string; mcpConfig: string; promptFile: string; session: string; resume: boolean }) {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "default",
    "--setting-sources", "user",
    "--strict-mcp-config",
    "--mcp-config", o.mcpConfig,
    "--append-system-prompt-file", o.promptFile,
    "--allowedTools", CLAUDE_AUTO_TOOLS.join(","),
    "--disallowedTools", CLAUDE_NEVER_TOOLS.join(","),
    "--permission-prompt-tool", APPROVE_TOOL,
    ...(o.resume ? ["--resume", o.session] : ["--session-id", o.session]),
  ];
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(o.env)) if (v !== undefined && !/KEY|TOKEN|SECRET|PASSWORD/i.test(k)) env[k] = v;
  return { file: o.claude, args, cwd: o.workspace, env };
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

/** Stop a turn's Claude Code and whatever it started (on Windows its whole tree: its MCP servers too). */
export function stopClaude(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  else {
    const kill = setTimeout(() => child.kill("SIGKILL"), 5000);
    kill.unref?.();
    child.once("exit", () => clearTimeout(kill));
    child.kill();
  }
}

/** The most a line of Claude Code's output may be, and how long a turn may run at all. */
const LINE_MOST = 4 * 1024 * 1024;

/**
 * One turn on Claude Code: `input` in on stdin, each event out (`parse`: cli-agents.ts claudeDriver's, so its
 * steps read as a cloud brain's do) as it comes, redacted first. Resolves with its answer; a turn that failed,
 * or a process that ended with no result, throws a PcTaskError in words. Stop (`signal`) ends it at once.
 */
export function runClaudeTurn(o: {
  cmd: { file: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv };
  input: string;
  parse: (e: Record<string, unknown>) => CliEvent[];
  onEvent: (e: CliEvent) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ text: string; session?: string }> {
  return new Promise((resolve, reject) => {
    if (o.signal?.aborted) return reject(new PcTaskError("Stopped by you"));
    if (!existsSync(o.cmd.cwd)) return reject(new PcTaskError("The task's folder on this PC is missing. Try again."));
    let child: ChildProcess;
    try {
      child = spawn(o.cmd.file, o.cmd.args, { cwd: o.cmd.cwd, env: o.cmd.env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      return reject(new PcTaskError(PC_WORDS.noClaude));
    }
    let buf = "";
    let errTail = "";
    let said = "";
    let session: string | undefined;
    let result: { ok: boolean; text?: string } | undefined;
    let done = false;
    const finish = (e?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", abort);
      if (e) reject(e);
      else if (result?.ok) resolve({ text: (result.text || said).trim(), session });
      else reject(new PcTaskError(claudeFailure(result?.text ?? errTail)));
    };
    const abort = () => {
      stopClaude(child);
      finish(new PcTaskError("Stopped by you"));
    };
    o.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      stopClaude(child);
      finish(new PcTaskError("Claude Code took too long on this, so it was stopped. Try again with a smaller task."));
    }, o.timeoutMs ?? 60 * 60_000);
    timer.unref?.();
    const line = (raw: string) => {
      if (!raw.trim()) return;
      let event: Record<string, unknown>;
      try {
        event = redactDeep(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        return;
      }
      for (const ev of o.parse(event)) {
        if (ev.type === "started" && ev.session) session = ev.session;
        if (ev.type === "text" && !ev.parent) said = ev.text;
        if (ev.type === "result") result = { ok: ev.ok, text: ev.text };
        o.onEvent(ev);
      }
    };
    child.stdout!.on("data", (d: Buffer) => {
      buf += d.toString();
      if (buf.length > LINE_MOST) buf = buf.slice(-LINE_MOST);
      let at: number;
      while ((at = buf.indexOf("\n")) >= 0) {
        line(buf.slice(0, at));
        buf = buf.slice(at + 1);
      }
    });
    // Its errors are only read for why it stopped (a sign in, a limit): never shown or logged.
    child.stderr!.on("data", (d: Buffer) => void (errTail = (errTail + d.toString()).slice(-4096)));
    child.once("error", () => finish(new PcTaskError(PC_WORDS.noClaude)));
    child.once("close", () => {
      line(buf);
      buf = "";
      finish();
    });
    child.stdin!.on("error", () => {});
    child.stdin!.end(o.input);
  });
}

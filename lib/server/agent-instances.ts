import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, win32 } from "node:path";
import { redact } from "@/lib/secret-patterns";
import { envLocalFile, EnvLocalError, looksLikeKey, maskKey, readEnvLocalValue, setEnvLocal } from "./env-local";
import { fromThisMac } from "./owner-email";
import { getState } from "./store";
import { fromBopsWindow } from "./ui-token";
import { dataRoot } from "./user-paths";

/*
 * Agents you run (Settings, Agents you run): the owner's own DeepSeek Harness and Hermes Agent instances, as many as
 * they like, each one a name a bot can hand a task to (agent-instances-chat.ts) and get the answer back in the chat.
 *
 * How each is reached, as the projects document it (the PR's Research section has the sources):
 * - Hermes on a server: its API server (gateway/platforms/api_server.py), POST <address>/v1/chat/completions with
 *   Authorization: Bearer <API_SERVER_KEY>, stream off, and X-Hermes-Session-Id so each Bops chat keeps one Hermes
 *   session. Check: GET /health (no key) then GET /v1/models (with the key).
 * - Hermes on this PC: `hermes chat --query-file - --oneshot -Q --source tool`, its HERMES_HOME the instance's folder.
 * - DeepSeek Harness on this PC: `dsh --profile headless --json -` (the task on stdin; its NDJSON ends with `final`),
 *   DSH_HOME the instance's folder, and `--session-id` from the second task in a chat on, as Bops' own dsh agent does.
 *   On Windows the desktop app's own command works too: <install>\resources\runtime\cli\bin\dsh.cmd.
 * Not here (lib/feature-status.ts shows them unfinished): dsh on another computer (its web profile is a browser GUI
 * behind a launch token and cookie, with no documented task API) and driving the dsh desktop app's window itself.
 *
 * Each instance is its own: its own folder (no two share one), its own address, its own sessions, its own key. The
 * registry (names, how to reach each) is a file only this PC's owner reaches; a key goes in .env.local like Settings,
 * Services' keys (env-local.ts), is read from there each time it's used (no restart), and is never sent back, logged
 * or kept anywhere else: only "ends in" its last four.
 */

export type AgentKind = "dsh" | "hermes";
export type AgentReach = "command" | "address";
export const KIND_NAMES: Record<AgentKind, string> = { dsh: "DeepSeek Harness", hermes: "Hermes Agent" };

type Saved = {
  id: string;
  name: string;
  kind: AgentKind;
  reach: AgentReach;
  /** reach "command": the program, and the folder that is its DSH_HOME or HERMES_HOME. */
  command?: string;
  home?: string;
  /** reach "address": where its API server answers (https, or http on this PC or the tailnet). */
  address?: string;
  /** dsh: each Bops chat's dsh session (a hash of the chat's id, never the id), so the next task carries on. */
  sessions?: Record<string, string>;
};

/** What the page sees of one: never the key, only that it's there and how it ends. */
export type AgentView = {
  id: string;
  name: string;
  kind: AgentKind;
  reach: AgentReach;
  command?: string;
  home?: string;
  address?: string;
  key: { set: boolean; ends: string; needed: boolean; label: string };
  check?: CheckResult;
};
export type CheckResult = { ok: boolean; words: string; at: number };

export class AgentInstanceError extends Error {}

/* ---------------- Who may ---------------- */

const fromPhone = (request: Request) => request.headers.has("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");

/** The owner, in the Bops window on this PC, on a self-hosted Bops (as Settings, Services). Never a phone or a shared workspace. */
export function agentsOwnerHere(request: Request): boolean {
  try {
    return process.env.BOPS_SELF_HOSTED === "1" && !!process.env.BOPS_UI_TOKEN && !fromPhone(request) && !getState().shared && fromThisMac(request) && fromBopsWindow(request);
  } catch {
    return false;
  }
}

/* ---------------- The registry ---------------- */

export const agentsFile = () => process.env.BOPS_AGENT_INSTANCES_FILE || join(/*turbopackIgnore: true*/ dataRoot(), "agent-instances.json");
const ID = /^[a-f0-9]{8}$/;
const KINDS: readonly AgentKind[] = ["dsh", "hermes"];
const REACHES: readonly AgentReach[] = ["command", "address"];

function load(): Saved[] {
  try {
    const raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ agentsFile(), "utf8")) as { agents?: unknown };
    if (!Array.isArray(raw.agents)) return [];
    return raw.agents.filter((a): a is Saved => !!a && typeof a === "object" && ID.test((a as Saved).id) && KINDS.includes((a as Saved).kind) && REACHES.includes((a as Saved).reach));
  } catch {
    return [];
  }
}

function save(list: Saved[]) {
  const file = agentsFile();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify({ version: 1, agents: list }, null, 2), { mode: 0o600 });
    renameSync(/*turbopackIgnore: true*/ tmp, file);
  } catch {
    throw new AgentInstanceError("Bops couldn't save your agents on this PC. Check that the Bops folder can be written to, then try again.");
  } finally {
    rmSync(/*turbopackIgnore: true*/ tmp, { force: true });
  }
}

/** The setting in .env.local that holds an instance's key. */
export const keyName = (id: string) => `BOPS_AGENT_KEY_${id.toUpperCase()}`;
/** Its key: .env.local as it is now (so a new key works at once), else what Bops started with. Never logged or returned. */
const keyOf = (id: string) => readEnvLocalValue(envLocalFile(), keyName(id)) ?? (process.env[keyName(id)] || undefined);

/** What its key is for: Hermes' API server key, or (dsh on this PC) a DeepSeek key, which is optional. */
const keyLabel = (a: Pick<Saved, "kind" | "reach">) => (a.reach === "address" ? "API server key (API_SERVER_KEY)" : a.kind === "dsh" ? "DeepSeek key (optional)" : "No key needed");
const keyNeeded = (a: Pick<Saved, "kind" | "reach">) => a.reach === "address";

const checks = new Map<string, CheckResult>();

export function listAgents(): AgentView[] {
  return load().map((a) => {
    const k = a.reach === "address" || a.kind === "dsh" ? keyOf(a.id) : undefined;
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      reach: a.reach,
      ...(a.command ? { command: a.command } : {}),
      ...(a.home ? { home: a.home } : {}),
      ...(a.address ? { address: a.address } : {}),
      key: { set: !!k, ends: maskKey(k), needed: keyNeeded(a), label: keyLabel(a) },
      ...(checks.has(a.id) ? { check: checks.get(a.id) } : {}),
    };
  });
}

/** One by its name (as a bot names it), any case. */
export const agentByName = (name: string) => load().find((a) => a.name.toLowerCase() === name.trim().toLowerCase());

/* ---------------- What a value may look like ---------------- */

/** A name: plain words, digits and a little punctuation; no dashes, quotes or anything that could read as code. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9 .,'&()]{0,39}$/;
/** A program: an absolute path (C:\… or /…), or a bare name on PATH. Nothing a shell would read as more than a path. */
const UNSAFE = /["'`$%^&|<>;!*?\r\n\t\0]/;
export function commandProblem(v: string): string | null {
  if (!v || v.length > 400 || UNSAFE.test(v)) return "Give the program's full path, like C:\\Users\\you\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd, with no quotes.";
  if (/^[A-Za-z0-9._]+$/.test(v)) return null;
  if (!looksAbsolute(v)) return "Give the program's full path (starting with C:\\ or /), or just its name if it's on this PC's PATH.";
  return null;
}
const looksAbsolute = (v: string) => /^[A-Za-z]:[\\/]/.test(v) || (v.startsWith("/") && isAbsolute(v));
export function homeProblem(v: string): string | null {
  if (!v || v.length > 400 || UNSAFE.test(v) || !looksAbsolute(v)) return "Give the folder's full path (starting with C:\\ or /), with no quotes.";
  if (v.split(/[\\/]+/).some((part) => part === ".." || part === ".")) return "Give the folder's full path without . or .. in it.";
  const home = homedir();
  // Folders that are someone else's: the dsh desktop app's and Hermes' own homes, and Bops' own data. Bops' homes
  // folder (~/.bops) only under its agents folder, where Bops makes them.
  const theirs = [join(home, ".dsh"), join(home, ".hermes"), dataRoot(), process.cwd()];
  if (theirs.some((t) => overlaps(t, v))) return "That folder belongs to something else (the DeepSeek Harness app, Hermes' own setup, or Bops). Choose a new, empty folder for this agent.";
  const bops = join(home, ".bops");
  const agents = process.env.BOPS_AGENT_HOMES || join(bops, "agents");
  if (overlaps(bops, v) && !(folderKey(v).startsWith(folderKey(agents)) && folderKey(v) !== folderKey(agents))) return "That folder is part of Bops' own files. Choose a new, empty folder for this agent.";
  return null;
}
/** Folders compared as this PC would (any case, either slash): one inside another counts as the same (they'd share files). */
const folderKey = (v: string) => `${normalize(v).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()}/`;
const overlaps = (a: string, b: string) => {
  const x = folderKey(a);
  const y = folderKey(b);
  return x.startsWith(y) || y.startsWith(x);
};

/** An address on this PC or the tailnet may be http; anything else must be https. Never a user, password, query or hash. */
export function addressProblem(v: string): string | null {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "That isn't a web address. It looks like http://100.101.102.103:8642 or https://hermes.example.com.";
  }
  if (u.username || u.password || u.search || u.hash || /\s/.test(v)) return "Give just the address and port, with no name, password or anything after a ? or #.";
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (u.protocol === "https:") return null;
  if (u.protocol !== "http:") return "The address must start with http:// or https://.";
  if (onTailnetOrHere(host)) return null;
  return "Use https for an address on the internet. http is only for this PC or your tailnet (a 100.x.x.x address, or a name ending in .ts.net, like bops.tail1234.ts.net).";
}
/** Plain http only here: this PC, Tailscale's 100.64.0.0/10 and fd7a:115c:a1e0::/48, and MagicDNS names (*.ts.net). */
export function onTailnetOrHere(host: string) {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(host)) return true;
  const m = /^100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) return Number(m[1]) >= 64 && Number(m[1]) <= 127 && Number(m[2]) <= 255 && Number(m[3]) <= 255;
  return /^fd7a:115c:a1e0:/.test(host);
}
const cleanAddress = (v: string) => {
  const u = new URL(v);
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}`;
};

/** Where a new instance on this PC keeps its things, unless the owner names a folder. */
export const defaultHome = (id: string, kind: AgentKind) => join(/*turbopackIgnore: true*/ process.env.BOPS_AGENT_HOMES || join(homedir(), ".bops", "agents"), `${kind}-${id}`);

type Input = { name?: unknown; kind?: unknown; reach?: unknown; command?: unknown; home?: unknown; address?: unknown; key?: unknown };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Check a new or edited entry against the others; throws AgentInstanceError in the page's words. */
function shape(input: Input, others: Saved[], id: string, was?: Saved): Saved {
  const name = str(input.name) || was?.name || "";
  if (!NAME.test(name)) throw new AgentInstanceError("Give it a short name in plain words, like Hermes on server or dsh research (up to 40 letters, no dashes).");
  if (others.some((o) => o.name.toLowerCase() === name.toLowerCase())) throw new AgentInstanceError(`You already have an agent called ${name}. Give this one another name.`);
  const kind = (was?.kind ?? str(input.kind)) as AgentKind;
  if (!KINDS.includes(kind)) throw new AgentInstanceError("Choose DeepSeek Harness or Hermes Agent.");
  const reach = (str(input.reach) || was?.reach || "") as AgentReach;
  if (!REACHES.includes(reach)) throw new AgentInstanceError("Choose how Bops reaches it: a program on this PC, or an address.");
  if (reach === "address") {
    if (kind === "dsh") throw new AgentInstanceError("DeepSeek Harness on another computer isn't set up yet. Run it on this PC for now.");
    const address = str(input.address) || was?.address || "";
    const problem = addressProblem(address);
    if (problem) throw new AgentInstanceError(problem);
    const clean = cleanAddress(address);
    if (others.some((o) => o.address === clean)) throw new AgentInstanceError("Another agent already uses that address. Each one needs its own.");
    return { id, name, kind, reach, address: clean };
  }
  const command = str(input.command) || was?.command || (kind === "dsh" ? "dsh" : "hermes");
  const cp = commandProblem(command);
  if (cp) throw new AgentInstanceError(cp);
  const home = str(input.home) || was?.home || defaultHome(id, kind);
  const hp = homeProblem(home);
  if (hp) throw new AgentInstanceError(hp);
  const clash = others.find((o) => o.home && overlaps(o.home, home));
  if (clash) throw new AgentInstanceError(`${clash.name} already keeps its things in that folder. Each agent needs a folder of its own, so they never share sessions or settings.`);
  return { id, name, kind, reach, command, home, ...(was?.home === home && was.sessions ? { sessions: was.sessions } : {}) };
}

function saveKey(a: Saved, key: unknown) {
  if (key === undefined || key === null) return;
  if (typeof key !== "string") throw new AgentInstanceError("Paste the whole key, with no spaces.");
  const k = key.trim();
  if (a.reach === "command" && a.kind === "hermes" && k) throw new AgentInstanceError("Hermes on this PC uses the keys in its own folder: run hermes setup there. Leave the key empty.");
  try {
    setEnvLocal(envLocalFile(), keyName(a.id), k, looksLikeKey);
  } catch (e) {
    throw new AgentInstanceError(e instanceof EnvLocalError ? e.message : "Bops couldn't save the key on this PC. Try again.");
  }
}

export function addAgent(input: Input): AgentView {
  const list = load();
  if (list.length >= 100) throw new AgentInstanceError("That's a hundred agents already. Remove one first.");
  let id = randomBytes(4).toString("hex");
  while (list.some((a) => a.id === id)) id = randomBytes(4).toString("hex");
  const a = shape(input, list, id);
  if (a.reach === "address" && !str(input.key)) throw new AgentInstanceError("Paste its API server key (API_SERVER_KEY). Hermes won't answer without one.");
  saveKey(a, input.key);
  if (a.home) mkdirSync(/*turbopackIgnore: true*/ a.home, { recursive: true });
  save([...list, a]);
  return listAgents().find((x) => x.id === id)!;
}

export function editAgent(id: unknown, input: Input): AgentView {
  const list = load();
  const was = list.find((a) => a.id === id);
  if (!was) throw new AgentInstanceError("That agent isn't here any more.");
  const a = shape(input, list.filter((x) => x.id !== was.id), was.id, was);
  saveKey(a, input.key === "" ? undefined : input.key);
  if (a.home) mkdirSync(/*turbopackIgnore: true*/ a.home, { recursive: true });
  save(list.map((x) => (x.id === was.id ? a : x)));
  checks.delete(was.id);
  return listAgents().find((x) => x.id === was.id)!;
}

/** Take it off the list and its key out of .env.local. Its folder stays: it's the owner's (their sessions are in it). */
export function removeAgent(id: unknown) {
  const list = load();
  const was = list.find((a) => a.id === id);
  if (!was) throw new AgentInstanceError("That agent isn't here any more.");
  try {
    setEnvLocal(envLocalFile(), keyName(was.id), "");
  } catch {
    throw new AgentInstanceError("Bops couldn't take its key out of this PC's settings. Try again.");
  }
  save(list.filter((a) => a.id !== was.id));
  checks.delete(was.id);
  stoppers.get(was.id)?.abort();
  stoppers.delete(was.id);
}

/* ---------------- Running a program ---------------- */

/** What a child gets of Bops' environment: what a program needs to run, never Bops' own keys. */
function childEnv(extra: Record<string, string>) {
  const keep = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "COMSPEC", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "LANG", "LC_ALL", "TZ", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"];
  const env: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  return { ...env, ...extra };
}

type Ran = { code: number | null; out: string; err: string; missing?: boolean; timedOut?: boolean; stopped?: boolean };
const MAX_OUT = 2_000_000;

/** How a program is started: the file, words before its own, and what it adds to the environment. */
export type Launch = { file: string; pre: string[]; env: Record<string, string>; viaCmd: boolean };

/**
 * How to start `command` on this computer, without cmd.exe where that can be helped. On Windows, the DeepSeek Harness
 * app's own command (…\resources\runtime\cli\bin\dsh.cmd, which only runs its Electron as Node on its CLI) is
 * started the way that .cmd does it, directly; the default "dsh" finds that app in its usual place first
 * (%LOCALAPPDATA%\Programs\DeepSeek Harness), else dsh.cmd on PATH; any other .cmd or .bat goes through cmd.
 */
export function resolveLaunch(command: string, o: { platform?: string; env?: Record<string, string | undefined>; exists?: (p: string) => boolean } = {}): Launch {
  const platform = o.platform ?? process.platform;
  const env = o.env ?? process.env;
  const exists = o.exists ?? ((p: string) => existsSync(p));
  if (platform !== "win32") return { file: command, pre: [], env: {}, viaCmd: false };
  let cmd = command;
  if (/^dsh(?:\.cmd)?$/i.test(cmd)) {
    const local = env.LOCALAPPDATA;
    const app = local ? win32.join(local, "Programs", "DeepSeek Harness", "resources", "runtime", "cli", "bin", "dsh.cmd") : "";
    cmd = app && exists(app) ? app : "dsh.cmd";
  }
  const m = /^(.*)\\resources\\runtime\\cli\\bin\\dsh\.cmd$/i.exec(cmd);
  if (m) {
    const exe = win32.join(m[1], "DeepSeek Harness.exe");
    const asar = win32.join(m[1], "resources", "app.asar");
    if (exists(exe) && exists(asar))
      return { file: exe, pre: ["--expose-internals", win32.join(asar, "dsh", "node_modules", "@deepseek-ai", "dsh-desktop-host", "lib", "cli.js")], env: { ELECTRON_RUN_AS_NODE: "1" }, viaCmd: false };
  }
  return { file: cmd, pre: [], env: {}, viaCmd: /\.(cmd|bat)$/i.test(cmd) };
}

/** Stop a program and everything it started: its whole tree on Windows (taskkill /T /F), its process group elsewhere. */
function killTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid || child.exitCode !== null) return Promise.resolve();
  if (process.platform === "win32")
    return new Promise((done) => {
      const k = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
      k.on("error", () => done());
      k.on("close", () => done());
    });
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    /* gone already */
  }
  return new Promise((done) => {
    const t = setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* gone */
      }
      done();
    }, 2000);
    t.unref?.();
    // The group leader's exit isn't the group's: give the rest a moment, then make sure.
    child.once("close", () => {
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          /* all gone */
        }
        clearTimeout(t);
        done();
      }, 100);
    });
  });
}

/**
 * Run `command args` with `input` on stdin, in a process group (or job tree) of its own so a timeout or a stop takes
 * everything it started with it, and only returns once that's done. Only fixed words go in args (the task goes on
 * stdin), so a .cmd runs safely through cmd.
 */
function run(command: string, args: string[], o: { env: Record<string, string>; cwd: string; input?: string; timeoutMs: number; signal?: AbortSignal }): Promise<Ran> {
  return new Promise((done) => {
    if (o.signal?.aborted) return done({ code: null, out: "", err: "", stopped: true });
    const l = resolveLaunch(command, { env: o.env });
    const env = { ...o.env, ...l.env } as NodeJS.ProcessEnv;
    let child: ChildProcess;
    try {
      child = l.viaCmd
        ? spawn(`"${l.file}"`, args, { cwd: o.cwd, env, shell: true, windowsHide: true })
        : spawn(l.file, [...l.pre, ...args], { cwd: o.cwd, env, windowsHide: true, detached: process.platform !== "win32" });
    } catch {
      return done({ code: null, out: "", err: "", missing: true });
    }
    let out = "";
    let err = "";
    let timedOut = false;
    let stopped = false;
    let killing: Promise<void> | null = null;
    const stop = (why: "time" | "stop") => {
      if (killing) return;
      if (why === "time") timedOut = true;
      else stopped = true;
      killing = killTree(child);
    };
    const timer = setTimeout(() => stop("time"), o.timeoutMs);
    const onAbort = () => stop("stop");
    o.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (d: Buffer) => {
      if (out.length < MAX_OUT) out += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (err.length < 200_000) err += d.toString("utf8");
    });
    let settled = false;
    const finish = async (r: Ran) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
      // Whatever it started goes with it, before this returns.
      if (killing) await killing;
      else if (process.platform !== "win32" && !l.viaCmd && child.pid)
        try {
          // It ended on its own: anything it left running in its group goes too.
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* nothing left */
        }
      done({ ...r, timedOut, stopped });
    };
    child.on("error", (e: NodeJS.ErrnoException) => void finish({ code: null, out, err, missing: e.code === "ENOENT" || e.code === "EACCES" || e.code === "EINVAL" }));
    child.on("close", (code) => {
      // cmd's own "not recognized" when the .cmd isn't there.
      const missing = l.viaCmd && code !== 0 && /is not recognized as an internal or external command/i.test(err);
      void finish({ code, out, err, missing });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(o.input ?? "");
  });
}

const lastLine = (s: string) =>
  s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("dsh: reasoning"))
    .pop() ?? "";
/** Words from outside, made safe to show: keys taken out, cut to a size, nothing that names Bops' own setting. */
const tidy = (s: string, n: number) => redact(s).replace(/\s+/g, " ").trim().slice(0, n);

/* ---------------- Check ---------------- */

const CHECK_TIMEOUT = 15_000;

async function hermesFetch(a: Saved, path: string, init: RequestInit & { timeoutMs: number; stop?: AbortSignal }) {
  const key = keyOf(a.id);
  const { timeoutMs, stop, ...rest } = init;
  return fetch(`${a.address}${path}`, {
    ...rest,
    redirect: "error",
    signal: anySignal([AbortSignal.timeout(timeoutMs), stop]),
    headers: { ...(init.headers as Record<string, string>), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  });
}

export async function checkAgent(id: unknown): Promise<CheckResult> {
  const a = load().find((x) => x.id === id);
  if (!a) throw new AgentInstanceError("That agent isn't here any more.");
  const result = { ...(await probe(a)), at: Date.now() };
  checks.set(a.id, result);
  return result;
}

async function probe(a: Saved): Promise<Omit<CheckResult, "at">> {
  if (a.reach === "address") {
    if (!keyOf(a.id)) return { ok: false, words: "Paste its API server key first." };
    let health: Response;
    try {
      health = await fetch(`${a.address}/health`, { redirect: "error", signal: AbortSignal.timeout(CHECK_TIMEOUT) });
    } catch {
      return { ok: false, words: `Bops couldn't reach ${a.address}. Check that the server is on, that Tailscale is connected on this PC, and that the port is Hermes' API server's.` };
    }
    const body = (await health.json().catch(() => null)) as { status?: unknown } | null;
    if (!health.ok || body?.status !== "ok")
      return { ok: false, words: "That address answers, but not as Hermes' API server. It may be the Hermes dashboard: use the port Hermes' API server listens on (8642 inside its container), with API_SERVER_ENABLED=true." };
    const models = await hermesFetch(a, "/v1/models", { method: "GET", timeoutMs: CHECK_TIMEOUT }).catch(() => null);
    if (!models) return { ok: false, words: "Hermes answered its health check, then stopped answering. Try again." };
    if (models.status === 401 || models.status === 403) return { ok: false, words: "Hermes turned down the key. Paste the API_SERVER_KEY from the server's Hermes settings again." };
    if (!models.ok) return { ok: false, words: `Hermes answered with an error (${models.status}). Try again in a minute.` };
    const list = (await models.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
    const name = list?.data?.map((m) => m.id).find((x): x is string => typeof x === "string");
    return { ok: true, words: `It works. Hermes answered${name ? ` as ${tidy(name, 40)}` : ""}.` };
  }
  const ran = await run(a.command!, ["--version"], { env: childEnv(homeEnv(a)), cwd: a.home!, timeoutMs: CHECK_TIMEOUT });
  if (ran.missing) return { ok: false, words: `Bops can't find ${a.command} on this PC. Give the program's full path.` };
  if (ran.timedOut) return { ok: false, words: "The program didn't answer within 15 seconds." };
  if (ran.code !== 0) return { ok: false, words: `The program stopped with an error: ${tidy(lastLine(ran.err) || lastLine(ran.out), 200) || "it gave no reason"}.` };
  return { ok: true, words: `It works. ${KIND_NAMES[a.kind]} ${tidy(lastLine(ran.out), 60)} is ready in its own folder.` };
}

const homeEnv = (a: Saved): Record<string, string> =>
  a.kind === "dsh" ? { DSH_HOME: a.home!, DSH_TELEMETRY_DISABLED: "1", DSH_TELEMETRY_MODE: "DISABLED" } : { HERMES_HOME: a.home! };

/* ---------------- A task ---------------- */

const TASK_TIMEOUT = 20 * 60_000;
const taskTimeout = () => Number(process.env.BOPS_AGENT_TASK_TIMEOUT_MS) || TASK_TIMEOUT;
const MAX_REPLY_BYTES = 4_000_000;
const MAX_ANSWER = 60_000;
const DSH_SESSION = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A chat's id as its sessions are kept under: a hash, so the registry never names a chat. */
const chatKey = (a: Saved, chatId: string) => createHash("sha256").update(`${a.id}:${chatId}`).digest("hex").slice(0, 24);

export type TaskResult = { ok: true; text: string } | { ok: false; words: string };

/** One task at a time per instance and chat: a second waits for the first (a session takes one turn at a time). */
const queues = new Map<string, Promise<unknown>>();
function inTurn<T>(key: string, job: () => Promise<T>): Promise<T> {
  const before = queues.get(key) ?? Promise.resolve();
  const next = before.catch(() => {}).then(job);
  queues.set(key, next);
  next.finally(() => queues.get(key) === next && queues.delete(key)).catch(() => {});
  return next;
}

/** Hand `task` to the instance named `name`, in chat `chatId`'s own session there, and wait for its answer. */
export async function sendTask(name: string, task: string, chatId: string, signal?: AbortSignal): Promise<TaskResult> {
  const a = agentByName(name);
  if (!a) return { ok: false, words: `There's no agent called ${tidy(name, 40)} in Settings, Agents you run.` };
  const t = task.trim();
  if (!t) return { ok: false, words: "The task was empty." };
  // Removing the agent stops its tasks too.
  const both = anySignal([signal, stopperFor(a.id).signal]);
  return inTurn(`${a.id}:${chatKey(a, chatId)}`, () => {
    if (both.aborted) return Promise.resolve<TaskResult>({ ok: false, words: `The task for ${a.name} was stopped.` });
    return a.reach === "address" ? hermesTask(a, t, chatId, both) : a.kind === "dsh" ? dshTask(a, t, chatId, both) : hermesLocalTask(a, t, both);
  });
}

async function hermesTask(a: Saved, task: string, chatId: string, signal: AbortSignal): Promise<TaskResult> {
  if (!keyOf(a.id)) return { ok: false, words: `${a.name} has no key. Paste its API server key in Settings, Agents you run.` };
  let r: Response;
  try {
    r = await hermesFetch(a, "/v1/chat/completions", {
      method: "POST",
      timeoutMs: taskTimeout(),
      stop: signal,
      headers: { "Content-Type": "application/json", "X-Hermes-Session-Id": `bops-${a.id}-${chatKey(a, chatId)}` },
      body: JSON.stringify({ model: "hermes-agent", messages: [{ role: "user", content: task }], stream: false }),
    });
  } catch (e) {
    if (signal.aborted) return { ok: false, words: `The task for ${a.name} was stopped.` };
    const timeout = (e as Error)?.name === "TimeoutError";
    return { ok: false, words: timeout ? `${a.name} didn't finish in time, so Bops stopped it.` : `Bops couldn't reach ${a.name}. Check that the server is on and Tailscale is connected, then try again.` };
  }
  if (r.status === 401 || r.status === 403) return { ok: false, words: `${a.name} turned down the key. Paste its API server key again in Settings, Agents you run.` };
  if (r.status === 429) return { ok: false, words: `${a.name} is busy right now. Try again in a minute.` };
  const raw = await readCapped(r, MAX_REPLY_BYTES);
  if (raw === null) return { ok: false, words: `${a.name} answered with more than Bops takes in one reply (4 MB).` };
  let body: { choices?: { message?: { content?: unknown } }[]; error?: { message?: unknown } } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (!r.ok) return { ok: false, words: `${a.name} couldn't do it: ${tidy(typeof body?.error?.message === "string" ? body.error.message : `error ${r.status}`, 300)}` };
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) return { ok: false, words: `${a.name} finished without an answer.` };
  return { ok: true, text: redact(text).slice(0, MAX_ANSWER) };
}

async function dshTask(a: Saved, task: string, chatId: string, signal: AbortSignal): Promise<TaskResult> {
  const ck = chatKey(a, chatId);
  const sid = a.sessions?.[ck];
  // The headless runner adopts a session only from the folder it began in: each instance has one of its own.
  const cwd = join(/*turbopackIgnore: true*/ a.home!, "workspace");
  mkdirSync(/*turbopackIgnore: true*/ cwd, { recursive: true });
  const key = keyOf(a.id);
  const args = ["--profile", "headless", "--json", ...(sid && DSH_SESSION.test(sid) ? ["--session-id", sid] : []), "-"];
  const ran = await run(a.command!, args, { env: childEnv({ ...homeEnv(a), ...(key ? { DEEPSEEK_API_KEY: key } : {}) }), cwd, input: task, timeoutMs: taskTimeout(), signal });
  if (ran.missing) return { ok: false, words: `Bops can't find ${a.command} on this PC. Fix its path in Settings, Agents you run.` };
  if (ran.stopped) return { ok: false, words: `The task for ${a.name} was stopped.` };
  if (ran.timedOut) return { ok: false, words: `${a.name} didn't finish in time, so Bops stopped it.` };
  let session: string | undefined;
  let final: { text?: unknown; reason?: { kind?: unknown; error?: { message?: unknown } } | null } | undefined;
  let error: string | undefined;
  for (const line of ran.out.split(/\r?\n/)) {
    let e: { type?: unknown; sessionId?: unknown; message?: unknown } & Record<string, unknown>;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "session" && typeof e.sessionId === "string") session = e.sessionId;
    if (e.type === "final") final = e as typeof final;
    if (e.type === "error" && typeof e.message === "string") error = e.message;
  }
  if (session && DSH_SESSION.test(session) && session !== sid) remember(a.id, ck, session);
  if (final && ran.code === 0 && final.reason?.kind === "completed" && typeof final.text === "string" && final.text.trim()) return { ok: true, text: redact(final.text).slice(0, MAX_ANSWER) };
  // An unknown session (its folder was cleared): forget it, so the next task starts a new one.
  if (sid && error && /session/i.test(error)) remember(a.id, ck, undefined);
  const why = (typeof final?.reason?.error?.message === "string" ? final.reason.error.message : undefined) ?? error ?? lastLine(ran.err);
  return { ok: false, words: `${a.name} couldn't do it: ${tidy(why || "it stopped without an answer", 300)}` };
}

async function hermesLocalTask(a: Saved, task: string, signal: AbortSignal): Promise<TaskResult> {
  const ran = await run(a.command!, ["chat", "--query-file", "-", "--oneshot", "-Q", "--source", "tool"], { env: childEnv(homeEnv(a)), cwd: a.home!, input: task, timeoutMs: taskTimeout(), signal });
  if (ran.missing) return { ok: false, words: `Bops can't find ${a.command} on this PC. Fix its path in Settings, Agents you run.` };
  if (ran.stopped) return { ok: false, words: `The task for ${a.name} was stopped.` };
  if (ran.timedOut) return { ok: false, words: `${a.name} didn't finish in time, so Bops stopped it.` };
  const text = ran.out.trim();
  if (ran.code !== 0 || !text) return { ok: false, words: `${a.name} couldn't do it: ${tidy(lastLine(ran.err) || "it stopped without an answer", 300)}` };
  return { ok: true, text: redact(text).slice(0, MAX_ANSWER) };
}

function remember(id: string, ck: string, session: string | undefined) {
  try {
    const list = load();
    const a = list.find((x) => x.id === id);
    if (!a) return;
    const sessions = { ...(a.sessions ?? {}) };
    if (session) sessions[ck] = session;
    else delete sessions[ck];
    a.sessions = sessions;
    save(list);
  } catch {
    /* the next task starts a new session */
  }
}

/** One signal for several: aborted when any of them is. */
function anySignal(list: (AbortSignal | undefined)[]): AbortSignal {
  const real = list.filter((x): x is AbortSignal => !!x);
  return real.length === 1 ? real[0] : AbortSignal.any(real);
}

/** Each instance's own stop: removing it stops what it's doing. */
const stoppers = new Map<string, AbortController>();
function stopperFor(id: string) {
  let c = stoppers.get(id);
  if (!c || c.signal.aborted) {
    c = new AbortController();
    stoppers.set(id, c);
  }
  return c;
}

/** A response's body, read as it comes, up to `max` bytes; null when there's more. */
async function readCapped(r: Response, max: number): Promise<string | null> {
  if (!r.body) return "";
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString("utf8");
}

import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, lstatSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

/**
 * Starting a bot's Chrome (local.ts ensureChrome), with what went wrong kept when it doesn't start: whether
 * the program is there, the spawn error's code, its exit code or signal, and how long it took. Never its
 * arguments, its profile's path, its output or anything of the user's: those can carry a profile name, a
 * sign-in or a key, and none of them is needed to say why it didn't start.
 *
 * No "server-only" and only Node's own modules, so scripts/test-chrome-start.mjs runs it as it is, with a
 * fake Chrome, a fake environment and a real port.
 */

/** Why it didn't start, in the few kinds a person can do something about. */
export type ChromeStartReason = "not-found" | "could-not-run" | "exited" | "timeout" | "port-busy";

export type ChromeStartFacts = {
  reason: ChromeStartReason;
  /** The program was where Bops looked for it. */
  exeFound: boolean;
  /** The spawn error's code (ENOENT, EACCES, UNKNOWN...), never its message (it names the path). */
  spawnCode?: string;
  /** How it exited, when it did before it was ready. */
  exitCode?: number | null;
  signal?: string | null;
  elapsedMs: number;
  /** The port it was asked to listen on. */
  port: number;
};

export class ChromeStartError extends Error {
  readonly facts: ChromeStartFacts;
  constructor(message: string, facts: ChromeStartFacts) {
    super(message);
    this.facts = facts;
  }
}

/** The one line a failure leaves in the server's log: the facts above, and nothing else. */
export const chromeStartLog = (f: ChromeStartFacts) =>
  `[chrome] didn't start: reason=${f.reason} exe=${f.exeFound ? "found" : "missing"} spawn=${f.spawnCode ?? "-"} exit=${f.exitCode ?? "-"} signal=${f.signal ?? "-"} elapsed=${f.elapsedMs}ms port=${f.port}`;

/** What the task's thread says: plain, with the one reason that's known. */
export function chromeStartWords(f: ChromeStartFacts, where = "on this PC") {
  const lead = `Couldn't start the bot's Chrome ${where}`;
  switch (f.reason) {
    case "not-found":
      return `${lead}: Google Chrome wasn't found. Install it, or reinstall it, and try again.`;
    case "could-not-run":
      return `${lead}: it couldn't be run${f.spawnCode ? ` (${f.spawnCode})` : ""}.`;
    case "exited":
      return `${lead}: it exited immediately${f.exitCode !== undefined && f.exitCode !== null ? ` with code ${f.exitCode}` : f.signal ? ` (${f.signal})` : ""}.`;
    case "port-busy":
      return `${lead}: port ${f.port} is busy (another app is using it).`;
    case "timeout":
      return `${lead}: it started but didn't answer within ${Math.round(f.elapsedMs / 1000)} seconds.`;
  }
}

/** Case-insensitive, as Windows reads its environment (a copied env object isn't). */
const envGet = (env: NodeJS.ProcessEnv, name: string) => {
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
};

/**
 * Where Chrome installs on Windows: for every user (64-bit Program Files, then the 32-bit one), then for this
 * user only (LOCALAPPDATA). `appPath`: the path Windows' App Paths key gives for chrome.exe, for an install
 * somewhere else. `found` is false when none is there: `path` is then the first place, for the message only.
 */
export function windowsChromeAt(env: NodeJS.ProcessEnv, exists: (p: string) => boolean = existsSync, appPath?: string | null) {
  const tail = ["Google", "Chrome", "Application", "chrome.exe"];
  const roots = ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)", "LOCALAPPDATA"].map((n) => envGet(env, n)).filter((v): v is string => !!v);
  const places = [...new Set([...roots.map((r) => join(r, ...tail)), ...(appPath ? [appPath] : [])])];
  const hit = places.find((p) => exists(p));
  return { path: hit ?? places[0] ?? "chrome.exe", found: !!hit, places };
}

/** Whether something already holds `port` on 127.0.0.1 (or Windows won't let it be used: an excluded range). */
export function portBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", (e: NodeJS.ErrnoException) => resolve(e.code === "EADDRINUSE" || e.code === "EACCES"));
    s.listen({ port, host: "127.0.0.1", exclusive: true }, () => s.close(() => resolve(false)));
  });
}

/** A port nothing is using now, from the OS. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen({ port: 0, host: "127.0.0.1" }, () => {
      const a = s.address();
      const p = typeof a === "object" && a ? a.port : 0;
      s.close(() => (p ? resolve(p) : reject(new Error("no free port"))));
    });
  });
}

/** The files Chrome leaves in a profile to say it's in use (Windows: lockfile; Mac and Linux: the Singleton ones). */
export const PROFILE_LOCKS = ["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"];

/**
 * A lock left by a Chrome that crashed: removed only when no Chrome runs with this profile (`inUse`), so a
 * running one is never cut off. Chrome on the Mac refuses a profile whose SingletonLock names another host
 * (a copied or renamed machine), and exits. Returns whether one was removed.
 */
export async function clearStaleLock(profile: string, inUse: () => Promise<boolean>, exists: (p: string) => boolean = existsSync) {
  // SingletonLock is a symlink to a name, not a file: existsSync doesn't see it, lstat does.
  const present = PROFILE_LOCKS.filter((n) => exists(join(profile, n)) || isLink(join(profile, n)));
  if (!present.length || (await inUse())) return false;
  for (const n of present) rmSync(join(profile, n), { force: true });
  return true;
}

const isLink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

export type LaunchOptions = {
  exe: string;
  /** Whether `exe` was where it was looked for. */
  exeFound: boolean;
  args: string[];
  port: number;
  /** The Chrome answers on its port (local.ts cdpUp). */
  up: (port: number) => Promise<boolean>;
  /** How long it gets to answer. */
  readyMs?: number;
  pollMs?: number;
  spawn?: (cmd: string, args: string[], o: SpawnOptions) => ChildProcess;
};

/**
 * Start Chrome once and wait for its port: done when it answers; a ChromeStartError as soon as it can't be run
 * or exits, or when `readyMs` goes by (it's stopped then, so no Chrome is left that never listened).
 */
export async function launchChrome(o: LaunchOptions): Promise<void> {
  const t0 = Date.now();
  const facts = (reason: ChromeStartReason, more: Partial<ChromeStartFacts> = {}): ChromeStartFacts => ({ reason, exeFound: o.exeFound, elapsedMs: Date.now() - t0, port: o.port, ...more });
  if (!o.exeFound) {
    const f = facts("not-found");
    throw new ChromeStartError(chromeStartWords(f), f);
  }
  let ended: Partial<ChromeStartFacts> & { reason: ChromeStartReason } | undefined;
  let wake: () => void = () => {};
  const child = (o.spawn ?? nodeSpawn)(o.exe, o.args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", (e: NodeJS.ErrnoException) => {
    ended ??= { reason: e.code === "ENOENT" ? "not-found" : "could-not-run", spawnCode: e.code ?? "UNKNOWN" };
    wake();
  });
  child.on("exit", (code, signal) => {
    ended ??= { reason: "exited", exitCode: code, signal };
    wake();
  });
  child.unref();
  const readyMs = o.readyMs ?? 20_000;
  const pollMs = o.pollMs ?? 250;
  while (Date.now() - t0 < readyMs) {
    if (await o.up(o.port)) return;
    if (ended) {
      // Chrome on Windows can hand its command line to one already running on this profile and exit 0: that one answering is fine.
      if (ended.reason === "exited" && (await o.up(o.port))) return;
      const f = facts(ended.reason, ended);
      throw new ChromeStartError(chromeStartWords(f), f);
    }
    await new Promise<void>((r) => {
      const t = setTimeout(r, pollMs);
      wake = () => {
        clearTimeout(t);
        r();
      };
    });
  }
  if (ended) {
    const f = facts(ended.reason, ended);
    throw new ChromeStartError(chromeStartWords(f), f);
  }
  try {
    child.kill();
  } catch {}
  const f = facts("timeout");
  throw new ChromeStartError(chromeStartWords(f), f);
}

/**
 * A bot's Chrome, started: a crashed Chrome's lock cleared from its profile first (only when none uses it), and
 * when another app holds `port` (or Windows keeps it back), one more try on a port that's free now. Returns
 * the port it answers on. `note` gets the one line about a moved port (no path, no arguments).
 */
export async function startBotChrome(o: Omit<LaunchOptions, "args" | "port"> & { port: number; profile: string; args: (port: number) => string[]; inUse: () => Promise<boolean>; note?: (line: string) => void }) {
  await clearStaleLock(o.profile, o.inUse).catch(() => false);
  let at = o.port;
  if (await portBusy(at)) {
    const next = await freePort().catch(() => 0);
    if (!next) {
      const f: ChromeStartFacts = { reason: "port-busy", exeFound: o.exeFound, elapsedMs: 0, port: at };
      throw new ChromeStartError(chromeStartWords(f), f);
    }
    o.note?.(`[chrome] port ${at} busy: using ${next}`);
    at = next;
  }
  await launchChrome({ ...o, port: at, args: o.args(at) });
  return at;
}

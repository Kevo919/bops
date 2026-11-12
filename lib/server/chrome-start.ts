import { execFile, spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
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
export type ChromeStartReason = "not-found" | "could-not-run" | "exited" | "timeout" | "port-busy" | "profile-in-use" | "not-ours";

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
    case "profile-in-use":
      return `${lead}: its profile is in use by another Chrome that isn't answering. Quit Bops and open it again, then retry.`;
    case "not-ours":
      return `${lead}: the Chrome answering on port ${f.port} isn't this bot's, so it wasn't used.`;
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

/** The files Chrome leaves in a profile to say it's in use (Windows: lockfile; Mac and Linux: the Singleton ones). */
export const PROFILE_LOCKS = ["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"];

/**
 * pgrep's answer to "does a Chrome run with this profile", failing closed: exit 1 is the only "none"; 0 is one,
 * and any other error (2 or 3: a bad pattern or a fault, or no pgrep at all) reads as in use.
 */
export const pgrepInUse = (e: (Error & { code?: unknown }) | null) => !e || e.code !== 1;

/** A count PowerShell printed (windows-host.ts profileChromeRunning), failing closed: an error, or anything but a whole number, is "in use". */
export const inUseFromCount = (e: unknown, out: string) => !!e || !/^\d+$/.test(out.trim()) || Number(out.trim()) > 0;

/**
 * A lock left by a Chrome that crashed: removed only when no Chrome runs with this profile (`inUse`), so a
 * running one is never cut off. Chrome on the Mac refuses a profile whose SingletonLock names another host
 * (a copied or renamed machine), and exits. `inUse` failing counts as in use. Returns "cleared", "none"
 * (no lock), or "in-use" (a lock, and a Chrome holds it or that couldn't be ruled out: nothing is removed).
 */
export async function clearStaleLock(profile: string, inUse: () => Promise<boolean>, exists: (p: string) => boolean = existsSync): Promise<"cleared" | "none" | "in-use"> {
  // SingletonLock is a symlink to a name, not a file: existsSync doesn't see it, lstat does.
  const present = PROFILE_LOCKS.filter((n) => exists(join(profile, n)) || isLink(join(profile, n)));
  if (!present.length) return "none";
  if (await inUse().catch(() => true)) return "in-use";
  for (const n of present) rmSync(join(profile, n), { force: true });
  return "cleared";
}

const isLink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

/**
 * The port the Chrome on this profile says it listens on: the first line of DevToolsActivePort, which Chrome
 * writes in its own profile folder once its DevTools server is up. Only a Chrome on this profile writes it, so
 * a port read here is this bot's own Chrome's, never another bot's that happens to answer there.
 */
export function activePort(profile: string): number | null {
  try {
    const n = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0].trim());
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
  } catch {
    return null;
  }
}

/**
 * The browser id this profile's Chrome wrote: the second line of DevToolsActivePort, "/devtools/browser/<id>",
 * a fresh id each time Chrome starts. null when the file or the line isn't there or isn't that shape.
 */
export function activeBrowserPath(profile: string): string | null {
  try {
    const line = (readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[1] ?? "").trim();
    return /^\/devtools\/browser\/[\w-]{8,64}$/.test(line) ? line : null;
  } catch {
    return null;
  }
}

/**
 * Whether the browser answering on `port` is the very Chrome this profile names (BG-09). The port and the
 * profile's file alone don't prove it: the file can be left from a Chrome that has since gone, and another
 * program (another bot's Chrome, above all) can hold that port now. So the browser's own id, from its
 * /json/version, must match the one this profile's Chrome wrote. Any doubt (no file, no id, no answer, an
 * answer that isn't the shape Chrome gives) is "not proven", and the caller starts this bot's own Chrome.
 */
export async function sameBrowser(
  profile: string,
  port: number,
  get: (url: string) => Promise<unknown> = async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return r.ok ? r.json() : null;
  },
): Promise<boolean> {
  if (activePort(profile) !== port) return false;
  const want = activeBrowserPath(profile);
  if (!want) return false;
  try {
    const v = (await get(`http://127.0.0.1:${port}/json/version`)) as { webSocketDebuggerUrl?: unknown } | null;
    if (!v || typeof v.webSocketDebuggerUrl !== "string") return false;
    const u = new URL(v.webSocketDebuggerUrl);
    return u.pathname === want && (u.port === "" || Number(u.port) === port);
  } catch {
    return false;
  }
}

/**
 * Stop a Chrome and everything it started, and wait till they're gone: `taskkill /T /F` on Windows (the
 * whole tree), the process group on Mac and Linux (it was started detached, so it leads its own group).
 */
export async function killTree(
  pid: number | undefined,
  o: { platform?: NodeJS.Platform; run?: (cmd: string, args: string[], cb: (e: Error | null) => void) => void; waitMs?: number } = {},
) {
  if (!pid) return;
  if ((o.platform ?? process.platform) === "win32") {
    const run = o.run ?? ((cmd, args, cb) => void execFile(cmd, args, { windowsHide: true, timeout: 10_000 }, (e) => cb(e)));
    await new Promise<void>((r) => run("taskkill", ["/PID", String(pid), "/T", "/F"], () => r()));
    return;
  }
  const signal = (sig: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, sig);
      return true;
    } catch {
      try {
        process.kill(pid, sig);
        return true;
      } catch {
        return false;
      }
    }
  };
  signal("SIGKILL");
  const until = Date.now() + (o.waitMs ?? 3000);
  while (signal(0) && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
}

export type LaunchOptions = {
  exe: string;
  /** Whether `exe` was where it was looked for. */
  exeFound: boolean;
  /** Its arguments for a port (0: Chrome picks a free one itself). */
  args: (port: number) => string[];
  /** The port asked for, or 0 for any. */
  port: number;
  /** Its profile folder: where it writes DevToolsActivePort, the proof that the Chrome on a port is this one. */
  profile: string;
  /** The Chrome answers on its port (local.ts cdpUp). */
  up: (port: number) => Promise<boolean>;
  /** How long it gets to answer. */
  readyMs?: number;
  pollMs?: number;
  spawn?: (cmd: string, args: string[], o: SpawnOptions) => ChildProcess;
  kill?: (pid: number | undefined) => Promise<void>;
};

/**
 * Start Chrome once and wait till it answers on the port its own profile names (DevToolsActivePort): returns that
 * port. A ChromeStartError as soon as it can't be run or exits; when it names a port other than the one asked
 * for; or when `readyMs` goes by. Whatever it started is stopped (the whole tree) on every failure after spawn.
 */
export async function launchChrome(o: LaunchOptions): Promise<number> {
  const t0 = Date.now();
  const facts = (reason: ChromeStartReason, more: Partial<ChromeStartFacts> = {}): ChromeStartFacts => ({ reason, exeFound: o.exeFound, elapsedMs: Date.now() - t0, port: o.port, ...more });
  if (!o.exeFound) {
    const f = facts("not-found");
    throw new ChromeStartError(chromeStartWords(f), f);
  }
  // One from before (a Chrome that crashed) would name a port that's no longer this profile's.
  rmSync(join(o.profile, "DevToolsActivePort"), { force: true });
  let ended: (Partial<ChromeStartFacts> & { reason: ChromeStartReason }) | undefined;
  let wake: () => void = () => {};
  const child = (o.spawn ?? nodeSpawn)(o.exe, o.args(o.port), { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", (e: NodeJS.ErrnoException) => {
    ended ??= { reason: e.code === "ENOENT" ? "not-found" : "could-not-run", spawnCode: e.code ?? "UNKNOWN" };
    wake();
  });
  child.on("exit", (code, signal) => {
    ended ??= { reason: "exited", exitCode: code, signal };
    wake();
  });
  child.unref();
  const kill = o.kill ?? ((pid) => killTree(pid));
  const fail = async (f: ChromeStartFacts): Promise<never> => {
    if (!ended || ended.reason === "exited") await kill(child.pid);
    throw new ChromeStartError(chromeStartWords(f), f);
  };
  const readyMs = o.readyMs ?? 20_000;
  const pollMs = o.pollMs ?? 250;
  while (Date.now() - t0 < readyMs) {
    const at = activePort(o.profile);
    if (at !== null) {
      if (o.port && at !== o.port) return fail(facts("not-ours", { port: at }));
      if (await o.up(at)) return at;
    }
    if (ended) return fail(facts(ended.reason, ended));
    await new Promise<void>((r) => {
      const t = setTimeout(r, pollMs);
      wake = () => {
        clearTimeout(t);
        r();
      };
    });
  }
  return fail(ended ? facts(ended.reason, ended) : facts("timeout"));
}

/**
 * A bot's Chrome, started: a crashed Chrome's lock cleared from its profile first (only when no Chrome uses it;
 * one that does, or that couldn't be ruled out, fails as "profile in use"), and when another app holds `port`
 * (or Windows keeps it back), one more try with Chrome picking a free port itself: no other bot can take that
 * port between the pick and the bind, and the port is read from this Chrome's own profile. Returns the port it
 * answers on. `note` gets the one line about a moved port (no path, no arguments).
 */
export async function startBotChrome(o: Omit<LaunchOptions, "port"> & { port: number; inUse: () => Promise<boolean>; note?: (line: string) => void }) {
  if ((await clearStaleLock(o.profile, o.inUse)) === "in-use") {
    const f: ChromeStartFacts = { reason: "profile-in-use", exeFound: o.exeFound, elapsedMs: 0, port: o.port };
    throw new ChromeStartError(chromeStartWords(f), f);
  }
  const busy = await portBusy(o.port);
  const at = await launchChrome({ ...o, port: busy ? 0 : o.port });
  if (busy) o.note?.(`[chrome] port ${o.port} busy: using ${at}`);
  return at;
}

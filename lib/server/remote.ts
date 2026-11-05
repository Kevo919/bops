import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { dataRoot } from "./user-paths";

/**
 * A phone paired with this Bops (the Bops Android app): it reaches this server from another device,
 * over Tailscale or the internet, with a pairing code. Only a hash of the code is kept here
 * (.data/remote.json), so the file can't be used to get in; the code itself is shown once, when the
 * user pairs, in the Bops window. Pairing again makes a new code and the old one stops working at once,
 * and unpairing removes it. proxy.ts checks it on every request (the phone sends it as its bops_remote
 * cookie); what only the Bops window may do (Full access, a bot's settings) still needs the window.
 */

const file = () => join(dataRoot(), "remote.json");

export type Pairing = { hash: string; created: number };

export const hashCode = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");

export function pairing(): Pairing | null {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), "utf8")) as Pairing) : null;
  } catch {
    return null;
  }
}

/** A new code (256 random bits): the one paired phone uses it from now on. */
export function pair(): string {
  const code = randomBytes(32).toString("base64url");
  mkdirSync(dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ hash: hashCode(code), created: Date.now() } satisfies Pairing), { mode: 0o600 });
  renameSync(tmp, file());
  return code;
}

export const unpair = () => rmSync(file(), { force: true });

/**
 * Where a phone can reach this server: its Tailscale address first (100.64.0.0/10, reachable from
 * anywhere on the user's tailnet), then its home-network ones. The port is the server's.
 */
export function addresses(port = process.env.PORT ?? "3210") {
  const all = Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => !!a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
  const tailnet = all.filter((a) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a));
  const home = all.filter((a) => !tailnet.includes(a) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));
  const url = (a: string) => `http://${a}:${port}`;
  // Home-network addresses are listed for what they are, not offered to pair with: plain http on the
  // wifi would carry the pairing code where anyone on it could read it. Tailscale encrypts its own.
  return { tailnet: tailnet.map(url), home: home.map(url), public: process.env.BOPS_PUBLIC_URL?.startsWith("https://") ? process.env.BOPS_PUBLIC_URL : null };
}

/* ---------------- Tailscale's own state (the 22:29 report: installed and signed out reads as "install it") ---------------- */

export type TailscaleState = {
  /** The tailscale CLI was found on this computer. */
  installed: boolean;
  /** The CLI answered and its backend says a tailnet is connected (an address exists). */
  connected: boolean;
  /** The CLI answered but says a login is needed (the user's exact confusion: installed ≠ signed in). */
  needsLogin: boolean;
  /** The state string the CLI reported ("Running", "NeedsLogin", "Stopped", ...); absent when it didn't answer. */
  backend?: string;
};

const CANDIDATES =
  process.platform === "win32"
    ? [join(process.env.ProgramFiles ?? "C:\\Program Files", "Tailscale", "tailscale.exe"), join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Tailscale", "tailscale.exe")]
    : process.platform === "darwin"
      ? ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/usr/local/bin/tailscale"]
      : ["/usr/bin/tailscale", "/usr/local/bin/tailscale"];

const cli = () => {
  for (const c of CANDIDATES) if (existsSync(c)) return c;
  return null;
};

let tailscaleCache: { at: number; state: TailscaleState } | null = null;
const TAILSCALE_CACHE_MS = 10_000;

/** What this computer's Tailscale is doing, for the Phone card's step 2 to speak plainly: installed
 *  but signed out is the state users hit and the old copy got wrong (it said "install it"). Cached ten
 *  seconds: the card polls, and status is not free. */
export function tailscaleState(): TailscaleState {
  if (tailscaleCache && Date.now() - tailscaleCache.at < TAILSCALE_CACHE_MS) return tailscaleCache.state;
  const bin = cli();
  if (!bin) return (tailscaleCache = { at: Date.now(), state: { installed: false, connected: false, needsLogin: false } }).state;
  // An interface check first: a 100.64/10 address means connected, whatever the CLI says after.
  if (addresses().tailnet.length) return (tailscaleCache = { at: Date.now(), state: { installed: true, connected: true, needsLogin: false, backend: "Running" } }).state;
  const state: TailscaleState = { installed: true, connected: false, needsLogin: false };
  try {
    const out = execFileSync(bin, ["status", "--json"], { timeout: 4000, encoding: "utf8" });
    const j = JSON.parse(out) as { BackendState?: string };
    state.backend = j.BackendState;
    state.needsLogin = j.BackendState === "NeedsLogin";
  } catch {
    // The daemon may not be running at all; installed is still true and the wording covers it.
    state.backend = "unreachable";
  }
  return (tailscaleCache = { at: Date.now(), state }).state;
}


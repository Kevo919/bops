import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { findCodex } from "./codex-cli";

export type LocalSubscriptionKind = "codex" | "claude";
export type LocalSubscriptionStatus = { kind: LocalSubscriptionKind; available: boolean; connected: boolean; state: "missing" | "signed-out" | "connecting" | "connected" | "error"; error?: string; loginUrl?: string; account?: string; plan?: string; checkedAt: number };
const allowedEnvironment = new Set(["PATH", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR", "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"]);
// Proxy and certificate overrides (including HTTPS_PROXY/NODE_EXTRA_CA_CERTS)
// deliberately stay outside this allowlist; managed proxy logins are unsupported.
export function localSubscriptionRuntime(kind: LocalSubscriptionKind) {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const [key, value] of Object.entries(process.env)) if (allowedEnvironment.has(key.toUpperCase()) && value !== undefined) env[key] = value;
  env.HOME = homedir();
  if (process.platform === "win32") env.USERPROFILE = homedir();
  if (kind === "codex") return { file: findCodex(), env };
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  for (const dir of [join(homedir(), ".local", "bin"), ...(process.env.PATH ?? process.env.Path ?? "").split(delimiter)]) {
    if (!dir) continue;
    const file = join(dir, name);
    try { accessSync(file, constants.X_OK); return { file, env }; } catch { /* try next native executable */ }
  }
  return { file: undefined, env };
}
type Stopping = { child: ChildProcess; result: Promise<boolean> };
type Login = { child: ChildProcess; timer: ReturnType<typeof setTimeout>; url?: string };
const globalState = globalThis as typeof globalThis & { bopsLocalSubscriptions?: { logins: Map<LocalSubscriptionKind, Login>; errors: Map<LocalSubscriptionKind, string>; generations: Map<LocalSubscriptionKind, number>; signingOut: Set<LocalSubscriptionKind>; stopping: Map<LocalSubscriptionKind, Map<ChildProcess, Stopping>>; closed: WeakSet<ChildProcess> } };
const registry = globalState.bopsLocalSubscriptions ??= { logins: new Map(), errors: new Map(), generations: new Map(), signingOut: new Set(), stopping: new Map(), closed: new WeakSet() };
// Preserve operation identity across development reloads, including upgrades from the prior registry shape.
const signingOut = registry.signingOut ??= new Set();
const generations = registry.generations ??= new Map();
const stopping = registry.stopping ??= new Map();
const closed = registry.closed ??= new WeakSet();
const advance = (kind: LocalSubscriptionKind) => { generations.set(kind, (generations.get(kind) ?? 0) + 1); checked.delete(kind); };
/**
 * The last sign-in check per CLI, for readers that only need to know roughly (the chat box's agent chip, through
 * /api/pc-task-runner): reused for CHECKED_MS, so mounting the chip or focusing the window doesn't run the CLI each
 * time. Gone on any sign-in change here (advance), and replaced by every full check (Settings, AI subscriptions).
 */
const CHECKED_MS = 60_000;
const checked = new Map<LocalSubscriptionKind, { at: number; generation: number; value: LocalSubscriptionStatus }>();
/** For tests: forget the cached checks. */
export const forgetLocalChecks = () => checked.clear();
/** The sign-in as last checked within a minute (and nothing changed here since), else checked now. */
export async function cachedLocalSubscriptionStatus(kind: LocalSubscriptionKind): Promise<LocalSubscriptionStatus> {
  const c = checked.get(kind);
  if (c && Date.now() - c.at < CHECKED_MS && c.generation === (generations.get(kind) ?? 0) && !registry.logins.has(kind) && !signingOut.has(kind)) return c.value;
  return getLocalSubscriptionStatus(kind);
}
const status = (kind: LocalSubscriptionKind, state: LocalSubscriptionStatus["state"], extra: Partial<LocalSubscriptionStatus> = {}): LocalSubscriptionStatus => ({ kind, available: state !== "missing", connected: state === "connected", state, checkedAt: Date.now(), ...extra });
const args = (kind: LocalSubscriptionKind, action: "status" | "login" | "logout") => {
  if (kind === "claude") return ["auth", action, ...(action === "status" ? ["--json"] : action === "login" ? ["--claudeai"] : [])];
  if (action === "logout") return ["logout"];
  return ["-c", 'forced_login_method="chatgpt"', "login", ...(action === "status" ? ["status"] : [])];
};
function providerUrl(kind: LocalSubscriptionKind, text: string): string | undefined {
  // Claude's printed URL requires pasting a code into the CLI, which Bops cannot
  // accept. Only its automatically opened browser flow can complete here.
  if (kind === "claude") return undefined;
  for (const candidate of text.match(/https:\/\/[^\s<>"']+/g) ?? []) {
    try {
      const u = new URL(candidate);
      const hosts = ["auth.openai.com", "chatgpt.com"];
      if (u.protocol === "https:" && !u.username && !u.password && !u.port && hosts.includes(u.hostname) && /(?:oauth|authorize|device)/.test(u.pathname)) return u.href;
    } catch { /* untrusted CLI output */ }
  }
}
const stoppingStatus = (kind: LocalSubscriptionKind) => status(kind, "error", { error: "The previous CLI process is still stopping. Wait before trying again." });
/** A kill request is not proof of exit. Retain the lock even after the bounded wait expires. */
function stopOwned(kind: LocalSubscriptionKind, child: ChildProcess): Promise<boolean> {
  if (closed.has(child)) return Promise.resolve(true);
  const group = stopping.get(kind) ?? new Map<ChildProcess, Stopping>();
  const existing = group.get(child);
  if (existing) return existing.result;
  let resolve!: (closed: boolean) => void;
  const result = new Promise<boolean>(done => { resolve = done; });
  const entry = { child, result };
  group.set(child, entry);
  stopping.set(kind, group);
  const timer = setTimeout(() => resolve(false), 5000);
  child.once("close", () => { clearTimeout(timer); group.delete(child); if (stopping.get(kind) === group && group.size === 0) stopping.delete(kind); resolve(true); });
  try { child.kill("SIGKILL"); } catch { /* Keep the lock until close, even if signalling fails. */ }
  return result;
}
function launch(kind: LocalSubscriptionKind, command: string[]) {
  const runtime = localSubscriptionRuntime(kind);
  if (!runtime.file) return undefined;
  const child = spawn(runtime.file, command, { env: runtime.env, cwd: homedir(), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.once("close", () => closed.add(child));
  return child;
}
async function run(kind: LocalSubscriptionKind, command: string[]): Promise<{ code: number | null; text: string; failed: boolean }> {
  let child: ChildProcess | undefined;
  try { child = launch(kind, command); } catch { return { code: null, text: "", failed: true }; }
  if (!child) return { code: null, text: "", failed: true };
  const owned = child;
  return new Promise(resolve => {
    let text = "", bytes = 0, done = false;
    const finish = (code: number | null, failed = false) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, text, failed }); };
    const timer = setTimeout(() => { void stopOwned(kind, owned); finish(null, true); }, 15000);
    const read = (chunk: Buffer) => { bytes += chunk.length; if (bytes > 65536) { void stopOwned(kind, owned); finish(null, true); } else text += chunk.toString(); };
    child.stdout?.on("data", read); child.stderr?.on("data", read);
    child.once("error", () => { void stopOwned(kind, owned); finish(null, true); }); child.once("close", code => finish(code));
  });
}
export async function getLocalSubscriptionStatus(kind: LocalSubscriptionKind): Promise<LocalSubscriptionStatus> {
  const generation = generations.get(kind) ?? 0;
  const value = await checkLocalSubscription(kind);
  // Kept for cachedLocalSubscriptionStatus: a settled answer only, and only if nothing changed while it was checked.
  if (value.state !== "connecting" && (generations.get(kind) ?? 0) === generation) checked.set(kind, { at: Date.now(), generation, value });
  return value;
}
async function checkLocalSubscription(kind: LocalSubscriptionKind): Promise<LocalSubscriptionStatus> {
  if (stopping.has(kind)) return stoppingStatus(kind);
  if (!localSubscriptionRuntime(kind).file) return status(kind, "missing");
  if (signingOut.has(kind)) return status(kind, "error", { error: "Sign-out is still in progress." });
  const login = registry.logins.get(kind);
  if (login) return status(kind, "connecting", { loginUrl: login.url });
  const priorError = registry.errors.get(kind);
  // Check again always asks the CLI, so a sign-in completed outside Bops can recover.
  const signedOut = () => priorError ? status(kind, "error", { error: priorError }) : status(kind, "signed-out");
  const connected = (extra: Partial<LocalSubscriptionStatus> = {}) => { registry.errors.delete(kind); return status(kind, "connected", extra); };
  const generation = generations.get(kind) ?? 0;
  const result = await run(kind, args(kind, "status"));
  if (registry.logins.has(kind)) return status(kind, "connecting");
  if ((generations.get(kind) ?? 0) !== generation) return status(kind, "error", { error: "Sign-in changed during the check. Check again." });
  if (result.failed) return status(kind, "error", { error: "The CLI could not check its sign-in. Try again." });
  if (kind === "codex") {
    if (result.code === 0 && result.text.trim() === "Logged in using ChatGPT") return connected();
    if (/^(?:Not logged in|Logged in using an API key)/.test(result.text.trim())) return signedOut();
  } else {
    try {
      const data = JSON.parse(result.text);
      if (data.loggedIn === false) return signedOut();
      if (result.code === 0 && data.loggedIn === true && data.authMethod === "claude.ai") {
        const account = typeof data.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) && data.email.length < 255 ? data.email : undefined;
        const plan = ["pro", "max", "team", "enterprise"].includes(data.subscriptionType) ? data.subscriptionType : undefined;
        return connected({ account, plan });
      }
      if (data.loggedIn === true && typeof data.authMethod === "string") return signedOut();
    } catch { /* never expose CLI output */ }
  }
  return status(kind, "error", { error: "The CLI did not report a recognized subscription sign-in." });
}
export async function getLocalSubscriptions() { return Promise.all((["codex", "claude"] as const).map(getLocalSubscriptionStatus)); }
export async function startLocalLogin(kind: LocalSubscriptionKind) {
  if (stopping.has(kind)) return stoppingStatus(kind);
  if (signingOut.has(kind)) return status(kind, "error", { error: "Wait for sign-out to finish before signing in." });
  if (registry.logins.has(kind)) return getLocalSubscriptionStatus(kind);
  registry.errors.delete(kind);
  advance(kind);
  let child: ChildProcess | undefined;
  try { child = launch(kind, args(kind, "login")); } catch { return status(kind, "error", { error: "The CLI could not start sign-in." }); }
  if (!child) return status(kind, "missing");
  const owned = child;
  const entry: Login = { child, timer: setTimeout(() => {
    if (registry.logins.get(kind) !== entry) return;
    registry.errors.set(kind, "Sign-in timed out. Try again."); advance(kind); void stopOwned(kind, owned);
  }, 5 * 60_000) };
  registry.logins.set(kind, entry);
  let buffered = "", bytes = 0;
  const finish = (failed: boolean) => {
    clearTimeout(entry.timer);
    if (registry.logins.get(kind) !== entry) return;
    registry.logins.delete(kind);
    advance(kind);
    if (failed && !registry.errors.has(kind)) registry.errors.set(kind, "Sign-in did not complete. Try again.");
  };
  const read = (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > 65536) { clearTimeout(entry.timer); registry.errors.set(kind, "Sign-in returned too much output. Try again."); void stopOwned(kind, owned); return; }
    buffered = (buffered + chunk.toString()).slice(-8192);
    entry.url = providerUrl(kind, buffered) ?? entry.url;
  };
  child.stdout?.on("data", read); child.stderr?.on("data", read);
  child.once("error", () => { clearTimeout(entry.timer); registry.errors.set(kind, "Sign-in could not start. Try again."); void stopOwned(kind, owned); }); child.once("close", code => finish(code !== 0));
  return status(kind, "connecting");
}
export async function cancelLocalLogin(kind: LocalSubscriptionKind) {
  if (signingOut.has(kind)) return stoppingStatus(kind);
  advance(kind);
  const entry = registry.logins.get(kind);
  if (entry) { clearTimeout(entry.timer); if (!await stopOwned(kind, entry.child)) return stoppingStatus(kind); }
  if (stopping.has(kind)) return stoppingStatus(kind);
  registry.errors.delete(kind);
  return getLocalSubscriptionStatus(kind);
}
export async function logoutLocalSubscription(kind: LocalSubscriptionKind) {
  if (stopping.has(kind)) return stoppingStatus(kind);
  if (signingOut.has(kind)) return status(kind, "error", { error: "Sign-out is still in progress." });
  signingOut.add(kind);
  advance(kind);
  const entry = registry.logins.get(kind);
  try {
    if (entry) { clearTimeout(entry.timer); if (!await stopOwned(kind, entry.child)) return stoppingStatus(kind); }
    registry.errors.delete(kind);
    if (!localSubscriptionRuntime(kind).file) return status(kind, "missing");
    const result = await run(kind, args(kind, "logout"));
    if (result.failed || result.code !== 0) return status(kind, "error", { error: "The CLI could not sign out. Try again." });
  } finally { signingOut.delete(kind); advance(kind); }
  return getLocalSubscriptionStatus(kind);
}

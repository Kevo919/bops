import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
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

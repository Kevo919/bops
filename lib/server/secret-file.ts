import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataRoot } from "./user-paths";

/**
 * Secrets off the Mac (Windows, and a Linux server such as a Hostinger VPS): one file of secrets,
 * .data/secrets.enc.json, each value sealed with AES-256-GCM. The file alone is useless: its key is
 * kept somewhere else.
 *
 * - On Windows the key lives in Windows Credential Manager (under "Bops Vault"), which only this
 *   Windows user can read, the way the Mac keeps its secrets in its Keychain. (Credential Manager
 *   caps each entry at about 2.5 KB, which is why only the key goes there and not the secrets.)
 * - On Linux the key is BOPS_SECRET_KEY (64 hex characters, set it in .env.local or the service's
 *   environment); without it, one is made once in .data/secret.key, readable by this user only.
 *
 * Every value is read and written whole and the file replaced in one rename, so it's never half
 * written. Reads are cached in memory; the file is small (a few logins and tokens).
 */

const SERVICE = "Bops Vault";
const KEY_ACCOUNT = "bops-file-key";
const file = () => join(dataRoot(), "secrets.enc.json");

type Sealed = { iv: string; tag: string; data: string };
let cache: Record<string, Sealed> | undefined;
let keyPromise: Promise<Buffer> | undefined;

/** Windows Credential Manager, through @napi-rs/keyring (a prebuilt native module, loaded only on Windows). */
async function windowsKey(): Promise<Buffer> {
  const { Entry } = (await import("@napi-rs/keyring")) as typeof import("@napi-rs/keyring");
  const entry = new Entry(SERVICE, KEY_ACCOUNT);
  let hex: string | null = null;
  try {
    hex = entry.getPassword() ?? null;
  } catch {}
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    // A key made now with no file yet is fine; a key made now for a file that exists means the old
    // key is gone (another Windows user, a reset), and what the file holds can't be read again.
    if (existsSync(file())) console.warn("[secrets] the key for .data/secrets.enc.json is missing; saved logins and tokens need entering again");
    hex = randomBytes(32).toString("hex");
    entry.setPassword(hex);
  }
  return Buffer.from(hex, "hex");
}

/** Linux: BOPS_SECRET_KEY, else a key file next to the secrets, made once. */
function linuxKey(): Buffer {
  const env = process.env.BOPS_SECRET_KEY?.trim();
  if (env) {
    if (!/^[0-9a-f]{64}$/i.test(env)) throw new Error("BOPS_SECRET_KEY must be 64 hex characters (openssl rand -hex 32)");
    return Buffer.from(env, "hex");
  }
  const keyFile = join(dataRoot(), "secret.key");
  if (existsSync(keyFile)) return Buffer.from(readFileSync(keyFile, "utf8").trim(), "hex");
  mkdirSync(dirname(keyFile), { recursive: true });
  const hex = randomBytes(32).toString("hex");
  writeFileSync(keyFile, `${hex}\n`, { mode: 0o600 });
  return Buffer.from(hex, "hex");
}

const key = () => (keyPromise ??= process.platform === "win32" ? windowsKey() : Promise.resolve().then(linuxKey));

function load(): Record<string, Sealed> {
  if (cache) return cache;
  try {
    cache = existsSync(file()) ? (JSON.parse(readFileSync(file(), "utf8")) as Record<string, Sealed>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function save(all: Record<string, Sealed>) {
  mkdirSync(dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 });
  renameSync(tmp, file());
  cache = all;
}

/** Writes one after another, so two at once can't drop each other's value. */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

export const fileSetSecret = (account: string, value: string) =>
  serial(async () => {
    const k = await key();
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", k, iv);
    c.setAAD(Buffer.from(account, "utf8"));
    const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
    save({ ...load(), [account]: { iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") } });
  });

export async function fileGetSecret(account: string): Promise<string | null> {
  const sealed = load()[account];
  if (!sealed) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", await key(), Buffer.from(sealed.iv, "base64"));
    d.setAAD(Buffer.from(account, "utf8"));
    d.setAuthTag(Buffer.from(sealed.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(sealed.data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const fileDeleteSecret = (account: string) =>
  serial(async () => {
    const all = { ...load() };
    if (!(account in all)) return;
    delete all[account];
    save(all);
  });

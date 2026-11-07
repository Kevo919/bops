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
 * - On Windows the key lives in Windows Credential Manager (under "Bops Vault"), out of other Windows
 *   users' reach. Unlike the Mac's Keychain, Windows doesn't ask before another program of this same
 *   user reads it: anything running as you (a bot task with Full access among them) could. (Each
 *   entry holds about 2.5 KB at most, which is why only the key goes there and not the secrets.)
 * - On Linux the key is BOPS_SECRET_KEY (64 hex characters, set it in .env.local or the service's
 *   environment); without it, one is made once in .data/secret.key, readable by this user only.
 *
 * Every value is read and written whole and the file replaced in one rename, so it's never half
 * written. Reads are cached in memory; the file is small (a few logins and tokens).
 */

const SERVICE = "Bops Vault";
/**
 * The Credential Manager entry the key is in. A test sets BOPS_TEST_SECRET_KEY_ACCOUNT to a scratch name of its own, so
 * it never reads or makes the real one (scripts/test-cloud.mjs on Windows).
 */
const keyAccount = () => process.env.BOPS_TEST_SECRET_KEY_ACCOUNT?.trim() || "bops-file-key";
const file = () => join(dataRoot(), "secrets.enc.json");

type Sealed = { iv: string; tag: string; data: string };
let cache: Record<string, Sealed> | undefined;
let keyPromise: Promise<Buffer> | undefined;

/** Windows Credential Manager, through @napi-rs/keyring (a prebuilt native module, loaded only on Windows). */
async function windowsKey(): Promise<Buffer> {
  const { Entry } = (await import("@napi-rs/keyring")) as typeof import("@napi-rs/keyring");
  const entry = new Entry(SERVICE, keyAccount());
  // Any error reading it (Credential Manager locked or unavailable) stops here: making a new key then
  // would leave every saved secret unreadable for good. Only "there is none" makes one.
  const hex = entry.getPassword() ?? null;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  if (hex) throw new Error("The key for Bops' saved secrets in Windows Credential Manager isn't one Bops made.");
  if (existsSync(file()) && Object.keys(load()).length) throw new Error("The key for Bops' saved secrets is missing from Windows Credential Manager, so .data/secrets.enc.json can't be read.");
  const made = randomBytes(32).toString("hex");
  entry.setPassword(made);
  return Buffer.from(made, "hex");
}

/** Linux: BOPS_SECRET_KEY, else a key file next to the secrets, made once. */
function linuxKey(): Buffer {
  const env = process.env.BOPS_SECRET_KEY?.trim();
  if (env) {
    if (!/^[0-9a-f]{64}$/i.test(env)) throw new Error("BOPS_SECRET_KEY must be 64 hex characters (openssl rand -hex 32)");
    return Buffer.from(env, "hex");
  }
  // On the internet the key never sits next to the secrets: a copy of .data would hold both.
  if (process.env.BOPS_REQUIRE_REMOTE === "1") throw new Error("Set BOPS_SECRET_KEY (openssl rand -hex 32) on a server on the internet.");
  console.warn("[secrets] no BOPS_SECRET_KEY: the key is kept in .data/secret.key, next to the secrets it opens");
  const keyFile = join(dataRoot(), "secret.key");
  if (existsSync(keyFile)) {
    const hex = readFileSync(keyFile, "utf8").trim();
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error(".data/secret.key isn't a whole key (64 hex characters).");
    return Buffer.from(hex, "hex");
  }
  mkdirSync(dirname(keyFile), { recursive: true });
  const hex = randomBytes(32).toString("hex");
  writeFileSync(keyFile, `${hex}\n`, { mode: 0o600 });
  return Buffer.from(hex, "hex");
}

/** The key, read once; a failed read isn't kept, so the next use tries again. */
const key = () => {
  keyPromise ??= (process.platform === "win32" ? windowsKey() : Promise.resolve().then(linuxKey)).catch((e) => {
    keyPromise = undefined;
    throw e;
  });
  return keyPromise;
};

/**
 * The sealed secrets. A file that can't be read as such is set aside (secrets.enc.json.corrupt-<time>),
 * never written over: the next save would otherwise drop every secret it still held.
 */
function load(): Record<string, Sealed> {
  if (cache) return cache;
  if (!existsSync(file())) return (cache = {});
  try {
    cache = JSON.parse(readFileSync(file(), "utf8")) as Record<string, Sealed>;
  } catch {
    const aside = `${file()}.corrupt-${Date.now()}`;
    renameSync(file(), aside);
    console.warn(`[secrets] .data/secrets.enc.json couldn't be read; set aside as ${aside}`);
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

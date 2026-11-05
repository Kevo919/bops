import "server-only";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/*
 * This PC's .env.local, written from Settings so nobody has to open it: one setting at a time, every other line kept
 * as it was. The same design as Bot tasks on this PC's key writer (PR #80, pc-task-runner.ts saveExecutorKey), as a
 * shared helper it can move onto: a value that could end a line or start another setting is refused, the file is
 * written to a new file and moved over the old one (owner only), and a failed move leaves no copy behind. Nothing here
 * logs, returns or throws a value: errors are this file's own words.
 */

/**
 * The .env.local Bops read its keys from as it started: the one next to the app (the repo folder on the Windows app,
 * process.cwd()), or the one desktop/main.cjs names for a packaged server (BOPS_ENV_LOCAL).
 */
export const envLocalFile = () => process.env.BOPS_ENV_LOCAL || join(/*turbopackIgnore: true*/ process.cwd(), ".env.local");

/** A setting's name: capitals, digits and _ (what .env.example uses). */
const NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
/**
 * A key's shape, loosely (no provider's prefix is assumed): key characters only. No space, newline, `=`, `#` or quote,
 * so a pasted value can never end its line, start another setting or be read back as something else.
 */
export const looksLikeKey = (v: string) => /^[A-Za-z0-9._~+/:-]{8,400}$/.test(v);
/** A public web address (where texts arrive): https, a host, nothing that could break the line. */
export const looksLikeHttpsUrl = (v: string) => {
  if (!/^https:\/\/[A-Za-z0-9._~:/?&%+@!$*,;-]{3,400}$/.test(v) || v.includes("=")) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/** How a saved key shows: never the key, only that it's there and its last four characters. */
export const maskKey = (v: string | undefined) => (v ? `ends in ${v.slice(-4)}` : "");

/** The line that sets `name` (with or without `export`), as dotenv reads it. */
const setsName = (name: string) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);

/** What `file` sets `name` to (the last line that sets it), or undefined. Never logged or returned to a page. */
export function readEnvLocalValue(file: string, name: string): string | undefined {
  if (!NAME.test(name)) return undefined;
  let text = "";
  try {
    text = readFileSync(/*turbopackIgnore: true*/ file, "utf8");
  } catch {
    return undefined;
  }
  let found: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!setsName(name).test(line)) continue;
    let v = line.slice(line.indexOf("=") + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    found = v;
  }
  return found || undefined;
}

export class EnvLocalError extends Error {}

/**
 * Set `name` to `value` in `file` (or with "" take it out). Every other line stays as it was; the setting goes at the
 * end. Written to a new file beside it and moved over the old one, owner only. `valid` says what a value may look
 * like; one that doesn't, or a name that isn't a setting's, is refused before anything is written.
 */
export function setEnvLocal(file: string, name: string, value: string, valid: (v: string) => boolean = looksLikeKey) {
  if (!NAME.test(name)) throw new EnvLocalError("That isn't a setting Bops knows.");
  if (value && (!valid(value) || /[\r\n=]/.test(value))) throw new EnvLocalError("That doesn't look like a key. Paste the whole key, with no spaces.");
  let lines: string[] = [];
  try {
    lines = readFileSync(/*turbopackIgnore: true*/ file, "utf8").split(/\r?\n/);
  } catch {
    /* no file yet */
  }
  const kept = lines.filter((l) => !setsName(name).test(l));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  if (value) kept.push(`${name}=${value}`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ tmp, kept.length ? `${kept.join("\n")}\n` : "", { mode: 0o600 });
    renameSync(/*turbopackIgnore: true*/ tmp, file);
  } catch {
    // Never the file system's own message: it could name a path.
    throw new EnvLocalError("Bops couldn't save the key on this PC. Check that the Bops folder can be written to, then try again.");
  } finally {
    // A move that failed leaves no copy of the key behind.
    rmSync(/*turbopackIgnore: true*/ tmp, { force: true });
  }
}

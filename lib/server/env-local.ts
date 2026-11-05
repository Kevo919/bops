import "server-only";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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
 * A key's shape, loosely (no provider's prefix is assumed): key characters only. No space, newline, `=`, `#`, `$` or
 * quote, so a pasted value can never end its line, start another setting, be cut at a comment or be expanded as
 * another variable (Next reads .env.local with dotenv-expand, which expands $NAME).
 */
export const looksLikeKey = (v: string) => /^[A-Za-z0-9._~+/:-]{8,400}$/.test(v);
/** A public web address (where texts arrive): https, a host, nothing that could break the line. */
export const looksLikeHttpsUrl = (v: string) => {
  // `=` is allowed (a query string): setEnvLocal quotes such a value. Never `$`, `#`, a quote, a space or NUL.
  if (!/^https:\/\/[A-Za-z0-9._~:/?&%+@!*,;=-]{3,400}$/.test(v)) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * How a saved key shows: never the key. Its last four characters only when it's long enough (16 or more) that four
 * say little about it; a shorter one shows as "saved".
 */
export const maskKey = (v: string | undefined) => (!v ? "" : v.length >= 16 ? `ends in ${v.slice(-4)}` : "saved");

/**
 * What no saved value may hold, whatever its kind: a line break or NUL (a new line, a new setting), `$` (expanded as a
 * variable by dotenv-expand), or a quote or backslash (which would end or escape the quotes a value with `=` gets).
 */
export const UNSAFE_IN_VALUE = /[\r\n\0$"'`\\]/;

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
  if (value && (!valid(value) || UNSAFE_IN_VALUE.test(value))) throw new EnvLocalError("That doesn't look like a key. Paste the whole key, with no spaces.");
  let text: string | null = null;
  try {
    text = readFileSync(/*turbopackIgnore: true*/ file, "utf8");
  } catch {
    /* no file yet */
  }
  const lines = text === null ? [] : text.split(/\r?\n/);
  // The file's own line endings (Windows' CRLF stays CRLF) and its permissions are kept; a new file is owner only.
  const eol = text?.includes("\r\n") ? "\r\n" : "\n";
  let mode = 0o600;
  try {
    mode = statSync(/*turbopackIgnore: true*/ file).mode & 0o777;
  } catch {
    /* no file yet */
  }
  const kept = lines.filter((l) => !setsName(name).test(l));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  // A value with `=`, `#` or a space (an address with a query string) goes in double quotes, so dotenv reads it whole
  // and never as a comment; nothing in it can end the quotes (UNSAFE_IN_VALUE).
  if (value) kept.push(/[=#\s]/.test(value) ? `${name}="${value}"` : `${name}=${value}`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ tmp, kept.length ? `${kept.join(eol)}${eol}` : "", { mode });
    chmodSync(/*turbopackIgnore: true*/ tmp, mode);
    renameSync(/*turbopackIgnore: true*/ tmp, file);
  } catch {
    // Never the file system's own message: it could name a path.
    throw new EnvLocalError("Bops couldn't save the key on this PC. Check that the Bops folder can be written to, then try again.");
  } finally {
    // A move that failed leaves no copy of the key behind.
    rmSync(/*turbopackIgnore: true*/ tmp, { force: true });
  }
}

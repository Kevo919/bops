import type { Look, LookDensity, LookTheme } from "./types";

export type { Look, LookDensity, LookTheme };

/**
 * How the Bops window looks, checked and turned into CSS (Look, AppState.look). Pure, so the server
 * checks every field as it saves a look and the window checks the CSS again before it paints it, and
 * the tests run it with no server at all (scripts/test-look.mjs).
 */

/** How many looks before the current one are kept, so changes can be undone one at a time. */
export const LOOK_HISTORY = 20;
/** The most custom CSS a look may carry: 20 KB is far past useful and well past harmless. */
export const LOOK_CSS_LIMIT = 20_000;
/** What font_scale can range over, as a share of the usual text size. */
export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.4;
export const LOOK_THEMES: readonly LookTheme[] = ["light", "dark", "system"];
export const LOOK_DENSITIES: readonly LookDensity[] = ["compact", "normal", "roomy"];

/** A look couldn't be kept: `message` says why in plain words, for the owner and for the bot that asked. */
export class LookError extends Error {}

/** What one density does to the space between the window's parts, as a share of the usual. */
const DENSITY_SCALE: Record<LookDensity, number> = { compact: 0.85, normal: 1, roomy: 1.15 };

/**
 * The parts of CSS that can reach out of the window: loading a file (a stylesheet, a picture from
 * anywhere), running script (old IE), or hiding inside HTML. Anything here, spelled any way, and the
 * whole CSS is refused rather than picked apart: the owner or the bot is told why and can send it
 * without. A backslash is refused too, since CSS escapes could spell any of these a character at a
 * time, and no hand-written styles need one.
 */
const BANNED = [
  { test: (css: string) => /@import/i.test(css), why: "@import (loading another stylesheet)" },
  { test: (css: string) => /expression\s*\(/i.test(css), why: "expression()" },
  { test: (css: string) => /javascript\s*:/i.test(css), why: "javascript:" },
  // "behavior:" as its own property, so scroll-behavior and overscroll-behavior still work.
  { test: (css: string) => /(^|[^a-z-])behavior\s*:/i.test(css), why: "behavior:" },
  { test: (css: string) => /-moz-binding/i.test(css), why: "-moz-binding" },
  // image-set() can name a picture as a bare string, past url().
  { test: (css: string) => /image-set\s*\(/i.test(css), why: "image-set()" },
];

/**
 * Check custom CSS and hand it back clean, or refuse it with why. url() is the one thing on the list
 * that can stay: an image inlined as data:image/... (small pictures, icons) loads nothing, so it's
 * allowed and every other url() is not.
 */
export function sanitizeCss(css: string): string {
  const text = String(css ?? "");
  if (text.length > LOOK_CSS_LIMIT) throw new LookError(`The CSS is over ${LOOK_CSS_LIMIT} characters; keep it under that.`);
  // No "<" (HTML inside), no backslash (CSS escapes), no control characters (they can hide all of it).
  if (/[<\\\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new LookError('The CSS has a character that isn\'t allowed: "<", a backslash or a control character.');
  for (const b of BANNED) if (b.test(text)) throw new LookError(`The CSS uses ${b.why}, which could load or run something. Styles may only paint.`);
  const urls = text.match(/url\s*\(/gi) ?? [];
  for (const u of urls) {
    const rest = text.slice(text.indexOf(u)).slice(u.length);
    if (!/^\s*['"]?\s*data:image\//i.test(rest)) throw new LookError("The CSS loads a web address with url(); only url(data:image/...) pictures, inlined, are allowed.");
  }
  return text.trim();
}

/** A hex color as the look keeps it (#RRGGBB, lowercase), or a LookError saying why it isn't one. */
function accentOf(v: unknown): string {
  if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v.trim())) throw new LookError(`The accent color must be a hex color like #1F6F43, not "${String(v)}".`);
  return v.trim().toLowerCase();
}

/**
 * Check what a change asked for, field by field, and give back the look to keep: only the fields it
 * named, cleaned. One that's wrong (a theme that isn't one, a bad color, CSS that could load or run
 * something) refuses the whole change with why, so nothing half-checked is ever kept.
 */
export function validateLook(input: unknown): Look {
  if (!input || typeof input !== "object") throw new LookError("A look change needs at least one of theme, accent, font_scale, density or css.");
  const raw = input as Record<string, unknown>;
  const out: Look = {};
  let named = 0;
  if (raw.theme !== undefined && raw.theme !== null) {
    if (!LOOK_THEMES.includes(raw.theme as LookTheme)) throw new LookError(`The theme must be light, dark or system, not "${String(raw.theme)}".`);
    out.theme = raw.theme as LookTheme;
    named++;
  }
  if (raw.accent !== undefined && raw.accent !== null) {
    // "" takes the accent back to Bops' own, like the Default button in Settings.
    out.accent = typeof raw.accent === "string" && !raw.accent.trim() ? "" : accentOf(String(raw.accent));
    named++;
  }
  if (raw.font_scale !== undefined && raw.font_scale !== null) {
    const n = Number(raw.font_scale);
    if (!Number.isFinite(n)) throw new LookError(`The text size must be a number between ${FONT_SCALE_MIN} and ${FONT_SCALE_MAX}, not "${String(raw.font_scale)}".`);
    // Held inside its range rather than refused: a bot's "make it twice as big" becomes the most it can be.
    out.fontScale = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
    named++;
  }
  if (raw.density !== undefined && raw.density !== null) {
    if (!LOOK_DENSITIES.includes(raw.density as LookDensity)) throw new LookError(`The density must be compact, normal or roomy, not "${String(raw.density)}".`);
    out.density = raw.density as LookDensity;
    named++;
  }
  if (raw.css !== undefined && raw.css !== null) {
    if (typeof raw.css !== "string") throw new LookError(`The CSS must be text, not "${String(raw.css)}".`);
    // An empty string clears the custom CSS; anything else is checked in full.
    out.css = !raw.css.trim() ? "" : sanitizeCss(raw.css);
    named++;
  }
  if (!named) throw new LookError("A look change needs at least one of theme, accent, font_scale, density or css.");
  return out;
}

/** The dark palette over the app's own (globals.css): the window's papers and inks, turned over. */
const DARK_VARS = `  color-scheme: dark;
  --color-paper: #17191c;
  --color-desk: #101214;
  --color-ink: #f2f2f0;
  --color-pencil: #9a9a98;
  --color-rule: #2a2c2f;
  --color-white: #1c1f22;
  --color-black: #0a0a0a;`;

/**
 * The CSS for a look: variables the window's own rules and the custom CSS both build on, the palette
 * turned over for dark, text size and spacing scaled, and the (already checked) custom CSS after it.
 * The window checks the custom CSS again with sanitizeCss before it paints any of this, so state that
 * somehow slipped past the server still can't load or run anything.
 */
export function lookCssText(look: Look): string {
  const lines: string[] = [];
  const vars: string[] = [];
  if (look.accent) {
    // The accent takes the highlighter's place (buttons, marks, what needs the owner) and the focus ring.
    vars.push(`  --bops-accent: ${look.accent};`, `  --color-highlighter: ${look.accent};`, `  --color-ring: ${look.accent};`);
  }
  if (look.density && look.density !== "normal") vars.push(`  --spacing: calc(0.25rem * ${DENSITY_SCALE[look.density]});`);
  if (vars.length) lines.push(`:root {\n${vars.join("\n")}\n}`);
  if (look.theme === "dark") lines.push(`:root {\n${DARK_VARS}\n}`);
  if (look.theme === "system") lines.push(`@media (prefers-color-scheme: dark) {\n:root {\n${DARK_VARS}\n}\n}`);
  // Text size: the window sizes its text in pixels, so the base font size moves nothing; zoom is the
  // one lever that scales every piece of text, and the layout with it, as "bigger text" should.
  if (look.fontScale !== undefined && look.fontScale !== 1) lines.push(`body {\n  zoom: ${look.fontScale};\n}`);
  if (look.css) lines.push(look.css);
  return lines.join("\n");
}

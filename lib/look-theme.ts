import { DARK_PALETTE } from "./look-palette";
import type { Look, LookDensity, LookTheme, MotionLevel, MotionSpeed } from "./types";
import { layoutUsed, normalizeLayout } from "./widgets";

export type { Look, LookDensity, LookTheme, MotionLevel, MotionSpeed };

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
export const MOTION_LEVELS: readonly MotionLevel[] = ["off", "subtle", "normal", "lively"];
export const MOTION_SPEEDS: readonly MotionSpeed[] = ["slow", "normal", "fast"];

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
  { test: (css: string) => /@namespace/i.test(css), why: "@namespace" },
  { test: (css: string) => /expression\s*\(/i.test(css), why: "expression()" },
  { test: (css: string) => /javascript\s*:/i.test(css), why: "javascript:" },
  // "behavior:" as its own property, so scroll-behavior and overscroll-behavior still work.
  { test: (css: string) => /(^|[^a-z-])behavior\s*:/i.test(css), why: "behavior:" },
  { test: (css: string) => /-moz-binding/i.test(css), why: "-moz-binding" },
  // These can each name a picture or a file as a bare string, or paint another part of the page, past url().
  { test: (css: string) => /image-set\s*\(/i.test(css), why: "image-set()" },
  { test: (css: string) => /\bsrc\s*\(/i.test(css), why: "src()" },
  { test: (css: string) => /\bimage\s*\(/i.test(css), why: "image()" },
  { test: (css: string) => /cross-fade\s*\(/i.test(css), why: "cross-fade()" },
  // element() and -moz-element() both.
  { test: (css: string) => /element\s*\(/i.test(css), why: "element()" },
  { test: (css: string) => /\bpaint\s*\(/i.test(css), why: "paint()" },
  { test: (css: string) => !fontFacesLocal(css), why: "@font-face with a src that isn't local() (loading a font)" },
];

/** Whether every @font-face in the CSS takes its fonts only from this computer (src: local(...)), or there's none. */
function fontFacesLocal(css: string): boolean {
  const faces = css.match(/@font-face/gi)?.length ?? 0;
  if (!faces) return true;
  const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/gi)];
  // One that doesn't close where it should can't be checked, so it isn't kept.
  if (blocks.length !== faces) return false;
  const onlyLocal = /^\s*local\(\s*(?:"[^"()]*"|'[^'()]*'|[^"'()]*)\s*\)(?:\s*,\s*local\(\s*(?:"[^"()]*"|'[^'()]*'|[^"'()]*)\s*\))*\s*(?:!important\s*)?$/i;
  for (const [, body] of blocks)
    for (const d of body.split(";")) {
      const m = /^\s*src\s*:([\s\S]*)$/i.exec(d);
      if (m && !onlyLocal.test(m[1])) return false;
    }
  return true;
}

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
  // Every url(), each where it stands (not just the first of each spelling): each must be an inlined picture.
  for (const u of text.matchAll(/url\s*\(/gi)) {
    const rest = text.slice((u.index ?? 0) + u[0].length);
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
  if (!input || typeof input !== "object") throw new LookError("A look change needs at least one of theme, accent, font_scale, density, css, motion or motion_speed.");
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
  if (raw.motion !== undefined && raw.motion !== null) {
    if (!MOTION_LEVELS.includes(raw.motion as MotionLevel)) throw new LookError(`The animations must be off, subtle, normal or lively, not "${String(raw.motion)}".`);
    out.motion = raw.motion as MotionLevel;
    named++;
  }
  if (raw.motion_speed !== undefined && raw.motion_speed !== null) {
    if (!MOTION_SPEEDS.includes(raw.motion_speed as MotionSpeed)) throw new LookError(`The animation speed must be slow, normal or fast, not "${String(raw.motion_speed)}".`);
    out.motionSpeed = raw.motion_speed as MotionSpeed;
    named++;
  }
  if (!named) throw new LookError("A look change needs at least one of theme, accent, font_scale, density, css, motion or motion_speed.");
  return out;
}

/**
 * Any look, however it came (the state file, the cloud's copy, a message's card, the window's state),
 * made into one that's safe to paint: a field that isn't what it should be goes back to Bops' own
 * (left out), so nothing but what validateLook would keep ever reaches CSS. The theme and spacing
 * from their lists, the accent a #RRGGBB, the text size a number held inside its range, and the
 * custom CSS through sanitizeCss (dropped whole if it doesn't pass).
 */
export function normalizeLook(input: unknown): Look {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const out: Look = {};
  if (LOOK_THEMES.includes(raw.theme as LookTheme)) out.theme = raw.theme as LookTheme;
  if (typeof raw.accent === "string" && /^#[0-9a-f]{6}$/i.test(raw.accent)) out.accent = raw.accent.toLowerCase();
  // A text size that isn't a finite number is the usual one (1), which is no field at all.
  if (typeof raw.fontScale === "number" && Number.isFinite(raw.fontScale)) {
    const n = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, raw.fontScale));
    if (n !== 1) out.fontScale = n;
  }
  if (LOOK_DENSITIES.includes(raw.density as LookDensity)) out.density = raw.density as LookDensity;
  // The usual motion is no field at all, like the usual text size.
  if (MOTION_LEVELS.includes(raw.motion as MotionLevel) && raw.motion !== "normal") out.motion = raw.motion as MotionLevel;
  if (MOTION_SPEEDS.includes(raw.motionSpeed as MotionSpeed) && raw.motionSpeed !== "normal") out.motionSpeed = raw.motionSpeed as MotionSpeed;
  // The widgets, checked whole (lib/widgets.ts), and kept only when there's something in them.
  if (raw.layout !== undefined) {
    const layout = normalizeLayout(raw.layout);
    if (layoutUsed(layout)) out.layout = layout;
  }
  if (typeof raw.css === "string" && raw.css.trim())
    try {
      out.css = sanitizeCss(raw.css);
    } catch {
      // CSS that doesn't pass is dropped, and the rest of the look still applies.
    }
  return out;
}

/** The look state as it's kept (AppState.look), every look in it normalized and the history held to LOOK_HISTORY. */
export function normalizeLookState(input: unknown): { current: Look; history: Look[] } {
  const raw = (input && typeof input === "object" ? input : {}) as { current?: unknown; history?: unknown };
  return { current: normalizeLook(raw.current), history: (Array.isArray(raw.history) ? raw.history : []).slice(0, LOOK_HISTORY).map(normalizeLook) };
}

/**
 * How much and how fast the window moves (Look.motion, Look.motionSpeed), as the variables every motion-
 * class in globals.css reads: --motion-time scales how long each takes, --motion-reach how far it travels.
 * Off stops them all: every motion- class, the mascots' loops and the animate- ones, transitions too. The
 * system's own ask for less motion stops them whatever this says (globals.css's reduced motion blocks,
 * and the same rule here once more, so nothing a look says can start them again).
 */
const MOTION_TIME: Record<MotionLevel, number> = { off: 0, subtle: 0.75, normal: 1, lively: 1.2 };
const MOTION_REACH: Record<MotionLevel, number> = { off: 0, subtle: 0.4, normal: 1, lively: 1.8 };
const SPEED_TIME: Record<MotionSpeed, number> = { slow: 1.6, normal: 1, fast: 0.6 };
const MOVING = '[class*="motion-"], [class*="mascot-"], [class*="animate-"], [class*="boppy-"]';
const STILL = `${MOVING.split(", ").map((s) => `${s}, ${s}::before, ${s}::after`).join(", ")} {\n  animation: none !important;\n  transition: none !important;\n}`;
/**
 * And everything else that moves: every Tailwind transition (duration-200 and the rest), the pages sliding in, a
 * scroll that glides. Durations go to nothing, so what changes is just there; nothing loops.
 */
const STILL_ALL = `*, *::before, *::after {\n  transition-duration: 0s !important;\n  transition-delay: 0s !important;\n  animation-duration: 0s !important;\n  animation-delay: 0s !important;\n  animation-iteration-count: 1 !important;\n  scroll-behavior: auto !important;\n}`;

export function motionCss(level: MotionLevel = "normal", speed: MotionSpeed = "normal"): string {
  if (level === "off") return `:root {\n  --motion-time: 0;\n  --motion-reach: 0;\n}\n${STILL}\n${STILL_ALL}`;
  const lines: string[] = [];
  const time = Math.round(MOTION_TIME[level] * SPEED_TIME[speed] * 100) / 100;
  const reach = MOTION_REACH[level];
  // Tailwind's transitions with no duration of their own take --default-transition-duration (150ms): scaled the same.
  if (time !== 1 || reach !== 1) lines.push(`:root {\n  --motion-time: ${time};\n  --motion-reach: ${reach};\n  --default-transition-duration: ${Math.round(150 * time)}ms;\n}`);
  if (lines.length) lines.push(`@media (prefers-reduced-motion: reduce) {\n${STILL}\n${STILL_ALL}\n}`);
  return lines.join("\n");
}

/**
 * The dark palette over the app's own (globals.css): the window's papers and inks, turned over. The named colors
 * (ink, paper, white...), the page's own (shadcn's background and foreground, which the body and the sidebar sit
 * on; its primary is the raised grey of a dark fill and its destructive the lifted red, as the palette's are),
 * the bots' washes (lib/look.ts: a deep shade of the bot's color, not a pale one, so words on them read),
 * and every hard-coded color of the window's classes (DARK_PALETTE, generated by scripts/look-palette.mjs from
 * components/app; app/look-palette.css has their light values), so every screen turns, not just a part.
 */
const DARK_VARS = `  color-scheme: dark;
  --color-paper: #17191c;
  --color-desk: #101214;
  --color-ink: #f2f2f0;
  --color-pencil: #a3a3a1;
  --color-rule: #2a2c2f;
  --color-white: #1c1f22;
  --color-black: #0a0a0a;
  --background: #17191c;
  --foreground: #f2f2f0;
  --card: #1c1f22;
  --card-foreground: #f2f2f0;
  --popover: #1c1f22;
  --popover-foreground: #f2f2f0;
  --primary: #3d4043;
  --primary-foreground: #f5f5f3;
  --destructive: #fe8c7b;
  --secondary: #26292d;
  --secondary-foreground: #f2f2f0;
  --muted: #26292d;
  --muted-foreground: #a3a3a1;
  --accent: #26292d;
  --accent-foreground: #f2f2f0;
  --border: #2e3135;
  --input: #34373b;
  --sidebar: #17191c;
  --sidebar-foreground: #f2f2f0;
  --sidebar-border: #2e3135;
  --bops-wash-base: #1c1f22;
  --bops-wash-k: 0.6;
  --bops-desk-0: oklab(29% -0.025 0.05);
  --bops-desk-1: oklab(32% -0.035 0.065);
  --bops-desk-2: oklab(36% -0.04 0.075);
${DARK_PALETTE}`;

/**
 * The dark look: the palette, and the highlighter's ink. What's marked in the highlighter (a yellow button, a badge)
 * inherits its words' color from around it, which the dark look turns light; on the highlighter they stay dark, or
 * light on an accent dark enough to need it (black or white, whichever reads on the accent's lightness). And the
 * hint in an empty box is the faint ink, whatever share of the ink it was in light: still 4.5:1 on any field. The
 * loading Boppy and its notes (mascot.tsx, drawn in the ink's #0A0A0A) are the raised grey of a dark fill, not black
 * on the dark paper. An icon button's glyph drawn in one of the inks (stroke="#0A0A0A" and the greys: SVG attributes
 * the palette's classes never reach) takes that ink's dark-look word color, so it reads at 3:1 or more on the dark
 * paper (task 87: the sidebar's and the side panel's toggles were near-black on it).
 */
const DARK_CSS = `:root {
${DARK_VARS}
}
.bg-highlighter {
  color: oklch(from var(--color-highlighter) clamp(0, (0.62 - l) * 1000, 1) 0 0);
}
input::placeholder,
textarea::placeholder {
  color: #a7a7a5;
}
.boppy-loading-scene [fill="#0A0A0A"] {
  fill: var(--hb-0a0a0a);
}
button svg [stroke="#0A0A0A" i] {
  stroke: var(--ht-0a0a0a);
}
button svg [stroke="#3A3A38" i] {
  stroke: var(--ht-3a3a38);
}
button svg [stroke="#6B6B6B" i] {
  stroke: var(--ht-6b6b6b);
}
button svg [stroke="#8A8A88" i] {
  stroke: var(--ht-8a8a88);
}
button svg [stroke="#9A9A98" i] {
  stroke: var(--ht-9a9a98);
}
button svg [fill="#3A3A38" i] {
  fill: var(--ht-3a3a38);
}`;

/**
 * The CSS for a look: variables the window's own rules and the custom CSS both build on, the palette
 * turned over for dark, text size and spacing scaled, and the custom CSS after it. Built only from
 * normalizeLook's copy, every field checked again here, so a look that somehow slipped past the
 * server (a hostile accent, CSS that loads something) still can't paint more than a look may.
 */
export function lookCssText(input: unknown): string {
  const look = normalizeLook(input);
  const lines: string[] = [];
  const vars: string[] = [];
  if (look.accent) {
    // The accent takes the highlighter's place (buttons, marks, what needs the owner) and the focus ring.
    vars.push(`  --bops-accent: ${look.accent};`, `  --color-highlighter: ${look.accent};`, `  --color-ring: ${look.accent};`);
  }
  if (look.density && look.density !== "normal") vars.push(`  --spacing: calc(0.25rem * ${DENSITY_SCALE[look.density]});`);
  if (vars.length) lines.push(`:root {\n${vars.join("\n")}\n}`);
  if (look.theme === "dark") lines.push(DARK_CSS);
  if (look.theme === "system") lines.push(`@media (prefers-color-scheme: dark) {\n${DARK_CSS}\n}`);
  // Text size: the window sizes its text in pixels, so the base font size moves nothing; zoom is the
  // one lever that scales every piece of text, and the layout with it, as "bigger text" should.
  if (look.fontScale !== undefined && look.fontScale !== 1) lines.push(`body {\n  zoom: ${look.fontScale};\n}`);
  const motion = motionCss(look.motion, look.motionSpeed);
  if (motion) lines.push(motion);
  if (look.css) lines.push(look.css);
  return lines.join("\n");
}

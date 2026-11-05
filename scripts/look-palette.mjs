// The look's palette (lib/look-theme.ts): every hard-coded color the window's own classes use is a variable named
// for the color and for what it colors (components/app/*.tsx write `bg-[color:var(--hb-f2f2f0)]` where they once
// wrote `bg-[#F2F2F0]`): `--ht-<hex>` for words (text, caret, accent, fill, stroke), `--hb-<hex>` for fills (bg,
// from, via, to), `--h-<hex>` for lines and shadows (border, shadow, outline, decoration, divide, ring). bg-ink is
// `--hb-0a0a0a`, text-white is `--bops-on-fill` (white words on a dark or strong fill). This script finds them all
// and writes:
//   - app/look-palette.css: each variable as the color it names, so the light look is exactly what it was;
//   - lib/look-palette.ts: the same variables turned over for the dark theme (DARK_PALETTE), which lookCssText puts
//     in the dark look's :root (and the system look's prefers-color-scheme: dark), beside the named colors.
// The dark color of each is worked out in OKLab, not picked by hand, by what it colors:
//   - lines and shadows: light papers and lines become dark ones (the lighter in light, the darker in dark, so lines
//     and rings still stand off the page), the ink's focus rings become light;
//   - fills: papers, chips and hovers become dark papers the same way; the ink's dark fills (a sent message, a
//     primary button) become a raised dark grey, so they still carry white words; pale tints become deep tints of
//     the same hue; strong colors (a red button, a green dot) and the highlighter's vivid yellows stay as they are;
//   - words: inks become light inks, the order kept and the faintest still readable at WCAG AA on the papers, and
//     strong colors are lifted to read on a dark page.
// Black at a low alpha (a hairline) becomes white at that alpha; deeper black shadows stay black, a little stronger.
// A class with a hex the palette doesn't have yet is a variable with no value, so run this after adding one:
//   node scripts/look-palette.mjs           (writes both files)
//   node scripts/look-palette.mjs --check   (fails if either is out of date, or a class still has a raw hex)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "components", "app");
const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
const used = { h: new Set(), ht: new Set(), hb: new Set() };
const raw = [];
const RAW = /(^|[\s"'`:!{(])((?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|shadow|inset-shadow|outline|divide|decoration|accent|caret|fill|stroke|from|via|to)-)\[([^\]\s"'`]*#[0-9a-fA-F]{3,8}[^\]\s"'`]*)\]/g;
for (const f of files) {
  const src = readFileSync(join(dir, f), "utf8");
  for (const m of src.matchAll(/--(h|ht|hb)-([0-9a-f]{6}(?:[0-9a-f]{2})?)\b/g)) used[m[1]].add(m[2]);
  for (const m of src.matchAll(RAW)) raw.push(`${f}: ${m[2]}[${m[3]}]`);
  // An arbitrary property (`[background-image:radial-gradient(#DDDDD8_1px,...)]`) with a raw hex in it, too.
  for (const m of src.matchAll(/(?:^|[\s"'`:!{(])\[[a-z-]+:[^\]\s"'`]*#[0-9a-fA-F]{3,8}[^\]\s"'`]*\]/g)) raw.push(`${f}: ${m[0].trim()}`);
}

// ---- color math (sRGB <-> OKLab) ----------------------------------------------------------------------------------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toLab([r, g, b]) {
  [r, g, b] = [r, g, b].map((x) => lin(x / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(gam);
}
/** OKLCH to a #rrggbb in gamut: the chroma comes down until it fits, the lightness and hue kept. */
function hexOf(L, C, h) {
  for (let c = C; ; c *= 0.94) {
    const rgb = fromLab([L, c * Math.cos(h), c * Math.sin(h)]);
    if (rgb.every((x) => x >= -0.0005 && x <= 1.0005) || c < 1e-4)
      return "#" + rgb.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0")).join("");
  }
}
const parse = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The dark look's white (lib/look-theme.ts --color-white), as OKLCH: where the papers start. */
const PAPER = (([L, a, b]) => [L, Math.hypot(a, b), Math.atan2(b, a)])(toLab(parse("1c1f22")));

/** The dark look's color for a line or a shadow (and, through it, the base rules the others build on). */
function lineOf(hex) {
  const alpha = hex.length === 8 ? hex.slice(6) : "";
  const [L, a, b] = toLab(parse(hex));
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  if (alpha) {
    const al = parseInt(alpha, 16);
    // Black at a low alpha is a hairline: white at that alpha draws it on a dark page. Deeper, it's a shadow: kept, a little stronger.
    // The ink (#0A0A0A) at an alpha is a line or a faint mark in any amount: the light ink at that alpha.
    if (hex.startsWith("0a0a0a")) return `#f2f2f0${alpha}`;
    if (L < 0.25) return al <= 0x1f ? `#ffffff${alpha}` : `#000000${Math.min(255, Math.round(al * 1.5)).toString(16).padStart(2, "0")}`;
    // Any other dark color at an alpha is a tinted shadow: kept as it is.
    if (L < 0.45) return `#${hex}`;
    // White at an alpha (a frosted edge) becomes the dark paper at that alpha.
    if (L > 0.9 && C < 0.02) return `#1c1f22${alpha}`;
    return `${lineOf(hex.slice(0, 6))}${alpha}`;
  }
  // The highlighter's vivid yellows and greens stay: they mark what needs you, and carry dark ink on any page.
  if (L >= 0.86 && C > 0.1) return `#${hex}`;
  if (C < 0.008) {
    // Papers, chips, hovers and lines: lighter in light is darker in dark.
    // White is the dark look's white (--color-white, #1c1f22), and the rest take its cool tint.
    if (L >= 0.78) return hexOf(PAPER[0] + (1 - L) * 1.5, PAPER[1], PAPER[2]);
    // Inks and dark fills: the darkest ink is the lightest, the faint ones still readable.
    return hexOf(0.955 - (L - 0.145) * 0.42, Math.min(C, 0.004), h);
  }
  // Pale tints (an error's wash, a note's): a deep tint of the same hue.
  if (L >= 0.86) return hexOf(PAPER[0] + (1 - L) * 1.2 + 0.03, Math.min(Math.max(C * 1.4, 0.03), 0.06), h);
  // Strong colors (reds, greens, blues as text, dots and buttons): lifted to read on a dark page.
  return hexOf(Math.max(L, 0.76), C, h);
}

/** The dark look's color for words: light inks, the faintest still readable; strong colors lifted. */
function textOf(hex) {
  if (hex.length === 8) return lineOf(hex);
  const [L, a, b] = toLab(parse(hex));
  const C = Math.hypot(a, b);
  if (L >= 0.86 && C > 0.1) return `#${hex}`;
  // Pale words (a "0" in a faint grey, a hint) are the faintest ink: still 4.5:1 on the papers.
  if (C < 0.008) return hexOf(L >= 0.78 ? 0.74 : 0.96 - (L - 0.145) * 0.38, Math.min(C, 0.004), Math.atan2(b, a));
  return hexOf(Math.max(L, 0.76), C, Math.atan2(b, a));
}

/** The dark look's color for a fill: papers dark, the ink's fills raised, tints deep, strong colors kept. */
function fillOf(hex) {
  if (hex.length === 8) return lineOf(hex);
  const [L, a, b] = toLab(parse(hex));
  const C = Math.hypot(a, b);
  if (C < 0.008) {
    if (L >= 0.78) return lineOf(hex);
    // A dark fill (a sent message, a primary button, its hover) is a raised grey, lighter as it was lighter.
    return hexOf(0.37 + (L - 0.145) * 0.33, PAPER[1], PAPER[2]);
  }
  if (L >= 0.86 && C <= 0.1) return lineOf(hex);
  return `#${hex}`;
}

const ROLES = [
  ["h", lineOf],
  ["ht", textOf],
  ["hb", fillOf],
];
const list = (f) => ROLES.flatMap(([r, of]) => [...used[r]].sort().map((h) => f(r, h, of))).join("\n");
const count = ROLES.reduce((n, [r]) => n + used[r].size, 0);
const light = list((r, h) => `  --${r}-${h}: #${h};`);
const dark = list((r, h, of) => `  --${r}-${h}: ${of(h)};`);
const css = `/* Generated by scripts/look-palette.mjs: every hard-coded color components/app's classes use, as itself (the light
   look). The dark look turns each over (lib/look-palette.ts, put in by lookCssText). Don't edit by hand. */
:root {
  /* Black, for the faint tints of hovers and hairlines (bg-[color:var(--bops-tint)]/[0.04]); white in the dark look. */
  --bops-tint: #000;
  /* White words on a dark or strong fill (text-white was): they stay light in the dark look, where the fills do too. */
  --bops-on-fill: #fff;
${light}
}
`;
const ts = `// Generated by scripts/look-palette.mjs from components/app's classes. Don't edit by hand: run the script.
/** The dark look's value for each hard-coded color of the window (app/look-palette.css has the light ones). */
export const DARK_PALETTE = \`  --bops-tint: #fff;
  --bops-on-fill: #f5f5f3;
${dark}\`;
`;
const cssPath = join(root, "app", "look-palette.css");
const tsPath = join(root, "lib", "look-palette.ts");
if (process.argv.includes("--check")) {
  const stale = [];
  if (readFileSync(cssPath, "utf8") !== css) stale.push("app/look-palette.css");
  if (readFileSync(tsPath, "utf8") !== ts) stale.push("lib/look-palette.ts");
  if (stale.length || raw.length) {
    if (stale.length) console.error(`Out of date: ${stale.join(", ")}. Run node scripts/look-palette.mjs`);
    if (raw.length) console.error(`A class with a raw hex color (write it as bg-[color:var(--h-<hex>)] and run the script):\n  ${raw.slice(0, 20).join("\n  ")}`);
    process.exit(1);
  }
  console.log(`look palette up to date: ${count} colors`);
} else {
  writeFileSync(cssPath, css);
  writeFileSync(tsPath, ts);
  console.log(`wrote app/look-palette.css and lib/look-palette.ts: ${count} colors`);
}

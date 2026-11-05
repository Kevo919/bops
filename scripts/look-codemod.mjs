// Turns the window's light-only colors into the look's palette variables, so the dark look can turn them over
// (lib/look-theme.ts, scripts/look-palette.mjs). In components/app's class names:
//   - a raw hex in a color utility becomes a variable named for its color and for what it colors:
//       fills   bg-[#F2F2F0]                 -> bg-[color:var(--hb-f2f2f0)]            (bg, from, via, to)
//       words   text-[#6B6B6B]               -> text-[color:var(--ht-6b6b6b)]          (text, caret, accent, fill, stroke)
//       lines   shadow-[0_0_0_1px_#E6E6E3]   -> shadow-[0_0_0_1px_var(--h-e6e6e3)]     (border, ring, shadow, outline,
//                                                                                       divide, decoration)
//     and in an arbitrary property: [background-image:radial-gradient(#DDDDD8_1px,...)] -> var(--h-ddddd8)
//     (a fill's in [background...], a word's in [color:...], a line's in anything else);
//   - bg-ink -> bg-[color:var(--hb-0a0a0a)] (a dark fill: a raised grey in the dark look, not the light ink);
//   - text-white -> text-[color:var(--bops-on-fill)] (white words on a dark or strong fill stay light);
//   - a faint black tint, bg-/border-/divide-black at an alpha up to 0.12 (hovers, hairlines) ->
//     [color:var(--bops-tint)] at that alpha (white in the dark look); deeper ones (a scrim, bg-black/70) stay.
// Hex is lowercased and a short one (#FFF, #0000) spelled out; variants (hover:, aria-pressed:, max-md:, has-[...]:)
// and modifiers (/15, /[0.04]) are kept as they are. Each light value is the very color it replaces
// (app/look-palette.css), so the light look doesn't change. It's idempotent: what it writes, it never matches again.
//
// Usage: node scripts/look-codemod.mjs [dir-or-file ...]   (default components/app), then node scripts/look-palette.mjs
// scripts/look-palette.mjs --check runs convert() over components/app and fails on anything it would still change.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const B = `(^|[\\s"'\`:!{(])`;
const FILL = "bg|from|via|to";
const WORD = "text|caret|accent|fill|stroke";
const LINE = "border(?:-[trblxyse])?|ring|ring-offset|shadow|inset-shadow|outline|divide|decoration";
const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-fA-F])/g;
const UTIL = new RegExp(`${B}((${FILL}|${WORD}|${LINE})-)\\[([^\\]\\s"'\`]*#[0-9a-fA-F]{3,8}[^\\]\\s"'\`]*)\\]`, "g");
const PROP = new RegExp(`${B}\\[([a-z-]+):([^\\]\\s"'\`]*#[0-9a-fA-F]{3,8}[^\\]\\s"'\`]*)\\]`, "g");
const TINT = new RegExp(`${B}((?:bg|border(?:-[trblxyse])?|divide)-)black\\/(\\[0?\\.\\d+\\]|\\d+)(?![\\w\\[])`, "g");
const BG_INK = new RegExp(`${B}bg-ink(?![\\w-])`, "g");
const TEXT_WHITE = new RegExp(`${B}text-white(?![\\w-])`, "g");

/** A hex as the palette names it: lowercase, without #, the short forms spelled out. */
const norm = (h) => {
  h = h.slice(1).toLowerCase();
  return h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
};
const roleOf = (util) => (new RegExp(`^(${FILL})$`).test(util) ? "hb" : new RegExp(`^(${WORD})$`).test(util) ? "ht" : "h");
const vars = (value, role) => value.replace(HEX, (h) => `var(--${role}-${norm(h)})`);

/** One file's text with its light-only colors made palette variables (unchanged when there are none). */
export function convert(src) {
  return src
    .replace(UTIL, (m, pre, util, name, value) => {
      const role = roleOf(name);
      // A lone color gets its type said, so text-[...] is never read as a font size.
      const hint = /^#[0-9a-fA-F]{3,8}$/.test(value) && !/shadow$/.test(name) ? "color:" : "";
      return `${pre}${util}[${hint}${vars(value, role)}]`;
    })
    .replace(PROP, (m, pre, prop, value) => `${pre}[${prop}:${vars(value, /^background/.test(prop) ? "hb" : prop === "color" ? "ht" : "h")}]`)
    .replace(TINT, (m, pre, util, a) => {
      const n = a.startsWith("[") ? Number(a.slice(1, -1)) : Number(a) / 100;
      return n <= 0.12 ? `${pre}${util}[color:var(--bops-tint)]/${a}` : m;
    })
    .replace(BG_INK, (m, pre) => `${pre}bg-[color:var(--hb-0a0a0a)]`)
    .replace(TEXT_WHITE, (m, pre) => `${pre}text-[color:var(--bops-on-fill)]`);
}

/** Every .ts/.tsx file under the paths given. */
export function filesUnder(paths) {
  const out = [];
  const walk = (p) => {
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
    else if (/\.tsx?$/.test(p)) out.push(p);
  };
  for (const p of paths) walk(p);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const paths = process.argv.slice(2).length ? process.argv.slice(2) : [join(root, "components", "app")];
  let changed = 0;
  for (const f of filesUnder(paths)) {
    const src = readFileSync(f, "utf8");
    const out = convert(src);
    if (out !== src) {
      writeFileSync(f, out);
      changed++;
      console.log(`converted ${f}`);
    }
  }
  console.log(`look codemod: ${changed} file(s) changed. Now run node scripts/look-palette.mjs`);
}

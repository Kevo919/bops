// Features still being built (lib/feature-status.ts) and how the window shows them (components/app/in-progress.tsx):
// - the list parses, with every feature being built now; a bad entry (percent out of range or not whole, no name,
//   nothing said of what's left, a dash in what's shown, an id twice) is refused with a reason;
// - <InProgress> shows its child grayed and out of reach (inert), the red label, the percent badge and what's left,
//   with aria-disabled, a label a screen reader reads and the tooltip tied to it; <InProgressRow> the same, compact;
// - at 100, or with no entry, the child renders exactly as it would alone;
// - no dash in any text shown or read, and the red keeps 4.5:1 on its pill in light and in dark;
// - being tested: the child usable as it is (not disabled, grayed or inert), a red "Being tested" label, the percent;
// - no raw hex color classes in what this adds;
// - the placeholders are where they go (Settings' nav, Look), and #80's and #83's real rows are marked being tested.
// Rendered to static markup with React's own server renderer; .tsx files transpile with the TypeScript in node_modules.
// Usage: node scripts/test-in-progress.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootUrl = new URL("..", import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), rootUrl).href;
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier))
        for (const ext of [".ts", ".tsx"])
          try {
            return next(specifier + ext, context);
          } catch {}
      throw e;
    }
  },
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    if (!/\.[cm]?[jt]sx?$/.test(url) || url.includes("/node_modules/") || !/\.tsx?$/.test(url)) return next(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: url });
    return { format: "module", source: out.outputText, shortCircuit: true };
  },
});

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement: h } = await import("react");
const F = await import(new URL("lib/feature-status.ts", rootUrl).href);
const W = await import(new URL("components/app/in-progress.tsx", rootUrl).href);

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};
const DASH = /[-‐-―−﹘﹣－]/;
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** What a page shows and reads: its text, and its aria-label and title words. */
const shown = (html) => [decode(html.replace(/<[^>]+>/g, " ")), ...[...html.matchAll(/\s(?:aria-label|title)="([^"]*)"/g)].map((m) => decode(m[1]))];
const good = { id: "sample-feature", name: "A sample", percent: 25, left: "Wire it up and test it" };

check("the list parses, with the features being built now and their percents", () => {
  const byId = Object.fromEntries(F.FEATURES_IN_PROGRESS.map((f) => [f.id, f.percent]));
  assert.deepEqual(byId, { "widgets-by-chat": 10, "animations-setting": 10, "composio-for-you": 85, "pc-tasks-claude-plan": 85, "phone-pairing": 75 });
  for (const f of F.FEATURES_IN_PROGRESS) assert.ok(f.name && f.left, f.id);
  assert.deepEqual(F.checkFeatures([good]), [{ ...good, state: "building" }]);
  for (const id of ["pc-tasks-claude-plan", "composio-for-you"]) assert.equal(F.FEATURES_IN_PROGRESS.find((f) => f.id === id).state, "testing", id);
  assert.equal(F.checkFeatures([{ ...good, state: "testing" }])[0].state, "testing");
});

check("bad entries are refused, each with its reason", () => {
  const bad = [
    [{ ...good, percent: 101 }, /whole number from 0 to 100/],
    [{ ...good, percent: -1 }, /whole number from 0 to 100/],
    [{ ...good, percent: 12.5 }, /whole number from 0 to 100/],
    [{ ...good, percent: "50" }, /whole number from 0 to 100/],
    [{ ...good, percent: undefined }, /whole number from 0 to 100/],
    [{ ...good, name: undefined }, /has no name/],
    [{ ...good, name: "   " }, /has no name/],
    [{ ...good, left: "" }, /doesn't say what's left/],
    [{ ...good, left: "one\ntwo" }, /one line/],
    [{ ...good, name: "Set-up" }, /name has a dash/],
    [{ ...good, left: "Tests – then review" }, /left has a dash/],
    [{ ...good, left: "Tests — then review" }, /left has a dash/],
    [{ ...good, id: "Bad Id" }, /its id must be/],
    [{ ...good, id: undefined }, /its id must be/],
    [null, /isn't an entry/],
    [{ ...good, state: "done" }, /state must be "building" or "testing"/],
  ];
  for (const [entry, why] of bad) assert.throws(() => F.checkFeatures([entry]), (e) => e instanceof F.FeatureStatusError && why.test(e.message), JSON.stringify(entry));
  assert.throws(() => F.checkFeatures([good, good]), /there twice/);
  assert.throws(() => F.checkFeatures({}), /must be a list/);
});

const child = h("button", { type: "button", onClick: () => {} }, "Open animations");
const seeded = F.FEATURES_IN_PROGRESS.find((f) => f.id === "animations-setting");

check("<InProgress>: its child grayed and inert, the red label, the percent badge, disabled with its aria", () => {
  const html = renderToStaticMarkup(h(W.InProgress, { id: "animations-setting" }, child));
  assert.match(html, /data-in-progress="animations-setting"/);
  assert.match(html, /role="group"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /aria-label="Animations: not set up yet, 10% built."/);
  // The child is out of reach: inert (no clicks, no focus), hidden from screen readers, grayed.
  assert.match(html, /<div inert="" aria-hidden="true" class="[^"]*pointer-events-none[^"]*opacity-50 grayscale"><button[^>]*>Open animations<\/button><\/div>/);
  assert.match(html, /data-in-progress-label[^>]*text-\[var\(--wip-red\)\][^>]*>.*Not set up yet<\/span>/);
  assert.match(html, /data-in-progress-percent[^>]*absolute right-1\.5 top-1\.5[^>]*>10%<\/span>/);
  assert.match(html, /--wip-red:light-dark\(#B42318, #FF9A90\)/);
  // What's left, tied to the wrapper for screen readers, shown on hover or focus.
  const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(describedBy);
  assert.ok(html.includes(`id="${describedBy}" role="tooltip"`), "the tooltip isn't the one described by");
  assert.ok(html.includes(`10% built. What&#x27;s left: ${seeded.left}.`));
  assert.match(html, /group-hover\/wip:block group-focus-visible\/wip:block/);
  assert.match(html, /tabindex="0"/);
});

check("<InProgress>: being tested, the child is usable as it is: not disabled, not grayed, not inert", () => {
  const html = renderToStaticMarkup(h(W.InProgress, { id: "pc-tasks-claude-plan" }, child));
  assert.match(html, /data-in-progress="pc-tasks-claude-plan" data-in-progress-state="testing" role="group"/);
  assert.doesNotMatch(html, /aria-disabled/);
  assert.doesNotMatch(html, /inert|opacity-50|grayscale|pointer-events-none select-none/);
  assert.ok(html.includes(renderToStaticMarkup(child)), "the child isn't there as it is");
  assert.match(html, /aria-label="Bot tasks on this PC: being tested, 85% built."/);
  assert.match(html, /<button type="button" aria-describedby="[^"]+" aria-expanded="false"[^>]*><span data-in-progress-label[^>]*>.*Being tested<\/span><\/span><\/button><span data-in-progress-percent[^>]*>85%<\/span>/);
  const describedBy = html.match(/aria-describedby="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${describedBy}" role="tooltip"`));
  assert.ok(html.includes("85% built. What&#x27;s left: A real task on your PC."));
  // Its tooltip shows from the label only, in the flow under it (pushing what follows down), never over the card.
  const tipTag = html.match(/<span id="[^"]+" role="tooltip"[^>]*>/)[0];
  assert.doesNotMatch(tipTag, /absolute|bottom-|top-/);
  assert.match(html, /group-hover\/wiptip:block group-focus-within\/wiptip:block/);
  assert.doesNotMatch(html, /tabindex/);
  const row = renderToStaticMarkup(h(W.InProgressRow, { id: "pc-tasks-claude-plan", name: "Bot tasks" }, child));
  assert.doesNotMatch(row, /aria-disabled|opacity-55/);
  // No aria-label on a span without a role (screen readers skip it): the label and percent are read as shown.
  assert.doesNotMatch(row, /aria-label|aria-hidden="true" class="flex shrink-0/);
  assert.ok(row.includes(renderToStaticMarkup(child)));
  assert.match(row, />Being tested<\/span><\/span><span data-in-progress-percent[^>]*>85%<\/span>/);
});

check("<InProgress>: past half it reads In progress; a label asked for wins", () => {
  const half = F.FEATURES_IN_PROGRESS.find((f) => f.id === "phone-pairing");
  assert.match(renderToStaticMarkup(h(W.InProgress, { id: "phone-pairing" }, child)), />In progress<\/span>[\s\S]*>75%</);
  assert.equal(half.state, "building");
  assert.match(renderToStaticMarkup(h(W.InProgress, { id: "widgets-by-chat", label: "In progress" }, child)), />In progress</);
});

check("<InProgressRow>: compact, a disabled button with the red label and the percent on the right", () => {
  const html = renderToStaticMarkup(h(W.InProgressRow, { id: "widgets-by-chat", name: "Widgets", icon: h("svg", { "aria-hidden": true }) }));
  assert.match(html, /<button type="button" data-in-progress="widgets-by-chat" aria-disabled="true" aria-label="Widgets: in progress, 10% built."/);
  assert.match(html, /opacity-55">Widgets<\/span>/);
  assert.match(html, />In progress<\/span><\/span><span data-in-progress-percent[^>]*>10%<\/span>/);
  assert.match(html, /role="tooltip"/);
});

check("at 100, or with no entry, the child renders as it would alone", () => {
  const alone = renderToStaticMarkup(child);
  assert.equal(renderToStaticMarkup(h(W.InProgress, { id: "not-in-the-list" }, child)), alone);
  assert.equal(renderToStaticMarkup(h(W.InProgressRow, { id: "not-in-the-list", name: "X" }, child)), alone);
  assert.equal(renderToStaticMarkup(h(W.InProgressRow, { id: "not-in-the-list", name: "X" })), "");
  assert.equal(F.featureInProgress("x", F.checkFeatures([{ ...good, id: "x", percent: 100 }])), null);
  const was = seeded.percent;
  try {
    seeded.percent = 100;
    assert.equal(renderToStaticMarkup(h(W.InProgress, { id: "animations-setting" }, child)), alone);
    assert.equal(renderToStaticMarkup(h(W.InProgressRow, { id: "animations-setting", name: "Animations" }, child)), alone);
  } finally {
    seeded.percent = was;
  }
});

check("no dash in any text shown or read, for every feature in the list", () => {
  for (const f of F.FEATURES_IN_PROGRESS) {
    for (const html of [renderToStaticMarkup(h(W.InProgress, { id: f.id }, h("span", null, "x"))), renderToStaticMarkup(h(W.InProgressRow, { id: f.id }))])
      for (const text of shown(html)) assert.ok(!DASH.test(text), `${f.id}: a dash in "${text.trim()}"`);
  }
});

check("the red keeps at least 4.5:1 on its pill, in light and in dark, and the tooltip too", () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const src = readFileSync(new URL("components/app/in-progress.tsx", rootUrl), "utf8");
  const pair = (name) => src.match(new RegExp(`"--${name}": "light-dark\\((#[0-9A-F]{6}), (#[0-9A-F]{6})\\)"`)).slice(1);
  const [redL, redD] = pair("wip-red");
  const [bgL, bgD] = pair("wip-red-bg");
  const [tipBgL, tipBgD] = pair("wip-tip-bg");
  const [tipFgL, tipFgD] = pair("wip-tip-fg");
  const out = { light: ratio(redL, bgL), dark: ratio(redD, bgD), lightOnWhite: ratio(redL, "#FFFFFF"), tipLight: ratio(tipFgL, tipBgL), tipDark: ratio(tipFgD, tipBgD) };
  for (const [k, v] of Object.entries(out)) assert.ok(v >= 4.5, `${k}: ${v.toFixed(2)}:1`);
  console.log(`     red on its pill ${out.light.toFixed(1)}:1 light, ${out.dark.toFixed(1)}:1 dark; tooltip ${out.tipLight.toFixed(1)}:1 and ${out.tipDark.toFixed(1)}:1`);
});

check("no raw hex color classes in what this adds (the dark palette check): light-dark() pairs only", () => {
  const src = readFileSync(new URL("components/app/in-progress.tsx", rootUrl), "utf8");
  assert.doesNotMatch(src, /(?:bg|text|border|shadow|ring|fill|stroke)-\[[^\]]*#[0-9A-Fa-f]{3,8}/);
  const at = (file) => readFileSync(new URL(file, rootUrl), "utf8");
  for (const [file, re] of [["components/app/bops-app.tsx", /<InProgressRow[^\n]*/], ["components/app/look-settings.tsx", /<InProgress id="animations-setting"[^\n]*/]])
    assert.doesNotMatch(at(file).match(re)[0], /#[0-9A-Fa-f]{3,8}/, file);
});

check("the placeholders are wired where they go, each tiny and self-contained", () => {
  const at = (file) => readFileSync(new URL(file, rootUrl), "utf8");
  assert.match(at("components/app/bops-app.tsx"), /<InProgressRow id="widgets-by-chat" name="Widgets"/);
  assert.doesNotMatch(at("components/app/bops-app.tsx"), /WipCard|pc-tasks-claude-plan/, "the Bot tasks placeholder is still there");
  assert.match(at("components/app/setup.tsx"), /<InProgress id="pc-tasks-claude-plan">\s*<PcTaskRunnerCard(?: onView=\{setPcView\})? \/>\s*<\/InProgress>/);
  assert.match(at("components/app/look-settings.tsx"), /<InProgress id="animations-setting"/);
  assert.doesNotMatch(at("components/app/logins.tsx"), /InProgress|composio-for-you/, "the Composio placeholder is still in Logins");
  assert.match(at("components/app/connections-card.tsx"), /c\.key === "COMPOSIO_MCP_URL" \? \(\s*<InProgress key=\{c\.key\} id="composio-for-you">\s*\{row\}/);
  // Every id the window names is in the list (a typo would show the placeholder as finished).
  for (const file of ["components/app/bops-app.tsx", "components/app/look-settings.tsx", "components/app/connections-card.tsx", "components/app/setup.tsx"])
    for (const [, id] of at(file).matchAll(/<(?:InProgress|InProgressRow|WipCard) id="([^"]+)"/g)) assert.ok(F.featureInProgress(id), `${file}: ${id} isn't in the list`);
});

console.log(`\nall ${passed} passed`);

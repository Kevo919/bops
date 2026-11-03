// A smoke test for the look's own window pieces (components/app/look-settings.tsx, look-style.tsx):
// the Settings card renders with all its controls (theme, accent, text size, spacing, custom CSS,
// Reset), the style element carries exactly the CSS the look builds, and bad custom CSS in the state
// is dropped by the window's own second check, never painted. Rendered to static markup with React's
// own server renderer (no DOM, no clicks: the pane's clicking behavior is the settings page's own
// suite's to cover); .tsx files transpile with the TypeScript in node_modules as they load.
// Usage: node scripts/test-look-ui.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
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
    if (!/\.[cm]?[jt]sx$/.test(url)) return next(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: url });
    return { format: "module", source: out.outputText, shortCircuit: true };
  },
});

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { LookSettings } = await import(new URL("../components/app/look-settings.tsx", import.meta.url).href);
const { LookStyle } = await import(new URL("../components/app/look-style.tsx", import.meta.url).href);

let failures = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 4).join("\n  ") ?? e.message}`);
  }
}

/** A state as the window gets it: everything the Settings card and the style element read. */
const stateOf = (look) => ({ look: look === undefined ? undefined : { current: look, history: [] } });

check("the Settings card shows every control, and what the look says is on", () => {
  const html = renderToStaticMarkup(createElement(LookSettings, { state: stateOf({ theme: "dark", accent: "#1f6f43", fontScale: 1.15, density: "compact", css: ".x{color:red}" }) }));
  for (const needle of ['data-look-settings', "Theme", "Accent color", "Text size", "Spacing", "115% of the usual", "Custom CSS", "Reset", 'value="#1f6f43"']) assert.ok(html.includes(needle), `missing: ${needle}`);
  assert.ok(html.includes(".x{color:red}"), "the custom CSS is in the box");
  assert.ok(html.includes("Light") && html.includes("System") && html.includes("Dark"), "the theme choices");
  assert.ok(html.includes("Compact") && html.includes("Roomy"), "the spacing choices");
});

check("the card with no look set shows Bops' own defaults, not blanks", () => {
  const html = renderToStaticMarkup(createElement(LookSettings, { state: stateOf(undefined) }));
  assert.ok(html.includes("100% of the usual"), "text size reads as the usual");
  assert.ok(!html.includes("Default</button>"), "no Default button while the accent is Bops' own");
});

check("the style element paints what the state says", () => {
  const html = renderToStaticMarkup(createElement(LookStyle, { look: { theme: "dark", accent: "#1f6f43", fontScale: 1.15, density: "roomy", css: ".sidebar .label{display:none}" } }));
  assert.match(html, /<style>/, "one style element");
  assert.match(html, /--bops-accent: #1f6f43/);
  assert.match(html, /color-scheme: dark/);
  assert.match(html, /zoom: 1.15/);
  assert.match(html, /\.sidebar \.label\{display:none\}/);
  assert.equal(renderToStaticMarkup(createElement(LookStyle, { look: undefined })), "", "no look, no style element");
});

check("custom CSS the state shouldn't have is dropped by the window's own check", () => {
  const html = renderToStaticMarkup(createElement(LookStyle, { look: { accent: "#1f6f43", css: "@import url(https://evil.example/x.css);" } }));
  assert.ok(!html.includes("evil.example"), "nothing of it painted");
  assert.match(html, /--bops-accent/, "the rest of the look still applies");
});

console.log(`look ui: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

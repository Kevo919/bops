// Tests for Settings, Voice typing (components/app/handy-card.tsx): the card says what Handy is in plain
// words (free, open source, offline, any program), that it's optional and that Bops installs nothing;
// Get Handy is a link to Handy's Releases page (not one release's file, which goes stale) that opens
// outside the app the way every other outside link does (target _blank, rel noopener noreferrer); the
// steps are there in order (download, install, a shortcut key, the microphone, hold the key and talk,
// Bops named); the code and license link goes to the repository; no dashes; and the card sits in
// Settings after Keys and Models (setup.tsx).
//
// Rendered into a DOM (linkedom): nothing reaches a server. The .tsx files are compiled with the TypeScript in
// node_modules as they load.
// Usage: node scripts/test-handy-card-ui.mjs   (not with --conditions=react-server: a client component)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const rootPath = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const rootUrl = pathToFileURL(rootPath).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = `${rootUrl}/${specifier.slice(2)}`;
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
    if (!url.endsWith(".tsx")) return next(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: url });
    return { format: "module", source: out.outputText, shortCircuit: true };
  },
});
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => (rest[0]?.code === "MODULE_TYPELESS_PACKAGE_JSON" ? undefined : emitWarning(warning, ...rest));

const { parseHTML } = await import("linkedom");
const { window: win } = parseHTML("<!doctype html><html><body></body></html>");
const doc = win.document;
globalThis.window = globalThis;
globalThis.document = doc;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { HandyCard, HANDY_RELEASES_URL, HANDY_REPO_URL, HANDY_STEPS } = await import(`${rootUrl}/components/app/handy-card.tsx`);

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const DASHES = /[‒–—―]| - /;

const box = doc.createElement("div");
doc.body.appendChild(box);
const root = createRoot(box);
await act(async () => {
  root.render(h(HandyCard));
});
const card = box.querySelector("[data-handy-card]");
const text = card.textContent.replace(/\s+/g, " ");

await test("the card says what Handy is, that it's optional, and that Bops installs nothing", () => {
  assert.ok(card, "the card");
  assert.match(text, /Voice typing/);
  assert.match(text, /Optional/);
  assert.match(text, /Handy/);
  assert.match(text, /free, open source \(MIT\) dictation app that works offline/);
  assert.match(text, /every other program/);
  assert.match(text, /install yourself\. Bops downloads nothing\./);
});

await test("Get Handy opens the Releases page outside the app, like every other outside link", () => {
  const link = [...card.querySelectorAll("a")].find((a) => a.textContent.trim() === "Get Handy");
  assert.ok(link, "a Get Handy link");
  assert.equal(link.getAttribute("href"), "https://github.com/cjpais/Handy/releases");
  assert.equal(link.getAttribute("href"), HANDY_RELEASES_URL);
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
  // The page, not one version's file (a release's URL goes stale when the next one ships).
  assert.doesNotMatch(link.getAttribute("href"), /\/download\/|\.exe|\.msi|\.dmg|v\d/);
  assert.equal(card.querySelector("button"), null, "nothing here downloads or installs: no buttons, only links out");
});

await test("the steps, in order, end with holding the key and talking in Bops", () => {
  const steps = [...card.querySelectorAll("ol > li")].map((li) => li.textContent.replace(/\s+/g, " ").trim());
  assert.equal(steps.length, HANDY_STEPS.length);
  assert.equal(steps.length, 5);
  assert.match(steps[0], /^Download it\./);
  assert.match(steps[0], /Releases page/);
  assert.match(steps[0], /Handy_<version>_x64-setup\.exe/, "the Windows installer's name, so it's found among the assets");
  assert.match(steps[1], /^Install it\./);
  assert.match(steps[2], /^Pick a shortcut key\./);
  assert.match(steps[3], /^Allow the microphone\./);
  assert.match(steps[4], /^Hold the key and talk\./);
  assert.match(steps[4], /any text box, Bops' chat included/);
});

await test("the code and license link goes to the repository", () => {
  const link = [...card.querySelectorAll("a")].find((a) => a.textContent.trim() === "its code and license");
  assert.ok(link);
  assert.equal(link.getAttribute("href"), HANDY_REPO_URL);
  assert.equal(link.getAttribute("href"), "https://github.com/cjpais/Handy");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
});

await test("plain words: no dashes", () => {
  assert.ok(!DASHES.test(text), `a dash: ${text}`);
  for (const s of HANDY_STEPS) assert.ok(!DASHES.test(`${s.title} ${s.words}`), `a dash in ${s.title}`);
});

await test("it sits in Settings after Keys and Models", () => {
  const setup = readFileSync(`${rootPath}/components/app/setup.tsx`, "utf8");
  assert.match(setup, /import \{ HandyCard \} from "\.\/handy-card";/);
  const keys = setup.indexOf("<KeysCard />");
  const models = setup.indexOf("<ModelsCard />");
  const handy = setup.indexOf("<HandyCard />");
  assert.ok(keys > 0 && models > keys && handy > models, "Keys, then Models, then Voice typing");
});

await act(async () => root.unmount());
console.log(`handy card ui: ${passed} passed`);

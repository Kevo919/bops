// Tests for the window's first load when the server turns it away (components/app/ui.tsx useAppState /
// useStateRefused, bops-app.tsx FirstLoad): a phone whose pairing was undone or made again (or a tab without the app's
// cookie) gets 403 on /api/state. Before, the app said "Loading Bops…" forever. Now the refusal is heard (what the server
// said), FirstLoad says Bops can't let this device in and how a phone gets back in, and once the server answers again
// the refusal is gone and the state arrives.
//
// Rendered into a DOM (linkedom) against a fake /api/state: nothing reaches a server.
// Usage: node scripts/test-refused-load-ui.mjs   (not with --conditions=react-server: client components)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(`${root}/${specifier.slice(2)}`).href;
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
globalThis.window = globalThis;
globalThis.document = win.document;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The fake server: refuses until it's told to answer.
let answer = "refuse";
globalThis.fetch = async (url) => {
  if (!String(url).startsWith("/api/state")) return new Response("{}", { status: 404 });
  if (answer === "refuse") return new Response(JSON.stringify({ error: "Only the Bops app can do that." }), { status: 403, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ version: 7, state: { bots: [], chats: [], messages: [], sessions: [], routines: [], host: "orgo" } }), { status: 200, headers: { "content-type": "application/json" } });
};

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useAppState, useStateRefused } = await import(pathToFileURL(`${root}/components/app/ui.tsx`).href);

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const settle = async (ms = 30) => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, ms));
};

let seen = { state: undefined, refused: undefined };
function Probe() {
  seen = { state: useAppState(), refused: useStateRefused() };
  return null;
}
const box = document.createElement("div");
document.body.appendChild(box);
const r = createRoot(box);

await test("a 403 on the state is heard as a refusal, with what the server said", async () => {
  await act(async () => {
    r.render(h(Probe));
    await settle();
  });
  assert.equal(seen.state, null, "no state");
  assert.equal(seen.refused, "Only the Bops app can do that.");
});

await test("once the server answers again, the refusal is gone and the state arrives", async () => {
  answer = "state";
  await act(async () => {
    await new Promise((res) => setTimeout(res, 1000)); // the next poll (every 0.9 s)
    await settle();
  });
  assert.equal(seen.refused, null);
  assert.ok(seen.state && Array.isArray(seen.state.bots), "the state");
});

await test("FirstLoad says the device can't come in, and how a phone pairs again, instead of loading forever", () => {
  const src = readFileSync(`${root}/components/app/bops-app.tsx`, "utf8");
  const first = src.slice(src.indexOf("function FirstLoad()"), src.indexOf("function ViewReporter"));
  assert.match(first, /const refusedWhy = useStateRefused\(\);/);
  assert.match(first, /if \(refusedWhy\)[\s\S]*Bops can't let this device in\.[\s\S]*role="alert"[\s\S]*pair it again in the Bops app on your computer/);
  assert.doesNotMatch(first.slice(first.indexOf("if (refusedWhy)"), first.indexOf("Loading Bops")), /[‒–—―]| - /, "no dashes");
});

await act(async () => r.unmount());
console.log(`refused load ui: ${passed} passed`);
process.exit(0);

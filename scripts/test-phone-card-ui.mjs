// Tests for Settings, This PC, Your phone (components/app/setup.tsx PhoneCard): Unpair and Pair again each lock the
// phone paired now out of Bops at once, so neither acts on its first click. Each asks in place (Unpair? / Pair again?)
// with Keep beside it; Keep leaves the pairing as it was and sends nothing; only the second, confirming click unpairs
// or pairs again. A phone not paired yet pairs on its first click (nothing to lose).
//
// Rendered into a DOM (linkedom) against a fake /api/remote: nothing reaches a server.
// Usage: node scripts/test-phone-card-ui.mjs   (not with --conditions=react-server: a client component)
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
globalThis.window = win;
globalThis.document = win.document;
globalThis.location = { origin: "http://localhost:3210" };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { PhoneCard } = await import(pathToFileURL(`${root}/components/app/setup.tsx`).href);

// The fake server: a phone paired or not, and every change sent.
const remote = { paired: true, created: Date.UTC(2026, 10, 1), addresses: { tailnet: ["100.64.0.7"], home: [], public: null } };
const sent = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const path = typeof input === "string" ? input : input.url;
  const method = init.method ?? "GET";
  if (path.split("?")[0] !== "/api/remote") return json({}, 404);
  if (method === "GET") return json(remote);
  sent.push(method);
  if (method === "DELETE") {
    remote.paired = false;
    return json({ ok: true });
  }
  remote.paired = true;
  return json({ ...remote, code: "pair-code-for-the-test", qr: null });
};

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const settle = () => new Promise((r) => setTimeout(r, 5));
async function mount() {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const r = createRoot(box);
  await act(async () => {
    r.render(h(PhoneCard));
    await settle();
  });
  return { box, done: () => act(async () => r.unmount()).then(() => box.remove()) };
}
const buttons = (box) => [...box.querySelectorAll("button")].map((b) => b.textContent.trim());
const click = async (box, label) => {
  const b = [...box.querySelectorAll("button")].find((x) => x.textContent.trim() === label);
  assert.ok(b, `a ${label} button among ${buttons(box).join(", ")}`);
  await act(async () => {
    b.dispatchEvent(new win.Event("click", { bubbles: true }));
    await settle();
  });
};
const asked = (box) => box.querySelector('[role="alertdialog"]');

await test("Unpair asks first, and Keep leaves the phone paired with nothing sent", async () => {
  const m = await mount();
  assert.deepEqual(buttons(m.box), ["Pair again", "Unpair"]);
  await click(m.box, "Unpair");
  assert.deepEqual(sent, [], "the first click sends nothing");
  assert.ok(asked(m.box), "asked in place");
  assert.equal(asked(m.box).getAttribute("aria-label"), "Unpair your phone");
  assert.match(asked(m.box).textContent, /stops reaching Bops at once/);
  assert.deepEqual(buttons(m.box), ["Unpair", "Keep"]);
  await click(m.box, "Keep");
  assert.deepEqual(sent, []);
  assert.equal(asked(m.box), null);
  assert.ok(remote.paired);
  assert.deepEqual(buttons(m.box), ["Pair again", "Unpair"]);
  await m.done();
});

await test("Unpair, then Unpair again, unpairs", async () => {
  const m = await mount();
  await click(m.box, "Unpair");
  await click(m.box, "Unpair");
  assert.deepEqual(sent, ["DELETE"]);
  assert.equal(remote.paired, false);
  assert.deepEqual(buttons(m.box), ["Pair a phone"]);
  await m.done();
});

await test("a phone not paired yet pairs on the first click, and its code shows", async () => {
  sent.length = 0;
  const m = await mount();
  await click(m.box, "Pair a phone");
  assert.deepEqual(sent, ["POST"]);
  assert.match(m.box.textContent, /pair-code-for-the-test/);
  await m.done();
});

await test("Pair again asks first (the phone paired now stops working), Keep sends nothing, confirming pairs", async () => {
  sent.length = 0;
  const m = await mount();
  await click(m.box, "Pair again");
  assert.deepEqual(sent, []);
  assert.equal(asked(m.box)?.getAttribute("aria-label"), "Pair a new phone");
  assert.match(asked(m.box).textContent, /stops working at once/);
  await click(m.box, "Keep");
  assert.deepEqual(sent, []);
  await click(m.box, "Pair again");
  await click(m.box, "Pair again");
  assert.deepEqual(sent, ["POST"]);
  assert.match(m.box.textContent, /pair-code-for-the-test/);
  await m.done();
});

await test("plain words: no dashes in what it asks", async () => {
  const m = await mount();
  await click(m.box, "Unpair");
  assert.doesNotMatch(asked(m.box).textContent, /[‒–—―]| - /);
  await click(m.box, "Keep");
  await click(m.box, "Pair again");
  assert.doesNotMatch(asked(m.box).textContent, /[‒–—―]| - /);
  await m.done();
});

console.log(`phone card ui: ${passed} passed`);

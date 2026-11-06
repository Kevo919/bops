// Tests for what the Memory sheet (components/app/memory-sheet.tsx) and a bot's Memory tab (bot-memory.tsx) show for
// each answer /api/memory can give when it isn't a normal memory: refused (200 {refused}), unreachable (503
// {unreachable}), off, and error (a code bug's 500 {error}). Each state is rendered for real - the component mounted
// into a DOM (linkedom), its fetch answered by a fake /api/memory with the route's real status and body - and the
// visible text is checked: the right words for that state, and none of the other states' words.
// This replaces the source-text regexes in test-memory-reachable.mjs (which passed whatever the render did).
// Usage: node scripts/test-memory-sheet-ui.mjs   (not with --conditions=react-server: client components)
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
// So react-dom listens for input events (it checks `"oninput" in document` when it loads; linkedom has no on* props).
if (!("oninput" in win.document)) win.document.oninput = null;
// And knows a plain <input> for a text box: a browser's input.type is "text" when no type is set; linkedom's is empty.
{
  const P = Object.getPrototypeOf(win.document.createElement("input"));
  const type = Object.getOwnPropertyDescriptor(P, "type");
  if (!win.document.createElement("input").type)
    Object.defineProperty(P, "type", { configurable: true, get() { return this.getAttribute("type") || "text"; }, set(v) { if (type?.set) type.set.call(this, v); else this.setAttribute("type", v); } });
}
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The fake server: /api/memory answers as the route does for `mode` (status and body as in app/api/memory/route.ts).
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ANSWERS = {
  refused: () => json({ refused: true }),
  unreachable: () => json({ unreachable: true }, 503),
  // Memory off: the sheet's path (?ws=) is memoryInfo with on: false; the bot tab's (?bot=) is {off: true}.
  off: (url) => (url.includes("bot=") ? json({ off: true, workspace: "", ws: "", card: [], facts: [] }) : json({ on: false, bank: "b", own: true, sharedWith: [], card: [], review: null })),
  error: () => json({ error: "Memory failed; this isn't an outage." }, 500),
  // A search (D2): the page loads normally, then the search's own call can't reach the service, or is refused.
  "search-unreachable": (url) => (url.includes("q=") ? json({ unreachable: true }, 503) : json({ workspace: "Home", ws: "ws_main", card: [], facts: [] })),
  "search-refused": (url) => (url.includes("q=") ? json({ refused: true }) : json({ workspace: "Home", ws: "ws_main", card: [], facts: [] })),
  "search-ok": (url) => (url.includes("q=") ? json({ workspace: "Home", ws: "ws_main", card: [], facts: [] }) : json({ workspace: "Home", ws: "ws_main", card: [], facts: [] })),
};
let mode = "refused";
const asked = [];
globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  asked.push(url);
  if (url.startsWith("/api/memory")) return ANSWERS[mode](url);
  if (url.startsWith("/api/config")) return json({ selfHosted: true });
  return json({}, 404);
};

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemorySheet } = await import(pathToFileURL(`${root}/components/app/memory-sheet.tsx`).href);
const { BotMemory } = await import(pathToFileURL(`${root}/components/app/bot-memory.tsx`).href);

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const settle = async (ms = 20) => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, ms));
};

const bot = { id: "boppy", name: "Boppy", workspaceId: "ws_main" };
const state = { workspace: "ws_main", workspaces: [{ id: "ws_main", name: "Home" }], bots: [bot], chats: [], messages: [], sessions: [], routines: [] };

/** Mounts `el` with /api/memory answering as `m`, and gives its visible text (whitespace collapsed). */
async function rendered(m, el, search) {
  mode = m;
  asked.length = 0;
  const box = document.createElement("div");
  document.body.appendChild(box);
  const r = createRoot(box);
  await act(async () => {
    r.render(el);
    await settle();
  });
  if (search)
    await act(async () => {
      // Typed as a person would: the native value setter (React's change tracking), then an input event.
      const input = box.querySelector("input");
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set.call(input, search);
      input.dispatchEvent(new win.Event("input", { bubbles: true }));
      await new Promise((res) => setTimeout(res, 400)); // the search waits 300 ms for typing to stop
      await settle();
    });
  const text = box.textContent.replace(/\s+/g, " ").trim();
  await act(async () => r.unmount());
  box.remove();
  return text;
}

// Each state's own words; every other state's words must be absent from it.
const SHEET = {
  refused: "Memory’s service refused this key. Check the memory key in Settings → Services — trying again won’t fix a refused key.",
  unreachable: "Can’t reach the memory service right now. It’s set up, but it didn’t answer — try again in a moment.",
  off: "Memory isn’t on yet.",
  error: "Memory couldn’t load. Try again, and if it keeps happening tell us.",
};
for (const m of Object.keys(SHEET))
  await test(`the Memory sheet, ${m}: says "${SHEET[m].slice(0, 40)}…" and nothing of the other states`, async () => {
    const text = await rendered(m, h(MemorySheet, { state, onClose: () => {} }));
    assert.ok(asked.some((u) => u.startsWith("/api/memory?ws=ws_main")), "it asked the sheet's path");
    assert.ok(text.includes(SHEET[m]), `${m}: expected ${JSON.stringify(SHEET[m])} in ${JSON.stringify(text)}`);
    for (const other of Object.keys(SHEET)) if (other !== m) assert.ok(!text.includes(SHEET[other]), `${m}: not the ${other} wording`);
    assert.doesNotMatch(text, /Loading…/, "it settled");
    assert.doesNotMatch(text, /this isn't an outage|undefined|\[object Object\]|\{"/, "no raw body");
  });

const TAB = {
  refused: "Memory’s service refused this key. Check the memory key in Settings — trying again won’t fix a refused key.",
  unreachable: "Can’t reach the memory service right now. It’s set up, but it didn’t answer — try again in a moment.",
  off: "Memory isn't set up on this computer yet.",
  error: "Memory couldn’t load. Try again, and if it keeps happening tell us.",
};
for (const m of Object.keys(TAB))
  await test(`a bot's Memory tab, ${m}: says "${TAB[m].slice(0, 40)}…" and nothing of the other states`, async () => {
    const text = await rendered(m, h(BotMemory, { state, bot, onOpenThread: () => {} }));
    assert.ok(asked.some((u) => u.startsWith("/api/memory?bot=boppy")), "it asked the tab's path");
    assert.ok(text.includes(TAB[m]), `${m}: expected ${JSON.stringify(TAB[m])} in ${JSON.stringify(text)}`);
    for (const other of Object.keys(TAB)) if (other !== m) assert.ok(!text.includes(TAB[other]), `${m}: not the ${other} wording`);
    assert.doesNotMatch(text, /this isn't an outage|undefined|\[object Object\]|\{"/, "no raw body");
  });

// D2: a search whose call can't reach the service (or is refused) says so, not "nothing matches" (a real search
// through the box, replacing test-memory-reachable.mjs's source-text match).
const DOWN = "Can’t reach the memory service right now — try again in a moment.";
const NONE = "Nothing learned matches.";
for (const [m, want] of [["search-unreachable", DOWN], ["search-refused", DOWN], ["search-ok", NONE]])
  await test(`a bot's Memory tab, ${m}: a search says "${want.slice(0, 40)}…"`, async () => {
    const text = await rendered(m, h(BotMemory, { state, bot, onOpenThread: () => {} }), "coffee");
    assert.ok(asked.some((u) => u.startsWith("/api/memory?") && u.includes("bot=boppy") && u.includes("q=coffee")), `the search asked the route (asked: ${asked.join(", ")})`);
    assert.ok(text.includes(want), `${m}: expected ${JSON.stringify(want)} in ${JSON.stringify(text)}`);
    for (const other of [DOWN, NONE]) if (other !== want) assert.ok(!text.includes(other), `${m}: not ${JSON.stringify(other)}`);
  });

console.log(`memory sheet ui: ${passed} passed`);
process.exit(0);

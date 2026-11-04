// A bot's Memory tab's Edit (components/app/bot-memory.tsx BotDocs): the Memory and Edit switch, shown to the
// owner alone (never with someone else's workspace open); Edit's two text areas, SOUL.md and MEMORY.md, with the
// generated text until the owner writes one (from How I work and what's pinned), Save enabled only once the text
// changes and sending PATCH /api/bots/docs with that document alone, Reset to generated sending null, the note on
// how the bot uses them, the characters left under the cap, an error from the server shown, and the size cap on each
// text area. Every user-facing line is checked for dashes.
//
// Rendered into a DOM (linkedom) against a fake Bops: nothing reaches a server. The .tsx files are compiled with
// the TypeScript in node_modules as they load.
// Usage: node scripts/test-bot-docs-ui.mjs   (not with --conditions=react-server: a client component)
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
win.HTMLElement.prototype.focus = function () {};
doc.oninput = null;
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = doc;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* ---------------- A fake Bops ---------------- */

const { MAX_BOT_DOC_CHARS } = await import(`${rootUrl}/lib/types.ts`);
const Docs = await import(`${rootUrl}/lib/bot-docs.ts`);
const BOPPY = { id: "boppy", name: "Boppy", role: "Chief of Staff", color: "#0A0A0A", isMain: true, computerStatus: "ready", persona: "Keep it short." };
const bops = { bot: { ...BOPPY }, sent: [], docsStatus: 200, docsError: null, pinned: ["Alex lives in Austin"] };
const docsOf = () => ({
  soul: { text: bops.bot.soul ?? null, generated: Docs.renderSoul(bops.bot, "Alex") },
  memory: { text: bops.bot.memoryDoc ?? null, generated: Docs.renderMemoryDoc(bops.bot, "Alex", bops.pinned) },
  max: MAX_BOT_DOC_CHARS,
  dir: "/Users/alex/bops/.data/users/u1/bots/boppy",
});
const json = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("/api/memory")) return json({ ws: "ws_main", workspace: "Main", card: bops.pinned.map((text, i) => ({ id: `card:${i}`, text, private: false })), facts: [] });
  if (u.startsWith("/api/bots/docs")) {
    if (!init.method || init.method === "GET") return json(docsOf());
    const body = JSON.parse(init.body);
    bops.sent.push({ method: init.method, body });
    if (bops.docsStatus !== 200) return json({ error: bops.docsError }, bops.docsStatus);
    for (const k of ["soul", "memoryDoc"]) {
      if (body[k] === undefined) continue;
      const v = body[k] === null ? undefined : Docs.cleanDoc(body[k]);
      if (v === undefined) delete bops.bot[k];
      else bops.bot[k] = v;
    }
    return json(docsOf());
  }
  throw new Error(`unexpected ${u} ${init.method ?? "GET"}`);
};

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BotMemory } = await import(`${rootUrl}/components/app/bot-memory.tsx`);

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};
const setterOf = (el, prop) => {
  for (let p = Object.getPrototypeOf(el); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, prop);
    if (d?.set) return d.set;
  }
  return null;
};
const click = (el) =>
  act(async () => {
    el.dispatchEvent(new win.Event("click", { bubbles: true, cancelable: true }));
    await settle();
  });
const type = (el, value) =>
  act(async () => {
    const set = setterOf(el, "value");
    if (set) set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    await settle();
  });
const DASHES = /[‒–—―]| - /;
const words = (box) => [box.textContent, ...[...box.querySelectorAll("[aria-label],[title]")].flatMap((e) => [e.getAttribute("aria-label"), e.getAttribute("title")])].filter(Boolean).join("\n");
const seen = [];
async function mount(state) {
  const box = doc.createElement("div");
  doc.body.appendChild(box);
  const r = createRoot(box);
  await act(async () => {
    r.render(h(BotMemory, { state, bot: state.bots[0], onOpenThread: () => {} }));
    await settle();
  });
  return {
    box,
    done: async () => {
      seen.push(words(box));
      await act(async () => r.unmount());
      box.remove();
    },
  };
}
const stateOf = (o = {}) => ({ bots: [bops.bot], chats: [], sessions: [], messages: [], routines: [], workspaces: [{ id: "ws_main", name: "Main", createdAt: 1 }], owner: { name: "Alex" }, ...o });
const tab = (box, name) => [...box.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === name);
const buttonIn = (section, text) => [...section.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const area = (box, file) => box.querySelector(`textarea[aria-label="${file}"]`);
const section = (box, file) => box.querySelector(`[data-doc="${file}"]`);

await test("the owner sees Memory and Edit; Edit shows SOUL.md and MEMORY.md as generated, with the note", async () => {
  const m = await mount(stateOf());
  assert.ok(tab(m.box, "Memory") && tab(m.box, "Edit"), "the two views");
  assert.equal(tab(m.box, "Memory").getAttribute("aria-selected"), "true");
  assert.ok(!m.box.querySelector("[data-bot-docs]"), "Memory first");
  await click(tab(m.box, "Edit"));
  assert.ok(m.box.querySelector("[data-bot-docs]"));
  assert.ok(!m.box.textContent.includes("About you"), "the memory page is out of the way");
  const soul = area(m.box, "SOUL.md");
  const mem = area(m.box, "MEMORY.md");
  assert.ok(soul && mem);
  assert.equal(soul.value, Docs.renderSoul(bops.bot, "Alex"));
  assert.ok(soul.value.includes("Keep it short."), "How I work is in the generated SOUL.md");
  assert.equal(mem.value, Docs.renderMemoryDoc(bops.bot, "Alex", ["Alex lives in Austin"]));
  assert.ok(mem.value.includes("- Alex lives in Austin"), "what's pinned is in the generated MEMORY.md");
  const cap = (el) => el.getAttribute("maxlength") ?? el.getAttribute("maxLength");
  assert.equal(cap(soul), String(MAX_BOT_DOC_CHARS), "the cap on the text area");
  assert.equal(cap(mem), String(MAX_BOT_DOC_CHARS));
  const text = m.box.textContent;
  assert.ok(text.includes("reads both at the start of every chat turn, task and call"), "how the bot uses them");
  assert.ok(text.includes("takes the place of How I work"));
  assert.ok(text.includes("/Users/alex/bops/.data/users/u1/bots/boppy"), "where the copies are");
  assert.ok(text.includes("edits there do nothing"));
  assert.equal(section(m.box, "SOUL.md").textContent.includes("Generated"), true);
  assert.equal(buttonIn(section(m.box, "SOUL.md"), "Save").disabled, true, "nothing to save yet");
  assert.equal(buttonIn(section(m.box, "SOUL.md"), "Reset to generated"), undefined, "nothing to reset yet");
  await click(tab(m.box, "Memory"));
  assert.ok(!m.box.querySelector("[data-bot-docs]"), "back to Memory");
  await m.done();
});

await test("Save sends that document alone; the view says Yours; Reset to generated sends null", async () => {
  const m = await mount(stateOf());
  await click(tab(m.box, "Edit"));
  const s = section(m.box, "SOUL.md");
  await type(area(m.box, "SOUL.md"), "# Boppy\nDry wit.\n");
  assert.equal(buttonIn(s, "Save").disabled, false);
  assert.ok(s.textContent.includes(`${(MAX_BOT_DOC_CHARS - "# Boppy\nDry wit.\n".length).toLocaleString("en-US")} characters left`));
  await click(buttonIn(s, "Save"));
  assert.deepEqual(bops.sent.at(-1), { method: "PATCH", body: { botId: "boppy", soul: "# Boppy\nDry wit.\n" } }, "SOUL.md alone");
  assert.equal(bops.bot.soul, "# Boppy\nDry wit.");
  assert.ok(section(m.box, "SOUL.md").textContent.includes("Yours"));
  assert.equal(area(m.box, "SOUL.md").value, "# Boppy\nDry wit.", "as kept");
  assert.equal(buttonIn(section(m.box, "SOUL.md"), "Save").disabled, true, "saved: nothing more to save");
  assert.equal(area(m.box, "MEMORY.md").value, Docs.renderMemoryDoc(bops.bot, "Alex", ["Alex lives in Austin"]), "MEMORY.md untouched");
  await click(buttonIn(section(m.box, "SOUL.md"), "Reset to generated"));
  assert.deepEqual(bops.sent.at(-1), { method: "PATCH", body: { botId: "boppy", soul: null } });
  assert.equal(bops.bot.soul, undefined);
  assert.equal(area(m.box, "SOUL.md").value, Docs.renderSoul(bops.bot, "Alex"), "the generated one again");
  assert.ok(section(m.box, "SOUL.md").textContent.includes("Generated"));
  const me = section(m.box, "MEMORY.md");
  await type(area(m.box, "MEMORY.md"), "- Invoices go to Dana.");
  await click(buttonIn(me, "Save"));
  assert.deepEqual(bops.sent.at(-1), { method: "PATCH", body: { botId: "boppy", memoryDoc: "- Invoices go to Dana." } }, "MEMORY.md alone");
  assert.equal(bops.bot.memoryDoc, "- Invoices go to Dana.");
  await m.done();
});

await test("what the server refuses is said, and the text stays to fix", async () => {
  const m = await mount(stateOf());
  await click(tab(m.box, "Edit"));
  bops.docsStatus = 400;
  bops.docsError = "SOUL.md is too long: at most 20,000 characters.";
  await type(area(m.box, "SOUL.md"), "too much");
  await click(buttonIn(section(m.box, "SOUL.md"), "Save"));
  const alert = section(m.box, "SOUL.md").querySelector('[role="alert"]');
  assert.ok(alert && alert.textContent.includes("too long"));
  assert.equal(area(m.box, "SOUL.md").value, "too much", "kept to fix");
  bops.docsStatus = 200;
  await m.done();
});

await test("with someone else's workspace open there's no Edit", async () => {
  const m = await mount(stateOf({ shared: { projectId: "p", name: "Acme", owner: "Ava", role: "member", wsId: "ws_main" } }));
  assert.equal(tab(m.box, "Edit"), undefined);
  assert.ok(!m.box.querySelector("[data-bot-docs]"));
  await m.done();
});

await test("no dashes in what's shown", () => {
  for (const text of seen) assert.ok(!DASHES.test(text.replace(/\/Users\/[^\s]+/g, "")), `a dash: ${text.match(new RegExp(`.{0,40}(${DASHES.source}).{0,40}`))?.[0]}`);
});

console.log(`bot docs ui: ${passed} passed`);
process.exit(0);

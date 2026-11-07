// The message box's agent chip (components/app/new-thread.tsx AgentChipPick), in a build with agent harnesses
// (NEXT_PUBLIC_BOPS_BRAINS=1), rendered into a DOM (linkedom) and pressed (task 93, the live retest's regression):
// - Kevin's case: Boppy works on this PC, its Default is Claude Code on a Claude plan, and Claude isn't signed in on
//   this PC: the chip says so ("not signed in on this PC"), in its name, its title and what shows;
// - the picker opens and lists every agent it offers, none refused (aria-disabled): one not ready says why, and a
//   press picks it (the Default as null, another by its id), as a click or an accessibility client does;
// - a pick that isn't ready where it would run (another Claude plan, on this PC) shows that too, never no status.
// Usage: node scripts/test-agent-chip-ui.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

process.env.NEXT_PUBLIC_BOPS_BRAINS = "1";
const rootUrl = pathToFileURL(fileURLToPath(new URL("..", import.meta.url))).href.replace(/\/$/, "");
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
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
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    if (!url.endsWith(".tsx")) return next(url, context);
    const out = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: url });
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// This PC's Bot tasks: no runner, Claude isn't signed in here (Kevin's PC as the retest found it).
globalThis.fetch = async (u) => ({
  ok: true,
  json: async () => (String(u).includes("pc-task-runner") ? { runner: null, choice: null, problem: "Sign in to Claude in Settings, AI subscriptions, This PC." } : String(u).includes("/api/config") ? { platform: "win32" } : {}),
});

const now = Date.now();
const brains = [
  { id: "brain_one", kind: "claude", name: "Claude Code", auth: "plan", bots: ["boppy"], workspaceId: "ws_main", createdAt: 1, signIns: [{ computerId: "pc-boppy", at: now, account: { plan: "max" } }] },
  { id: "brain_two", kind: "claude", name: "Claude Code (2)", auth: "plan", bots: ["boppy"], workspaceId: "ws_main", createdAt: 2, signIns: [{ computerId: "pc-boppy", at: now, account: { plan: "max" } }] },
];
const boppy = {
  id: "boppy",
  name: "Boppy",
  role: "Chief of staff",
  color: "#E9FF3B",
  isMain: true,
  computerId: "pc-boppy",
  computerStatus: "ready",
  workspaceId: "ws_main",
  runsOn: "mac",
  ai: { agents: [{ id: "bops", kind: "bops", pays: "credit" }, { id: "ag_AAAAAAAAAA", kind: "claude", pays: "plan", account: "brain_one" }, { id: "ag_BBBBBBBBBB", kind: "claude", pays: "plan", account: "brain_two" }], default: "ag_BBBBBBBBBB" },
};
const state = { host: "orgo", bots: [boppy], brains, chats: [], sessions: [] };

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AgentChipPick } = await import(`${rootUrl}/components/app/new-thread.tsx`);

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};
const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => await new Promise((r) => setTimeout(r, 5)));
};
async function mount(value) {
  const picks = [];
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  await act(async () => root.render(h(AgentChipPick, { state, bot: boppy, value, onPick: (id) => picks.push(id) })));
  await settle();
  return { box, picks, chip: box.querySelector('button[aria-haspopup="menu"]'), unmount: () => act(async () => root.unmount()) };
}
const items = (box) => [...box.querySelectorAll('[role="menu"] [role="menuitemradio"]')];

await test("the chip says the Default isn't signed in on this PC: in its name, its title and what shows", async () => {
  const m = await mount(null);
  assert.ok(m.chip, "no chip");
  assert.match(m.chip.getAttribute("aria-label"), /^Agent for new tasks: Claude Code · Claude Max plan 2, not signed in on this PC$/);
  assert.match(m.chip.getAttribute("title"), /Claude isn't signed in on this PC/);
  assert.match(m.box.querySelector("[data-agent-status]").textContent, /not signed in on this PC/);
  assert.equal(m.chip.getAttribute("data-agent-ready"), "no");
  await m.unmount();
});

await test("the picker opens and lists its agents, none refused; the one not ready says why", async () => {
  const m = await mount(null);
  await act(async () => m.chip.click());
  assert.equal(m.chip.getAttribute("aria-expanded"), "true");
  const list = items(m.box);
  assert.ok(list.length >= 2, `items: ${list.map((x) => x.textContent)}`);
  for (const x of list) assert.equal(x.getAttribute("aria-disabled"), null, `${x.textContent} is refused`);
  const def = list.find((x) => /Claude Max plan 2/.test(x.textContent));
  assert.match(def.textContent, /not signed in on this PC/);
  assert.equal(def.getAttribute("aria-checked"), "true");
  // Pressed: Bops agent by its id, the Default as null.
  await act(async () => list.find((x) => /^Bops agent/.test(x.textContent)).click());
  assert.deepEqual(m.picks, ["bops"]);
  assert.equal(items(m.box).length, 0, "the menu closes");
  await act(async () => m.chip.click());
  await act(async () => items(m.box).find((x) => /Claude Max plan 2/.test(x.textContent)).click());
  assert.deepEqual(m.picks, ["bops", null]);
  await m.unmount();
});

await test("a pick that isn't ready where it would run (another Claude plan, on this PC) shows that, never no status", async () => {
  const m = await mount("ag_AAAAAAAAAA");
  const label = m.chip.getAttribute("aria-label");
  if (/Claude Max plan(?! 2)/.test(label)) assert.match(label, /not signed in on this PC/, `the pick shows no status: ${label}`);
  else assert.match(label, /not signed in on this PC/);
  await m.unmount();
});

console.log(`agent chip ui: ${passed} passed`);
process.exit(0);

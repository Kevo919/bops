// Focused subscription action tests: no provider calls, real credentials or computers.
// node scripts/test-subscriptions-ui.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { createElement: h, act } = await import("react");
process.env.NEXT_PUBLIC_BOPS_BRAINS = "1";
const { SubscriptionRow } = await import(pathToFileURL(`${root}/components/app/setup.tsx`).href);
const calls = [], shown = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bot = { id: "boppy", name: "Boppy", isMain: true, workspaceId: "ws_main", computerId: "pc-main", computerStatus: "ready", ai: { agents: [{ id: "bops", kind: "bops", pays: "credit" }], default: "bops" } };
const state = { host: "orgo", workspace: "ws_main", bots: [bot], brains: [], sessions: [], llms: [] };
const account = "brain_subscription";
const added = { id: "ag_sub0000001", kind: "codex", pays: "plan", account };
let answer;
globalThis.fetch = async (input, init = {}) => {
  const path = typeof input === "string" ? input : input.url;
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ path, method: init.method ?? "GET", body });
  return answer(path, body);
};
const props = { kind: "codex", state, bot, selfHosted: true, onShowScreen: (...args) => shown.push(args), onOpenVault() {} };
const settle = () => new Promise((r) => setTimeout(r, 5));
async function mount(extra = {}) {
  const box = document.createElement("div"); document.body.appendChild(box);
  const root = createRoot(box);
  await act(async () => { root.render(h(SubscriptionRow, { ...props, ...extra })); await settle(); });
  return { box, done: async () => { await act(async () => root.unmount()); box.remove(); } };
}
const button = (box, label) => [...box.querySelectorAll("button")].find((b) => b.textContent === label);
const click = async (box, label) => {
  const b = button(box, label); assert.ok(b, label);
  await act(async () => { b.dispatchEvent(new win.Event("click", { bubbles: true })); await settle(); });
};
const addedResponse = () => json({ added: added.id, ai: { agents: [added], default: "bops" } });
answer = (path) => path === "/api/bots/ai" ? addedResponse() : json({ botId: bot.id, display: 100 });
let m = await mount();
await click(m.box, "Sign in with your subscription");
assert.deepEqual(calls.map((c) => c.path), ["/api/bots/ai", "/api/brains/sign-in"]);
assert.deepEqual(calls[0].body, { botId: bot.id, op: "add", kind: "codex", pays: "plan" });
assert.deepEqual(calls[1].body, { brainId: account, botId: bot.id });
assert.deepEqual(shown, [[bot.id, 100]]);
await m.done();
console.log("ok new subscription agent signs in on the selected bot's computer");

calls.length = 0; shown.length = 0;
let release;
answer = () => new Promise((r) => { release = r; });
m = await mount();
await click(m.box, "Sign in with your subscription");
await m.done(); // Changing the selected bot remounts this keyed row.
await act(async () => { release(addedResponse()); await settle(); });
assert.equal(calls.length, 1, "no old-bot sign-in after a bot change");
assert.deepEqual(shown, []);
console.log("ok changing bots while adding an agent cancels the old sign-in continuation");

calls.length = 0; shown.length = 0;
const connectedBot = { ...bot, ai: { agents: [added], default: added.id } };
const connectedState = { ...state, bots: [connectedBot], brains: [{ id: account, kind: "codex", auth: "plan", bots: [bot.id], workspaceId: "ws_main" }] };
answer = () => new Promise((r) => { release = r; });
m = await mount({ bot: connectedBot, state: connectedState });
await click(m.box, "Sign in with your subscription");
assert.deepEqual(calls.map((c) => c.path), ["/api/brains/sign-in"], "reuse the existing subscription account");
await m.done();
await act(async () => { release(json({ botId: bot.id, display: 100 })); await settle(); });
assert.deepEqual(shown, [], "late sign-in response cannot reopen the old computer");
console.log("ok late sign-in response does not show a stale screen");

calls.length = 0;
connectedState.brains[0].signIns = [{ computerId: "pc-main", at: 1700000000000 }];
answer = () => json({ ok: true });
m = await mount({ bot: connectedBot, state: connectedState });
await click(m.box, "Check connection");
await click(m.box, "Sign out on this computer");
assert.deepEqual(calls, [
  { path: `/api/brains/sign-in?brain=${account}&bot=${bot.id}`, method: "GET", body: undefined },
  { path: "/api/brains/sign-out", method: "POST", body: { brainId: account, botId: bot.id } },
]);
await m.done();
console.log("ok refresh and sign out target only the selected account and computer");

calls.length = 0;
const coding = { id: "ag_sub0000003", kind: "opencode", pays: "key", model: "zai-coding/glm-5.3" };
const codingBot = { ...bot, ai: { agents: [coding], default: coding.id } };
answer = () => json({ ok: true });
m = await mount({ kind: "zai", bot: codingBot, state: { ...state, bots: [codingBot] }, keys: new Set(["ZAI_API_KEY"]) });
await click(m.box, "Disconnect Coding Plan tasks");
assert.equal(calls.length, 0, "disconnect asks before stopping tasks");
assert.match(m.box.textContent, /saved Z.ai key stays available/);
await click(m.box, "Disconnect");
assert.deepEqual(calls, [{ path: "/api/bots/ai", method: "POST", body: { botId: bot.id, op: "remove", agentId: coding.id } }]);
await m.done();
console.log("ok Coding Plan disconnect removes only its selected agent, never the shared key");
console.log("subscriptions ui: 5 passed");

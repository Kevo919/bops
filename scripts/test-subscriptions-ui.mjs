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
const BRAINS_OFF = process.argv.includes("--brains-off");
process.env.NEXT_PUBLIC_BOPS_BRAINS = BRAINS_OFF ? "0" : "1";
const { SubscriptionRow, AiSubscriptionsCard, LocalSubscriptions } = await import(pathToFileURL(`${root}/components/app/setup.tsx`).href);
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
async function mount(extra = {}, Component = SubscriptionRow) {
  const box = document.createElement("div"); document.body.appendChild(box);
  const root = createRoot(box);
  await act(async () => { root.render(h(Component, { ...props, ...extra })); await settle(); });
  return { box, done: async () => { await act(async () => root.unmount()); box.remove(); } };
}
const button = (box, label) => [...box.querySelectorAll("button")].find((b) => b.textContent === label);
const click = async (box, label) => {
  const b = button(box, label); assert.ok(b, label);
  await act(async () => { b.dispatchEvent(new win.Event("click", { bubbles: true })); await settle(); });
};
const addedResponse = () => json({ added: added.id, ai: { agents: [added], default: "bops" } });
if (!BRAINS_OFF) {
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
}

const local = (kind, state = "signed-out", extra = {}) => ({ kind, state, available: state !== "missing", connected: state === "connected", checkedAt: 1700000000000, ...extra });
win.bopsMac = {}; // Desktop bridge presence; no real desktop calls.
let snapshots = [local("codex"), local("claude", "missing", { error: "Install Claude Code, then check again." })];
calls.length = 0;
answer = (path, body) => {
  if (path === "/api/config") return json({ selfHosted: true });
  if (path === "/api/pc-task-runner") return json({ choice: null, runner: null, problem: "No AI is set up for bot tasks on this PC.", openaiKey: { set: false, masked: "" } });
  assert.equal(path, "/api/local-subscriptions", "no cloud APIs are needed for local sign-in");
  if (!body) return json({ subscriptions: snapshots });
  assert.equal(body.kind, "codex");
  const subscription = body.action === "login" ? local("codex", "connecting", { loginUrl: "https://auth.openai.com/oauth/authorize?fixture=only" }) : local("codex");
  snapshots = [subscription, snapshots[1]];
  return json({ subscription });
};
const noHost = { ...state, host: "mac", bots: [{ ...bot, computerId: undefined, ai: undefined }], brains: [] };
let localMount = await mount({ state: noHost }, AiSubscriptionsCard);
assert.equal(button(localMount.box, "This PC").getAttribute("aria-pressed"), "true");
assert.match(localMount.box.textContent, /No bot computer or AI profile is needed/);
assert.doesNotMatch(localMount.box.textContent, /coming later/);
assert.ok(button(localMount.box, "Your Claude plan (signed in)") && button(localMount.box, "OpenAI key"), "Bot tasks on this PC offers both runners");
assert.match(localMount.box.textContent, /Claude subscriptions do not power Bops chat/);
assert.ok(!button(localMount.box, "Sign in with your ChatGPT subscription").disabled);
assert.ok(button(localMount.box, "Sign in with your Claude subscription").disabled);
await click(localMount.box, "Sign in with your ChatGPT subscription");
assert.match(localMount.box.textContent, /Finish signing in in your normal browser/);
assert.equal(localMount.box.querySelector("a").href, "https://auth.openai.com/oauth/authorize?fixture=only");
await click(localMount.box, "Cancel ChatGPT sign-in");
assert.deepEqual(calls.filter((c) => c.method === "POST").map((c) => c.body), [{ kind: "codex", action: "login" }, { kind: "codex", action: "cancel" }]);
if (BRAINS_OFF) {
  await click(localMount.box, "Bot cloud computer");
  assert.match(localMount.box.textContent, /Cloud agent harnesses are off in this build/);
}
await localMount.done();
console.log(`ok local subscription sign-in and cancel work with no brains, computer or AI profile (harnesses ${BRAINS_OFF ? "off" : "on"})`);

calls.length = 0;
answer = (_path, body) => body ? json({ error: "Official CLI could not start. Check its installation." }, 502) : json({ subscriptions: [local("codex"), local("claude", "error", { error: "Could not check Claude account." })] });
localMount = await mount({}, LocalSubscriptions);
await click(localMount.box, "Sign in with your ChatGPT subscription");
assert.match(localMount.box.textContent, /Official CLI could not start/);
assert.match(localMount.box.textContent, /Could not check Claude account/);
assert.ok(!button(localMount.box, "Sign in with your ChatGPT subscription").disabled, "failure leaves a retry path");
await localMount.done();
console.log("ok provider status and start failures are visible, with retry");

calls.length = 0;
answer = (_path, body) => body ? json({ subscription: local("codex") }) : json({ subscriptions: [local("codex", "connected"), local("claude")] });
localMount = await mount({}, LocalSubscriptions);
assert.match(localMount.box.textContent, /Connected: your ChatGPT subscription/);
assert.match(localMount.box.textContent, /Account details unavailable. The CLI did not report the plan tier/);
assert.doesNotMatch(localMount.box.textContent, /Connected: your ChatGPT (Plus|Pro)/);
await click(localMount.box, "Sign out of ChatGPT on this PC");
assert.match(localMount.box.textContent, /including its use outside Bops/);
assert.equal(calls.filter((c) => c.method === "POST").length, 0);
await click(localMount.box, "Confirm sign out");
assert.deepEqual(calls.at(-1).body, { kind: "codex", action: "logout" });
await localMount.done();
console.log("ok local logout warns about the official CLI outside Bops, and unknown plan metadata stays unknown");

calls.length = 0;
answer = () => json({ error: "Local subscriptions are available only to the self-hosted owner." }, 403);
localMount = await mount({}, LocalSubscriptions);
assert.match(localMount.box.textContent, /only to the self-hosted owner/);
await localMount.done();
console.log("ok API access failure is visible rather than a silent empty card");
// Bot tasks on this PC: the choice and the OpenAI key box. The key is posted once and never shown back, only its mask.
{
  const { PcTaskRunnerCard } = await import(pathToFileURL(`${root}/components/app/setup.tsx`).href);
  const KEY = `sk-proj-${"K".repeat(40)}`;
  let view = { choice: null, runner: "claude", openaiKey: { set: false, masked: "" } };
  calls.length = 0;
  answer = (path, body) => {
    assert.equal(path, "/api/pc-task-runner");
    if (body?.choice !== undefined) view = { ...view, choice: body.choice, runner: body.choice, ...(body.choice === "openai" && !view.openaiKey.set ? { runner: null, problem: "Add an OpenAI environment key in Settings, Bot tasks on this PC, then try again." } : {}) };
    if (typeof body?.key === "string") view = { ...view, runner: view.choice ?? "claude", problem: undefined, openaiKey: body.key ? { set: true, masked: "ends in KKKK" } : { set: false, masked: "" } };
    return json(view);
  };
  const m2 = await mount({}, PcTaskRunnerCard);
  assert.match(m2.box.textContent, /Bot tasks on this PC/);
  assert.match(m2.box.textContent, /Not chosen yet, so tasks use your Claude plan for now/);
  assert.equal(button(m2.box, "Your Claude plan (signed in)").getAttribute("aria-pressed"), "true");
  await click(m2.box, "OpenAI key");
  assert.deepEqual(calls.at(-1).body, { choice: "openai" });
  assert.match(m2.box.textContent, /Add an OpenAI environment key in Settings, Bot tasks on this PC/);
  assert.match(m2.box.textContent, /environment key, not an ordinary API key/);
  assert.match(m2.box.textContent, /Agents, Environments, Keys/);
  const input = m2.box.querySelector('input[aria-label="OpenAI key for bot tasks"]');
  assert.equal(input.getAttribute("type"), "password");
  // React's own change handler for the box (linkedom's input events don't reach a password box's onChange here).
  await act(async () => {
    input[Object.keys(input).find((k) => k.startsWith("__reactProps"))].onChange({ target: { value: KEY } });
    await settle();
  });
  assert.ok(!button(m2.box, "Save key").disabled);
  await act(async () => { m2.box.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); await settle(); });
  assert.deepEqual(calls.at(-1).body, { key: KEY });
  assert.equal(input.value, "", "the box empties once the key is sent");
  assert.ok(!m2.box.innerHTML.includes(KEY), "the key is never shown back");
  assert.match(m2.box.textContent, /Saved on this PC \(ends in KKKK\)/);
  assert.doesNotMatch(m2.box.textContent, /[\u2013\u2014]/, "no dashes in shown text");
  await click(m2.box, "Remove key");
  assert.deepEqual(calls.at(-1).body, { key: "" });
  await m2.done();
  console.log("ok Bot tasks on this PC: choice, masked OpenAI key box, never echoed");
}
console.log("local subscriptions ui: 5 passed");
for (const hosted of [false, true]) {
  calls.length = 0;
  if (hosted) win.bopsMac = {}; else delete win.bopsMac;
  answer = (path) => path === "/api/config" ? json({ selfHosted: !hosted }) : json({});
  localMount = await mount({ state: noHost }, AiSubscriptionsCard);
  assert.equal(button(localMount.box, "This PC"), undefined);
  assert.ok(!calls.some((c) => c.path.startsWith("/api/local-subscriptions")));
  await localMount.done();
}
console.log("ok phone/browser and hosted cards never request desktop subscription status");
win.bopsMac = {};
calls.length = 0;
answer = (path) => json({ subscriptions: path.includes("?kind=codex") ? [local("codex", "connected")] : [local("codex", "connecting"), local("claude", "signed-out", { loginUrl: "https://claude.com/cai/oauth/authorize?fixture=only" })] });
localMount = await mount({}, LocalSubscriptions);
await act(async () => { await new Promise((r) => setTimeout(r, 2100)); });
assert.ok(calls.some((c) => c.path === "/api/local-subscriptions?kind=codex"));
assert.ok(!calls.some((c) => c.path.includes("?kind=claude")));
assert.equal(localMount.box.querySelector("a"), null);
assert.match(localMount.box.textContent, /cannot accept a pasted authorization code/);
await localMount.done();
console.log("ok polling requests only the connecting provider and Claude has no manual code URL");
answer = () => json({ subscriptions: [local("codex"), local("claude", "connecting", { loginUrl: "https://claude.ai/oauth/authorize?fixture=only" })] });
localMount = await mount({}, LocalSubscriptions);
assert.equal(localMount.box.querySelector("a"), null, "even an older allowed Claude URL is not offered during sign-in");
assert.ok(button(localMount.box, "Cancel Claude sign-in"));
await localMount.done();
console.log("ok connecting Claude never offers its printed paste-code URL");
if (!BRAINS_OFF) {
  const { execFileSync } = await import("node:child_process");
  const output = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--brains-off"], { encoding: "utf8", env: process.env });
  process.stdout.write(output);
}

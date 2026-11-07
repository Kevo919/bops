// Tests for the message box's agent chip (lib/agents.ts nextRunState, components/app/new-thread.tsx boxAgents): it
// says whether the agent the next message would run on is ready where that message's tasks really run, in plain words.
// The case from Kevin's PC: Boppy's Default is a second Claude Code agent ("Max plan 2") while Settings, AI subscriptions shows
// Claude connected. The chip goes by the Default and the place its tasks run, never by another profile's sign in:
// - on this PC (Boppy works here), Bot tasks on this PC run them: ready when Claude is signed in here and runs them,
//   "Claude isn't signed in on this PC" when not, and never ready because a cloud computer's account is;
// - on Boppy's cloud computer, the Default's own account must be signed in there; the other account being signed in
//   is named, not counted; asleep is ready ("it wakes when you send"); stopped isn't.
// Usage: node --experimental-strip-types --no-warnings scripts/test-chat-readiness.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

process.env.NEXT_PUBLIC_BOPS_BRAINS = "1";
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    if (/^(\.{1,2}\/|file:)/.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(fileURLToPath(base.href + ext))) return next(base.href + ext, context);
    }
    return next(specifier, context);
  },
});
const A = await import(pathToFileURL(join(root, "lib", "agents.ts")).href);

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

const now = Date.now();
// Kevin's: two Claude Max plan accounts, both signed in on Boppy's cloud computer (so the chip names the Default "Max plan 2").
const brains = [
  { id: "brain_one", kind: "claude", name: "Claude Code", auth: "plan", bots: ["boppy"], workspaceId: "ws_main", createdAt: 1, signIns: [{ computerId: "pc-boppy", at: now, account: { plan: "max" } }] },
  { id: "brain_two", kind: "claude", name: "Claude Code (2)", auth: "plan", bots: ["boppy"], workspaceId: "ws_main", createdAt: 2, signIns: [{ computerId: "pc-boppy", at: now, account: { plan: "max" } }] },
];
// The second account signed in on another computer only, not Boppy's.
const elsewhere = brains.map((x) => (x.id === "brain_two" ? { ...x, signIns: [{ computerId: "pc-old", at: now, account: { plan: "max" } }] } : x));
const one = { id: "ag_AAAAAAAAAA", kind: "claude", pays: "plan", account: "brain_one" };
const two = { id: "ag_BBBBBBBBBB", kind: "claude", pays: "plan", account: "brain_two" };
const codex = { id: "ag_CCCCCCCCCC", kind: "codex", pays: "key", account: undefined };
const boppy = (over = {}) => ({
  id: "boppy",
  name: "Boppy",
  role: "Chief of staff",
  color: "#E9FF3B",
  isMain: true,
  computerId: "pc-boppy",
  computerStatus: "ready",
  workspaceId: "ws_main",
  ai: { agents: [{ id: "bops", kind: "bops", pays: "credit" }, one, two], default: two.id },
  ...over,
});
const stateOf = (b, over = {}) => ({ host: "orgo", bots: [b], brains, ...over });

check("the two profiles are told apart: the Default is 'Claude Code · Claude Max plan 2', the other 'Claude Code · Claude Max plan'", () => {
  const b = boppy();
  const st = stateOf(b);
  const ai = A.aiOf(b, st);
  assert.equal(ai.default, two.id);
  assert.equal(A.agentName(ai.agents.find((x) => x.id === two.id), { bot: b, state: st }), "Claude Code · Claude Max plan 2");
  assert.equal(A.agentName(ai.agents.find((x) => x.id === one.id), { bot: b, state: st }), "Claude Code · Claude Max plan");
});

check("Boppy works on this PC and Claude is signed in here: the Default is ready (the cloud check alone said 'not ready')", () => {
  const b = boppy({ runsOn: "mac" });
  const st = stateOf(b);
  assert.equal(A.agentState(two, b, st).ready, false, "the cloud check alone said not ready: the bug");
  const r = A.nextRunState(two, b, st, { pc: { runner: "claude" } });
  assert.equal(r.where, "pc");
  assert.equal(r.ready, true);
  assert.equal(r.line, "Your Claude plan · signed in on this PC");
});

check("on this PC, Claude not signed in: not ready, and says so in plain words", () => {
  const b = boppy({ runsOn: "mac" });
  const r = A.nextRunState(two, b, stateOf(b), { pc: { runner: null, problem: "Sign in to Claude in Settings, AI subscriptions, This PC, then try again." } });
  assert.equal(r.ready, false);
  assert.match(r.line, /^Claude isn't signed in on this PC\. Sign in to Claude/);
  assert.equal(r.short, "not signed in on this PC");
});

check("on this PC, the OpenAI key runs tasks: a Claude agent isn't what runs, so not ready, saying where to switch", () => {
  const b = boppy({ runsOn: "mac" });
  const r = A.nextRunState(two, b, stateOf(b), { pc: { runner: "openai" } });
  assert.equal(r.ready, false);
  assert.match(r.line, /OpenAI key.*Settings → AI subscriptions/);
});

check("on this PC, not checked yet: not called ready, marked as checking; can't be checked here: says why", () => {
  const b = boppy({ runsOn: "mac" });
  const checking = A.nextRunState(two, b, stateOf(b), {});
  assert.equal(checking.ready, false);
  assert.equal(checking.checking, true);
  const elsewhere = A.nextRunState(two, b, stateOf(b), { pc: null });
  assert.equal(elsewhere.ready, false);
  assert.match(elsewhere.line, /only be checked in the Bops app on this PC/);
});

check("on this PC, another CLI agent doesn't run tasks here: not ready, in words", () => {
  const b = boppy({ runsOn: "mac", ai: { agents: [{ id: "bops", kind: "bops", pays: "credit" }, one, codex], default: codex.id } });
  const r = A.nextRunState(codex, b, stateOf(b), { pc: { runner: "claude" } });
  assert.equal(r.ready, false);
  assert.match(r.line, /^Codex on a key doesn't run tasks on this PC/);
});

check("on the cloud computer: the Default's own account counts, and the other one signed in there is named, not counted", () => {
  const b = boppy({ runsOn: "cloud" });
  const st = stateOf(b, { brains: elsewhere });
  const r = A.nextRunState(two, b, st, { computerStatus: "running" });
  assert.equal(r.where, "cloud");
  assert.equal(r.ready, false, "the other profile's sign in doesn't make this one ready");
  assert.equal(r.line, "Claude Code (Claude plan) isn't signed in on Boppy's computer. Claude Code · Claude Max plan is: pick it, or sign this one in.");
  assert.equal(r.short, "not signed in");
  assert.equal(r.button, "sign_in");
  const first = A.nextRunState(one, b, st, { computerStatus: "running" });
  assert.equal(first.ready, true, "the one signed in there is ready");
  assert.equal(first.note, undefined);
});

check("two profiles, the Default's computer asleep: ready, and it says it wakes when you send", () => {
  // Both accounts are signed in on Boppy's computer, which is asleep (Orgo's "suspended").
  const b = boppy();
  const st = stateOf(b);
  const r = A.nextRunState(two, b, st, { computerStatus: "suspended" });
  assert.equal(r.ready, true);
  assert.equal(r.line, "Boppy's computer is asleep; it wakes when you send.");
  assert.equal(r.note, "asleep, wakes when you send");
  const off = A.nextRunState(two, b, st, { computerStatus: "stopped" });
  assert.equal(off.ready, false, "a stopped computer doesn't wake by itself");
  assert.match(off.line, /^Boppy's computer is stopped, and nothing wakes it by itself/);
  const up = A.nextRunState(two, b, st, { computerStatus: "running" });
  assert.equal(up.ready, true);
  assert.equal(up.note, undefined);
});

check("Bops agent is ready wherever the task runs, as before", () => {
  for (const runsOn of ["mac", "cloud", "auto"]) {
    const b = boppy({ runsOn });
    assert.equal(A.nextRunState({ id: "bops", kind: "bops", pays: "credit" }, b, stateOf(b), {}).ready, true, runsOn);
  }
});

check("a bot that works on this Mac's browsers (host mac) is on this PC too", () => {
  const b = boppy();
  assert.equal(A.nextRunWhere(b, { host: "mac" }), "pc");
  assert.equal(A.nextRunWhere(b, { host: "orgo" }), "cloud");
  assert.equal(A.nextRunWhere({ runsOn: "mac" }, { host: "orgo" }), "pc");
});

console.log(`\nchat readiness: ${passed} passed`);

// A routine's model (Routine.model, lib/server/routines.ts, app/api/routines, chat.ts's schedule tool):
// - it's one of the models a chat can be on (Your LLMs, presets too, and the built in ones), else turned down, and
//   says which there are; null clears it, and the routine runs as before;
// - only the owner sets it: the routines API only from the Bops window, never on a routine someone else set up,
//   never on a reminder (it runs nothing);
// - a chat run's turn is on it (chat.ts BackgroundJob.model), and on the chat's model as before without one, or
//   when it's gone from the list since;
// - a task starts on a bot's agent that runs it, when it's one of Your LLMs that bots' agents run (not a preset);
// - the state's merge (routine-sync between the user's Bops) carries it like any field.
// Usage: node --conditions=react-server scripts/test-routine-model.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|ANTHROPIC|OPENROUTER|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-routine-model";
const rootUrl = new URL("..", import.meta.url);
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-routine-model-"));
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
const exportsOf = (url) => [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = at(specifier.slice(2));
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
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    // The chat engine: a turn that records what it was asked to run on (a chat run's BackgroundJob).
    if (name === "chat")
      return {
        format: "module",
        shortCircuit: true,
        source: [
          ...exportsOf(url).filter((n) => n !== "backgroundTurn").map((n) => `export const ${n} = function () { return Promise.resolve(); };`),
          "export const backgroundTurn = async (botId, job) => { (globalThis.__turns ??= []).push({ botId, job }); return { text: 'Done.' }; };",
        ].join("\n"),
      };
    if (!name || !STAND_INS.has(name)) return next(url, context);
    return { format: "module", shortCircuit: true, source: exportsOf(url).map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 5).join("\n  ") ?? e.message}`);
  }
}

const S = await import(at("lib/server/store.ts"));
const R = await import(at("lib/server/routines.ts"));
const A = await import(at("lib/agents.ts"));
const M = await import(at("lib/server/state-merge.ts"));
const route = await import(at("app/api/routines/route.ts"));
clearInterval(globalThis.__bopsRoutines);

A.setLlms([
  { name: "Qwen Coder", provider: "openrouter", model: "qwen/qwen3-coder-next", runBy: "dsh" },
  { name: "Email writer", provider: "openrouter", model: "@preset/email-writer" },
]);
const botId = S.getState().bots[0].id;
S.update((s) => {
  s.owner = { name: "Alex", timeZone: "America/New_York" };
  s.ownerSeenAt = Date.now();
});
const daily = { kind: "daily", time: "09:00" };
const make = (opts = {}) => R.createRoutine(botId, "News check", "Check the news.", daily, { run: "chat", ...opts });
const routine = (id) => S.getState().routines.find((r) => r.id === id);

await check("made with a model: a preset, one of Your LLMs, or a built in one; anything else is turned down, naming the ones there are", async () => {
  const a = make({ model: "openrouter/@preset/email-writer" });
  assert.equal(a.error, undefined);
  assert.equal(a.routine.model, "openrouter/@preset/email-writer");
  assert.equal(make({ model: "anthropic/claude-opus-5-5" }).routine.model, "anthropic/claude-opus-5-5", "a built in one");
  const bad = make({ model: "openrouter/made-up/model" });
  assert.equal(bad.routine, undefined);
  assert.match(bad.error, /isn't a model Bops has.*openrouter\/qwen\/qwen3-coder-next/);
  assert.equal(make().routine.model, undefined, "none: as before");
  assert.equal(R.createRoutine(botId, "Water", "", daily, { reminder: "Drink water.", model: "anthropic/claude-opus-5-5" }).routine.model, undefined, "a reminder runs nothing, so no model");
});

await check("only the owner: not on a routine someone else set up, made or changed", async () => {
  const outside = R.createRoutine(botId, "Hotel", "Check in.", daily, { fromOutside: "an email from desk@hotel.example", model: "anthropic/claude-opus-5-5" });
  assert.match(outside.error, /Only Alex can pick the model/);
  const theirs = R.createRoutine(botId, "Hotel", "Check in.", daily, { fromOutside: "an email from desk@hotel.example" }).routine;
  assert.match(R.editRoutine(theirs.id, { model: "anthropic/claude-opus-5-5" }).error, /set up by an email/);
  assert.equal(routine(theirs.id).model, undefined);
});

await check("changed, and cleared (null in the API: as before); a bad one changes nothing", async () => {
  const r = make().routine;
  assert.equal(R.editRoutine(r.id, { model: "openrouter/qwen/qwen3-coder-next" }).routine.model, "openrouter/qwen/qwen3-coder-next");
  assert.match(R.editRoutine(r.id, { model: "nope/nope" }).error, /isn't a model Bops has/);
  assert.equal(routine(r.id).model, "openrouter/qwen/qwen3-coder-next", "unchanged");
  assert.equal(R.editRoutine(r.id, { title: "News" }).routine.model, "openrouter/qwen/qwen3-coder-next", "another change keeps it");
  R.editRoutine(r.id, { model: undefined });
  assert.equal("model" in routine(r.id), false, "cleared");
});

await check("the routines API: only the Bops window may set it; a set one comes back, null clears it, a bad one is a 400", async () => {
  process.env.BOPS_UI_TOKEN = "synthetic-window-token";
  const req = (body, window = true) => new Request("http://localhost:3210/api/routines", { method: "PATCH", headers: { "content-type": "application/json", ...(window ? { cookie: "bops_window=synthetic-window-token" } : {}) }, body: JSON.stringify(body) });
  const r = make().routine;
  const res0 = await route.PATCH(req({ id: r.id, edit: { model: "anthropic/claude-opus-5-5" } }, false));
  assert.equal(res0.status, 403, "not from a page in a bot's Chrome");
  assert.equal(routine(r.id).model, undefined);
  let res = await route.PATCH(req({ id: r.id, edit: { model: "openrouter/@preset/email-writer" } }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).routine.model, "openrouter/@preset/email-writer");
  res = await route.PATCH(req({ id: r.id, edit: { model: "made/up" } }));
  assert.equal(res.status, 400);
  res = await route.PATCH(req({ id: r.id, edit: { model: null } }));
  assert.equal(res.status, 200);
  assert.equal(routine(r.id).model, undefined);
  const made = await route.POST(new Request("http://localhost:3210/api/routines", { method: "POST", headers: { "content-type": "application/json", cookie: "bops_window=synthetic-window-token" }, body: JSON.stringify({ botId, goal: "Digest.", schedule: daily, run: "chat", model: "anthropic/claude-haiku-5-5" }) }));
  assert.equal((await made.json()).routine.model, "anthropic/claude-haiku-5-5");
  delete process.env.BOPS_UI_TOKEN;
});

await check("a chat run's turn is on its model; without one, or with one gone from the list since, as before", async () => {
  globalThis.__turns = [];
  const r = make({ model: "openrouter/@preset/email-writer" }).routine;
  await R.runRoutine(r.id, { manual: "app" });
  assert.equal(globalThis.__turns.at(-1).job.model, "openrouter/@preset/email-writer");
  const plain = make().routine;
  await R.runRoutine(plain.id, { manual: "app" });
  assert.equal("model" in globalThis.__turns.at(-1).job, false);
  // Taken out of config/llms.yaml since: the run goes on as before, not on a model Bops no longer has.
  S.update(() => (routine(plain.id).model = "openrouter/gone/model"));
  await R.runRoutine(plain.id, { manual: "app" });
  assert.equal("model" in globalThis.__turns.at(-1).job, false);
});

await check("a task starts on the bot's agent for the model, when it's one of Your LLMs bots' agents run; a preset or a built in one: as before", async () => {
  const dsh = { id: "ag_dshAAAAAAA", kind: "dsh", pays: "key" };
  const open = { id: "ag_openAAAAAA", kind: "opencode", pays: "key", model: "openrouter/qwen/qwen3-coder-next" };
  const claude = { id: "ag_clauAAAAAA", kind: "claude", pays: "plan" };
  const b = S.getState().bots[0];
  const qwen = { model: "openrouter/qwen/qwen3-coder-next" };
  assert.deepEqual(R.taskAgentFor(qwen, b, [A.BOPS_AGENT, claude, dsh, open]), { agents: [open.id] }, "the agent on that very model first");
  assert.deepEqual(R.taskAgentFor(qwen, b, [A.BOPS_AGENT, { ...open, model: undefined }, dsh]), { agents: [dsh.id], model: qwen.model }, "else one of the kind its run_by names, told the model");
  assert.deepEqual(R.taskAgentFor(qwen, b, [A.BOPS_AGENT, claude]), {}, "no agent that takes any model: as before");
  assert.deepEqual(R.taskAgentFor({ model: "openrouter/@preset/email-writer" }, b, [dsh, open]), {}, "a preset runs chats only");
  assert.deepEqual(R.taskAgentFor({ model: "anthropic/claude-opus-5-5" }, b, [dsh, open]), {}, "a built in one isn't an LLM bots' agents run");
  assert.deepEqual(R.taskAgentFor({ ...qwen, fromOutside: "x" }, b, [dsh, open]), {});
  assert.deepEqual(R.taskAgentFor({}, b, [dsh, open]), {});
  assert.deepEqual(R.taskAgentFor(qwen, b), {}, "this bot's own: no computer, so none ready");
  const src = readFileSync(new URL("lib/server/routines.ts", rootUrl), "utf8");
  assert.match(src, /\.\.\.taskAgentFor\(r, b\),\n {4}\}\);/, "taskRun starts the thread with it");
});

await check("the state's merge between the user's Bops carries it, changed on either side", async () => {
  const base = { routines: [{ id: "r1", title: "A", goal: "g", schedule: daily, enabled: true }] };
  const mine = { routines: [{ ...base.routines[0], model: "anthropic/claude-opus-5-5" }] };
  const theirs = { routines: [{ ...base.routines[0], title: "B" }] };
  const out = M.merge3(base, mine, theirs);
  assert.equal(out.routines[0].model, "anthropic/claude-opus-5-5");
  assert.equal(out.routines[0].title, "B");
  const cleared = M.merge3(mine, { routines: [{ ...base.routines[0] }] }, mine);
  assert.equal(cleared.routines[0].model, undefined, "cleared on one side stays cleared");
});

await check("the schedule tool: a model only by id, checked like the app's (chat.ts scheduleFor)", async () => {
  const src = readFileSync(new URL("lib/server/chat.ts", rootUrl), "utf8");
  assert.match(src, /model: reminder \? undefined : a\.model\?\.trim\(\) \|\| undefined,/);
  assert.match(src, /Only when \$\{owner\} names a model for it: the id of one Bops has, exactly/);
  // "schedule" is only on the owner's own turns: never someone else's, a member's or a runner's.
  for (const set of ["NOT_FROM_OUTSIDE", "NOT_FROM_MEMBER", "NOT_ON_RUNNER"]) assert.match(src, new RegExp(`const ${set} = new Set\\(\\["schedule"`));
});

console.log(`\nroutine model: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

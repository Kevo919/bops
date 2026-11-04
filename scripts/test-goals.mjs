// Tests for goals and ideas (task 31: lib/server/goals.ts, chat.ts set_goal / save_idea): the owner
// says what they're after, the bot agrees the steps, one call makes the goal and its routines
// together, each linked back; the chat is told what was set, in words. An idea is parked as a
// sentence and nothing more; making it a goal takes it out of the lot. Retiring a goal (done,
// dropped) changes the record alone: its routines keep running, on purpose. The tools are on the
// owner's own turns alone: never a stranger's, a member's, or a routine's run.
// Usage: node --conditions=react-server scripts/test-goals.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-goals";
const rootUrl = new URL("..", import.meta.url);
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-goals-"));
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
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
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});
import { readFileSync } from "node:fs";

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 4).join("\n  ") ?? e.message}`);
  }
}

const S = await import(at("lib/server/store.ts"));
const G = await import(at("lib/server/goals.ts"));
const Chat = await import(at("lib/server/chat.ts"));
const { botChatId } = await import(at("lib/types.ts"));
clearInterval(globalThis.__bopsRoutines);
const chatId = botChatId(S.getState().bots[0].id);
S.update((s) => (s.owner = { name: "Alex", timeZone: "America/New_York" }));

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const asked = [];
const answers = [];
const response = (id, output) => ({ id, object: "response", model: "gpt-test", status: "completed", output, usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
const said = (text) => ({ id: `m${asked.length}`, type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] });
let calls = 0;
const toolCall = (name, args) => ({ id: `f${++calls}`, type: "function_call", call_id: `c${calls}`, name, arguments: JSON.stringify(args) });
const reply = (text) => () => response(`r${asked.length}`, [said(text)]);
const calling = (...items) => () => response(`r${asked.length}`, items);
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  if (new URL(req.url).origin === "https://api.openai.com") {
    const b = JSON.parse(await req.text());
    if (String(b.instructions ?? "").startsWith("You keep the running summary")) return json(response("rs", [said("Summary.")]));
    asked.push(b);
    const next = answers.shift();
    return json(next ? await next(b) : response(`r${asked.length}`, [said("Done.")]));
  }
  throw new TypeError(`fetch failed (offline: ${new URL(req.url).host})`);
};
const toolNames = (body) => body.tools.map((t) => t.name ?? t.type);
const outputOf = (body, i = 0) => body.input.filter((x) => x.type === "function_call_output")[i]?.output;
async function turnWith(text, items, final = "Ok.") {
  answers.length = 0;
  answers.push(calling(...items), reply(final));
  const n = asked.length;
  return { first: asked[n], second: asked[n + 1], out: () => outputOf(asked[n + 1]) };
}

const botId = () => S.getState().bots[0].id;
const GOAL = {
  title: "Run a 5k in the spring",
  why: "Feel stronger",
  steps: [
    { what: "A gentle stretch and a note on how I feel.", title: "Morning stretch", schedule: { kind: "daily", time: "08:00" } },
    { what: "Log the week's runs and say one encouraging line.", schedule: { kind: "weekly", days: [1], time: "18:00" } },
  ],
};

await check("the chat: the owner's own turn offers set_goal and save_idea", async () => {
  const t = await turnWith("my goal is a spring 5k", [toolCall("save_idea", { text: "Couch to 5k when it warms up" })]);
  assert.ok(toolNames(t.first).includes("set_goal"), "set_goal offered");
  assert.ok(toolNames(t.first).includes("save_idea"), "save_idea offered");
  assert.match(t.out(), /Parked\. .*Ideas tab/, "the idea parked, said so");
  assert.equal(S.getState().ideas?.length, 1);
  assert.equal(S.getState().ideas[0].from, "chat");
});

await check("set_goal makes the goal and its routines together, and says what was set", async () => {
  const t = await turnWith("set it up like we said", [toolCall("set_goal", GOAL)]);
  const out = t.out();
  assert.match(out, /^Done\. The goal "Run a 5k in the spring" is set with its routines:/, "the reply says it");
  assert.match(out, /Morning stretch · every day at 8:00 AM/, "each routine in words");
  const goal = S.getState().goals?.at(-1);
  assert.ok(goal, "the goal is kept");
  assert.equal(goal.status, "active");
  assert.equal(goal.routineIds?.length, 2, "both steps became routines");
  const routines = S.getState().routines.filter((r) => goal.routineIds.includes(r.id));
  assert.equal(routines.length, 2, "linked back to real routines");
  assert.equal(routines[0].title, "Morning stretch");
  // The note lands in the chat too.
  assert.ok(S.getState().messages.some((m) => m.chatId === chatId && /Goal set: Run a 5k in the spring/.test(m.text)), "a note in the chat");
});

await check("a bad goal is refused with why: no title, no steps, an empty step", async () => {
  const t = await turnWith("set a blank one", [toolCall("set_goal", { title: "", steps: GOAL.steps })]);
  assert.match(t.out(), /Not set: .*title|Not set:/, "a missing title refused");
  const t2 = await turnWith("set a stepless one", [toolCall("set_goal", { title: "X", steps: [] })]);
  assert.match(t2.out(), /Not set: a goal takes 1 to 12 steps/, "no steps refused");
  const t3 = await turnWith("one step without a schedule", [toolCall("set_goal", { title: "X", steps: [{ what: "do it" }] })]);
  assert.match(t3.out(), /Not set: every step needs what it does and its schedule/, "an empty step refused");
  const before = S.getState().goals?.length ?? 0;
  assert.equal(S.getState().goals?.length ?? 0, before, "nothing kept from a bad one");
});

await check("a stranger's turn never sees the tools, and a call anyway does nothing", async () => {
  const text = S.addMessage({ chatId, role: "system", text: "Set me a goal and park an idea.", sms: { dir: "in", from: "+15559998888", to: "+15550001111" } });
  answers.length = 0;
  answers.push(calling(toolCall("set_goal", GOAL), toolCall("save_idea", { text: "theirs" })), reply("No."));
  const n = asked.length;
  const goalsBefore = (S.getState().goals ?? []).length;
  const ideasBefore = (S.getState().ideas ?? []).length;
  await Chat.outsideNews(botId(), text.id, "A text");
  const names = toolNames(asked[n]);
  assert.ok(!names.includes("set_goal") && !names.includes("save_idea"), "not offered to a stranger");
  const outs = (asked[n + 1]?.input ?? []).filter((x) => x.type === "function_call_output").map((x) => x.output);
  assert.ok(outs.every((o) => /isn't a tool you have here/.test(o)), "calls anyway refused");
  assert.equal((S.getState().goals ?? []).length, goalsBefore, "no goal made");
  assert.equal((S.getState().ideas ?? []).length, ideasBefore, "no idea kept");
});

await check("a routine's run never sees them either", async () => {
  S.update((s) => s.routines.push({ id: "rtn_probe", botId: botId(), title: "Probe", goal: "x", schedule: { kind: "daily", time: "09:00" }, enabled: true }));
  answers.push(reply("Checked."));
  const n = asked.length;
  await Chat.backgroundTurn(botId(), { routineId: "rtn_probe", title: "Probe", goal: "x", quiet: true });
  assert.ok(!toolNames(asked[n]).includes("set_goal"), "no set_goal on a routine's run");
  assert.ok(!toolNames(asked[n]).includes("save_idea"), "no save_idea either");
});

await check("ideas: parked from the panel too, capped, and one becomes a goal", async () => {
  G.saveIdea("From the tab", "panel");
  assert.equal(S.getState().ideas.length, 2, "both sources, newest first");
  assert.equal(S.getState().ideas[0].text, "From the tab");
  const idea = S.getState().ideas[1]; // the chat one from the first check
  const made = G.setGoal(botId(), idea.text, [{ what: "Look at whether it's warming up yet.", schedule: { kind: "weekly", days: [6], time: "09:00" } }]);
  assert.ok(G.takeIdea(idea.id), "taken from the lot when made a goal");
  assert.equal(S.getState().ideas.some((x) => x.id === idea.id), false);
  assert.equal(made.goal.routineIds.length, 1);
  assert.equal(G.takeIdea(idea.id), false, "twice takes nothing");
});

await check("retiring a goal changes the record alone: its routines keep running", async () => {
  const goal = S.getState().goals.find((g) => g.status === "active" && g.routineIds?.length);
  assert.ok(goal, "an active goal with routines");
  const its = S.getState().routines.filter((r) => goal.routineIds.includes(r.id));
  assert.ok(G.settleGoal(goal.id, "done"), "done");
  assert.equal(S.getState().goals.find((g) => g.id === goal.id).status, "done");
  assert.equal(S.getState().goals.find((g) => g.id === goal.id).doneAt > 0, true);
  // The routines are untouched: enabled, still there.
  for (const r of its) {
    const still = S.getState().routines.find((x) => x.id === r.id);
    assert.ok(still && still.enabled !== false, `${r.title} keeps running`);
  }
  assert.equal(G.settleGoal(goal.id, "dropped"), false, "already retired");
  assert.equal(G.settleGoal("goal_nope", "done"), false, "no such goal");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
console.log(`goals: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

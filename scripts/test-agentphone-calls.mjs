// Calls and texts from the user's own AgentPhone number (lib/server/agentphone-outbound.ts, agentphone-status.ts, the
// place_call and send_text tools in lib/server/chat.ts, the AgentPhone panel in lib/server/services.ts), in local mode:
// AGENTPHONE_API_KEY set, no Bops Cloud. The tools are offered on the owner's own turns; every call and every text
// asks first (onceOnly) and nothing reaches AgentPhone before the yes; the call goes as POST /v1/calls in camelCase
// (agentId, toNumber, fromNumberId, systemPrompt, initialGreeting) with the user's only agent and number, then its end
// and transcript show in the chat; the text goes as POST /v1/messages in snake_case; a 402 and a 403 (10DLC) become
// Bops' plain words, never AgentPhone's; a reply that says "I called you" or "I texted you" after a refusal gets the
// note that nothing happened; Settings, Services shows the number, agent, calls and texts from a read-only probe.
//
// AgentPhone is a stub HTTP server on 127.0.0.1 (BOPS_AGENTPHONE_BASE), OpenAI is a fake, the state lives in a
// throwaway folder: nothing reaches a real service, and a request to api.agentphone.ai fails the test.
// Usage: node --conditions=react-server scripts/test-agentphone-calls.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG|ZAPIER)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-agentphone";
// A made-up key, built so no line here reads as a real one.
const KEY = ["fake", "agentphone", "x".repeat(10), "Zq42"].join("-");
process.env.AGENTPHONE_API_KEY = KEY;
const rootPath = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const rootUrl = pathToFileURL(rootPath).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-agentphone-"));
const bin = join(scratch, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "security"), "#!/bin/sh\nexit 44\n", { mode: 0o755 });
process.env.PATH = `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
globalThis.bopsOrgoKey = "sk_orgo_test_agentphone";
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);
// The call is looked at quickly here (agentphone-outbound.ts followCall).
globalThis.bopsCallPoll = { everyMs: 20, forMs: 3000 };

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
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
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});

/* ---------------- The AgentPhone stub ---------------- */

const ap = {
  seen: [],
  agents: [{ id: "agt_1", name: "Front desk", description: null }],
  numbers: [{ id: "num_1", phoneNumber: "+15550102000", agentId: "agt_1", outboundSms: "registration_required", status: "active" }],
  calls: () => [201, { id: "call_1", agentId: "agt_1", toNumber: "+15550109999", status: "in-progress" }],
  messages: () => [200, { id: "msg_1", status: "sent", channel: "sms" }],
  call: { id: "call_1", status: "completed", transcript: [{ role: "agent", content: "Hi, this is Boppy, calling for Alex." }, { role: "user", content: "Hi Boppy." }, { role: "agent", content: "Your package arrives at five." }] },
};
const stub = createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : undefined;
    ap.seen.push({ method: req.method, path: req.url, auth: req.headers.authorization, body });
    const j = (s, x) => (res.writeHead(s, { "content-type": "application/json" }), res.end(JSON.stringify(x)));
    if (req.headers.authorization !== `Bearer ${KEY}`) return j(401, { detail: "Invalid API key" });
    const p = req.url.split("?")[0];
    if (req.method === "GET" && p === "/v1/numbers") return j(200, { data: ap.numbers, hasMore: false, total: ap.numbers.length });
    if (req.method === "GET" && p === "/v1/agents") return j(200, { data: ap.agents, hasMore: false, total: ap.agents.length });
    if (req.method === "POST" && p === "/v1/calls") return j(...ap.calls(body));
    if (req.method === "POST" && p === "/v1/messages") return j(...ap.messages(body));
    if (req.method === "GET" && p === "/v1/calls/call_1") return j(200, ap.call);
    j(404, { detail: "Not found" });
  });
});
await new Promise((r) => stub.listen(0, "127.0.0.1", r));
process.env.BOPS_AGENTPHONE_BASE = `http://127.0.0.1:${stub.address().port}`;
const posts = (path) => ap.seen.filter((x) => x.method === "POST" && x.path === path);

/* ---------------- OpenAI's fake ---------------- */

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const asked = [];
const answers = [];
const response = (id, output) => ({ id, object: "response", model: "gpt-test", status: "completed", output, usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
const said = (text) => ({ id: `msg_${asked.length}`, type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] });
let n = 0;
const toolCall = (name, args) => ({ id: `fc_${++n}`, type: "function_call", call_id: `call_${n}`, name, arguments: JSON.stringify(args) });
const reply = (text) => () => response(`resp_${asked.length}`, [said(text)]);
const calling = (...items) => () => response(`resp_${asked.length}`, items);
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.hostname === "api.agentphone.ai") throw new Error("the real AgentPhone was called");
  if (url.hostname === "127.0.0.1") return realFetch(input, init);
  if (url.origin === "https://api.openai.com" && url.pathname === "/v1/responses") {
    const b = JSON.parse(await req.text());
    if (String(b.instructions ?? "").startsWith("You keep the running summary")) return json(response("resp_summary", [said("They talked.")]));
    asked.push(b);
    const next = answers.shift();
    return json(next ? await next(b) : response(`resp_${asked.length}`, [said("Done.")]));
  }
  throw new TypeError(`fetch failed (the test is offline: ${url.host})`);
};
console.warn = () => {};

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 5).join("\n  ") ?? e.message}`);
  }
}

const S = await import(`${rootUrl}/lib/server/store.ts`);
const { botChatId } = await import(`${rootUrl}/lib/types.ts`);
const Chat = await import(`${rootUrl}/lib/server/chat.ts`);
const Out = await import(`${rootUrl}/lib/server/agentphone-outbound.ts`);
const St = await import(`${rootUrl}/lib/server/agentphone-status.ts`);
clearInterval(globalThis.__bopsRoutines);
const chatId = botChatId("boppy");
S.update((s) => {
  s.owner = { name: "Alex", timeZone: "America/New_York" };
  s.account = { user: { id: "u_alex", email: "alex@example.com", name: "Alex" }, signedInAt: 1 };
});
const messages = () => S.getState().messages.filter((m) => m.chatId === chatId);
const lastBot = () => messages().filter((m) => m.role === "bot").at(-1);
const toolNames = (body) => body.tools.map((t) => t.name ?? t.type);
const outputOf = (body) => body.input.filter((x) => x.type === "function_call_output").at(-1)?.output;
const asks = () => S.getState().appApprovals ?? [];

/** The owner asks; the model calls the tool; the turn pauses for the OK. Returns the ask. */
async function ask(text, tool, args) {
  answers.push(calling(toolCall(tool, args)));
  const before = asks().length;
  await Chat.handleMessage(chatId, text);
  assert.equal(asks().length, before + 1, "the turn paused for the owner's OK");
  return asks().at(-1);
}
/** The owner answers the ask; the model then says `final`. Returns what the tool answered. */
async function answer(a, replyWith, final) {
  answers.push(reply(final));
  const k = asked.length;
  await Chat.resumeChat({ ...a, reply: { reply: replyWith, at: Date.now() } });
  return outputOf(asked[k]);
}

await check("local mode: place_call and send_text are offered on the owner's own turn, with no Bops Cloud", async () => {
  assert.equal(Out.outboundOn(), true);
  answers.push(reply("Hi."));
  const k = asked.length;
  await Chat.handleMessage(chatId, "hello");
  const names = toolNames(asked[k]);
  assert.ok(names.includes("place_call") && names.includes("send_text"), names.join(","));
  assert.match(asked[k].instructions, /use place_call or send_text/);
  assert.equal(Out.outboundForTurn({ member: { name: "Sam" } }), false, "not a member's turn");
  assert.equal(Out.outboundForTurn({ background: {} }), false, "not a routine's run");
  assert.equal(Out.outboundForTurn({ call: true }), false, "not on a phone call");
  assert.equal(Out.outboundForTurn({ relayed: true }), false, "not a text's or an email's");
});

await check("a call asks first, every time (onceOnly), and nothing reaches AgentPhone before the yes", async () => {
  ap.seen.length = 0;
  const a = await ask("call me at +1 555 010 9999 and tell me the package arrives at five", "place_call", { to: "+1 555 010 9999", purpose: "Tell Alex the package arrives at five.", greeting: null });
  assert.equal(a.onceOnly, true, "no Always allow");
  assert.equal(a.kind, "app");
  assert.match(a.action, /^Call \+1 \(555\) 010-9999/);
  assert.match(a.preview, /the package arrives at five/);
  assert.equal(ap.seen.length, 0, "not even a read before the yes");
  // A no: nothing placed.
  const out = await answer(a, "reject", "Ok, I won't call.");
  assert.match(out, /^Declined/);
  assert.equal(posts("/v1/calls").length, 0);
});

await check("on the yes the call goes as POST /v1/calls in camelCase, with the only agent and number; its end and transcript show in the chat", async () => {
  ap.seen.length = 0;
  const a = await ask("call me at +15550109999 and tell me the package arrives at five", "place_call", { to: "+15550109999", purpose: "Tell Alex the package arrives at five.", greeting: null });
  const out = await answer(a, "once", "I've called you. It's ringing now.");
  const [p] = posts("/v1/calls");
  assert.ok(p, "the call was placed");
  assert.equal(p.auth, `Bearer ${KEY}`);
  assert.deepEqual(Object.keys(p.body).sort(), ["agentId", "fromNumberId", "initialGreeting", "systemPrompt", "toNumber"]);
  assert.equal(p.body.agentId, "agt_1");
  assert.equal(p.body.toNumber, "+15550109999");
  assert.equal(p.body.fromNumberId, "num_1");
  assert.match(p.body.systemPrompt, /package arrives at five/);
  assert.match(p.body.initialGreeting, /Boppy.*Alex/);
  assert.match(out, /has started/);
  assert.doesNotMatch(lastBot().text, /No call was placed/, "a started call backs the claim");
  assert.ok(messages().some((m) => m.appResult?.action === "place_call" && m.appResult.ok), "the chat shows it started");
  for (let i = 0; i < 100 && !messages().some((m) => /completed/.test(m.text)); i++) await new Promise((r) => setTimeout(r, 20));
  const done = messages().find((m) => /^Call to \+1 \(555\) 010-9999 completed/.test(m.text));
  assert.ok(done, "how it ended shows in the chat");
  assert.match(done.text, /Boppy: Your package arrives at five\./);
  assert.match(done.text, /Them: Hi Boppy\./);
});

await check("a text goes as POST /v1/messages in snake_case, only after the yes", async () => {
  ap.seen.length = 0;
  const a = await ask("text +1 555 010 9999 that I'm running late", "send_text", { to: "+1 555 010 9999", text: "Running 10 minutes late." });
  assert.equal(a.onceOnly, true);
  assert.match(a.action, /^Text \+1 \(555\) 010-9999/);
  assert.equal(a.preview, "Running 10 minutes late.");
  assert.equal(ap.seen.length, 0);
  const out = await answer(a, "once", "I texted them.");
  const [p] = posts("/v1/messages");
  assert.deepEqual(p.body, { to_number: "+15550109999", body: "Running 10 minutes late.", agent_id: "agt_1", number_id: "num_1" });
  assert.ok(!Object.keys(p.body).some((k) => /[A-Z]/.test(k)), "no camelCase");
  assert.match(out, /^Sent the text/);
  assert.doesNotMatch(lastBot().text, /Nothing was sent/);
});

await check("a 402 on a call: Bops' words about funds, never AgentPhone's, and no claim of a call", async () => {
  ap.calls = () => [402, { detail: "Add funds on the Billing page to place outbound calls" }];
  const a = await ask("call me at +15550109999", "place_call", { to: "+15550109999", purpose: "Say hi.", greeting: "Hi!" });
  const out = await answer(a, "once", "I called you and told you hi.");
  assert.equal(out, `Failed: nothing was called. ${St.FUNDS_WORDS}`);
  assert.equal(St.FUNDS_WORDS, "Add funds in AgentPhone → Billing to make calls.");
  assert.doesNotMatch(out, /Billing page/, "never AgentPhone's own words");
  assert.match(lastBot().text, /No call was placed\./, "the reply's claim gets the note");
  const card = messages().filter((m) => m.appResult?.action === "place_call").at(-1);
  assert.equal(card.appResult.ok, false);
  assert.match(card.text, /Add funds in AgentPhone → Billing/);
});

await check("a 403 (10DLC) on a text: the registration words, never AgentPhone's, and no claim of a text", async () => {
  ap.messages = () => [403, { detail: "Outbound SMS is not enabled for +15550102000 yet. Complete 10DLC registration at https://agentphone.ai/register first." }];
  const a = await ask("text me at +15550109999 hi", "send_text", { to: "+15550109999", text: "Hi" });
  const out = await answer(a, "once", "I've texted you.");
  assert.equal(out, `Failed: nothing was sent. ${St.TEN_DLC_WORDS}`);
  assert.equal(St.TEN_DLC_WORDS, "Texting needs AgentPhone's 10DLC registration: agentphone.ai/register");
  assert.doesNotMatch(out, /Outbound SMS is not enabled|Complete 10DLC/);
  assert.match(lastBot().text, /Nothing was sent\./);
});

await check("refusals in plain words for every status, never the body", () => {
  const raw = { detail: "SECRET upstream words" };
  for (const s of [400, 401, 403, 404, 409, 422, 429, 500, 503]) for (const k of ["call", "text"]) assert.doesNotMatch(St.refusalWords(k, s, raw), /SECRET/);
});

await check("the line is picked by itself when there's one; two agents with numbers say so, never guess", () => {
  const one = St.pickLine([{ id: "a" }], [{ id: "n", phoneNumber: "+15550100000", agentId: "a" }]);
  assert.equal(one.agent.id, "a");
  assert.equal(one.number.id, "n");
  const two = St.pickLine([{ id: "a", name: "A" }, { id: "b", name: "B" }], [{ id: "n1", phoneNumber: "+15550100000", agentId: "a" }, { id: "n2", phoneNumber: "+15550100001", agentId: "b" }]);
  assert.match(two.problem, /2 agents/);
  const bopsToo = St.pickLine([{ id: "a", name: "Mine" }, { id: "b", description: "bops-x-ws-main" }], [{ id: "n1", phoneNumber: "+15550100000", agentId: "a" }, { id: "n2", phoneNumber: "+15550100001", agentId: "b" }]);
  assert.equal(bopsToo.agent.id, "a", "a Bops made agent isn't the user's own");
});

await check("a call claim: phone calls only, never an API, a tool or a function", () => {
  const backed = { task: true, running: true, send: true, schedule: true, call: false };
  const claims = ["I called you.", "I've called Dana about it.", "I just called him.", "I phoned her this morning.", "I rang you twice.", "I placed a call to Dana.", "I've placed a call to your number.", "I'm calling you now.", "I called +15550109999.", "I called your phone.", "The call was placed."];
  for (const t of claims) assert.equal(Chat.unbacked(t, backed), "No call was placed.", t);
  const not = ["I called the weather API and it's sunny.", "I called get_data for the totals.", "I called the function twice.", "I called Weather API for you.", "I called Stripe's API to check.", "I called it a day.", "Should I call you?", "I can call Dana if you like.", "I called a tool to look it up.", "I called list_repos."];
  for (const t of not) assert.equal(Chat.unbacked(t, backed), "", t);
  assert.equal(Chat.unbacked("I called you.", { ...backed, call: true }), "", "a started call backs it");
});

await check("a bot without AgentPhone set up is never told it placed no call", async () => {
  const keep = process.env.AGENTPHONE_API_KEY;
  delete process.env.AGENTPHONE_API_KEY;
  try {
    answers.push(reply("I called Dana yesterday, as you asked."));
    const k = asked.length;
    await Chat.handleMessage(chatId, "did you reach Dana?");
    assert.ok(!toolNames(asked[k]).includes("place_call"), "no place_call without the key");
    assert.equal(lastBot().text, "I called Dana yesterday, as you asked.");
  } finally {
    process.env.AGENTPHONE_API_KEY = keep;
  }
});

await check("picking: two numbers on one agent ask which; `from` picks one; no agent with a number says so", () => {
  const agents = [{ id: "a", name: "Front desk" }];
  const two = [{ id: "n1", phoneNumber: "+15550100000", agentId: "a" }, { id: "n2", phoneNumber: "+15550100001", agentId: "a" }];
  const asks = St.pickLine(agents, two);
  assert.match(asks.problem, /has 2 numbers\. Say which one to use: \+1 \(555\) 010-0000, \+1 \(555\) 010-0001/);
  const chosen = St.pickLine(agents, two, "+1 555 010 0001");
  assert.equal(chosen.number.id, "n2");
  assert.match(St.pickLine(agents, two, "+15559990000").problem, /isn't one of the numbers/);
  const none = St.pickLine([{ id: "a" }, { id: "b" }], [{ id: "n1", phoneNumber: "+15550100000", agentId: null }]);
  assert.match(none.problem, /^None of your 2 AgentPhone agents has a number yet/);
  assert.doesNotMatch(none.problem, /agents with numbers/);
});

await check("a call that ends unanswered, busy or canceled stops being polled, and says so", async () => {
  for (const [status, words] of [["no_answer", "no answer"], ["no-answer", "no answer"], ["busy", "busy"], ["canceled", "canceled"]]) {
    ap.call = { id: "call_1", status };
    ap.seen.length = 0;
    await Out.followCall("boppy", chatId, "call_1", "+15550109999");
    const polls = ap.seen.filter((x) => x.path === "/v1/calls/call_1").length;
    assert.equal(polls, 1, `${status}: one look, then it stops`);
    assert.equal(messages().at(-1).text, `Call to +1 (555) 010-9999 didn't go through (${words}).`);
  }
});

await check("a number that isn't one fails in words before asking", async () => {
  const r = await Out.runOutboundTool("boppy", "send_text", { to: "call me", text: "x" }, { chatId });
  assert.match(r.text, /isn't a full phone number/);
});

await check("Settings, Services: the AgentPhone panel from a read-only probe, the key by its last four only", async () => {
  St.forgetAgentPhoneStatus();
  ap.seen.length = 0;
  ap.numbers = [{ id: "num_1", phoneNumber: "+15550102000", agentId: "agt_1", outboundSms: "registration_required" }];
  const { probe } = await St.probeAccount(KEY);
  assert.ok(ap.seen.every((x) => x.method === "GET"), "only reads");
  assert.equal(probe.number, "+1 (555) 010-2000");
  let v = St.agentPhoneView("ends in Zq42");
  assert.deepEqual([v.number, v.agent, v.calls, v.texts], ["+1 (555) 010-2000", "Front desk", "ready", "registration needed"]);
  assert.equal(v.textsWords, St.TEN_DLC_WORDS);
  assert.ok(!JSON.stringify(v).includes(KEY));
  St.noteCalls("needs funds");
  v = St.agentPhoneView("ends in Zq42");
  assert.equal(v.calls, "needs funds");
  assert.equal(v.callsWords, St.FUNDS_WORDS);
  ap.numbers[0].outboundSms = "enabled";
  await St.probeAccount(KEY);
  v = St.agentPhoneView("ends in Zq42");
  assert.equal(v.texts, "enabled");
  assert.equal(v.calls, "needs funds", "only a call that goes clears it");
  St.noteCalls("working");
  assert.equal(St.agentPhoneView("x").calls, "working");
  // A key AgentPhone turns down: words, no number.
  await St.probeAccount("wrong-key");
  v = St.agentPhoneView("x");
  assert.match(v.problem, /turned the key down/);
});

await check("never a request to the real AgentPhone, and the key only to the stub", () => {
  assert.ok(ap.seen.every((x) => x.auth === `Bearer ${KEY}` || x.auth === "Bearer wrong-key"));
});

stub.close();
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
console.log(`agentphone calls and texts: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

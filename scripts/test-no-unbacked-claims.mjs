// Tests that a bot never says a task, a send or a routine happened unless a tool did it (lib/server/chat.ts,
// lib/server/chat-providers.ts):
// - a chat on a model that can't take tools, asked to do something: a plain "can't run tasks" with a model that can,
//   never the model's claim, and no task started;
// - a reply in prose only that says it started a task (tools there, none called): shown with "No task was started.";
// - a real start_task call: the reply carries the task's session id (its card), with no such note; for a single-agent
//   bot whose Works on is This PC, the task is placed on the PC outright, and the bot is told it works there;
// - the record of what tools did comes back to the model as Bops' note after the message, never in the bot's words;
// - one account's "this model can't take tools" is never another's;
// - only a tool of the matching kind that succeeded backs a claim: an email the user approved (the turn paused, then
//   went on) backs "I've sent it", a send refused or failed doesn't, nor a tell_task to no task or a hand_off refused;
// - no note on words that claim nothing ("I started thinking", "I sent you a summary above"), and a question ("how's my
//   task?") is never read as a request to act;
// - This PC only when the bot's Works on is This PC and the PC is ready: otherwise the old routing, said plainly; the
//   bot is told exactly when a task goes there (the owner's own turn, auto, not part of a group), never "every task";
// - only this turn's own sends back its claim (turn-deeds.ts): two bots in the same moment, A sends and B says it sent,
//   B gets the note and A doesn't;
// - an app's read (Zapier gmail_find_email) or a write that only marks (mark as read) never backs "I sent the email";
//   only an action that sends does (sendsOut);
// - notes that only say what didn't happen never become "Done.".
//
// OpenAI and OpenRouter are fakes (fetch), sessions.ts is a stand-in that records the tasks started and runs nothing,
// and the state lives in a throwaway folder: nothing reaches a real service, and no real task runs.
// Usage: node --conditions=react-server scripts/test-no-unbacked-claims.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|ANTHROPIC|ZAI|DEEPSEEK|OPENROUTER|DEEPINFRA|OLLAMA|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
// Fake keys, made up here: never a real one, and never written as a name and its value.
const fakeKey = (...parts) => ["fake", ...parts].join("-");
for (const k of Object.keys(process.env)) if (k.startsWith("ZAPIER_")) delete process.env[k];
process.env.OPENAI_API_KEY = fakeKey("openai");
process.env.OPENROUTER_API_KEY = fakeKey("or", "default");
process.env.OPENROUTER_API_KEY__WORK = fakeKey("or", "work");
process.env.AGENTMAIL_API_KEY = fakeKey("am");
const rootPath = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const rootUrl = pathToFileURL(rootPath).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-no-unbacked-"));
const bin = join(scratch, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "security"), "#!/bin/sh\nexit 44\n", { mode: 0o755 });
process.env.PATH = `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
globalThis.bopsOrgoKey = "sk_orgo_test_no_unbacked";
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), JSON.stringify({}));
process.chdir(work);

// Modules that start processes when loaded do nothing; sessions.ts records the tasks started instead of running them.
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
    return {
      format: "module",
      shortCircuit: true,
      source: names.map((n) => (n === "startSession" ? "export const startSession = (...a) => globalThis.__startSession(...a);" : `export const ${n} = function () { return Promise.resolve(); };`)).join("\n"),
    };
  },
});

/* ---------------- Fakes: OpenAI, OpenRouter, the tasks ---------------- */

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const asked = [];
const answers = [];
/** Otto's own answers (a second bot's turn running in the same moment as Boppy's): by whose instructions they are. */
const ottoAnswers = [];
/** Otto's inbox read (check_email) waits here until it's let go: Boppy's send lands while Otto's tool is running. */
let ottoReading = null;
let ottoGate = null;
/** A fake Zapier MCP server (Streamable HTTP, JSON answers): its actions, and the calls it got. */
const ZAP_TOOLS = [
  { name: "gmail_find_email", title: "Gmail: Find Email", description: "Finds an email.", inputSchema: { type: "object", properties: { instructions: { type: "string" } } }, annotations: { readOnlyHint: true } },
  { name: "gmail_mark_email_as_read", title: "Gmail: Mark Email as Read", description: "Marks an email read.", inputSchema: { type: "object", properties: { instructions: { type: "string" } } } },
  { name: "gmail_send_email", title: "Gmail: Send Email", description: "Sends an email.", inputSchema: { type: "object", properties: { instructions: { type: "string" }, to: { type: "string" } } } },
];
const zapCalls = [];
const response = (id, output) => ({ id, object: "response", model: "gpt-test", status: "completed", output, usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
const said = (text) => ({ id: `msg_${asked.length}`, type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] });
let calls = 0;
const toolCall = (name, args) => ({ id: `fc_${++calls}`, type: "function_call", call_id: `call_${calls}`, name, arguments: JSON.stringify(args) });
const reply = (text) => () => response(`resp_${asked.length}`, [said(text)]);
const calling = (...items) => () => response(`resp_${asked.length}`, items);
/** OpenRouter's calls: the key each came with and whether it had tools. The models in `refuses` can't take tools on the key named. */
const routed = [];
const mailed = [];
const refuses = new Set();
let routerSays = "Done.";
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.origin === "https://api.openai.com" && url.pathname === "/v1/responses") {
    const b = JSON.parse(await req.text());
    if (String(b.instructions ?? "").startsWith("You keep the running summary")) return json(response("resp_summary", [said("They talked.")]));
    asked.push(b);
    const next = (String(b.instructions ?? "").includes("You are Otto,") ? ottoAnswers : answers).shift();
    return json(next ? await next(b) : response(`resp_${asked.length}`, [said("Done.")]));
  }
  if (url.origin === "https://openrouter.ai" && url.pathname === "/api/v1/chat/completions") {
    const b = JSON.parse(await req.text());
    const key = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    routed.push({ key, model: b.model, tools: !!b.tools?.length, messages: b.messages });
    if (b.tools?.length && refuses.has(`${key} ${b.model}`)) return json({ error: { message: "No endpoints found that support tool use.", code: 404 } }, 404);
    return json({ choices: [{ message: { content: routerSays } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  }
  // Otto's inbox (check_email): held open until the test lets it go.
  if (url.origin === "https://api.agentmail.to" && req.method === "GET" && /\/inboxes\/in_otto\/messages/.test(url.pathname)) {
    ottoReading?.();
    await ottoGate;
    return json({ count: 0, limit: 10, messages: [] });
  }
  if (url.host === "mcp.zapier.com") {
    const msg = JSON.parse((await req.text()) || "{}");
    zapCalls.push(msg);
    if (msg.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "zapier", version: "1" } } }), { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "zs1" } });
    if (msg.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (msg.method === "tools/list") return json({ jsonrpc: "2.0", id: msg.id, result: { tools: ZAP_TOOLS } });
    if (msg.method === "tools/call") return json({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: msg.params?.name === "gmail_find_email" ? "Found 1 email from Dana: the quote." : "Done in Gmail." }] } });
    return json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "no such method" } });
  }
  // AgentMail (mail.ts): an email sent goes in `mailed`, and gets an id back.
  if (url.origin === "https://api.agentmail.to" && /\/messages\/send$/.test(url.pathname)) {
    mailed.push(JSON.parse(await req.text()));
    return json({ message_id: `m_${mailed.length}`, thread_id: `t_${mailed.length}` });
  }
  throw new TypeError(`fetch failed (the test is offline: ${url.host})`);
};
console.warn = () => {};

const started = [];
let S;
globalThis.__startSession = (o) => {
  const s = { id: `ses_${started.length + 1}`, botId: o.botId, chatId: o.chatId, sentVia: o.sentVia ?? "you", title: o.title ?? o.goal.slice(0, 48), goal: o.goal, host: "orgo", status: "queued", steps: [], replies: [], createdAt: Date.now(), ...(o.where === "mac" ? { runsOn: "mac" } : {}) };
  started.push(o);
  S.update((st) => st.sessions.push(s));
  return s;
};

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

// Your LLMs (config/llms.yaml): a free OpenRouter model on the default account and the same one on the work account.
const FREE = "acme/tiny-chat:free";
globalThis.__bopsLlms = [
  { name: "Tiny Chat", provider: "openrouter", model: FREE },
  { name: "Claude Sonnet 5.5", provider: "anthropic", model: "claude-sonnet-5-5" },
];
S = await import(`${rootUrl}/lib/server/store.ts`);
const { botChatId } = await import(`${rootUrl}/lib/types.ts`);
const Chat = await import(`${rootUrl}/lib/server/chat.ts`);
const P = await import(`${rootUrl}/lib/server/chat-providers.ts`);
clearInterval(globalThis.__bopsRoutines);

const chatId = botChatId("boppy");
S.update((s) => {
  s.owner = { name: "Alex", timeZone: "America/New_York" };
  Object.assign(s.bots.find((x) => x.id === "boppy"), { email: "boppy@bops.bot", mail: { inboxId: "in_1", podId: "pod_1" } });
});
const botMessages = () => S.getState().messages.filter((m) => m.chatId === chatId && m.role === "bot");
const lastBot = () => botMessages().at(-1);
const setModel = (model) => S.update((s) => (s.chats.find((c) => c.id === chatId).model = model));
const CLAIM = "I've started a task to tidy your downloads on your PC. The task is running now.";

await check("a model that can't take tools, asked to start a task: a plain can't-run-tasks reply naming one that can; no claim, no task", async () => {
  setModel(`openrouter/${FREE}`);
  refuses.add(`${process.env.OPENROUTER_API_KEY} ${FREE}`);
  routerSays = CLAIM;
  const n = started.length;
  await Chat.handleMessage(chatId, "Start a task on this PC to tidy my downloads folder");
  const m = lastBot();
  console.log(`     reply: ${JSON.stringify(m.text)}`);
  assert.match(m.text, /^Tiny Chat can't run tasks or use tools, so nothing was started, sent or scheduled\. To have this done, switch this chat to a model that can, such as GPT 6\.1 Sol\.$/, "names a model with a key set here (Claude Sonnet 5.5 has none in this test)");
  assert.ok(!/I've started|is running/i.test(m.text), "never the model's claim");
  assert.equal(started.length, n, "no task started");
  assert.equal(m.sessionIds, undefined, "no task card");
  const r = routed.filter((x) => x.model === FREE);
  assert.deepEqual(r.map((x) => x.tools), [true, false], "tried with tools once, then without");
});

await check("the same model asked a plain question: it answers (the tools it can't take aren't needed)", async () => {
  routerSays = "Downloads is the folder where files you save from the web land.";
  await Chat.handleMessage(chatId, "What is the downloads folder?");
  assert.equal(lastBot().text, "Downloads is the folder where files you save from the web land.");
  assert.equal(routed.at(-1).tools, false, "known for a while not to take tools: sent none");
});

await check("the same model asked about a task (a question, not a request): its answer, never the can't-run-tasks words", async () => {
  routerSays = "Nothing is running right now.";
  await Chat.handleMessage(chatId, "how's my task?");
  assert.equal(lastBot().text, "Nothing is running right now.");
  for (const q of ["how's my task?", "what did the research say?", "did you text Jordan?", "any reply yet?", "what's on my watch list?"]) assert.equal(Chat.asksToAct(q), false, q);
  for (const r of ["Start a task on this PC to tidy my downloads", "can you email Jordan the quote", "Please book a table for two", "Thanks. Text me when it's done"]) assert.equal(Chat.asksToAct(r), true, r);
});

await check("one account's 'can't take tools' is never another's: the same model moved to the work account still gets tools", async () => {
  P.forgetNoTools();
  const base = { instructions: "Be brief.", input: [{ role: "user", content: "hi" }], tools: [{ type: "function", name: "start_task", description: "Start a task.", parameters: { type: "object", properties: {} } }] };
  // On the default account this model can't take tools (that account's provider settings).
  const shared = { name: "Shared", provider: "openrouter", model: "acme/shared" };
  globalThis.__bopsLlms.push(shared);
  refuses.add(`${process.env.OPENROUTER_API_KEY} acme/shared`);
  const a = await P.createOnProvider({ ...base, model: "openrouter/acme/shared" });
  assert.ok(P.toolsDropped(a), "the default account's reply is marked as made without tools");
  assert.deepEqual(routed.slice(-2).map((x) => x.tools), [true, false]);
  // Asked again soon on the default account: no tools sent (it said no a moment ago), and still marked.
  const b = await P.createOnProvider({ ...base, model: "openrouter/acme/shared" });
  assert.equal(routed.at(-1).tools, false);
  assert.ok(P.toolsDropped(b));
  // The same model put on the work account (Settings, Models): its own key, sent tools, not marked.
  shared.account = "WORK";
  const c = await P.createOnProvider({ ...base, model: "openrouter/acme/shared" });
  assert.equal(routed.at(-1).key, process.env.OPENROUTER_API_KEY__WORK, "on the work key");
  assert.equal(routed.at(-1).tools, true, "the work account was sent tools: the default account's no isn't shared");
  assert.ok(!P.toolsDropped(c));
});

setModel(undefined);

await check("tools there, prose only: a reply saying it started a task with no tool call is shown with 'No task was started.'", async () => {
  const n = started.length;
  answers.push(reply(CLAIM));
  await Chat.handleMessage(chatId, "Tidy my downloads folder");
  const m = lastBot();
  console.log(`     reply: ${JSON.stringify(m.text)}`);
  assert.equal(m.text, `${CLAIM}\n\nNo task was started. No task is running.`);
  assert.equal(m.sessionIds, undefined, "no task card");
  assert.equal(started.length, n);
  // A plain honest reply gets nothing added.
  answers.push(reply("Sure, which folder do you mean?"));
  await Chat.handleMessage(chatId, "Tidy a folder");
  assert.equal(lastBot().text, "Sure, which folder do you mean?");
});

await check("Works on This PC, but the PC isn't ready: the old routing (auto), said plainly; the bot isn't told tasks run there", async () => {
  S.update((s) => {
    s.bots.find((b) => b.id === "boppy").runsOn = "mac";
    s.mac = { ready: false, reason: "Not set up" };
  });
  const n = started.length;
  answers.push(calling(toolCall("start_task", { title: "Sort photos", goal: "Sort the photos folder", say: "Sorting them.", where: "auto", then_on_mac: null, part_of: null, skill: null })));
  const k = asked.length;
  await Chat.handleMessage(chatId, "Start a task to sort my photos folder");
  assert.doesNotMatch(asked[k].instructions, /every task you start|a task you start \(start_task\) on Alex's own turn runs there/);
  assert.match(asked[k].instructions, /isn't ready right now: a task you start goes where Bops can run it/);
  assert.equal(started.length, n + 1);
  assert.equal(started.at(-1).where, "auto", "not forced onto a PC that can't take it");
  const note = S.getState().messages.filter((m) => m.chatId === chatId && m.role === "system").at(-1);
  assert.match(note.text, /^Boppy works on this (PC|computer|Mac), but it isn't ready, so "Sort photos" runs where Bops can run it$/);
  S.update((s) => (s.sessions = []));
});

await check("a real start_task, single-agent bot whose Works on is This PC and the PC ready: the task goes on the PC, the reply carries its session id", async () => {
  S.update((s) => (s.mac = { ready: true }));
  const n = started.length;
  answers.push(calling(toolCall("start_task", { title: "Tidy downloads", goal: "Tidy the downloads folder on this PC", say: "On it: tidying your downloads.", where: "auto", then_on_mac: null, part_of: null, skill: null })));
  const k = asked.length;
  await Chat.handleMessage(chatId, "Start a task on this PC to tidy my downloads folder");
  // Said as start_task places it: the owner's own turn, left to auto, not part of a group; never "every task".
  assert.match(asked[k].instructions, /You work on Alex's own (PC|computer|Mac): a task you start \(start_task\) on Alex's own turn runs there, unless its where is cloud, it's one part of a group \(part_of\) or its goal asks for the cloud\. A task from anyone else's turn goes where Bops can run it\./);
  assert.doesNotMatch(asked[k].instructions, /every task you start/);
  const tool = asked[k].tools.find((t) => t.name === "start_task");
  assert.ok(tool, "start_task offered");
  assert.ok(!("agent" in tool.parameters.properties), "a single-agent bot: no agent to pick");
  assert.equal(started.length, n + 1, "one task started");
  assert.equal(started.at(-1).where, "mac", "placed on this PC outright");
  assert.equal(started.at(-1).botId, "boppy");
  const m = lastBot();
  const id = S.getState().sessions.at(-1).id;
  console.log(`     reply: ${JSON.stringify(m.text)} sessionIds: ${JSON.stringify(m.sessionIds)}`);
  assert.deepEqual(m.sessionIds, [id], "its card: the real session id");
  assert.ok(!/No task was started/.test(m.text), "backed by the tool: no note");
  // Worded for the cloud, or one part of a group: left to Bops, as before.
  answers.push(calling(toolCall("start_task", { title: "Scrape prices", goal: "On the cloud computer, check the prices", say: "Checking.", where: "auto", then_on_mac: null, part_of: null, skill: null })));
  await Chat.handleMessage(chatId, "Start a task to check the prices in the cloud");
  assert.equal(started.at(-1).where, "auto");
});

await check("what tools did comes back as Bops' note after the message, never in the bot's own words", async () => {
  const before = lastBot().text;
  answers.push(reply("It's still going."));
  const k = asked.length;
  await Chat.handleMessage(chatId, "How's it going?");
  const input = asked[k].input;
  const at = input.findIndex((x) => x.role === "assistant" && x.content === before);
  assert.ok(at >= 0, "the bot's words alone");
  assert.equal(input[at + 1].role, "developer");
  assert.match(input[at + 1].content, /^Bops' record of what tools did for your message above \(from tool results, not words to copy\): started the task "Scrape prices"\. Never write a record like this yourself/);
  assert.ok(!JSON.stringify(input).includes("[What was done"), "no bracketed record anywhere to imitate");
  // A task is running now (backed by the state), so saying so gets no note.
  assert.equal(lastBot().text, "It's still going.");
});

/** A turn that paused for the user's OK on `call` (resumeChat): it goes on with their `answer`; `turn` is what it kept. */
const resumeWith = (call, answer, turn = {}) =>
  Chat.resumeChat({ id: `apr_${++calls}`, botId: "boppy", chatId, action: "Send it", resources: [], preview: "", at: 1, reply: { reply: answer, at: 2 }, resume: { engine: "chat", responseId: "resp_paused", callId: "call_paused", call, outputs: [], turn: { config: { model: "gpt-test", effort: "low" }, seen: [], madeUp: [], outsideRead: false, ...turn } } });
const SEND = { name: "send_email", arguments: JSON.stringify({ to: ["dana@acme.example"], cc: null, subject: "Quote", text: "Here's the quote." }) };

await check("a send the user approved (the turn paused, then went on): 'I've sent the email' is backed, no note", async () => {
  const m = mailed.length;
  answers.push(reply("I've sent the email to Dana."));
  await resumeWith(SEND, "once");
  assert.equal(mailed.length, m + 1, "the email went (AgentMail's fake)");
  assert.equal(lastBot().text, "I've sent the email to Dana.");
});

await check("what other calls of a paused round did is kept (ChatPause.did): declined now, an earlier send still backs the claim; without it, it doesn't", async () => {
  answers.push(reply("I've sent the invoice to Dana."));
  await resumeWith(SEND, "reject", { did: { send: true } });
  assert.equal(lastBot().text, "I've sent the invoice to Dana.");
  answers.push(reply("I've sent the email to Dana."));
  await resumeWith(SEND, "reject");
  assert.equal(lastBot().text, "I've sent the email to Dana.\n\nNothing was sent.");
});

await check("a send that didn't go backs nothing: bad address (Nothing was sent.), no inbox", async () => {
  const m = mailed.length;
  answers.push(calling(toolCall("send_email", { to: ["not an address"], cc: null, subject: "Hi", text: "Hi" })), reply("I've sent the email to Dana."));
  await Chat.handleMessage(chatId, "Email Dana hi");
  assert.equal(mailed.length, m);
  assert.equal(lastBot().text, "I've sent the email to Dana.\n\nNothing was sent.");
  const had = S.getState().bots.find((b) => b.id === "boppy").mail;
  S.update((s) => delete s.bots.find((b) => b.id === "boppy").mail);
  answers.push(calling(toolCall("send_email", { to: ["dana@acme.example"], cc: null, subject: "Hi", text: "Hi" })), reply("I've emailed Dana."));
  await Chat.handleMessage(chatId, "Email Dana hi");
  assert.equal(lastBot().text, "I've emailed Dana.\n\nNothing was sent.");
  S.update((s) => (s.bots.find((b) => b.id === "boppy").mail = had));
});

await check("a task tool that didn't start one backs nothing: tell_task to no task, a hand_off that isn't allowed", async () => {
  S.update((s) => (s.sessions = []));
  const n = started.length;
  answers.push(calling(said("I've started a task for it."), toolCall("tell_task", { thread_id: "ses_nope", message: "and the other folder", say: null })));
  await Chat.handleMessage(chatId, "Tell the task to do the other folder too");
  assert.equal(lastBot().text, "I've started a task for it.\n\nNo task was started.");
  answers.push(calling(said("I've started a task for Max on it."), toolCall("hand_off", { bot_id: "nobody", title: "Research", goal: "Research it", say: null, where: "auto", then_on_mac: null })));
  await Chat.handleMessage(chatId, "Hand the research to someone");
  assert.equal(lastBot().text, "I've started a task for Max on it.\n\nNo task was started.");
  assert.equal(started.length, n, "nothing started");
});

await check("two bots in the same moment: Boppy sends, Otto says 'I sent it' without sending; Otto gets the note, Boppy doesn't", async () => {
  const ottoChat = botChatId("otto");
  S.update((s) => {
    if (!s.bots.some((x) => x.id === "otto")) s.bots.push({ id: "otto", name: "Otto", role: "Outbound", color: "#E9FF3B", isMain: false, computerStatus: "none" });
    if (!s.chats.some((c) => c.id === ottoChat)) s.chats.push({ id: ottoChat, kind: "bot", botIds: ["otto"], createdAt: Date.now(), typing: [] });
    Object.assign(s.bots.find((x) => x.id === "otto"), { email: "otto@bops.bot", mail: { inboxId: "in_otto", podId: "pod_1" } });
  });
  let letGo;
  ottoGate = new Promise((r) => (letGo = r));
  const reading = new Promise((r) => (ottoReading = r));
  const m = mailed.length;
  // Otto's turn: reads its inbox (held open), then says it sent the email. It sent nothing.
  ottoAnswers.push(calling(toolCall("check_email", { query: null })), reply("I've sent the email to Dana."));
  const ottoTurn = Chat.handleMessage(ottoChat, "Did Dana write back?");
  await Promise.race([reading, new Promise((_, no) => setTimeout(() => no(new Error("Otto never read its inbox")), 5000))]);
  // Meanwhile Boppy's turn really sends one (the user approved it), while Otto's read is still running.
  answers.push(reply("I've sent the email to Dana."));
  await resumeWith(SEND, "once");
  assert.equal(mailed.length, m + 1, "Boppy's email went");
  letGo();
  await ottoTurn;
  ottoReading = ottoGate = null;
  const otto = S.getState().messages.filter((x) => x.chatId === ottoChat && x.role === "bot").at(-1);
  console.log(`     Otto: ${JSON.stringify(otto.text)}  Boppy: ${JSON.stringify(lastBot().text)}`);
  assert.equal(otto.text, "I've sent the email to Dana.\n\nNothing was sent.", "Boppy's send never backs Otto's claim");
  assert.equal(lastBot().text, "I've sent the email to Dana.", "Boppy's own send backs its claim");
  assert.equal(mailed.length, m + 1, "Otto sent nothing");
});

await check("an app read (Zapier gmail_find_email) or a mark-as-read, then 'I sent the email': the note; a real Zapier send: none", async () => {
  process.env.ZAPIER_MCP_URL = `https://mcp.zapier.com/api/v1/connect?token=${fakeKey("zap")}`; // gitleaks:allow (made up for this test)
  // In a turn: the model reads Dana's email, then says it sent one.
  answers.push(calling(toolCall("zapier_gmail_find_email", { instructions: "Dana's newest email" })), reply("I've sent the email to Dana."));
  const k = asked.length;
  await Chat.handleMessage(chatId, "Find Dana's email and send her the quote");
  assert.ok(asked[k].tools.some((t) => t.name === "zapier_gmail_find_email"), "Zapier's actions offered");
  assert.ok(zapCalls.some((c) => c.method === "tools/call" && c.params?.name === "gmail_find_email"), "the read ran");
  assert.equal(lastBot().text, "I've sent the email to Dana.\n\nNothing was sent.");
  // The same read in a paused round the user said yes to (approved): still a read, never a send.
  answers.push(reply("I've sent the email to Dana."));
  await resumeWith({ name: "zapier_gmail_find_email", arguments: JSON.stringify({ instructions: "Dana's newest email" }) }, "once");
  assert.equal(lastBot().text, "I've sent the email to Dana.\n\nNothing was sent.");
  // A write that only marks an email read, approved and done: not a send.
  answers.push(reply("I've sent the email to Dana."));
  await resumeWith({ name: "zapier_gmail_mark_email_as_read", arguments: JSON.stringify({ instructions: "mark Dana's email read" }) }, "once");
  assert.ok(zapCalls.some((c) => c.method === "tools/call" && c.params?.name === "gmail_mark_email_as_read"), "the mark-as-read ran");
  assert.equal(lastBot().text, "I've sent the email to Dana.\n\nNothing was sent.");
  // A real send, approved and done: backed, no note.
  answers.push(reply("I've sent the email to Dana."));
  await resumeWith({ name: "zapier_gmail_send_email", arguments: JSON.stringify({ instructions: "send Dana the quote", to: "dana@acme.example" }) }, "once");
  assert.ok(zapCalls.some((c) => c.method === "tools/call" && c.params?.name === "gmail_send_email"), "the send ran");
  assert.equal(lastBot().text, "I've sent the email to Dana.");
  delete process.env.ZAPIER_MCP_URL;
});

await check("sendsOut(): only an action that sends backs 'sent', never a read, a mark or a draft", () => {
  for (const a of ["GMAIL_SEND_EMAIL", "GMAIL_SEND_DRAFT", "GMAIL_REPLY_TO_THREAD", "zapier_slack_send_channel_message", "SLACK_CHAT_POST_MESSAGE", "OUTLOOK_FORWARD_MESSAGE", "TWILIO_CREATE_MESSAGE", "mycomposio_GMAIL_SEND_EMAIL", "sendMessage"]) assert.equal(Chat.sendsOut(a), true, a);
  for (const a of ["GMAIL_FETCH_EMAILS", "GMAIL_LIST_THREADS", "zapier_gmail_find_email", "GMAIL_MARK_AS_READ", "zapier_gmail_mark_email_as_read", "GMAIL_ADD_LABEL_TO_EMAIL", "GMAIL_CREATE_EMAIL_DRAFT", "GMAIL_GET_SEND_AS", "SLACK_LIST_MESSAGES", "read_messages", ""]) assert.equal(Chat.sendsOut(a), false, a);
});

await check("a turn whose only notes say what didn't happen: never 'Done.'", async () => {
  // The user said no to the send, and the model wrote nothing: the note says Boppy didn't do it, so the reply isn't "Done.".
  answers.push(reply(""));
  await resumeWith(SEND, "reject");
  const reply_ = lastBot().text;
  console.log(`     reply: ${JSON.stringify(reply_)}`);
  assert.notEqual(reply_, "Done.");
  assert.equal(reply_, "That didn't go through.");
});

await check("unbacked(): each kind of claim, and what backs it", () => {
  const none = { task: false, running: false, send: false, schedule: false };
  assert.equal(Chat.unbacked("I've sent the email to Jordan.", none), "Nothing was sent.");
  assert.equal(Chat.unbacked("I've scheduled a reminder for 9am.", none), "Nothing was scheduled.");
  assert.equal(Chat.unbacked("I've started a new task for that.", none), "No task was started.");
  assert.equal(Chat.unbacked("I kicked off two threads.", none), "No task was started.");
  assert.equal(Chat.unbacked("Your reminder has been set for 9.", none), "Nothing was scheduled.");
  // Words that claim nothing done get nothing.
  for (const t of ["I started thinking about how to split it up.", "I sent you a summary above.", "As I sent you earlier, the meeting is at 3.", "I've started looking at it and have a question first.", "Should I start a task for it?", "I can send it once you say yes."])
    assert.equal(Chat.unbacked(t, none), "", t);
  assert.equal(Chat.unbacked("I've sent the email to Jordan.", { ...none, send: true }), "");
  assert.equal(Chat.unbacked("Your task is running.", { ...none, running: true }), "");
  assert.equal(Chat.unbacked("Paris is the capital of France.", none), "");
});

console.log(`\nno unbacked claims: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

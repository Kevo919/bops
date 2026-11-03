// Tests for a chat's model (Chat.model) and the providers it runs on (lib/server/chat-providers.ts, lib/chat-models.ts,
// lib/server/routing.ts speedFor and routeChat, POST /api/chats/model, /api/state's chatKeys, components/app/chat-model.tsx):
// a Responses API call answered by Anthropic's Messages API and by OpenAI compatible Chat Completions (z.ai, DeepSeek,
// OpenRouter), a tool call and its result carried on through previous_response_id, web_search left out and the model
// told so, images passed or left out, a provider's no turned into plain words with its HTTP status kept (and never the
// key), one try with no speed tiers, the router leaving a chosen model alone, a whole chat turn (chat.ts) on Claude with
// a lookup in between, and who may set the model and to what.
//
// Every provider is a fake fetch: nothing reaches a real service, so no real provider is ever called here. The
// window's picker renders in a child of this test (--ui), without react-server, as the window's code does.
// Usage: node --conditions=react-server scripts/test-chat-providers.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const UI = process.argv.includes("--ui");

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|ANTHROPIC|ZAI|DEEPSEEK|OPENROUTER|DEEPINFRA|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-openai";
const KEYS = { ANTHROPIC_API_KEY: "sk-ant-test-SECRET123", ZAI_API_KEY: "zai-test-SECRET456", ZAI_CODING_CN_API_KEY: "zaicn-test-SECRET321", DEEPSEEK_API_KEY: "ds-test-SECRET789", OPENROUTER_API_KEY: "or-test-SECRET000" };
Object.assign(process.env, KEYS);
const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const scratch = mkdtempSync(join(tmpdir(), "bops-test-chat-providers-"));
const bin = join(scratch, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "security"), "#!/bin/sh\nexit 44\n", { mode: 0o755 });
process.env.PATH = `${bin}:${process.env.PATH}`;
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
globalThis.bopsOrgoKey = "sk_orgo_test_chat_providers";
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), JSON.stringify({}));
process.chdir(work);

// Modules that start processes when loaded do nothing (as scripts/test-chat-tools.mjs).
const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
registerHooks({
  resolve(specifier, context, next) {
    if (UI && specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
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
    // The window's code (--ui): its tsx, transpiled.
    if (url.endsWith(".tsx")) {
      const out = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: url });
      return { format: "module", source: out.outputText, shortCircuit: true };
    }
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
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

if (UI) {
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, getElementById: () => null };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.matchMedia = () => ({ matches: false });
  const chatId = "bot:boppy";
await check("the window's picker: Auto first, the models by provider, (no key) where the server has none, and the hint", async () => {
  const { ChatModelPick, chatModelHint } = await import(pathToFileURL(`${root}/components/app/chat-model.tsx`).href);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement: h } = await import("react");
  const state = { chatKeys: { anthropic: true, openai: true, zai: false, "zai-coding": false, "zai-coding-cn": false, deepseek: false, openrouter: true } };
  const html = renderToStaticMarkup(h(ChatModelPick, { state, chat: { id: chatId, model: "zai-coding/glm-5.3" } }));
  assert.match(html, /aria-label="Model for this chat"/);
  assert.match(html, /^<select[^>]*><option value="" ?>Auto \(OpenAI\)<\/option>/);
  assert.match(html, /<optgroup label="Anthropic"><option value="anthropic\/claude-sonnet-5-5">Claude Sonnet 5\.5<\/option>/);
  assert.match(html, /<option value="zai-coding\/glm-5\.3" selected="">GLM 5\.3 \(Coding Plan\) \(no key\)<\/option>/);
  assert.match(html, /<optgroup label="DeepSeek"><option value="deepseek\/deepseek-chat">DeepSeek Chat \(no key\)/);
  assert.match(html, /<optgroup label="Z\.ai Coding Plan \(China\)"><option value="zai-coding-cn\/glm-5\.3">GLM 5\.3 \(Coding Plan, China\) \(no key\)<\/option><\/optgroup>/);
  assert.equal(chatModelHint(state, { model: "zai-coding-cn/glm-5.3" }), "Z.ai Coding Plan (China) has no key on this server yet: add ZAI_CODING_CN_API_KEY to .env.local, then restart Bops.");
  assert.equal(chatModelHint({ chatKeys: { ...state.chatKeys, "zai-coding-cn": true } }, { model: "zai-coding-cn/glm-5.3" }), null, "its own key, not Z.ai's");
  assert.ok(!/Claude Opus 5\.5 \(no key\)/.test(html));
  assert.equal(chatModelHint(state, { model: "zai-coding/glm-5.3" }), "Z.ai Coding Plan has no key on this server yet: add ZAI_API_KEY to .env.local, then restart Bops.");
  assert.equal(chatModelHint(state, { model: "anthropic/claude-opus-5-5" }), null);
  assert.equal(chatModelHint(state, {}), null, "Auto");
  assert.equal(renderToStaticMarkup(h(ChatModelPick, { state: { ...state, shared: { id: "x" } }, chat: { id: chatId } })), "", "not in a shared workspace");
});

  process.exit(failures ? 1 : 0);
}

/* ---------------- The fake providers ---------------- */

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
/** Every provider call: its address, headers and body. `next` answers the next one (a function of the body), else a plain reply. */
const sent = [];
const next = [];
const openaiAsked = [];
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.origin === "https://api.openai.com") {
    const b = JSON.parse(await req.text());
    openaiAsked.push(b);
    return json({ id: `resp_oa_${openaiAsked.length}`, object: "response", model: "gpt-test", status: "completed", output: [{ id: "m", type: "message", role: "assistant", content: [{ type: "output_text", text: "From OpenAI.", annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
  }
  if (["api.anthropic.com", "api.z.ai", "open.bigmodel.cn", "api.deepseek.com", "openrouter.ai", "api.deepinfra.com"].includes(url.host)) {
    const body = JSON.parse(await req.text());
    sent.push({ url: req.url, headers: Object.fromEntries(req.headers), body });
    const answer = next.shift();
    if (answer) return answer(body);
    return url.host === "api.anthropic.com" ? json(claudeSays("Hello.")) : json(chatSays("Hello."));
  }
  throw new TypeError(`fetch failed (the test is offline: ${url.host})`);
};
const claudeSays = (text, extra = []) => ({ id: "msg_x", type: "message", role: "assistant", content: [...(text ? [{ type: "text", text }] : []), ...extra], usage: { input_tokens: 50, output_tokens: 5 } });
const claudeCalls = (id, name, input) => claudeSays("", [{ type: "tool_use", id, name, input }]);
const chatSays = (content, tool_calls) => ({ choices: [{ message: { role: "assistant", content, ...(tool_calls ? { tool_calls } : {}) } }], usage: { prompt_tokens: 40, completion_tokens: 4 } });
console.warn = () => {};


const S = await import(`${root}/lib/server/store.ts`);
const P = await import(`${root}/lib/server/chat-providers.ts`);
const M = await import(`${root}/lib/chat-models.ts`);
const A = await import(`${root}/lib/agents.ts`);
const R = await import(`${root}/lib/server/routing.ts`);
const { botChatId } = await import(`${root}/lib/types.ts`);

const fnTool = { type: "function", name: "recall", description: "Ask memory.", parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false }, strict: true };
const webTool = { type: "web_search", search_context_size: "low" };
const base = { instructions: "You are Boppy.", tools: [webTool, fnTool], reasoning: { effort: "low" }, service_tier: "fast", include: ["web_search_call.action.sources"] };

/* ---------------- Anthropic ---------------- */

await check("Claude: a tool call and its result go on through previous_response_id, shaped like a Responses result", async () => {
  sent.length = 0;
  next.push(() => json(claudeCalls("toolu_1", "recall", { question: "my dog's name" })), () => json(claudeSays("Your dog is Rex.")));
  const r1 = await P.createOnProvider({ ...base, model: "anthropic/claude-sonnet-5-5", input: [{ role: "user", content: "What's my dog called?" }, { role: "developer", content: "As of now: Monday." }] });
  const q1 = sent[0];
  assert.equal(q1.url, "https://api.anthropic.com/v1/messages");
  assert.equal(q1.headers["x-api-key"], KEYS.ANTHROPIC_API_KEY);
  assert.equal(q1.headers["anthropic-version"], "2023-06-01");
  assert.equal(q1.body.model, "claude-sonnet-5-5");
  assert.equal(q1.body.max_tokens, 8192);
  assert.ok(q1.body.system.startsWith("You are Boppy."));
  assert.ok(q1.body.system.includes(P.NO_WEB_SEARCH), "told it has no web_search");
  assert.deepEqual(q1.body.tools.map((t) => t.name), ["recall"], "web_search left out");
  assert.deepEqual(q1.body.tools[0].input_schema, fnTool.parameters);
  for (const k of ["reasoning", "service_tier", "include", "instructions", "input"]) assert.ok(!(k in q1.body), `${k} isn't sent`);
  // The user's words and Bops' note: one user message (Claude wants them alternating).
  assert.deepEqual(q1.body.messages, [{ role: "user", content: [{ type: "text", text: "What's my dog called?" }, { type: "text", text: "As of now: Monday." }] }]);
  assert.ok(r1.id);
  assert.equal(r1.output_text, "");
  assert.equal(r1.model, "anthropic/claude-sonnet-5-5");
  const fc = r1.output.filter((o) => o.type === "function_call");
  assert.equal(fc.length, 1);
  assert.equal(fc[0].call_id, "toolu_1");
  assert.equal(fc[0].name, "recall");
  assert.deepEqual(JSON.parse(fc[0].arguments), { question: "my dog's name" });
  assert.ok(!r1.output.some((o) => o.type === "web_search_call"));
  assert.deepEqual(r1.usage.input_tokens, 50);

  const r2 = await P.createOnProvider({ ...base, model: "anthropic/claude-sonnet-5-5", previous_response_id: r1.id, input: [{ type: "function_call_output", call_id: "toolu_1", output: "Rex" }] });
  const m2 = sent[1].body.messages;
  assert.equal(m2.length, 3);
  assert.deepEqual(m2[1], { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "recall", input: { question: "my dog's name" } }] });
  assert.deepEqual(m2[2], { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Rex" }] });
  assert.equal(r2.output_text, "Your dog is Rex.");
  assert.deepEqual(r2.output.map((o) => o.type), ["message"]);
  assert.equal(r2.output[0].content[0].type, "output_text");
  assert.equal(r2.output[0].content[0].text, "Your dog is Rex.");
  assert.notEqual(r2.id, r1.id);
});

await check("Claude: images as data URLs and links go in as images; one it can't be given is a note", async () => {
  sent.length = 0;
  await P.createOnProvider({
    model: "anthropic/claude-haiku-5-5",
    input: [
      { role: "assistant", content: "Hi there." },
      { role: "user", content: [{ type: "input_text", text: "Look" }, { type: "input_image", image_url: "data:image/png;base64,AAAA", detail: "auto" }, { type: "input_image", image_url: "https://example.com/a.jpg", detail: "auto" }, { type: "input_image", file_id: "file_1", detail: "auto" }] },
    ],
  });
  const msgs = sent[0].body.messages;
  assert.equal(msgs[0].role, "user", "a chat that starts with the bot gets a line before it");
  assert.equal(msgs[1].role, "assistant");
  const parts = msgs[2].content;
  assert.deepEqual(parts[1], { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
  assert.deepEqual(parts[2], { type: "image", source: { type: "url", url: "https://example.com/a.jpg" } });
  assert.equal(parts[3].type, "text");
  assert.match(parts[3].text, /can't be shown/);
  assert.ok(!("tools" in sent[0].body), "no tools, none sent");
});

/* ---------------- OpenAI compatible ---------------- */

await check("z.ai Coding Plan: a tool call and its result go on through previous_response_id, as Chat Completions", async () => {
  sent.length = 0;
  next.push(() => json(chatSays(null, [{ id: "call_9", type: "function", function: { name: "recall", arguments: '{"question":"dog"}' } }])), () => json(chatSays("It's Rex.")));
  const r1 = await P.createOnProvider({ ...base, model: "zai-coding/glm-5.3", input: "What's my dog called?" });
  const q1 = sent[0];
  assert.equal(q1.url, "https://api.z.ai/api/coding/paas/v4/chat/completions");
  assert.equal(q1.headers.authorization, `Bearer ${KEYS.ZAI_API_KEY}`);
  assert.equal(q1.body.model, "glm-5.3");
  assert.equal(q1.body.messages[0].role, "system");
  assert.ok(q1.body.messages[0].content.includes(P.NO_WEB_SEARCH));
  assert.deepEqual(q1.body.messages[1], { role: "user", content: "What's my dog called?" });
  assert.deepEqual(q1.body.tools, [{ type: "function", function: { name: "recall", description: "Ask memory.", parameters: fnTool.parameters } }]);
  for (const k of ["reasoning", "service_tier", "include"]) assert.ok(!(k in q1.body), `${k} isn't sent`);
  const fc = r1.output.find((o) => o.type === "function_call");
  assert.equal(fc.call_id, "call_9");
  assert.equal(fc.arguments, '{"question":"dog"}');
  assert.equal(r1.usage.input_tokens, 40);

  const r2 = await P.createOnProvider({ ...base, model: "zai-coding/glm-5.3", previous_response_id: r1.id, input: [{ type: "function_call_output", call_id: "call_9", output: "Rex" }] });
  const m2 = sent[1].body.messages;
  assert.deepEqual(m2[2], { role: "assistant", content: null, tool_calls: [{ id: "call_9", type: "function", function: { name: "recall", arguments: '{"question":"dog"}' } }] });
  assert.deepEqual(m2[3], { role: "tool", tool_call_id: "call_9", content: "Rex" });
  assert.equal(r2.output_text, "It's Rex.");
});

await check("z.ai Coding Plan in the China region: open.bigmodel.cn's coding address, on its own key, a tool call carried on", async () => {
  sent.length = 0;
  next.push(() => json(chatSays(null, [{ id: "call_cn", type: "function", function: { name: "recall", arguments: '{"question":"cat"}' } }])), () => json(chatSays("It's Mimi.")));
  const r1 = await P.createOnProvider({ ...base, model: "zai-coding-cn/glm-5.3", input: "What's my cat called?" });
  assert.equal(sent[0].url, "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions");
  assert.equal(sent[0].headers.authorization, `Bearer ${KEYS.ZAI_CODING_CN_API_KEY}`, "its own key, never Z.ai's");
  assert.equal(sent[0].body.model, "glm-5.3");
  assert.ok(sent[0].body.messages[0].content.includes(P.NO_WEB_SEARCH));
  assert.equal(r1.output.find((o) => o.type === "function_call").call_id, "call_cn");
  const r2 = await P.createOnProvider({ ...base, model: "zai-coding-cn/glm-5.3", previous_response_id: r1.id, input: [{ type: "function_call_output", call_id: "call_cn", output: "Mimi" }] });
  assert.equal(sent[1].url, "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions");
  assert.deepEqual(sent[1].body.messages[3], { role: "tool", tool_call_id: "call_cn", content: "Mimi" });
  assert.equal(r2.output_text, "It's Mimi.");
  await P.createOnProvider({ model: "zai-coding-cn/glm-5.2", input: "hi" });
  assert.equal(sent[2].body.model, "glm-5.2");
  assert.equal(sent[2].url, "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions");
});

await check("the other providers' addresses and keys; z.ai pay as you go; DeepSeek gets no images, OpenRouter does", async () => {
  sent.length = 0;
  const pic = [{ role: "user", content: [{ type: "input_text", text: "See" }, { type: "input_image", image_url: "data:image/jpeg;base64,BBBB", detail: "auto" }] }, { role: "developer", content: "Note." }];
  await P.createOnProvider({ model: "zai/glm-5.2", input: "hi" });
  await P.createOnProvider({ model: "deepseek/deepseek-reasoner", input: pic });
  await P.createOnProvider({ model: "openrouter/deepseek/deepseek-chat", input: pic });
  assert.equal(sent[0].url, "https://api.z.ai/api/paas/v4/chat/completions");
  assert.equal(sent[1].url, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(sent[1].headers.authorization, `Bearer ${KEYS.DEEPSEEK_API_KEY}`);
  assert.equal(sent[1].body.model, "deepseek-reasoner");
  // One user message (the reasoner refuses two in a row), text only, the image a note.
  assert.equal(sent[1].body.messages.length, 1);
  assert.equal(typeof sent[1].body.messages[0].content, "string");
  assert.match(sent[1].body.messages[0].content, /can't see images/);
  assert.match(sent[1].body.messages[0].content, /Note\./);
  assert.equal(sent[2].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent[2].body.model, "deepseek/deepseek-chat", "an OpenRouter model keeps its own slash");
  assert.deepEqual(sent[2].body.messages[0].content[1], { type: "image_url", image_url: { url: "data:image/jpeg;base64,BBBB" } });
});

/* ---------------- What a no says ---------------- */

const fails = async (params, answer) => {
  if (answer) next.push(answer);
  try {
    await P.createOnProvider(params);
  } catch (e) {
    return e;
  }
  assert.fail("it should have failed");
};

await check("a provider's no is plain words naming the provider and the fix, with its HTTP status, and never the key", async () => {
  const e401 = await fails({ model: "anthropic/claude-opus-5-5", input: "hi" }, () => json({ type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${KEYS.ANTHROPIC_API_KEY}` } }, 401));
  assert.equal(e401.message, "Claude turned this down: your Anthropic key isn't valid. Check ANTHROPIC_API_KEY in .env.local, then restart Bops.");
  assert.equal(e401.status, 401);
  assert.equal(e401.provider, "anthropic");

  const lowClaude = await fails({ model: "anthropic/claude-opus-5-5", input: "hi" }, () => json({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }, 400));
  assert.match(lowClaude.message, /^Claude says your Anthropic account has no credit left\. Add some at console\.anthropic\.com/);
  assert.equal(lowClaude.status, 400);

  const e402 = await fails({ model: "deepseek/deepseek-chat", input: "hi" }, () => json({ error: { message: "Insufficient Balance", type: "unknown_error" } }, 402));
  assert.match(e402.message, /^DeepSeek says your DeepSeek account has no credit left/);
  assert.equal(e402.status, 402);

  const zai = await fails({ model: "zai-coding/glm-5.3", input: "hi" }, () => json({ error: { code: "1113", message: "Insufficient balance or no resource package. Please recharge." } }, 429));
  assert.match(zai.message, /^z\.ai says your account has no balance or Coding Plan/);
  assert.equal(zai.status, 429, "the status stays what z.ai said");
  assert.equal(zai.message, "z.ai says your account has no balance or Coding Plan (this model runs on the Coding Plan). Top up or subscribe at z.ai, or pick another model.");

  const zaiCn = await fails({ model: "zai-coding-cn/glm-5.3", input: "hi" }, () => json({ error: { code: "1113", message: "余额不足或无可用资源包,请充值。" } }, 429));
  assert.equal(zaiCn.message, "z.ai (China) says your account has no balance or Coding Plan (this model runs on the Coding Plan). Top up or subscribe at open.bigmodel.cn, or pick another model.");
  assert.equal(zaiCn.status, 429);
  assert.equal(zaiCn.provider, "zai-coding-cn");
  const cn401 = await fails({ model: "zai-coding-cn/glm-5.3", input: "hi" }, () => json({ error: { code: "1000", message: `bad key ${KEYS.ZAI_CODING_CN_API_KEY}` } }, 401));
  assert.equal(cn401.message, "z.ai (China) turned this down: your open.bigmodel.cn key isn't valid. Check ZAI_CODING_CN_API_KEY in .env.local, then restart Bops.");

  const busy = await fails({ model: "openrouter/x/y", input: "hi" }, () => json({ error: { message: "Rate limit exceeded" } }, 429));
  assert.match(busy.message, /^OpenRouter is getting too many requests/);
  assert.equal(busy.status, 429);

  const e500 = await fails({ model: "deepseek/deepseek-chat", input: "hi" }, () => new Response("upstream exploded", { status: 500 }));
  assert.equal(e500.message, "DeepSeek had a problem on its side (HTTP 500). Try again in a minute, or pick another model.");
  assert.equal(e500.status, 500);

  const e404 = await fails({ model: "zai/glm-9", input: "hi" }, () => json({ error: { message: "Model not found" } }, 404));
  assert.match(e404.message, /^z\.ai doesn't know the model "glm-9"/);

  for (const e of [e401, lowClaude, e402, zai, zaiCn, cn401, busy, e500, e404]) for (const k of Object.values(KEYS)) assert.ok(!e.message.includes(k), "no key in the words");
  for (const e of [e401, e402, e500]) assert.ok(e instanceof P.ChatProviderError);
});

await check("no key, a lost conversation, and no answer at all: said plainly too", async () => {
  delete process.env.DEEPINFRA_API_KEY;
  const none = await fails({ model: "deepinfra/meta/llama", input: "hi" });
  assert.equal(none.message, "No DeepInfra key is set on this server: add DEEPINFRA_API_KEY to .env.local, then restart Bops. Or pick another model.");
  const lost = await fails({ model: "anthropic/claude-sonnet-5-5", previous_response_id: "resp_gone", input: [{ type: "function_call_output", call_id: "x", output: "y" }] });
  assert.match(lost.message, /^Claude lost track of this reply/);
  assert.equal(lost.status, 410);
  const offline = await fails({ model: "deepseek/deepseek-chat", input: "hi" }, () => {
    throw new TypeError("fetch failed");
  });
  assert.match(offline.message, /^Couldn't reach DeepSeek/);
  assert.equal(offline.status, undefined);
});

await check("what's kept between calls is bounded: a few hundred conversations, the oldest go first", async () => {
  P.forgetChats();
  const first = await P.createOnProvider({ model: "deepseek/deepseek-chat", input: "one" });
  for (let i = 0; i < 300; i++) await P.createOnProvider({ model: "deepseek/deepseek-chat", input: `n${i}` });
  const gone = await fails({ model: "deepseek/deepseek-chat", previous_response_id: first.id, input: "again" });
  assert.equal(gone.status, 410);
});

/* ---------------- Speed, the router, and respond ---------------- */

await check("a model on another provider runs at one speed: withSpeed tries once, so a 429 isn't retried as a tier", async () => {
  assert.equal(R.speedFor("anthropic/claude-sonnet-5-5", true), "default");
  assert.equal(R.speedFor("zai/glm-5.2", true), "default");
  assert.equal(R.speedFor("openai/gpt-6.1-sol", true), "ultrafast", "openai/ is OpenAI's");
  assert.equal(R.speedFor("gpt-6.1-sol", true), "ultrafast", "as before");
  sent.length = 0;
  next.push(() => json({ error: { message: "slow down" } }, 429));
  await assert.rejects(R.withSpeed(R.speedFor("deepseek/deepseek-chat", true), (tier) => P.createOnProvider({ model: "deepseek/deepseek-chat", input: "hi", ...R.tierParam(tier) })), (e) => e.status === 429);
  assert.equal(sent.length, 1);
});

await check("the router leaves a chosen model alone (no Jev, no OpenAI model)", async () => {
  process.env.BOPS_ROUTER = "on";
  const pinned = await R.routeChat({ model: "anthropic/claude-opus-5-5", effort: "low" }, "Write me a careful plan for the quarter.", undefined, { pinned: true });
  assert.deepEqual(pinned, { config: { model: "anthropic/claude-opus-5-5", effort: "low" } });
  delete process.env.BOPS_ROUTER;
});

await check("respond: another provider's model goes there, openai/ and a plain name to OpenAI's Responses API", async () => {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: "sk-test-openai", maxRetries: 0 });
  openaiAsked.length = 0;
  sent.length = 0;
  const a = await P.respond(client, { model: "openai/gpt-6.1-sol", input: "hi", tools: [webTool], include: ["web_search_call.action.sources"] });
  assert.equal(openaiAsked[0].model, "gpt-6.1-sol");
  assert.deepEqual(openaiAsked[0].tools, [webTool], "OpenAI keeps web_search");
  assert.equal(a.output_text, "From OpenAI.");
  await P.respond(client, { model: "gpt-6-luna", input: "hi" });
  assert.equal(openaiAsked[1].model, "gpt-6-luna");
  const c = await P.respond(client, { model: "anthropic/claude-sonnet-5-5", input: "hi" });
  assert.equal(c.output_text, "Hello.");
  assert.equal(openaiAsked.length, 2);
  assert.equal(sent.length, 1);
});

/* ---------------- The list, the API and the window ---------------- */

const Route = await import(`${root}/app/api/chats/model/route.ts`);
const chatId = botChatId("boppy");
const post = (body, headers = {}) => Route.POST(new Request("http://localhost/api/chats/model", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

await check("the models offered: Your LLMs first, then the built in ones they don't have, each once", async () => {
  A.setLlms([
    { name: "Claude Sonnet 5.5", provider: "anthropic", model: "claude-sonnet-5-5", starter: true },
    { name: "Kimi on OpenRouter", provider: "openrouter", model: "moonshotai/kimi-k3" },
  ]);
  const ids = M.chatModels().map((m) => m.id);
  assert.deepEqual(ids.slice(0, 2), ["anthropic/claude-sonnet-5-5", "openrouter/moonshotai/kimi-k3"]);
  for (const b of ["openai/gpt-6.1-sol", "anthropic/claude-opus-5-5", "anthropic/claude-haiku-5-5", "zai-coding/glm-5.3", "zai/glm-5.2", "zai-coding-cn/glm-5.3", "deepseek/deepseek-chat", "deepseek/deepseek-reasoner"]) assert.ok(ids.includes(b), b);
  assert.equal(M.providerOf("zai-coding-cn/glm-5.3"), "zai-coding-cn");
  assert.equal(M.chatKeyName("zai-coding-cn"), "ZAI_CODING_CN_API_KEY");
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(M.providerOf("openrouter/moonshotai/kimi-k3"), "openrouter");
  assert.equal(M.providerOf("gpt-6.1-sol"), undefined);
  assert.equal(M.providerOf("madeup/x"), undefined);
});

await check("POST /api/chats/model: only the Bops window, only a model from the list, and Auto clears it", async () => {
  process.env.BOPS_UI_TOKEN = "window-token";
  const win = { cookie: "bops_window=window-token" };
  assert.equal((await post({ chatId, model: "anthropic/claude-opus-5-5" })).status, 403, "not the window");
  assert.equal((await post({ chatId, model: "anthropic/claude-opus-5-5" }, { ...win, "x-bops-remote": "1" })).status, 403, "not the paired phone, with a window");
  const bad = await post({ chatId, model: "anthropic/claude-made-up" }, win);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /isn't one of the models/);
  assert.equal((await post({ chatId, model: "madeup/x" }, win)).status, 400);
  assert.equal((await post({ chatId, model: 7 }, win)).status, 400);
  assert.equal((await post({ chatId: "bot:nobody", model: "zai/glm-5.2" }, win)).status, 404);
  assert.equal(S.chat(chatId).model, undefined, "nothing changed yet");
  assert.equal((await post({ chatId, model: "openrouter/moonshotai/kimi-k3" }, win)).status, 200, "one of Your LLMs");
  assert.equal(S.chat(chatId).model, "openrouter/moonshotai/kimi-k3");
  assert.equal((await post({ chatId, model: "zai-coding/glm-5.3" }, win)).status, 200, "a built in one");
  assert.equal(S.chat(chatId).model, "zai-coding/glm-5.3");
  assert.equal((await post({ chatId, model: "zai-coding-cn/glm-5.3" }, win)).status, 200, "the China Coding Plan one");
  assert.equal(S.chat(chatId).model, "zai-coding-cn/glm-5.3");
  assert.equal((await post({ chatId, model: "zai-coding-cn/glm-made-up" }, win)).status, 400, "only its listed models");
  assert.equal((await post({ chatId, model: null }, win)).status, 200);
  assert.ok(!("model" in S.chat(chatId)), "Auto: unset, as before");
  // A server with no window that only lets in the paired phone (BOPS_REQUIRE_REMOTE=1): that phone.
  delete process.env.BOPS_UI_TOKEN;
  process.env.BOPS_REQUIRE_REMOTE = "1";
  assert.equal((await post({ chatId, model: "zai/glm-5.2" })).status, 403);
  assert.equal((await post({ chatId, model: "zai/glm-5.2" }, { "x-bops-remote": "1" })).status, 200);
  assert.equal(S.chat(chatId).model, "zai/glm-5.2");
  delete process.env.BOPS_REQUIRE_REMOTE;
  await post({ chatId, model: null }, { host: "localhost" });
});

await check("the field survives the state's save and its merge with another device's", async () => {
  const SM = await import(`${root}/lib/server/state-merge.ts`);
  S.update(() => (S.chat(chatId).model = "deepseek/deepseek-chat"));
  const shared = SM.toShared(JSON.parse(JSON.stringify(S.getState())), "dev_a");
  assert.equal(shared.chats.find((c) => c.id === chatId).model, "deepseek/deepseek-chat");
  const theirs = JSON.parse(JSON.stringify(shared));
  theirs.chats.find((c) => c.id === chatId).readAt = 5;
  const merged = SM.merge3(shared, shared, theirs);
  assert.equal(merged.chats.find((c) => c.id === chatId).model, "deepseek/deepseek-chat");
  const mine = JSON.parse(JSON.stringify(shared));
  mine.chats.find((c) => c.id === chatId).model = "zai/glm-5.2";
  assert.equal(SM.merge3(shared, mine, theirs).chats.find((c) => c.id === chatId).model, "zai/glm-5.2", "a change on one side is kept");
  S.update(() => delete S.chat(chatId).model);
});

await check("/api/state says which providers have a key, as true or false only", async () => {
  const State = await import(`${root}/app/api/state/route.ts`);
  const res = await State.GET(new Request("http://localhost/api/state"));
  const { state } = await res.json();
  assert.equal(state.chatKeys.anthropic, true);
  assert.equal(state.chatKeys.deepinfra, false);
  assert.equal(state.chatKeys.openai, true);
  for (const v of Object.values(state.chatKeys)) assert.equal(typeof v, "boolean");
  const text = JSON.stringify(state);
  for (const k of Object.values(KEYS)) assert.ok(!text.includes(k), "no key in the state");
});

/* ---------------- A whole chat turn on Claude ---------------- */

await check("a chat set to Claude: the turn and its lookup run on Claude, not OpenAI, and web_search is left out", async () => {
  const Chat = await import(`${root}/lib/server/chat.ts`);
  clearInterval(globalThis.__bopsRoutines);
  S.update((s) => {
    s.owner = { name: "Alex", timeZone: "America/New_York" };
    S.chat(chatId).model = "anthropic/claude-sonnet-5-5";
  });
  sent.length = 0;
  openaiAsked.length = 0;
  next.push(() => json(claudeCalls("toolu_r", "recall", { question: "dog" })), () => json(claudeSays("Your dog is Rex, as far as I know.")));
  await Chat.handleMessage(chatId, "What's my dog called?");
  const turnCalls = sent.filter((x) => x.url === "https://api.anthropic.com/v1/messages");
  assert.equal(turnCalls.length, 2, "the reply and the lookup's round");
  assert.equal(turnCalls[0].body.model, "claude-sonnet-5-5");
  assert.ok(!turnCalls[0].body.tools.some((t) => t.name === "web_search"));
  assert.ok(turnCalls[0].body.system.includes(P.NO_WEB_SEARCH));
  const results = turnCalls[1].body.messages.at(-1).content.filter((c) => c.type === "tool_result");
  assert.equal(results.length, 1);
  assert.equal(results[0].tool_use_id, "toolu_r");
  const said = S.getState().messages.filter((m) => m.chatId === chatId && m.role === "bot").at(-1);
  assert.equal(said.text, "Your dog is Rex, as far as I know.");
  // OpenAI may fold the chat's summary or learn from it after the turn, but never answers it.
  assert.ok(!openaiAsked.some((b) => String(b.instructions ?? "").includes("If a tapback says it all")), "the turn itself never went to OpenAI");
});

await check("a chat set to Claude whose key is wrong: the chat says so in plain words", async () => {
  const Chat = await import(`${root}/lib/server/chat.ts`);
  next.push(() => json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
  await Chat.handleMessage(chatId, "Hello?");
  const said = S.getState().messages.filter((m) => m.chatId === chatId && m.role === "bot").at(-1);
  assert.match(said.text, /Claude turned this down: your Anthropic key isn't valid\. Check ANTHROPIC_API_KEY in \.env\.local/);
});

await check("Auto (no model): the turn goes to OpenAI as before, with web_search", async () => {
  const Chat = await import(`${root}/lib/server/chat.ts`);
  S.update(() => delete S.chat(chatId).model);
  sent.length = 0;
  openaiAsked.length = 0;
  await Chat.handleMessage(chatId, "Hi");
  assert.equal(sent.length, 0);
  const turn = openaiAsked.find((b) => String(b.instructions ?? "").includes("If a tapback says it all"));
  assert.ok(turn);
  assert.equal(turn.model, "gpt-6.1-sol");
  assert.ok(turn.tools.some((t) => t.type === "web_search"));
});

await check("the window's picker renders right (the --ui pass)", async () => {
  const out = await new Promise((resolve) => execFile(process.execPath, [fileURLToPath(import.meta.url), "--ui"], { cwd: root, env: process.env }, (error, stdout, stderr) => resolve({ error, text: `${stdout}${stderr}` })));
  if (out.error) assert.fail(out.text);
  assert.match(out.text, /ok {3}the window's picker/);
});

console.log(`\nchat providers: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

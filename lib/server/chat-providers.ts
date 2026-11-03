import "server-only";
import type OpenAI from "openai";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { AgentRoute } from "@/lib/agents";
import { chatKeyName, providerOf } from "@/lib/chat-models";

/**
 * A chat on another provider than OpenAI (Chat.model "anthropic/…", "zai/…", "zai-coding-cn/…", "deepseek/…"): the part of
 * OpenAI's Responses API that chat.ts uses, answered by that provider. Anthropic speaks its Messages API; z.ai,
 * DeepSeek, OpenRouter and DeepInfra speak OpenAI's Chat Completions. What comes back is shaped like a Responses
 * result as chat.ts reads it: an id, the output (the reply as a message with output_text, and function calls
 * with call_id, name and arguments), output_text and usage.
 *
 * Those providers keep nothing between calls, so each response's whole conversation is kept here, in memory,
 * by the id it was given (a few hundred, for an hour): a call with previous_response_id goes on from it, and
 * function_call_output items are the tool results. A restart forgets them; a turn that paused for the user's OK
 * longer than that can't go on, and says so.
 *
 * OpenAI's own tools aren't there: web_search is left out, and the model is told so in its instructions.
 * reasoning, service_tier and include are OpenAI's and are left out too. Keys come from this server's
 * environment (.env.local), never the state, and are never logged or said back.
 */

type Params = ResponseCreateParamsNonStreaming;
type Part = { type: "text"; text: string } | { type: "image"; url: string };
type Call = { id: string; name: string; arguments: string };
/** One step of a conversation, the same for every provider until it's sent. A note is Bops' own words (developer or system). */
type Turn = { role: "user"; parts: Part[] } | { role: "note"; text: string } | { role: "assistant"; text: string; calls: Call[] } | { role: "tool"; id: string; output: string };
type Kept = { at: number; turns: Turn[] };

/** Where each provider's chat goes. OpenAI isn't here: it stays on the real Responses API. */
const CHAT_URLS: Partial<Record<AgentRoute, string>> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  zai: "https://api.z.ai/api/paas/v4/chat/completions",
  "zai-coding": "https://api.z.ai/api/coding/paas/v4/chat/completions",
  "zai-coding-cn": "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  deepinfra: "https://api.deepinfra.com/v1/openai/chat/completions",
};
/** Who said no, in the chat's words. */
const LABELS: Record<AgentRoute, string> = { anthropic: "Claude", openai: "OpenAI", zai: "z.ai", "zai-coding": "z.ai", "zai-coding-cn": "z.ai (China)", deepseek: "DeepSeek", openrouter: "OpenRouter", deepinfra: "DeepInfra" };
/** Whose account it is. */
const ACCOUNTS: Record<AgentRoute, string> = { anthropic: "Anthropic", openai: "OpenAI", zai: "z.ai", "zai-coding": "z.ai", "zai-coding-cn": "open.bigmodel.cn", deepseek: "DeepSeek", openrouter: "OpenRouter", deepinfra: "DeepInfra" };
/** Where to add credit. */
const BILLING: Record<AgentRoute, string> = {
  anthropic: "console.anthropic.com, Billing",
  openai: "platform.openai.com, Billing",
  zai: "z.ai, Billing",
  "zai-coding": "z.ai, Billing",
  "zai-coding-cn": "open.bigmodel.cn, Billing",
  deepseek: "platform.deepseek.com, Top up",
  openrouter: "openrouter.ai, Credits",
  deepinfra: "deepinfra.com, Billing",
};
/** Providers whose chat models can't see images: an image is left out, with a note in its place. */
const NO_IMAGES = new Set<AgentRoute>(["deepseek"]);

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MAX_TOKENS = 8192;
const TIMEOUT_MS = 120_000;
const KEEP_MAX = 300;
const KEEP_MS = 60 * 60 * 1000;

/** Said to the model when its tools had web_search, which only OpenAI runs. */
export const NO_WEB_SEARCH =
  "You don't have web_search on this model: don't try to call it. To read a page whose address you have, use web_fetch if you have it; otherwise say plainly that you can't look that up from this chat.";

/** A provider's no, in plain words: which provider, and what fixes it. `status` is the HTTP status it answered with (none: it wasn't reached). */
export class ChatProviderError extends Error {
  readonly provider: AgentRoute;
  readonly status?: number;
  constructor(message: string, provider: AgentRoute, status?: number) {
    super(message);
    this.name = "ChatProviderError";
    this.provider = provider;
    this.status = status;
  }
}

/* ---------------- What's kept between calls ---------------- */

const g = globalThis as unknown as { __bopsChatKept?: Map<string, Kept> };
const kept = (g.__bopsChatKept ??= new Map());

function keep(id: string, turns: Turn[]) {
  const now = Date.now();
  for (const [k, v] of kept) if (now - v.at > KEEP_MS) kept.delete(k);
  kept.set(id, { at: now, turns });
  while (kept.size > KEEP_MAX) kept.delete(kept.keys().next().value!);
}

function earlier(id: string): Turn[] | undefined {
  const k = kept.get(id);
  if (!k || Date.now() - k.at > KEEP_MS) return void kept.delete(id);
  // Used again: kept as the newest.
  kept.delete(id);
  kept.set(id, k);
  return k.turns;
}

/** For tests: forget every conversation. */
export const forgetChats = () => kept.clear();

/* ---------------- Responses input into turns ---------------- */

type Item = { type?: string; role?: string; content?: unknown; call_id?: string; name?: string; arguments?: string; output?: unknown };

function partsOf(content: unknown): Part[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const out: Part[] = [];
  for (const c of content as { type?: string; text?: string; image_url?: string | null; file_id?: string | null }[]) {
    if ((c.type === "input_text" || c.type === "output_text" || c.type === "text") && c.text) out.push({ type: "text", text: c.text });
    else if (c.type === "input_image") {
      const url = c.image_url ?? "";
      if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url) || /^https?:\/\//i.test(url)) out.push({ type: "image", url });
      else out.push({ type: "text", text: "[An image was attached here, but it can't be shown to this model.]" });
    }
  }
  return out;
}

const textOf = (parts: Part[]) => parts.map((p) => (p.type === "text" ? p.text : "")).filter(Boolean).join("\n");

function toolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return textOf(partsOf(output)) || JSON.stringify(output);
  return JSON.stringify(output ?? "");
}

function turnsOf(input: Params["input"]): Turn[] {
  if (typeof input === "string") return [{ role: "user", parts: [{ type: "text", text: input }] }];
  const out: Turn[] = [];
  for (const item of (input ?? []) as Item[]) {
    if (item.type === "function_call_output") out.push({ role: "tool", id: String(item.call_id ?? ""), output: toolOutput(item.output) });
    else if (item.type === "function_call") {
      const call = { id: String(item.call_id ?? ""), name: String(item.name ?? ""), arguments: item.arguments || "{}" };
      const last = out.at(-1);
      if (last?.role === "assistant") last.calls.push(call);
      else out.push({ role: "assistant", text: "", calls: [call] });
    } else if (item.role && (item.type === undefined || item.type === "message")) {
      const parts = partsOf(item.content);
      if (item.role === "assistant") out.push({ role: "assistant", text: textOf(parts), calls: [] });
      else if (item.role === "developer" || item.role === "system") out.push({ role: "note", text: textOf(parts) });
      else out.push({ role: "user", parts });
    }
    // Anything else (OpenAI's reasoning, web_search_call): nothing these providers can read.
  }
  return out;
}

/** Function tools, as name, description and JSON schema. web_search and OpenAI's other tools aren't among them. */
function functionsOf(tools: Params["tools"]) {
  const out: { name: string; description: string; parameters: Record<string, unknown> }[] = [];
  let webSearch = false;
  for (const t of tools ?? []) {
    if (t.type === "function") out.push({ name: t.name, description: t.description ?? "", parameters: (t.parameters as Record<string, unknown> | null) ?? { type: "object", properties: {} } });
    else if (String(t.type).startsWith("web_search")) webSearch = true;
  }
  return { functions: out, webSearch };
}

const imageNote = "[An image was attached here, but this model can't see images.]";

/* ---------------- Anthropic (Messages) ---------------- */

type ABlock = Record<string, unknown>;

function anthropicImage(url: string): ABlock {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]*)$/i.exec(url);
  return m ? { type: "image", source: { type: "base64", media_type: m[1].toLowerCase(), data: m[2] } } : { type: "image", source: { type: "url", url } };
}

function anthropicMessages(turns: Turn[]) {
  const out: { role: "user" | "assistant"; content: ABlock[] }[] = [];
  const push = (role: "user" | "assistant", blocks: ABlock[]) => {
    if (!blocks.length) return;
    const last = out.at(-1);
    if (last?.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const t of turns) {
    if (t.role === "user") push("user", t.parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : anthropicImage(p.url))).filter((b) => b.type !== "text" || b.text));
    else if (t.role === "note") push("user", t.text ? [{ type: "text", text: t.text }] : []);
    else if (t.role === "tool") push("user", [{ type: "tool_result", tool_use_id: t.id, content: t.output || "(nothing)" }]);
    else {
      const blocks: ABlock[] = [...(t.text ? [{ type: "text", text: t.text }] : []), ...t.calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: parsed(c.arguments) }))];
      push("assistant", blocks.length ? blocks : [{ type: "text", text: "(no reply)" }]);
    }
  }
  // A conversation starts with the user's words: one that starts with the bot's gets a line before it.
  if (out[0]?.role === "assistant") out.unshift({ role: "user", content: [{ type: "text", text: "(the chat so far)" }] });
  // In a user message, tool results come before anything else.
  for (const m of out) if (m.role === "user") m.content.sort((a, b) => Number(b.type === "tool_result") - Number(a.type === "tool_result"));
  return out;
}

function parsed(args: string): Record<string, unknown> {
  try {
    const v = JSON.parse(args || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

async function callAnthropic(model: string, system: string, turns: Turn[], functions: ReturnType<typeof functionsOf>["functions"], key: string, signal: AbortSignal) {
  const body = {
    model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: anthropicMessages(turns),
    ...(functions.length ? { tools: functions.map((f) => ({ name: f.name, description: f.description, input_schema: f.parameters })) } : {}),
  };
  const json = (await send("anthropic", CHAT_URLS.anthropic!, { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION }, body, key, model, signal)) as {
    content?: { type?: string; text?: string; id?: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  const text = (json.content ?? []).filter((c) => c.type === "text" && c.text).map((c) => c.text!).join("");
  const calls = (json.content ?? []).filter((c) => c.type === "tool_use").map((c) => ({ id: String(c.id), name: String(c.name), arguments: JSON.stringify(c.input ?? {}) }));
  const u = json.usage ?? {};
  return { text, calls, input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 };
}

/* ---------------- OpenAI compatible (Chat Completions) ---------------- */

type CMessage = Record<string, unknown> & { role: string };

function chatMessages(provider: AgentRoute, system: string, turns: Turn[]) {
  const out: CMessage[] = system ? [{ role: "system", content: system }] : [];
  // Bops' notes go in as the user's side of the conversation, merged with what's next to them: some providers
  // (DeepSeek's reasoner) refuse two user messages in a row, or a system message after the first.
  const userParts = (parts: Part[]) => parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : NO_IMAGES.has(provider) ? { type: "text", text: imageNote } : { type: "image_url", image_url: { url: p.url } }));
  const pushUser = (parts: { type: string }[]) => {
    if (!parts.length) return;
    const last = out.at(-1);
    if (last?.role === "user" && Array.isArray(last.content)) (last.content as unknown[]).push(...parts);
    else out.push({ role: "user", content: parts });
  };
  for (const t of turns) {
    if (t.role === "user") pushUser(userParts(t.parts.filter((p) => p.type !== "text" || p.text)));
    else if (t.role === "note") pushUser(t.text ? [{ type: "text", text: t.text } as { type: string }] : []);
    else if (t.role === "tool") out.push({ role: "tool", tool_call_id: t.id, content: t.output || "(nothing)" });
    else out.push({ role: "assistant", content: t.text || (t.calls.length ? null : "(no reply)"), ...(t.calls.length ? { tool_calls: t.calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) } : {}) });
  }
  // Text only, as a plain string: every provider reads that, and not all read parts.
  for (const m of out) if (m.role === "user" && Array.isArray(m.content) && (m.content as { type: string }[]).every((p) => p.type === "text")) m.content = (m.content as { text: string }[]).map((p) => p.text).join("\n\n");
  return out;
}

async function callChat(provider: AgentRoute, model: string, system: string, turns: Turn[], functions: ReturnType<typeof functionsOf>["functions"], key: string, signal: AbortSignal) {
  const body = {
    model,
    messages: chatMessages(provider, system, turns),
    ...(functions.length ? { tools: functions.map((f) => ({ type: "function", function: f })) } : {}),
  };
  const extra: Record<string, string> = provider === "openrouter" ? { "X-Title": "Bops" } : {};
  const json = (await send(provider, CHAT_URLS[provider]!, { authorization: `Bearer ${key}`, ...extra }, body, key, model, signal)) as {
    choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const m = json.choices?.[0]?.message ?? {};
  const calls = (m.tool_calls ?? []).map((c, i) => ({ id: c.id || `call_${i}_${Math.random().toString(36).slice(2, 10)}`, name: String(c.function?.name ?? ""), arguments: c.function?.arguments || "{}" }));
  return { text: typeof m.content === "string" ? m.content : "", calls, input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 };
}

/* ---------------- Sending, and what a no means ---------------- */

async function send(provider: AgentRoute, url: string, headers: Record<string, string>, body: unknown, key: string, model: string, signal: AbortSignal): Promise<unknown> {
  let res: globalThis.Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
    throw new ChatProviderError(
      timedOut
        ? `${LABELS[provider]} took too long to answer (over ${Math.round(TIMEOUT_MS / 1000)} seconds). Try again, or pick another model.`
        : `Couldn't reach ${LABELS[provider]}: check this server's internet connection, then try again.`,
      provider,
    );
  }
  const raw = await res.text().catch(() => "");
  if (!res.ok) throw refusal(provider, res.status, raw, key, model);
  try {
    return JSON.parse(raw);
  } catch {
    throw new ChatProviderError(`${LABELS[provider]} answered with something Bops can't read. Try again in a minute, or pick another model.`, provider, res.status);
  }
}

/** The provider's own words for a no, short, and never with the key in them. */
function said(raw: string, key: string): string {
  let text = raw;
  try {
    const j = JSON.parse(raw) as { error?: { message?: string; code?: string | number } | string; message?: string; msg?: string };
    const e = j.error;
    text = (typeof e === "string" ? e : e?.message) ?? j.message ?? j.msg ?? raw;
    if (typeof e === "object" && e?.code !== undefined) text = `${text} (code ${e.code})`;
  } catch {}
  return text.split(key).join("…").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** A no, in plain English: which provider, and the fix. */
export function refusal(provider: AgentRoute, status: number, raw: string, key: string, model: string): ChatProviderError {
  const who = LABELS[provider];
  const keyName = chatKeyName(provider);
  const words = said(raw, key);
  const balance = status === 402 || /insufficient[ _]balance|credit balance|no (resource package|balance)|out of credit|insufficient[ _]quota|quota exceeded|exceeded your current quota|billing|1113|top ?up|payment required/i.test(words);
  const err = (m: string) => new ChatProviderError(m, provider, status);
  if (status === 401 || (status === 403 && /key|auth|token|credential/i.test(words) && !balance))
    return err(`${who} turned this down: your ${ACCOUNTS[provider]} key isn't valid. Check ${keyName} in .env.local, then restart Bops.`);
  if (balance)
    return err(
      provider === "zai" || provider === "zai-coding" || provider === "zai-coding-cn"
        ? `${who} says your account has no balance or Coding Plan${provider === "zai" ? "" : " (this model runs on the Coding Plan)"}. Top up or subscribe at ${provider === "zai-coding-cn" ? "open.bigmodel.cn" : "z.ai"}, or pick another model.`
        : `${who} says your ${ACCOUNTS[provider]} account has no credit left. Add some at ${BILLING[provider]}, or pick another model.`,
    );
  if (status === 429) return err(`${who} is getting too many requests from your key right now. Wait a minute and try again, or pick another model.`);
  if (status === 404 || /model[^.]*(not[ _]found|does not exist|not exist|invalid|unknown|not supported)|unknown model|invalid model/i.test(words))
    return err(`${who} doesn't know the model "${model}". Check its name in config/llms.yaml, or pick another model.`);
  if (status === 403) return err(`${who} turned this down: your ${ACCOUNTS[provider]} key isn't allowed to use "${model}". Check the key's access, or pick another model.`);
  if (status >= 500) return err(`${who} had a problem on its side (HTTP ${status}). Try again in a minute, or pick another model.`);
  return err(`${who} turned this down (HTTP ${status})${words ? `: ${words}` : ""}.`);
}

/* ---------------- The call ---------------- */

let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * `client.responses.create` for a model on another provider ("anthropic/claude-sonnet-5-5"). The result is
 * a Responses API result as far as chat.ts reads it.
 */
export async function createOnProvider(params: Params, opts: { timeoutMs?: number } = {}): Promise<Response> {
  const model = String(params.model ?? "");
  const provider = providerOf(model);
  if (!provider || provider === "openai" || !CHAT_URLS[provider]) throw new Error(`${model} isn't a model Bops can chat on.`);
  const name = model.slice(provider.length + 1);
  const keyName = chatKeyName(provider);
  const key = process.env[keyName]?.trim();
  if (!key) throw new ChatProviderError(`No ${ACCOUNTS[provider]} key is set on this server: add ${keyName} to .env.local, then restart Bops. Or pick another model.`, provider);

  const before = params.previous_response_id ? earlier(params.previous_response_id) : [];
  if (!before)
    throw new ChatProviderError(`${LABELS[provider]} lost track of this reply: Bops restarted, or it was more than an hour ago. Send your message again.`, provider, 410);
  const turns = [...before, ...turnsOf(params.input)];
  const { functions, webSearch } = functionsOf(params.tools);
  const system = [params.instructions ?? "", webSearch ? NO_WEB_SEARCH : ""].filter(Boolean).join("\n");
  const signal = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);
  const got = provider === "anthropic" ? await callAnthropic(name, system, turns, functions, key, signal) : await callChat(provider, name, system, turns, functions, key, signal);

  const id = newId("resp");
  keep(id, [...turns, { role: "assistant", text: got.text, calls: got.calls }]);
  const output = [
    ...(got.text ? [{ type: "message", id: newId("msg"), role: "assistant", status: "completed", content: [{ type: "output_text", text: got.text, annotations: [] }] }] : []),
    ...got.calls.map((c) => ({ type: "function_call", id: newId("fc"), call_id: c.id, name: c.name, arguments: c.arguments, status: "completed" })),
  ];
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    status: "completed",
    output,
    output_text: got.text,
    usage: { input_tokens: got.input, output_tokens: got.output, total_tokens: got.input + got.output, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  } as unknown as Response;
}

/**
 * The one call chat.ts makes for a reply: a model on another provider goes there (createOnProvider), "openai/…"
 * and a plain model name go to OpenAI's Responses API, as before.
 */
export function respond(client: OpenAI, params: Params, options?: Parameters<OpenAI["responses"]["create"]>[1]): Promise<Response> {
  const provider = providerOf(String(params.model ?? ""));
  if (provider && provider !== "openai") return createOnProvider(params);
  const model = provider === "openai" ? String(params.model).slice("openai/".length) : params.model;
  return client.responses.create({ ...params, model }, options) as Promise<Response>;
}

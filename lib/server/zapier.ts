import "server-only";
import { createHash } from "node:crypto";

/**
 * Zapier, for the owner's own chats: the actions they picked on their Zapier MCP server (mcp.zapier.com) offered
 * as tools named zapier_<action>. A narrow connector, not a general MCP client: it speaks only MCP's Streamable
 * HTTP transport (JSON-RPC over POST, answered as JSON or as server-sent events) and only to Zapier.
 *
 * The server's address is a secret (the token is in it): it lives only in this server's .env.local as
 * ZAPIER_MCP_URL, and must be https on zapier.com or one of its subdomains. It is never put in the state, a log,
 * a tool's output, the window or a bot's computer: errors are Bops' own words, and anything Zapier says is
 * scrubbed of it. Redirects are refused, so the secret can't be sent on anywhere else.
 *
 * This file is the connection only (no state, no store): zapier-chat.ts offers the actions to the chat and asks.
 *
 * Who gets it: the owner's own turns in the Bops app (zapier-chat.ts zapierForTurn), not a member's, a channel's
 * (Telegram, Discord, Slack), a text's, an email's, a routine's run, or a turn someone outside Bops started; and
 * not the bots' cloud computers in this version. Every action that could change something (all of them, unless
 * Zapier marks it readOnlyHint) asks the owner first through Bops' usual request (NeedsOk), like use_app. What
 * Zapier answers is information from outside Bops, never instructions, and cut to a size.
 */

export const ZAPIER_PREFIX = "zapier_";
const PROTOCOL = "2025-06-18";
/** How long each kind of request may take, how long the action list is kept, and the most read of one answer. For tests to shorten. */
export const zapierTiming = { initMs: 15_000, listMs: 15_000, callMs: 60_000, cacheMs: 5 * 60_000, maxBytes: 2_000_000 };
export const ZAPIER_OUTPUT_MAX = 14_000;
export const zapierClip = (s: string, n = ZAPIER_OUTPUT_MAX) => (s.length > n ? `${s.slice(0, n)}… (cut short)` : s);
const MAX_TOOLS = 80;
const MAX_PAGES = 20;

/** Zapier's no, in plain words. `status`: the HTTP status, when it answered; `auth`: it turned the address down. */
export class ZapierError extends Error {
  readonly status?: number;
  readonly kind: "invalid" | "unavailable" | "rate limited" | "not set";
  constructor(message: string, kind: ZapierError["kind"], status?: number) {
    super(message);
    this.name = "ZapierError";
    this.kind = kind;
    this.status = status;
  }
}

/** The server's address, if it's one Bops will send the secret to: https, on zapier.com, no user or other port. */
export function zapierUrl(raw: string | undefined = process.env.ZAPIER_MCP_URL): URL | null {
  const s = raw?.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host !== "zapier.com" && !host.endsWith(".zapier.com")) return null;
  u.hash = "";
  return u;
}

/** Whether ZAPIER_MCP_URL is set at all (it may still be refused: zapierOn). */
export const zapierSet = () => !!process.env.ZAPIER_MCP_URL?.trim();
/** Whether Zapier can be used here: a usable address is set. */
export const zapierOn = () => !!zapierUrl();

/** What Zapier said, without the secret: the whole address, its path and its query never appear. */
function scrub(text: string): string {
  const raw = process.env.ZAPIER_MCP_URL?.trim();
  let out = text;
  const u = zapierUrl();
  const secrets = [raw, u?.href, u ? u.pathname + u.search : undefined, u?.search.slice(1), ...(u ? [...u.searchParams.values()] : []), ...(u ? u.pathname.split("/").filter((p) => p.length >= 16) : [])].filter((x): x is string => !!x && x.length >= 8);
  for (const s of secrets.sort((a, b) => b.length - a.length)) out = out.split(s).join("…");
  return out;
}

const clip = zapierClip;

/* ---------------- The connection ---------------- */

type McpTool = { name: string; title?: string; description?: string; inputSchema?: unknown; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string } };
export type ZapierAction = Known;
type Known = { tool: McpTool; name: string; readOnly: boolean };
type Live = { key?: string; sessionId?: string; protocol?: string; ready?: Promise<void>; tools?: { at: number; list: Known[] }; loading?: Promise<Known[]>; nextId: number };
const g = globalThis as unknown as { __bopsZapier?: Live };
const live: Live = (g.__bopsZapier ??= { nextId: 1 });

/** For tests: forget the session and the action list. */
export function forgetZapier() {
  for (const k of Object.keys(live) as (keyof Live)[]) if (k !== "nextId") delete live[k];
}

/** Which address the session is for, as a hash (the address itself is never kept). A new address starts over. */
function current(): URL {
  const u = zapierUrl();
  if (!u) throw new ZapierError(zapierSet() ? "ZAPIER_MCP_URL in .env.local isn't a Zapier MCP address: it must start with https:// and be on zapier.com (copy it from mcp.zapier.com)." : "Zapier isn't connected: add ZAPIER_MCP_URL to .env.local, then restart Bops.", zapierSet() ? "invalid" : "not set");
  const key = createHash("sha256").update(u.href).digest("hex");
  if (live.key !== key) {
    forgetZapier();
    live.key = key;
  }
  return u;
}

type RpcMessage = { jsonrpc?: string; id?: number | string | null; result?: unknown; error?: { code?: number; message?: string } };

/** Read at most maxBytes of a body. */
async function bounded(res: Response, until?: (soFar: string) => boolean): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > zapierTiming.maxBytes) throw new ZapierError("Zapier's answer was too big to read.", "unavailable");
      text += decoder.decode(next.value, { stream: true });
      if (until?.(text)) break;
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** The JSON-RPC messages in a server-sent events stream: each event's data lines, joined. */
function eventsIn(text: string): RpcMessage[] {
  const out: RpcMessage[] = [];
  for (const block of text.replace(/\r\n?/g, "\n").split("\n\n")) {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      const v = JSON.parse(data) as RpcMessage | RpcMessage[];
      out.push(...(Array.isArray(v) ? v : [v]));
    } catch {}
  }
  return out;
}

/** One POST to the server: a request (`id`), answered with its result, or a notification (no id), answered with nothing. */
async function post(method: string, params: Record<string, unknown> | undefined, ms: number, notify = false): Promise<unknown> {
  const url = current();
  const id = notify ? undefined : live.nextId++;
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (live.sessionId) headers["mcp-session-id"] = live.sessionId;
  if (live.protocol && method !== "initialize") headers["mcp-protocol-version"] = live.protocol;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", ...(id !== undefined ? { id } : {}), method, ...(params ? { params } : {}) }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(ms),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new ZapierError(`Zapier took too long to answer (over ${Math.round(ms / 1000)} seconds). Try again in a minute.`, "unavailable");
    throw new ZapierError("Couldn't reach Zapier: check this server's internet connection, then try again.", "unavailable");
  }
  if (res.headers.get("mcp-session-id") && method === "initialize") live.sessionId = res.headers.get("mcp-session-id")!.slice(0, 200);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    if (res.status === 404 && live.sessionId && method !== "initialize") throw new ZapierError("Zapier's session ended.", "unavailable", 404);
    if (res.status === 401 || res.status === 403) throw new ZapierError("Zapier turned down this server address. Make a new one at mcp.zapier.com, put it in ZAPIER_MCP_URL in .env.local, then restart Bops.", "invalid", res.status);
    if (res.status === 404) throw new ZapierError("Zapier doesn't know this server address any more (it may have been deleted or its token changed). Copy it again from mcp.zapier.com into ZAPIER_MCP_URL.", "invalid", 404);
    if (res.status === 429) throw new ZapierError("Zapier is getting too many requests right now (or your plan's task limit was reached). Wait a bit and try again.", "rate limited", 429);
    if (res.status === 405 || res.status === 406 || res.status === 415) throw new ZapierError("This Zapier address doesn't speak MCP over Streamable HTTP. Use the server URL mcp.zapier.com gives you for other MCP clients (it starts with https://mcp.zapier.com/).", "invalid", res.status);
    throw new ZapierError(`Zapier had a problem on its side (HTTP ${res.status}). Try again in a minute.`, "unavailable", res.status);
  }
  if (notify) {
    await res.body?.cancel().catch(() => {});
    return undefined;
  }
  const type = res.headers.get("content-type") ?? "";
  let messages: RpcMessage[];
  try {
    if (/text\/event-stream/i.test(type)) messages = eventsIn(await bounded(res, (t) => eventsIn(t).some((m) => m.id === id)));
    else {
      const v = JSON.parse(await bounded(res)) as RpcMessage | RpcMessage[];
      messages = Array.isArray(v) ? v : [v];
    }
  } catch (e) {
    if (e instanceof ZapierError) throw e;
    if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") throw new ZapierError(`Zapier took too long to answer (over ${Math.round(ms / 1000)} seconds). Try again in a minute.`, "unavailable");
    throw new ZapierError("Zapier answered with something Bops can't read. Try again in a minute.", "unavailable");
  }
  const mine = messages.find((m) => m && m.id === id && (m.result !== undefined || m.error));
  if (!mine) throw new ZapierError("Zapier answered without a result. Try again in a minute.", "unavailable");
  if (mine.error) throw new ZapierError(`Zapier said no: ${clip(scrub(String(mine.error.message ?? "an error")).replace(/\s+/g, " "), 200)}`, "unavailable");
  return mine.result;
}

/** Start a session (initialize, then notifications/initialized), once per address until it ends. */
async function ready() {
  current();
  live.ready ??= (async () => {
    delete live.sessionId;
    const r = (await post("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "bops", version: "1" } }, zapierTiming.initMs)) as { protocolVersion?: unknown } | undefined;
    live.protocol = typeof r?.protocolVersion === "string" && /^[\w.-]{1,40}$/.test(r.protocolVersion) ? r.protocolVersion : PROTOCOL;
    await post("notifications/initialized", undefined, zapierTiming.initMs, true);
  })();
  try {
    await live.ready;
  } catch (e) {
    delete live.ready;
    throw e;
  }
}

/** A request in the session; a session that ended (404) is started again, once. */
async function request(method: string, params: Record<string, unknown>, ms: number) {
  await ready();
  try {
    return await post(method, params, ms);
  } catch (e) {
    if (!(e instanceof ZapierError) || e.status !== 404 || e.message !== "Zapier's session ended.") throw e;
    delete live.ready;
    delete live.sessionId;
    await ready();
    return post(method, params, ms);
  }
}

/** The name a tool goes by in the chat: zapier_ and Zapier's name, in the letters tools may have, at most 64. */
function chatName(name: string, taken: Set<string>) {
  let n = `${ZAPIER_PREFIX}${name.replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 64);
  if (taken.has(n)) n = `${n.slice(0, 55)}_${createHash("sha256").update(name).digest("hex").slice(0, 8)}`;
  taken.add(n);
  return n;
}

/** Every action on the server (tools/list, page by page), kept for a few minutes. `fresh`: ask again now. */
export async function zapierActions(opts: { fresh?: boolean } = {}): Promise<Known[]> {
  current();
  if (!opts.fresh && live.tools && Date.now() - live.tools.at < zapierTiming.cacheMs) return live.tools.list;
  if (!opts.fresh && live.loading) return live.loading;
  const loading = (async () => {
    const all: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = (await request("tools/list", cursor ? { cursor } : {}, zapierTiming.listMs)) as { tools?: unknown; nextCursor?: unknown } | undefined;
      for (const t of Array.isArray(r?.tools) ? r.tools : []) if (t && typeof t === "object" && typeof (t as McpTool).name === "string" && (t as McpTool).name) all.push(t as McpTool);
      cursor = typeof r?.nextCursor === "string" && r.nextCursor ? r.nextCursor : undefined;
      if (!cursor) break;
    }
    const taken = new Set<string>();
    const list = all.slice(0, MAX_TOOLS).map((tool) => ({ tool, name: chatName(tool.name, taken), readOnly: tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true }));
    live.tools = { at: Date.now(), list };
    return list;
  })();
  live.loading = loading;
  try {
    return await loading;
  } finally {
    if (live.loading === loading) delete live.loading;
  }
}

/** A schema the providers take: an object, at most 20,000 characters, without $schema; else any object. */
export function zapierSchema(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || (input as { type?: unknown }).type !== "object") return { type: "object", properties: {}, additionalProperties: true };
  const { $schema: _drop, ...rest } = input as Record<string, unknown>;
  void _drop;
  return JSON.stringify(rest).length > 20_000 ? { type: "object", properties: {}, additionalProperties: true } : { properties: {}, ...rest };
}

/** What an MCP tool result says, as text. */
function textOfResult(r: unknown): { text: string; error: boolean } {
  const x = (r ?? {}) as { content?: unknown; structuredContent?: unknown; isError?: unknown };
  const parts: string[] = [];
  for (const c of Array.isArray(x.content) ? x.content : []) {
    const p = c as { type?: string; text?: unknown; resource?: { text?: unknown; uri?: unknown }; uri?: unknown; name?: unknown };
    if (p.type === "text" && typeof p.text === "string") parts.push(p.text);
    else if (p.type === "resource" && p.resource) parts.push(typeof p.resource.text === "string" ? p.resource.text : `[a file: ${String(p.resource.uri ?? "")}]`);
    else if (p.type === "resource_link") parts.push(`[a link: ${String(p.name ?? p.uri ?? "")}]`);
    else if (p.type === "image" || p.type === "audio") parts.push(`[${p.type === "image" ? "an image" : "audio"} that can't be shown here]`);
  }
  if (!parts.length && x.structuredContent !== undefined) parts.push(JSON.stringify(x.structuredContent));
  return { text: parts.join("\n") || "(nothing)", error: x.isError === true };
}

/** Call one action by Zapier's own name: what it answered, as text without the secret, and whether it's an error. Nothing asked here: zapier-chat.ts does that. */
export async function callZapier(name: string, args: Record<string, unknown>): Promise<{ text: string; error: boolean }> {
  const r = textOfResult(await request("tools/call", { name, arguments: args }, zapierTiming.callMs));
  return { text: scrub(r.text), error: r.error };
}

/** Zapier's description of an action, without the secret. */
export const zapierText = (s: string) => scrub(s);

/** Settings' Check: a new session and the action list. Only after the owner presses Check. Never the address or what Zapier said. */
export async function checkZapier(): Promise<{ status: "not set" | "works" | "invalid" | "unavailable" | "rate limited"; message: string }> {
  if (!zapierSet()) return { status: "not set", message: "ZAPIER_MCP_URL isn't set in the running server's environment." };
  if (!zapierOn()) return { status: "invalid", message: "ZAPIER_MCP_URL must be an https address on zapier.com. Copy the server URL from mcp.zapier.com." };
  try {
    delete live.ready;
    delete live.sessionId;
    const n = (await zapierActions({ fresh: true })).length;
    return n ? { status: "works", message: `Zapier answered with ${n} action${n === 1 ? "" : "s"} your bots can use in your chats.` } : { status: "works", message: "Zapier answered, but your server has no actions yet. Add some at mcp.zapier.com." };
  } catch (e) {
    const z = e instanceof ZapierError ? e : new ZapierError("The check could not reach Zapier.", "unavailable");
    return { status: z.kind === "not set" ? "not set" : z.kind, message: z.message };
  }
}

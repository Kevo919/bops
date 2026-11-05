import "server-only";
import { createHash } from "node:crypto";

/**
 * A narrow remote MCP client, shared by the connections that reach an MCP server over the internet: Zapier
 * (zapier.ts) and Composio, your account (composio-mcp.ts). Not a general MCP client: it speaks only MCP's
 * Streamable HTTP transport (JSON-RPC over POST, answered as JSON or as server-sent events), and only to the one
 * address its connection allows (each connection checks the address itself: https, its own host, no user or port).
 *
 * What is secret (an address with a token in it, a key in a header) stays in this server's .env.local: it is never
 * put in the state, a log, a tool's output, the window or a bot's computer. Errors are Bops' own words, and anything
 * the server says is scrubbed of every secret the connection names. Redirects are refused, so a secret can't be
 * sent on anywhere else.
 *
 * This file is the connection only (no state, no store, no asking): each connection's chat file offers the tools
 * and asks the owner first.
 */

const PROTOCOL = "2025-06-18";
const MAX_TOOLS = 80;
const MAX_PAGES = 20;
export const MCP_OUTPUT_MAX = 14_000;
export const mcpClip = (s: string, n = MCP_OUTPUT_MAX) => (s.length > n ? `${s.slice(0, n)}… (cut short)` : s);

export type McpErrorKind = "invalid" | "unavailable" | "rate limited" | "not set";

/** The server's no, in plain words. `status`: the HTTP status, when it answered. */
export class RemoteMcpError extends Error {
  readonly status?: number;
  readonly kind: McpErrorKind;
  constructor(message: string, kind: McpErrorKind, status?: number) {
    super(message);
    this.name = "RemoteMcpError";
    this.kind = kind;
    this.status = status;
  }
}

export type McpTool = { name: string; title?: string; description?: string; inputSchema?: unknown; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string } };
export type McpAction = { tool: McpTool; name: string; readOnly: boolean };

/** What a connection says in its own words (its name, where to fix it). Statuses are HTTP statuses. */
export type McpWords = {
  /** The address isn't set at all. */
  notSet: string;
  /** The address (or its key) is set but refused (not https, wrong host). */
  badAddress: string | (() => string);
  /** 401 or 403. */
  turnedDown: (status: number) => string;
  /** 404 outside a session. */
  unknown: string;
  /** 429. */
  busy: string;
  /** 405, 406 or 415. */
  notMcp: string;
};

export type RemoteMcpConfig = {
  /** Its name, in Bops' words ("Zapier"). */
  name: string;
  /** What its tools are called in the chat: prefix + the server's name. */
  prefix: string;
  /** The address, if it's one Bops will send the secret to; null otherwise (checked before anything is sent). */
  url: () => URL | null;
  /** Whether anything is set for it at all (it may still be refused). */
  set: () => boolean;
  /** Extra headers each request carries (a key). Never logged. */
  headers?: () => Record<string, string>;
  /** Every secret string to scrub from what the server says (an address, its path, a key). Short ones are ignored. */
  secrets: () => (string | undefined)[];
  /** How a tool is judged read only, if not by the server's own readOnlyHint (and not destructiveHint). */
  readOnly?: (tool: McpTool) => boolean;
  words: McpWords;
};

type Live = { key?: string; sessionId?: string; protocol?: string; ready?: Promise<void>; tools?: { at: number; list: McpAction[] }; loading?: Promise<McpAction[]>; nextId: number };
type RpcMessage = { jsonrpc?: string; id?: number | string | null; result?: unknown; error?: { code?: number; message?: string } };

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

/** A schema the providers take: an object, at most 20,000 characters, without $schema; else any object. */
export function mcpSchema(input: unknown): Record<string, unknown> {
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

/** One connection's client: its own session, kept on globalThis under `id` so a reload doesn't start a second. */
export function remoteMcp(id: string, cfg: RemoteMcpConfig) {
  const g = globalThis as unknown as Record<string, Live | undefined>;
  const slot = `__bopsMcp_${id}`;
  const live: Live = (g[slot] ??= { nextId: 1 });
  /** How long each kind of request may take, how long the tool list is kept, and the most read of one answer. For tests to shorten. */
  const timing = { initMs: 15_000, listMs: 15_000, callMs: 60_000, cacheMs: 5 * 60_000, maxBytes: 2_000_000 };
  const N = cfg.name;
  const badAddress = () => (typeof cfg.words.badAddress === "function" ? cfg.words.badAddress() : cfg.words.badAddress);

  const forget = () => {
    for (const k of Object.keys(live) as (keyof Live)[]) if (k !== "nextId") delete live[k];
  };

  /** What the server said, without any secret. */
  const scrub = (text: string) => {
    let out = text;
    const secrets = cfg.secrets().filter((x): x is string => !!x && x.length >= 8);
    for (const s of secrets.sort((a, b) => b.length - a.length)) out = out.split(s).join("…");
    return out;
  };

  /** Which address (and key) the session is for, as a hash (neither is kept). A new one starts over. */
  const current = (): URL => {
    const u = cfg.url();
    if (!u) throw new RemoteMcpError(cfg.set() ? badAddress() : cfg.words.notSet, cfg.set() ? "invalid" : "not set");
    const key = createHash("sha256").update(u.href).update("\0").update(JSON.stringify(cfg.headers?.() ?? {})).digest("hex");
    if (live.key !== key) {
      forget();
      live.key = key;
    }
    return u;
  };

  /** Read at most maxBytes of a body. */
  const bounded = async (res: Response, until?: (soFar: string) => boolean): Promise<string> => {
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
        if (size > timing.maxBytes) throw new RemoteMcpError(`${N}'s answer was too big to read.`, "unavailable");
        text += decoder.decode(next.value, { stream: true });
        if (until?.(text)) break;
      }
      return text + decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
    }
  };

  const ENDED = `${N}'s session ended.`;
  const tooLong = (ms: number) => new RemoteMcpError(`${N} took too long to answer (over ${Math.round(ms / 1000)} seconds). Try again in a minute.`, "unavailable");

  /** One POST to the server: a request (`id`), answered with its result, or a notification (no id), answered with nothing. */
  const post = async (method: string, params: Record<string, unknown> | undefined, ms: number, notify = false): Promise<unknown> => {
    const url = current();
    const id = notify ? undefined : live.nextId++;
    const headers: Record<string, string> = { ...(cfg.headers?.() ?? {}), "content-type": "application/json", accept: "application/json, text/event-stream" };
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
      if (name === "TimeoutError" || name === "AbortError") throw tooLong(ms);
      throw new RemoteMcpError(`Couldn't reach ${N}: check this server's internet connection, then try again.`, "unavailable");
    }
    if (res.headers.get("mcp-session-id") && method === "initialize") live.sessionId = res.headers.get("mcp-session-id")!.slice(0, 200);
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      if (res.status === 404 && live.sessionId && method !== "initialize") throw new RemoteMcpError(ENDED, "unavailable", 404);
      if (res.status === 401 || res.status === 403) throw new RemoteMcpError(cfg.words.turnedDown(res.status), "invalid", res.status);
      if (res.status === 404) throw new RemoteMcpError(cfg.words.unknown, "invalid", 404);
      if (res.status === 429) throw new RemoteMcpError(cfg.words.busy, "rate limited", 429);
      if (res.status === 405 || res.status === 406 || res.status === 415) throw new RemoteMcpError(cfg.words.notMcp, "invalid", res.status);
      throw new RemoteMcpError(`${N} had a problem on its side (HTTP ${res.status}). Try again in a minute.`, "unavailable", res.status);
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
      if (e instanceof RemoteMcpError) throw e;
      if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") throw tooLong(ms);
      throw new RemoteMcpError(`${N} answered with something Bops can't read. Try again in a minute.`, "unavailable");
    }
    const mine = messages.find((m) => m && m.id === id && (m.result !== undefined || m.error));
    if (!mine) throw new RemoteMcpError(`${N} answered without a result. Try again in a minute.`, "unavailable");
    if (mine.error) throw new RemoteMcpError(`${N} said no: ${mcpClip(scrub(String(mine.error.message ?? "an error")).replace(/\s+/g, " "), 200)}`, "unavailable");
    return mine.result;
  };

  /** Start a session (initialize, then notifications/initialized), once per address until it ends. */
  const ready = async () => {
    current();
    live.ready ??= (async () => {
      delete live.sessionId;
      const r = (await post("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "bops", version: "1" } }, timing.initMs)) as { protocolVersion?: unknown } | undefined;
      live.protocol = typeof r?.protocolVersion === "string" && /^[\w.-]{1,40}$/.test(r.protocolVersion) ? r.protocolVersion : PROTOCOL;
      await post("notifications/initialized", undefined, timing.initMs, true);
    })();
    try {
      await live.ready;
    } catch (e) {
      delete live.ready;
      throw e;
    }
  };

  /** A request in the session; a session that ended (404) is started again, once. */
  const request = async (method: string, params: Record<string, unknown>, ms: number) => {
    await ready();
    try {
      return await post(method, params, ms);
    } catch (e) {
      if (!(e instanceof RemoteMcpError) || e.status !== 404 || e.message !== ENDED) throw e;
      delete live.ready;
      delete live.sessionId;
      await ready();
      return post(method, params, ms);
    }
  };

  /** The name a tool goes by in the chat: the prefix and the server's name, in the letters tools may have, at most 64. */
  const chatName = (name: string, taken: Set<string>) => {
    let n = `${cfg.prefix}${name.replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 64);
    if (taken.has(n)) n = `${n.slice(0, 55)}_${createHash("sha256").update(name).digest("hex").slice(0, 8)}`;
    taken.add(n);
    return n;
  };

  const judged = (tool: McpTool) => tool.annotations?.destructiveHint !== true && (tool.annotations?.readOnlyHint === true || !!cfg.readOnly?.(tool));

  /** Every tool on the server (tools/list, page by page), kept for a few minutes. `fresh`: ask again now. */
  const actions = async (opts: { fresh?: boolean } = {}): Promise<McpAction[]> => {
    current();
    if (!opts.fresh && live.tools && Date.now() - live.tools.at < timing.cacheMs) return live.tools.list;
    if (!opts.fresh && live.loading) return live.loading;
    const loading = (async () => {
      const all: McpTool[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = (await request("tools/list", cursor ? { cursor } : {}, timing.listMs)) as { tools?: unknown; nextCursor?: unknown } | undefined;
        for (const t of Array.isArray(r?.tools) ? r.tools : []) if (t && typeof t === "object" && typeof (t as McpTool).name === "string" && (t as McpTool).name) all.push(t as McpTool);
        cursor = typeof r?.nextCursor === "string" && r.nextCursor ? r.nextCursor : undefined;
        if (!cursor) break;
      }
      const taken = new Set<string>();
      const list = all.slice(0, MAX_TOOLS).map((tool) => ({ tool, name: chatName(tool.name, taken), readOnly: judged(tool) }));
      live.tools = { at: Date.now(), list };
      return list;
    })();
    live.loading = loading;
    try {
      return await loading;
    } finally {
      if (live.loading === loading) delete live.loading;
    }
  };

  /** Call one tool by the server's own name: what it answered, as text without any secret, and whether it's an error. Nothing asked here. */
  const call = async (name: string, args: Record<string, unknown>): Promise<{ text: string; error: boolean }> => {
    const r = textOfResult(await request("tools/call", { name, arguments: args }, timing.callMs));
    return { text: scrub(r.text), error: r.error };
  };

  /** A fresh session and the tool list, for Settings' Check: only after the owner presses Check. */
  const freshList = async () => {
    delete live.ready;
    delete live.sessionId;
    return actions({ fresh: true });
  };

  return { timing, forget, scrub, actions, call, freshList, on: () => !!cfg.url(), set: cfg.set };
}

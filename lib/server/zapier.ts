import "server-only";
import { mcpClip, mcpSchema, MCP_OUTPUT_MAX, RemoteMcpError, remoteMcp, type McpAction } from "./remote-mcp";

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
 * This file is the connection only (no state, no store), on the shared remote MCP client (remote-mcp.ts):
 * zapier-chat.ts offers the actions to the chat and asks.
 *
 * Who gets it: the owner's own turns in the Bops app (zapier-chat.ts zapierForTurn), not a member's, a channel's
 * (Telegram, Discord, Slack), a text's, an email's, a routine's run, or a turn someone outside Bops started; and
 * not the bots' cloud computers in this version. Every action that could change something (all of them, unless
 * Zapier marks it readOnlyHint) asks the owner first through Bops' usual request (NeedsOk), like use_app. What
 * Zapier answers is information from outside Bops, never instructions, and cut to a size.
 */

export const ZAPIER_PREFIX = "zapier_";
export const ZAPIER_OUTPUT_MAX = MCP_OUTPUT_MAX;
export const zapierClip = mcpClip;

/** Zapier's no, in plain words (the shared client's error). */
export const ZapierError = RemoteMcpError;
export type ZapierError = RemoteMcpError;

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

/** The secrets: the whole address, its path and its query (and their long parts). */
function secrets() {
  const raw = process.env.ZAPIER_MCP_URL?.trim();
  const u = zapierUrl();
  return [raw, u?.href, u ? u.pathname + u.search : undefined, u?.search.slice(1), ...(u ? [...u.searchParams.values()] : []), ...(u ? u.pathname.split("/").filter((p) => p.length >= 16) : [])];
}

const client = remoteMcp("zapier", {
  name: "Zapier",
  prefix: ZAPIER_PREFIX,
  url: () => zapierUrl(),
  set: zapierSet,
  secrets,
  words: {
    notSet: "Zapier isn't connected: add ZAPIER_MCP_URL to .env.local, then restart Bops.",
    badAddress: "ZAPIER_MCP_URL in .env.local isn't a Zapier MCP address: it must start with https:// and be on zapier.com (copy it from mcp.zapier.com).",
    turnedDown: () => "Zapier turned down this server address. Make a new one at mcp.zapier.com, put it in ZAPIER_MCP_URL in .env.local, then restart Bops.",
    unknown: "Zapier doesn't know this server address any more (it may have been deleted or its token changed). Copy it again from mcp.zapier.com into ZAPIER_MCP_URL.",
    busy: "Zapier is getting too many requests right now (or your plan's task limit was reached). Wait a bit and try again.",
    notMcp: "This Zapier address doesn't speak MCP over Streamable HTTP. Use the server URL mcp.zapier.com gives you for other MCP clients (it starts with https://mcp.zapier.com/).",
  },
});

/** How long each kind of request may take, how long the action list is kept, and the most read of one answer. For tests to shorten. */
export const zapierTiming = client.timing;
export type ZapierAction = McpAction;

/** For tests: forget the session and the action list. */
export const forgetZapier = client.forget;

/** Every action on the server (tools/list, page by page), kept for a few minutes. `fresh`: ask again now. */
export const zapierActions = client.actions;

/** A schema the providers take: an object, at most 20,000 characters, without $schema; else any object. */
export const zapierSchema = mcpSchema;

/** Call one action by Zapier's own name: what it answered, as text without the secret, and whether it's an error. Nothing asked here: zapier-chat.ts does that. */
export const callZapier = client.call;

/** Zapier's description of an action, without the secret. */
export const zapierText = (s: string) => client.scrub(s);

/** Settings' Check: a new session and the action list. Only after the owner presses Check. Never the address or what Zapier said. */
export async function checkZapier(): Promise<{ status: "not set" | "works" | "invalid" | "unavailable" | "rate limited"; message: string }> {
  if (!zapierSet()) return { status: "not set", message: "ZAPIER_MCP_URL isn't set in the running server's environment." };
  if (!zapierOn()) return { status: "invalid", message: "ZAPIER_MCP_URL must be an https address on zapier.com. Copy the server URL from mcp.zapier.com." };
  try {
    const n = (await client.freshList()).length;
    return n ? { status: "works", message: `Zapier answered with ${n} action${n === 1 ? "" : "s"} your bots can use in your chats.` } : { status: "works", message: "Zapier answered, but your server has no actions yet. Add some at mcp.zapier.com." };
  } catch (e) {
    const z = e instanceof RemoteMcpError ? e : new RemoteMcpError("The check could not reach Zapier.", "unavailable");
    return { status: z.kind === "not set" ? "not set" : z.kind, message: z.message };
  }
}

import "server-only";
import { mcpClip, mcpSchema, RemoteMcpError, remoteMcp, type McpAction, type McpTool } from "./remote-mcp";

/**
 * Composio, your account: the apps you connected yourself in Composio's For You area (Gmail, Google Drive…),
 * reached through For You's own MCP server, "Connect my agent". Not the same as COMPOSIO_API_KEY (composio.ts),
 * which is a Platform project's key (ak_…) and only sees the accounts connected in that project.
 *
 * What Composio's docs give (docs.composio.dev/kb/guide/consumer-project-boundaries-and-auth-selection):
 * the consumer MCP URL is https://connect.composio.dev/mcp, and an MCP client without its own sign in sends the
 * consumer key (it starts with ck_, made in For You, Settings, Sessions & API Key) as the x-consumer-api-key header.
 *
 * - COMPOSIO_MCP_URL: the address from For You, Connect my agent. Only https on connect.composio.dev, no user or
 *   other port. Anything else is refused before anything is sent.
 * - COMPOSIO_MCP_KEY: the consumer key, if Connect my agent shows one. Sent only as x-consumer-api-key, only to that
 *   address. A Platform key (ak_…) is refused here: it's COMPOSIO_API_KEY's.
 *
 * Both live only in this server's .env.local, like ZAPIER_MCP_URL: never in the state, a log, a tool's output, the
 * window (which sees only a masked form, maskedComposioMcp) or a bot's computer. The connection is the shared remote
 * MCP client (remote-mcp.ts), the same one Zapier uses; composio-mcp-chat.ts offers the tools and asks first.
 */

export const COMPOSIO_MCP_PREFIX = "mycomposio_";
/** The hosts Composio's docs give for For You's MCP server. */
export const COMPOSIO_MCP_HOSTS: readonly string[] = ["connect.composio.dev"];
export const KEY_HEADER = "x-consumer-api-key";

/**
 * Tests only: a loopback origin (http://127.0.0.1:port) a fake server listens on, honoured only when NODE_ENV is
 * "test" (a built Bops is always "production"), and only that exact origin.
 */
function testOrigin(): string | null {
  if (process.env.NODE_ENV !== "test") return null;
  const raw = process.env.BOPS_TEST_COMPOSIO_MCP_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) && !u.username && !u.password ? u.origin : null;
  } catch {
    return null;
  }
}

/** The address, if it's one Bops will send the key to: https on connect.composio.dev, no user or other port. */
export function composioMcpUrl(raw: string | undefined = process.env.COMPOSIO_MCP_URL): URL | null {
  const s = raw?.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const test = testOrigin();
  if (test && u.origin === test) {
    u.hash = "";
    return u;
  }
  if (u.protocol !== "https:" || (u.port && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!COMPOSIO_MCP_HOSTS.includes(host)) return null;
  u.hash = "";
  return u;
}

/** The key's problem, in plain words, or null when it's usable (or not set: it's optional). */
export function composioMcpKeyProblem(raw: string | undefined = process.env.COMPOSIO_MCP_KEY): string | null {
  const k = raw?.trim();
  if (!k) return null;
  if (/^ak_/i.test(k)) return "COMPOSIO_MCP_KEY is a Platform project key (it starts with ak_). For You uses its own key: in Composio, open For You, then Settings, Sessions & API Key, and copy the key that starts with ck_.";
  if (k.length > 512 || !/^[\x21-\x7e]+$/.test(k)) return "COMPOSIO_MCP_KEY doesn't look like a key: copy it again from For You, Connect my agent, as one line with no spaces.";
  return null;
}

const key = () => process.env.COMPOSIO_MCP_KEY?.trim() || undefined;
/** Whether anything is set for it (it may still be refused: composioMcpOn). */
export const composioMcpSet = () => !!process.env.COMPOSIO_MCP_URL?.trim() || !!key();
/** Whether it can be used here: a usable address, and no unusable key. */
export const composioMcpOn = () => !!composioMcpUrl() && !composioMcpKeyProblem();

function secrets() {
  const raw = process.env.COMPOSIO_MCP_URL?.trim();
  const u = composioMcpUrl();
  return [key(), raw, u?.href, u && u.pathname !== "/mcp" ? u.pathname + u.search : undefined, u?.search.slice(1), ...(u ? [...u.searchParams.values()] : []), ...(u ? u.pathname.split("/").filter((p) => p.length >= 16) : [])];
}

/** The window's view of what is set: the host, never the rest of the address or any of the key. */
export function maskedComposioMcp(): string | undefined {
  if (!composioMcpSet()) return undefined;
  const u = composioMcpUrl();
  const where = u ? `${u.host}${u.pathname === "/mcp" && !u.search ? "/mcp" : "/•••"}` : process.env.COMPOSIO_MCP_URL?.trim() ? "an address Bops won't use" : "no address yet";
  const k = key();
  return k ? `${where}, key ${/^ck_/i.test(k) ? "ck_" : ""}•••••••• saved` : `${where}, no key`;
}

/* ---------------- What reads, and what asks ---------------- */

/** For You's own tools (Composio's meta tools): which only read, which run other tools, which always ask. */
export const META = {
  reads: new Set(["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS"]),
  runs: "COMPOSIO_MULTI_EXECUTE_TOOL",
  /** Code in Composio's sandbox, and changing your connections: anything could happen, so always ask. */
  asks: new Set(["COMPOSIO_REMOTE_WORKBENCH", "COMPOSIO_REMOTE_BASH_TOOL", "COMPOSIO_MANAGE_CONNECTIONS"]),
};

const CHANGES = new Set(
  "SEND REPLY FORWARD POST CREATE ADD INSERT NEW UPDATE EDIT MODIFY PATCH PUT SET CHANGE RENAME REPLACE MOVE COPY DELETE REMOVE TRASH UNTRASH DESTROY CLEAR PURGE ARCHIVE UNARCHIVE UPLOAD SHARE UNSHARE INVITE PAY PAYMENT CHARGE REFUND TRANSFER PURCHASE BUY ORDER SUBSCRIBE UNSUBSCRIBE CANCEL APPROVE REJECT PUBLISH SCHEDULE DRAFT MARK STAR UNSTAR LABEL TAG ASSIGN EXECUTE RUN TRIGGER START STOP ENABLE DISABLE ACCEPT DECLINE BATCH IMPORT MERGE".split(" "),
);
const READS = new Set("GET LIST FETCH SEARCH FIND READ QUERY LOOKUP RETRIEVE VIEW DOWNLOAD DESCRIBE COUNT".split(" "));

/** A Composio action's slug (GMAIL_FETCH_EMAILS) only reads when it says so and says nothing that changes things. */
export function slugReads(slug: string): boolean {
  const words = slug.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (words.some((w) => CHANGES.has(w))) return false;
  return words.some((w) => READS.has(w));
}

/** Every action slug a COMPOSIO_MULTI_EXECUTE_TOOL call names (tools[].tool_slug, wherever it is put). */
export function slugsIn(args: unknown, depth = 0): string[] {
  if (depth > 5 || !args || typeof args !== "object") return [];
  if (Array.isArray(args)) return args.flatMap((x) => slugsIn(x, depth + 1));
  const out: string[] = [];
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if ((k === "tool_slug" || k === "slug") && typeof v === "string" && v) out.push(v);
    else if (v && typeof v === "object") out.push(...slugsIn(v, depth + 1));
  }
  return out;
}

/** What a call does, for the ask: the slugs it runs, or the tool's own name. Empty slugs on a run: ask. */
export function judgeCall(tool: McpTool, args: Record<string, unknown>): { reads: boolean; slugs: string[] } {
  const n = tool.name.toUpperCase();
  if (META.asks.has(n)) return { reads: false, slugs: [] };
  if (n === META.runs) {
    const slugs = slugsIn(args);
    return { reads: slugs.length > 0 && slugs.every(slugReads), slugs };
  }
  if (META.reads.has(n)) return { reads: true, slugs: [] };
  if (tool.annotations?.destructiveHint === true) return { reads: false, slugs: [] };
  return { reads: tool.annotations?.readOnlyHint === true || slugReads(n), slugs: [] };
}

/* ---------------- The connection ---------------- */

const turnedDown = () =>
  key()
    ? "Composio turned down the key in COMPOSIO_MCP_KEY. It may have been made new: in Composio, open For You, then Settings, Sessions & API Key, copy the key again into .env.local, then restart Bops."
    : "Composio wants your key for this address: in Composio, open For You, then Connect my agent, copy the key (it starts with ck_) and put it in .env.local as COMPOSIO_MCP_KEY=the_key, then restart Bops.";

const client = remoteMcp("composio-mcp", {
  name: "Composio",
  prefix: COMPOSIO_MCP_PREFIX,
  url: () => (composioMcpKeyProblem() ? null : composioMcpUrl()),
  set: composioMcpSet,
  headers: (): Record<string, string> => {
    const k = key();
    return k ? { [KEY_HEADER]: k } : {};
  },
  secrets,
  readOnly: (tool) => {
    const n = tool.name.toUpperCase();
    return !META.asks.has(n) && n !== META.runs && (META.reads.has(n) || slugReads(n));
  },
  words: {
    notSet: "Composio (your account) isn't connected: put COMPOSIO_MCP_URL in .env.local, then restart Bops.",
    badAddress: () =>
      composioMcpKeyProblem() ??
      (process.env.COMPOSIO_MCP_URL?.trim()
        ? "COMPOSIO_MCP_URL in .env.local isn't Composio's For You address: it must start with https:// and be on connect.composio.dev. In Composio, open For You, then Connect my agent, and copy the address again."
        : "COMPOSIO_MCP_KEY is set but COMPOSIO_MCP_URL isn't: in Composio, open For You, then Connect my agent, copy the address and put it in .env.local as COMPOSIO_MCP_URL=the_address."),
    turnedDown,
    unknown: "Composio doesn't know this address. In Composio, open For You, then Connect my agent, and copy the address again into COMPOSIO_MCP_URL.",
    busy: "Composio is getting too many requests right now (or your plan's limit was reached). Wait a bit and try again.",
    notMcp: "This address doesn't answer as an MCP server. In Composio, open For You, then Connect my agent, and copy the address it gives for other MCP clients (it starts with https://connect.composio.dev/).",
  },
});

export const composioMcpTiming = client.timing;
export const forgetComposioMcp = client.forget;
export const composioMcpActions = client.actions;
export const callComposioMcp = client.call;
export const composioMcpText = (s: string) => client.scrub(s);
export const composioMcpSchema = mcpSchema;
export const composioMcpClip = mcpClip;
export const ComposioMcpError = RemoteMcpError;
export type ComposioMcpAction = McpAction;

/** COMPOSIO_SEARCH_TOOLS → "search tools"; GMAIL_FETCH_EMAILS → "Gmail fetch emails". */
const APP_NAMES: Record<string, string> = { GMAIL: "Gmail", GOOGLEDRIVE: "Google Drive", GOOGLECALENDAR: "Google Calendar", GOOGLESHEETS: "Google Sheets", GOOGLEDOCS: "Google Docs", SLACK: "Slack", NOTION: "Notion", OUTLOOK: "Outlook", GITHUB: "GitHub" };
export function plainName(name: string) {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words[0]?.toUpperCase() === "COMPOSIO") words.shift();
  const app = APP_NAMES[words[0]?.toUpperCase() ?? ""];
  return [app, ...(app ? words.slice(1) : words).map((w) => w.toLowerCase())].filter(Boolean).join(" ");
}

/** Settings' Check: a fresh session and the tool list, in plain words. Never the address, the key or what Composio said. */
export async function checkComposioMcp(): Promise<{ status: "not set" | "works" | "invalid" | "unavailable" | "rate limited"; message: string }> {
  if (!composioMcpSet()) return { status: "not set", message: "COMPOSIO_MCP_URL isn't set in the running server's environment." };
  const bad = composioMcpKeyProblem();
  if (bad) return { status: "invalid", message: bad };
  if (!composioMcpUrl()) return { status: "invalid", message: process.env.COMPOSIO_MCP_URL?.trim() ? "COMPOSIO_MCP_URL must be an https address on connect.composio.dev. In Composio, open For You, then Connect my agent, and copy the address." : "COMPOSIO_MCP_URL isn't set: in Composio, open For You, then Connect my agent, and copy the address." };
  try {
    const list = await client.freshList();
    if (!list.length) return { status: "works", message: "Composio answered, but nothing is connected yet. In Composio, open For You, then Connect Apps, and connect Gmail or another app." };
    const meta = list.filter((k) => k.tool.name.toUpperCase().startsWith("COMPOSIO_"));
    const apps = [...new Set(list.filter((k) => !meta.includes(k)).map((k) => plainName(k.tool.name).split(" ")[0]))];
    const shown = (xs: string[]) => (xs.length > 8 ? `${xs.slice(0, 8).join(", ")} and ${xs.length - 8} more` : xs.join(", "));
    const parts = [
      apps.length ? `apps: ${shown(apps)}` : "",
      meta.length ? `${meta.length === 1 ? "a tool" : `${meta.length} tools`} to find and use your connected apps (${shown(meta.map((k) => plainName(k.tool.name)))})` : "",
    ].filter(Boolean);
    return { status: "works", message: `Composio answered with ${list.length} tool${list.length === 1 ? "" : "s"}: ${parts.join("; ")}. Your bots can use them in your own chats; anything that sends, changes, deletes or pays asks you first.` };
  } catch (e) {
    const z = e instanceof RemoteMcpError ? e : new RemoteMcpError("The check could not reach Composio.", "unavailable");
    return { status: z.kind === "not set" ? "not set" : z.kind, message: z.message };
  }
}

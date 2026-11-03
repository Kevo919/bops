import { notReady } from "@/lib/server/ready";
import { describeServers } from "@/lib/server/mcp";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";

export const dynamic = "force-dynamic";

/*
 * The MCP servers the config names (lib/server/mcp.ts, config/bops.yaml `mcp: servers:`), for the
 * editor on a bot's settings page (which of them are that bot's own is saved through /api/bots, like
 * its other settings). Nothing secret here: a server's keys appear as NAMES, their values stay in
 * .env.local. The Bops window alone may read this (a paired phone or a bot's Chrome can't); on a
 * REQUIRE_REMOTE server, the paired phone.
 */
const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);

/** The servers the config names, each with what the editor shows (command, args, key names, chat-only). */
export async function GET(request: Request) {
  if (!allowed(request)) return Response.json({ error: "The MCP servers can only be seen in the Bops app." }, { status: 403 });
  const unready = notReady();
  if (unready) return unready;
  return Response.json({ servers: describeServers() });
}

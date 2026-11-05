import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Who may call Bops' API. The server answers on every address the Mac has, but only the app on this
 * Mac may drive it: anyone else on the same wifi could otherwise sign it out and back in to their own
 * Orgo account, and any web page in the user's browser could post to it.
 *
 * - A request addressed to another host (a LAN or tailnet address, or a DNS-rebound name) may only
 *   reach the paths the tailnet calls, each of which proves itself (the bot's secret, the webhook
 *   signature): bot computers' app calls and the webhook relay (edge/).
 * - A request from a web page must come from the app's own origin.
 *
 * The Host header is the caller's to set, so this stops browsers, not a determined caller on the
 * same network. That needs the server bound to loopback, and then another way in for the tailnet
 * paths above.
 *
 * On the Mac app, only the Bops window may use the API, reads included: desktop/main.cjs gives this
 * server a token (BOPS_UI_TOKEN) and the window an httpOnly cookie with it, so every request must carry
 * it (lib/server/ui-token.ts). A page that reached this server some other way (a bot's Chrome on this
 * Mac, after a redirect) has the same origin but not the cookie, so it can neither act nor read (a bot
 * computer's VNC password, the Mac's windows, the chats). What else may come without it: the paths
 * that prove themselves (the tailnet's above, the cloud tunnel's with its own token), the app's
 * health (main.cjs asks it before the window loads), and bots' pages, read in a tab of their own or
 * the browser (made by bots, served sandboxed, nothing of the user's in them but what a bot put there).
 * A hosted server, or a dev server run outside the app, has no token, and this doesn't apply.
 *
 * A hosted server (BOPS_DATABASE_URL) is reached by its own name, so that name is the app's too:
 * BOPS_PUBLIC_HOST lists it (names, comma separated; behind a reverse proxy that rewrites Host, the
 * public name the browser uses). Without it, a hosted server takes any Host and keeps the origin check.
 */

/*
 * A paired phone (the Bops Android app, lib/server/remote.ts) carries its pairing code as the bops_remote
 * cookie (or x-bops-remote). The code's hash is in .data/remote.json, read again whenever that file
 * changes, so unpairing or pairing again locks the old code out at once. With it, a request may come
 * from any address (the phone reaches this server over Tailscale or the internet), and counts as the
 * app's own for the window check below; what only the Bops window may do still asks again in its route.
 * BOPS_REQUIRE_REMOTE=1 (a server on the internet, such as a VPS) lets nothing else in.
 */
const REMOTE_FILE = () => join(process.cwd(), ".data", "remote.json");
const remote = { mtime: -1, hash: "" };
function pairedHash() {
  try {
    const m = statSync(REMOTE_FILE()).mtimeMs;
    if (m !== remote.mtime) {
      remote.mtime = m;
      remote.hash = String((JSON.parse(readFileSync(REMOTE_FILE(), "utf8")) as { hash?: string }).hash ?? "");
    }
  } catch {
    remote.mtime = -1;
    remote.hash = "";
  }
  return remote.hash;
}
function fromPhone(request: NextRequest) {
  const want = pairedHash();
  const code = request.cookies.get("bops_remote")?.value ?? request.headers.get("x-bops-remote") ?? "";
  if (!/^[0-9a-f]{64}$/.test(want) || code.length < 32) return false;
  return timingSafeEqual(Buffer.from(createHash("sha256").update(code, "utf8").digest("hex")), Buffer.from(want));
}
const REQUIRE_REMOTE = process.env.BOPS_REQUIRE_REMOTE === "1";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TAILNET_PATHS = new Set(["/api/apps/call", "/api/phone/agentphone", "/api/phone/openai", "/api/channels/slack/events"]);
/** Handed over by Bops Cloud's tunnel (lib/server/cloud-tunnel.ts), which proves itself with its own token. */
const TUNNEL_PATHS = new Set(["/api/cloud/event"]);
const READS = new Set(["GET", "HEAD"]);
/**
 * Reads anyone on this Mac's loopback may make: the app's health, bots' pages, the page of an app a bot
 * made (its code, which may hold what the chat gave it to start with, but never what it keeps: an id of
 * 128 random bits, made-apps.ts; it loads in a session of its own that has no window token,
 * desktop/app-frames.cjs), files bots linked once the user opened them (unguessable ids), and documents a
 * bot made for the owner (docs.ts: plain Office files built by Bops' own code, served as attachments
 * with nosniff; their ids are 64 random bits, and the route itself answers 404 for anything but
 * /^docs_[a-f0-9]{16}$/). A download link is clicked as a navigation, which the shell's download
 * handler or a new tab may make without the window's cookie - same as pages and files, it must not 403.
 */
const OPEN_READS = (path: string) =>
  path === "/api/health" || path.startsWith("/api/pages/") || path.startsWith("/api/files/") || path.startsWith("/api/docs/") || /^\/api\/made-apps\/[^/]+\/view$/.test(path);

/** The window's token, from its cookie or (desktop/main.cjs's own calls) its header, the same in constant time. */
function fromWindow(request: NextRequest, want: string) {
  const got = request.cookies.get("bops_window")?.value ?? request.headers.get("x-bops-window") ?? "";
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

const hostname = (host: string) => host.replace(/:\d+$/, "").toLowerCase();

const PUBLIC = new Set(
  (process.env.BOPS_PUBLIC_HOST ?? "")
    .split(",")
    .map((h) => hostname(h.trim()))
    .filter(Boolean),
);
const HOSTED = !!process.env.BOPS_DATABASE_URL;

/** A name the app is served under: this Mac's loopback, or a hosted server's own. */
const ours = (name: string) => LOOPBACK.has(name) || PUBLIC.has(name) || (HOSTED && !PUBLIC.size);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  const phone = fromPhone(request);
  if (!phone && !ours(hostname(host)) && !TAILNET_PATHS.has(request.nextUrl.pathname)) return new NextResponse("Not allowed", { status: 403 });
  if (origin) {
    let from = "";
    try {
      from = new URL(origin).host;
    } catch {}
    // (A sandboxed page, like the ones bots make, sends "null": not the app either.)
    if (from.toLowerCase() !== host.toLowerCase() && !PUBLIC.has(hostname(from))) return new NextResponse("Not allowed", { status: 403 });
  }
  const token = process.env.BOPS_UI_TOKEN;
  const path = request.nextUrl.pathname;
  const method = request.method.toUpperCase();
  // Local CLI accounts belong to this desktop, never to a paired phone or hosted browser.
  if ((path === "/api/local-subscriptions" || path === "/api/pc-task-runner") && (!token || !LOOPBACK.has(hostname(host)) || request.headers.has("x-bops-remote") || request.cookies.has("bops_remote") || !fromWindow(request, token)))
    return NextResponse.json({ error: "Local subscriptions are only available in the desktop app." }, { status: 403 });
  // Agents you run (Settings): the owner's own agents, seen and changed from this desktop's window only, by anyone's method.
  if (path === "/api/agent-instances" && (!token || !LOOPBACK.has(hostname(host)) || request.headers.has("x-bops-remote") || request.cookies.has("bops_remote") || !fromWindow(request, token)))
    return NextResponse.json({ error: "Only the owner can see and change the agents you run, in the Bops app on this PC." }, { status: 403 });
  const open = TAILNET_PATHS.has(path) || TUNNEL_PATHS.has(path) || method === "OPTIONS" || (READS.has(method) && OPEN_READS(path));
  if (token && !open && !phone && !fromWindow(request, token)) return NextResponse.json({ error: "Only the Bops app can do that." }, { status: 403 });
  // On the internet (BOPS_REQUIRE_REMOTE=1): only the paired phone, and the paths that prove themselves. Not "this
  // machine" by its Host header, which any caller can set; a VPS pairs with scripts/pair-phone.mjs instead.
  if (REQUIRE_REMOTE && !phone && !open) return NextResponse.json({ error: "Pair this device in the Bops app first." }, { status: 401 });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };

import { cancelLocalLogin, getLocalSubscriptions, getLocalSubscriptionStatus, logoutLocalSubscription, startLocalLogin } from "@/lib/server/local-subscriptions";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import { getState } from "@/lib/server/store";
import { notReady } from "@/lib/server/ready";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function denied(request: Request) {
  const phone = request.headers.has("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
  let allowed = false;
  try { allowed = process.env.BOPS_SELF_HOSTED === "1" && !!process.env.BOPS_UI_TOKEN && !phone && !getState().shared && fromThisMac(request) && fromBopsWindow(request); } catch { /* malformed credentials fail closed */ }
  return allowed ? notReady() : Response.json({ error: "Local subscriptions are only available to the owner in the desktop app." }, { status: 403, headers });
}
export async function GET(request: Request) {
  const blocked = denied(request); if (blocked) return blocked;
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== null && kind !== "codex" && kind !== "claude") return Response.json({ error: "Choose Codex or Claude." }, { status: 400, headers });
  return Response.json({ subscriptions: kind ? [await getLocalSubscriptionStatus(kind)] : await getLocalSubscriptions() }, { headers });
}
export async function POST(request: Request) {
  const blocked = denied(request); if (blocked) return blocked;
  const body = await request.json().catch(() => null);
  if (!body || !["codex", "claude"].includes(body.kind) || !["login", "cancel", "logout"].includes(body.action)) return Response.json({ error: "Choose a subscription and supported action." }, { status: 400, headers });
  const action = body.action === "login" ? startLocalLogin : body.action === "cancel" ? cancelLocalLogin : logoutLocalSubscription;
  return Response.json({ subscription: await action(body.kind) }, { headers });
}

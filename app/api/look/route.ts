import { notReady } from "@/lib/server/ready";
import { resetLook, setLookFromSettings, undoLook } from "@/lib/server/look";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";

/**
 * How the Bops window looks, set from Settings and undone or reset from the chat's cards and Settings
 * (AppState.look, lib/server/look.ts). The whole look comes with the state itself (GET /api/state), so
 * this only changes it. Every field is checked in lib/look-theme.ts before anything is kept, whatever
 * the window sends. Only the Bops window may (a paired phone, or a bot's Chrome, can't), and only this
 * machine when there is no window; on a server that only lets in the paired phone (BOPS_REQUIRE_REMOTE=1),
 * that phone: the same rule as app/api/modules/route.ts.
 */
const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
// On a server (BOPS_REQUIRE_REMOTE=1, no window) proxy.ts lets in only the paired phone, which is the owner there.
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);

type Body = { action: "set" | "undo" | "reset"; look?: unknown; messageId?: string };

export async function POST(request: Request) {
  const unready = notReady();
  if (unready) return unready;
  if (!allowed(request)) return Response.json({ error: "The look can only be changed in the Bops app." }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as Body;
  try {
    switch (b.action) {
      case "set":
        setLookFromSettings(b.look);
        return Response.json({ ok: true });
      case "undo":
        // The last change, from a chat card (messageId) or Settings (none): both take it off the history.
        return Response.json({ ok: undoLook(typeof b.messageId === "string" && b.messageId ? b.messageId : undefined) });
      case "reset":
        resetLook(b.messageId);
        return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    // A look that didn't pass its checks (LookError) comes back as why, for the window to show.
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

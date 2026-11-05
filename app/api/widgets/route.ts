import { notReady } from "@/lib/server/ready";
import { changeLayout } from "@/lib/server/widgets";
import { getState } from "@/lib/server/store";
import { sharedForApp } from "@/lib/server/shared";
import { WidgetError } from "@/lib/widgets";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";

/**
 * The owner's widgets, pages and pinned tabs, changed from the window (AppState.look's layout,
 * lib/server/widgets.ts): adding, removing, moving and resizing a widget, a page, a tab, and using one (a
 * note typed in, a box ticked: `quiet`, kept without going onto Undo's history). Undo is the look's
 * (POST /api/look). Every change is checked in lib/widgets.ts first, whatever the window sends. Only the
 * Bops window may, as for the look (app/api/look/route.ts), and never while a workspace shared with the
 * owner is open: the widgets are their own.
 */
const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);

export async function POST(request: Request) {
  const unready = notReady();
  if (unready) return unready;
  if (!allowed(request)) return Response.json({ error: "Widgets can only be changed in the Bops app." }, { status: 403 });
  if (sharedForApp(getState())) return Response.json({ error: "Your widgets are your own: open your own workspace to change them." }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { changes?: unknown; quiet?: unknown };
  try {
    const r = changeLayout(b.changes, b.quiet === true);
    return Response.json({ ok: true, said: r.said });
  } catch (e) {
    if (e instanceof WidgetError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

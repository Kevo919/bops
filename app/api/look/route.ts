import { notReady } from "@/lib/server/ready";
import { resetLook, setLookFromSettings, undoLook } from "@/lib/server/look";

/**
 * How the Bops window looks, set from Settings and undone or reset from the chat's cards and Settings
 * (AppState.look, lib/server/look.ts). The whole look comes with the state itself (GET /api/state), so
 * this only changes it. Every field is checked in lib/look-theme.ts before anything is kept, whatever
 * the window sends.
 */
type Body = { action: "set" | "undo" | "reset"; look?: unknown; messageId?: string };

export async function POST(request: Request) {
  const unready = notReady();
  if (unready) return unready;
  const b = (await request.json().catch(() => ({}))) as Body;
  try {
    switch (b.action) {
      case "set":
        setLookFromSettings(b.look);
        return Response.json({ ok: true });
      case "undo":
        return Response.json({ ok: undoLook(b.messageId ?? "") });
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

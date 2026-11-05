import "server-only";
import { addMessage, getState } from "./store";
import { currentLook, setLook } from "./look";
import { update } from "./store";
import { applyLayoutOps, CONTENT_FIELDS, contentOnly, normalizeLayout, opFromChat, WidgetError, type LayoutContext, type WidgetLayout } from "../widgets";
import { normalizeLook } from "../look-theme";
import type { Bot } from "../types";

/**
 * The owner's widgets, pages and pinned tabs (Look.layout), changed from the window (POST /api/widgets) or
 * by a bot on the owner's own ask in the chat (chat.ts change_widgets). Kept with the look, so each change
 * goes onto the same history and the same Undo takes it back (lib/server/look.ts); every change is checked
 * in lib/widgets.ts first, and one that's wrong keeps nothing. Never a shared workspace's: the look, and
 * these with it, are the owner's own (AppState.look).
 */

/** The layout on now (Home at least). */
export const currentLayout = (): WidgetLayout => normalizeLayout(currentLook().layout);

/** The bots a change may name: the owner's own, in every workspace of theirs. */
const context = (): LayoutContext => ({ bots: getState().bots.map((b) => ({ id: b.id, name: b.name })) });

/**
 * Make the changes and keep them: onto the history (Undo takes them back), or `quiet` (what's typed into a
 * note, a box ticked, a counter pressed), in place. Throws a WidgetError saying why when one is wrong.
 */
export function changeLayout(ops: unknown, quiet = false): { layout: WidgetLayout; said: string[] } {
  // Only using a widget stays off Undo's history: anything else asked to be quiet is refused, not let through.
  if (quiet && !contentOnly(ops)) throw new WidgetError("Only typing in a note, ticking a box or counting can skip Undo. Other changes must be undoable.");
  const was = currentLayout();
  const r = applyLayoutOps(was, ops, context());
  setLook({ ...currentLook(), layout: r.layout }, quiet);
  if (quiet) keepThroughUndo(was, r.layout);
  return r;
}

/**
 * What was typed, ticked or counted is the owner's newest content, not a change to undo: it's written into every
 * look on the history that has that widget too, so an Undo of an earlier change (a widget added, a page made)
 * never takes the typing back with it.
 */
function keepThroughUndo(was: WidgetLayout, layout: WidgetLayout) {
  // The widgets whose content this change moved (they're named by kind or title in a change, so found by comparing).
  const before = new Map(was.pages.flatMap((p) => p.widgets).map((w) => [w.id, w]));
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const now = new Map(layout.pages.flatMap((p) => p.widgets).filter((w) => CONTENT_FIELDS.some((f) => !same(w[f], before.get(w.id)?.[f]))).map((w) => [w.id, w]));
  if (!now.size) return;
  update((s) => {
    for (const look of s.look?.history ?? [])
      for (const page of look.layout?.pages ?? [])
        for (const w of page.widgets ?? []) {
          const fresh = now.get(w.id);
          if (!fresh || fresh.kind !== w.kind) continue;
          for (const f of CONTENT_FIELDS) {
            if (fresh[f] === undefined) delete w[f];
            else (w as Record<string, unknown>)[f] = structuredClone(fresh[f]);
          }
        }
  });
}

/**
 * Change the widgets from the chat (change_widgets): check every change, make them all or none, and leave the
 * card the chat shows (what changed, with Undo). Answers the bot in plain words: what it did, or why nothing
 * was kept. The tool only reaches here on the owner's own turn (chat.ts keeps that gate, as for change_look).
 */
export function changeWidgetsFromChat(b: Bot, input: unknown, chatId: string): string {
  const raw = (input && typeof input === "object" ? input : {}) as { changes?: unknown; summary?: unknown };
  const was = normalizeLook(currentLook());
  let said: string[];
  try {
    // Each change by its fields' true names (lib/widgets.ts opFromChat): another name is read, an unknown one refused.
    const ops = Array.isArray(raw.changes) ? raw.changes.map(opFromChat) : [];
    said = changeLayout(ops).said;
  } catch (e) {
    if (e instanceof WidgetError) return `Not changed: ${e.message}`;
    throw e;
  }
  const what = said.join(", ");
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim().slice(0, 200) : `${what.charAt(0).toUpperCase()}${what.slice(1)}.`;
  const { layout: _layout, ...before } = was;
  void _layout;
  addMessage({ chatId, role: "system", text: `Widgets changed: ${summary}`, look: { summary, before, widgets: true } });
  return `Done: ${what}. ${b.isMain ? "The owner" : `${b.name}'s owner`} can Undo it under the reply or in Settings, Look.`;
}

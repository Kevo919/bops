import "server-only";
import { addMessage, getState, update } from "./store";
import { LOOK_HISTORY, LookError, validateLook } from "../look-theme";
import type { Bot, Look } from "../types";

/**
 * The window's look as the state keeps it (AppState.look, LookState): changed from Settings or by a
 * bot in the chat (chat.ts change_look, the owner's own turn only), each change pushed onto the last
 * twenty so it can be undone, and every field checked here before anything is kept (lib/look-theme.ts).
 */

/** The look on now: nothing set is Bops' own look, which is what Reset goes back to. */
export const currentLook = (): Look => getState().look?.current ?? {};

/** Put the next look in: what's replaced goes onto the front of the history, so Undo walks back. */
function setLook(next: Look): Look {
  update((s) => {
    const look = s.look ?? { current: {}, history: [] };
    look.history = [look.current, ...look.history].slice(0, LOOK_HISTORY);
    look.current = next;
    s.look = look;
  });
  return next;
}

/**
 * Put a change in, over what's on now: only the fields it names move (validateLook has checked them).
 * An empty change is nothing to merge and does nothing; the whole look is put back another way
 * (undoLook, resetLook), so Undo and Reset really do clear it.
 */
export function applyLook(change: Look): { now: Look; was: Look } {
  const was = currentLook();
  const now = { ...was, ...change };
  // "" clears: the accent and the custom CSS go, rather than staying as empty strings.
  if (now.accent === "") delete now.accent;
  if (now.css === "") delete now.css;
  return { now: setLook(now), was };
}

/** A look message's card, as the chat and Settings act on it. */
type LookCard = NonNullable<import("../types").Message["look"]>;

/**
 * Undo a look change by its card (the Undo button): the look goes back to exactly what the card says
 * was there before, and what's replaced goes onto the history so that can be undone back too.
 * Returns false when there's no such card to undo (already undone, or gone).
 */
export function undoLook(messageId: string): boolean {
  const m = getState().messages.find((x) => x.id === messageId);
  if (!m?.look || m.look.undone) return false;
  // The look before that change, put back whole (not merged): exactly what the card says was there.
  setLook(m.look.before);
  update((s) => {
    const again = s.messages.find((x) => x.id === messageId);
    if (again?.look) again.look.undone = true;
  });
  return true;
}

/**
 * Back to Bops' own look (the Reset button, on a card or in Settings): the whole look goes, not a
 * merge, and what's replaced is kept on the history, so even a reset comes back with the next Undo.
 * On a card, the card says it was reset.
 */
export function resetLook(messageId?: string): void {
  setLook({});
  if (!messageId) return;
  update((s) => {
    const again = s.messages.find((x) => x.id === messageId);
    if (again?.look) again.look.reset = true;
  });
}

/** What a look change says it did, for the card and for the bot to tell the owner. */
const says = (change: Look, was: Look): string => {
  const parts: string[] = [];
  if (change.theme !== undefined && change.theme !== was.theme) parts.push(`${change.theme === "system" ? "follows the system's" : change.theme} theme`);
  if (change.accent !== undefined && change.accent !== was.accent) parts.push(change.accent ? `accent ${change.accent}` : "accent back to Bops' own");
  if (change.fontScale !== undefined && change.fontScale !== was.fontScale) parts.push(`text ${Math.round(change.fontScale * 100)}%`);
  if (change.density !== undefined && change.density !== was.density) parts.push(`${change.density} spacing`);
  if (change.css !== undefined && change.css !== was.css) parts.push(change.css ? "custom CSS" : "custom CSS cleared");
  return parts.length ? parts.join(", ") : "nothing new (it was already so)";
};

/** The words the change's own summary line uses, when the bot didn't give one. */
const fallbackSummary = (change: Look, was: Look) => `New look: ${says(change, was)}.`;

/**
 * Change the look from the chat (change_look): check every field, put it in, and leave the card the
 * chat shows (what changed, with Undo and Reset). Answers the bot in plain words: what it did, or why
 * nothing was kept, so it can tell the owner honestly. The tool only reaches here on the owner's own
 * turn (chat.ts offers it nowhere else, and a lookup it wasn't offered does nothing); that gate is
 * chat.ts's to keep, this just changes the look.
 */
export function changeLookFromChat(b: Bot, input: unknown, chatId: string): string {
  let change: Look;
  try {
    change = validateLook(input);
  } catch (e) {
    if (e instanceof LookError) return `Not changed: ${e.message}`;
    throw e;
  }
  const summary = typeof (input as { summary?: unknown })?.summary === "string" && (input as { summary: string }).summary.trim() ? (input as { summary: string }).summary.trim().slice(0, 200) : fallbackSummary(change, currentLook());
  const { now, was } = applyLook(change);
  const card: LookCard = { summary, before: was };
  addMessage({ chatId, role: "system", text: `Look changed: ${summary}`, look: card });
  return `Done: ${says(change, was)}. ${b.name === "Bops" || b.isMain ? "The owner" : `${b.name}'s owner`} can Undo it under the reply, or reset the look in Settings.`;
}

/** Set the look from Settings: checked the same as the chat's changes, and applied at once. */
export function setLookFromSettings(input: unknown): { ok: true; was: Look } {
  return { ok: true, was: applyLook(validateLook(input)).was };
}

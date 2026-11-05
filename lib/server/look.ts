import "server-only";
import { addMessage, getState, update } from "./store";
import { LOOK_HISTORY, LookError, normalizeLook, normalizeLookState, validateLook } from "../look-theme";
import type { Bot, Look } from "../types";

/**
 * The window's look as the state keeps it (AppState.look, LookState): changed from Settings or by a
 * bot in the chat (chat.ts change_look, the owner's own turn only), each change pushed onto the last
 * twenty so it can be undone, and every field checked here before anything is kept (lib/look-theme.ts).
 */

/** The look on now, normalized as it's read (the state file or the cloud's copy may hold anything): nothing set is Bops' own look, which is what Reset goes back to. */
export const currentLook = (): Look => normalizeLook(getState().look?.current);

/**
 * Put the next look in: what's replaced goes onto the front of the history (at most LOOK_HISTORY), so Undo
 * walks back. `quiet`: not onto the history (what's typed into a note, a box ticked, a counter pressed:
 * using a widget, not changing the layout), so Undo still takes back the last real change.
 */
export function setLook(next: Look, quiet = false): Look {
  const clean = normalizeLook(next);
  update((s) => {
    const look = normalizeLookState(s.look);
    if (!quiet) look.history = [look.current, ...look.history].slice(0, LOOK_HISTORY);
    look.current = clean;
    s.look = look;
  });
  return clean;
}

/**
 * Put a change in, over what's on now: only the fields it names move (validateLook has checked them).
 * The whole look is put back another way (undoLook, resetLook).
 */
export function applyLook(change: Look): { now: Look; was: Look } {
  const was = currentLook();
  const now = { ...was, ...change };
  // "" clears: the accent and the custom CSS go, rather than staying as empty strings.
  if (now.accent === "") delete now.accent;
  if (now.css === "") delete now.css;
  return { now: setLook(now), was };
}

/**
 * Undo the last look change, wherever it was made (the Undo on a chat card, or in Settings): the look
 * before it comes off the front of the history and is put back, normalized, so Undo again walks back
 * one more, up to LOOK_HISTORY changes. Pressed on a card, the card says it was undone (and offers
 * nothing more). Returns false when there's nothing to undo (the history is empty, or the card is
 * already undone or gone).
 */
export function undoLook(messageId?: string): boolean {
  if (messageId) {
    const m = getState().messages.find((x) => x.id === messageId);
    if (!m?.look || m.look.undone) return false;
  }
  if (!getState().look?.history?.length) return false;
  update((s) => {
    const look = normalizeLookState(s.look);
    const [back, ...rest] = look.history;
    s.look = { current: back ?? {}, history: rest };
    if (!messageId) return;
    const again = s.messages.find((x) => x.id === messageId);
    if (again?.look) again.look.undone = true;
  });
  return true;
}

/**
 * Back to Bops' own look (the Reset button, on a card or in Settings): the whole look goes, not a
 * merge, and what it replaced goes onto the history like any change, so the next Undo brings it back.
 * On a card, the card says it was reset.
 */
export function resetLook(messageId?: string): void {
  // The widgets stay (Look.layout): Reset is for how the window looks, not what's on its pages.
  const { layout, ...look } = currentLook();
  // Already Bops' own: nothing to keep for Undo.
  if (Object.keys(look).length) setLook(layout ? { layout } : {});
  else update((s) => void (s.look = normalizeLookState(s.look)));
  if (!messageId) return;
  update((s) => {
    const again = s.messages.find((x) => x.id === messageId);
    if (again?.look) again.look.reset = true;
  });
}

/** A look message's card, as the chat and Settings act on it. */
type LookCard = NonNullable<import("../types").Message["look"]>;

/** What a look change says it did, for the card and for the bot to tell the owner. */
const says = (change: Look, was: Look): string => {
  const parts: string[] = [];
  if (change.theme !== undefined && change.theme !== was.theme) parts.push(`${change.theme === "system" ? "follows the system's" : change.theme} theme`);
  if (change.accent !== undefined && change.accent !== was.accent) parts.push(change.accent ? `accent ${change.accent}` : "accent back to Bops' own");
  if (change.fontScale !== undefined && change.fontScale !== was.fontScale) parts.push(`text ${Math.round(change.fontScale * 100)}%`);
  if (change.density !== undefined && change.density !== was.density) parts.push(`${change.density} spacing`);
  if (change.css !== undefined && change.css !== was.css) parts.push(change.css ? "custom CSS" : "custom CSS cleared");
  if (change.motion !== undefined && change.motion !== (was.motion ?? "normal")) parts.push(change.motion === "off" ? "animations off" : `${change.motion} animations`);
  if (change.motionSpeed !== undefined && change.motionSpeed !== (was.motionSpeed ?? "normal")) parts.push(`${change.motionSpeed} animation speed`);
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
  const { was } = applyLook(change);
  // The card keeps what the look was, not the widgets (a record only, and the widgets can be large).
  const { layout: _layout, ...before } = normalizeLook(was);
  void _layout;
  const card: LookCard = { summary, before };
  addMessage({ chatId, role: "system", text: `Look changed: ${summary}`, look: card });
  return `Done: ${says(change, was)}. ${b.name === "Bops" || b.isMain ? "The owner" : `${b.name}'s owner`} can Undo it under the reply or in Settings, or reset the look in Settings.`;
}

/** Set the look from Settings: checked the same as the chat's changes, and applied at once. */
export function setLookFromSettings(input: unknown): { ok: true; was: Look } {
  return { ok: true, was: applyLook(validateLook(input)).was };
}

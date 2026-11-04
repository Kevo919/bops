import "server-only";
import { getState, update } from "./store";

/**
 * What the user has in front of them in Bops right now: the chat and thread open, and whether the
 * window is in front (the app says so as it changes, and every few seconds while it's open:
 * app/api/view). A task whose thread or chat is open in the window in front is being watched, so its
 * steps run fast (routing.ts speedFor); one nobody is looking at runs at standard speed.
 *
 * The same pings say when the owner was last around, kept in the shared state (AppState.ownerSeenAt)
 * so every Bops and every runner of the user's reads one clock - a routine that runs on a computer
 * skips by what the owner's own devices said (awayOver, the routines' inactivity brake), not by one
 * process's memory. Writes are throttled to one a minute; a minute changes nothing about "gone for
 * days". A Bops whose owner has never been seen counts as present until the first sighting, so
 * catch-up runs at wake or login don't skip, and a restart changes nothing (the clock is in the state).
 */
type View = { chatId?: string; threadId?: string; focused: boolean; at: number };

let view: View | null = null;
/** A view the app hasn't confirmed for this long is stale: the window closed, or the Mac slept. */
const STALE_MS = 20_000;
/** Views and messages come every few seconds; the state hears of one at most this often. */
const WRITE_EVERY_MS = 60_000;

export function setView(v: { chatId?: string; threadId?: string; focused: boolean }) {
  // Only a window in front counts as the owner being around: the app reports its view every few seconds
  // even when hidden, locked or behind other windows, and that alone would keep the brake off forever.
  if (v.focused) markSeen();
  view = { chatId: v.chatId || undefined, threadId: v.threadId || undefined, focused: !!v.focused, at: Date.now() };
}

/** Whether the user is looking at this task now: its thread open, or the chat it runs from, in the window in front. */
export function watching(task: { id: string; chatId?: string }): boolean {
  if (!view || !view.focused || Date.now() - view.at > STALE_MS) return false;
  return view.threadId === task.id || (!view.threadId && !!task.chatId && view.chatId === task.chatId);
}

/** The owner showed up: the window said so (setView), or one of their messages arrived. `at` is for tests. */
export function markSeen(at: number = Date.now()) {
  if (at - (getState().ownerSeenAt ?? 0) < WRITE_EVERY_MS) return;
  update((s) => {
    if (at > (s.ownerSeenAt ?? 0)) s.ownerSeenAt = at;
  });
}

/** Whether the owner has been away at least this many whole days, by the shared state's clock. */
export function awayOver(days: number): boolean {
  const seen = getState().ownerSeenAt;
  // Never seen in the state: the clock starts with the first sighting, not at process start.
  const since = seen ?? Date.now();
  return Date.now() - since > days * 86_400_000;
}

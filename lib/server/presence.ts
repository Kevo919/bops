import "server-only";

/**
 * What the user has in front of them in Bops right now: the chat and thread open, and whether the
 * window is in front (the app says so as it changes, and every few seconds while it's open:
 * app/api/view). A task whose thread or chat is open in the window in front is being watched, so its
 * steps run fast (routing.ts speedFor); one nobody is looking at runs at standard speed.
 */
type View = { chatId?: string; threadId?: string; focused: boolean; at: number };

let view: View | null = null;
/** A view the app hasn't confirmed for this long is stale: the window closed, or the Mac slept. */
const STALE_MS = 20_000;

/**
 * When the owner was last around: every view the window sends, and every message of theirs, moves it
 * (markSeen). Starts at this process's start, so a restart gives the brake its days to count again
 * rather than skipping everything at once. The routines' inactivity brake reads it (awayOver).
 */
let lastSeenAt = Date.now();

/** The owner showed up: the window said so (setView), or one of their messages arrived. `at` is for tests. */
export function markSeen(at: number = Date.now()) {
  lastSeenAt = at;
}

/** Whether the owner has been away at least this many whole days. */
export function awayOver(days: number): boolean {
  return Date.now() - lastSeenAt > days * 86_400_000;
}

export function setView(v: { chatId?: string; threadId?: string; focused: boolean }) {
  markSeen();
  view = { chatId: v.chatId || undefined, threadId: v.threadId || undefined, focused: !!v.focused, at: Date.now() };
}

/** Whether the user is looking at this task now: its thread open, or the chat it runs from, in the window in front. */
export function watching(task: { id: string; chatId?: string }): boolean {
  if (!view || !view.focused || Date.now() - view.at > STALE_MS) return false;
  return view.threadId === task.id || (!view.threadId && !!task.chatId && view.chatId === task.chatId);
}

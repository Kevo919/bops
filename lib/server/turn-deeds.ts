import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What one chat turn's own tools sent, keyed by the turn's id and carried through everything a tool awaits
 * (chat.ts lookup): an email or a text that went out while turn T's tool ran is T's, never another bot's or another
 * turn's that happens to be running in the same moment. Not by time, and not by a count of the whole state.
 *
 * An inner turn started from inside a tool (a teammate asked) runs its own tools under its own id, so what they send
 * is that turn's. No imports, so store.ts takes it without a cycle.
 */
type Deeds = { turn: string; sent: number };

const als = new AsyncLocalStorage<Deeds>();

/** Run `fn` as a tool of turn `turn`; `deeds.sent` is how many messages it sent out (noteSentOut). */
export function deedsOf<T>(turn: string, fn: () => Promise<T>): { deeds: Deeds; run: Promise<T> } {
  const deeds: Deeds = { turn, sent: 0 };
  return { deeds, run: als.run(deeds, fn) };
}

/** An email or a text went out: the turn whose tool sent it is told (nothing, outside any turn's tool). */
export function noteSentOut() {
  const d = als.getStore();
  if (d) d.sent++;
}

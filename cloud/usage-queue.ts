import { randomUUID } from "node:crypto";
import { appendFile, readFile, rename, unlink } from "node:fs/promises";
import { config } from "./config.ts";
import { recordUsageFor } from "./usage.ts";

/**
 * Billable use the proxy counts after it has answered (a text sent, a number bought, a Composio or
 * Honcho call): written in the background, so the Mac's call is never held up by it (usage.ts), but
 * never dropped either.
 *
 * - Each use gets its own ref when it's counted and is written with recordUsageFor, one row per ref:
 *   a retry, or a replay after a restart, of a write that did go in (its answer lost on the way back)
 *   finds the row and pays nothing more. So it's written once, however many times it's tried.
 * - A write that fails is tried again a few times, waiting longer each time (usageQueueTiming).
 * - One that still fails, or is still waiting when the cloud stops, goes on the spool: one JSON line
 *   per use in a file that outlives the process (config.usageSpool, under systemd's StateDirectory).
 *   The spool is replayed at the start and every minute; what fails again goes back on it.
 * - With no spool set, a use that can't be written is kept in memory and tried again with the spool's
 *   replays, and one still not written when the cloud stops is logged whole ("[usage] NOT RECORDED"),
 *   so it can be written by hand. It is never only a warning.
 *
 * Other writes the proxy doesn't wait for (counted in proxy.ts: tokens, web searches, images…) are
 * tracked here too, so a stop waits for them (drainUsage), though they aren't retried: an agent turn's
 * are read back by reconcile.ts anyway.
 */

export type QueuedUse = {
  ref: string;
  userId: string;
  kind: string;
  units: number;
  detail: Record<string, unknown>;
  at: number;
};

/** Tests shorten them. */
export const usageQueueTiming = {
  /** Tries in all before a use goes on the spool. */
  tries: 5,
  firstRetryMs: 200,
  maxRetryMs: 30_000,
  replayEveryMs: 60_000,
};

/** Uses counted and not yet written (or spooled). */
const pending = new Map<string, QueuedUse>();
/** Uses that couldn't be written or spooled (no spool set, or it couldn't be written): tried again with each replay. */
const parked = new Map<string, QueuedUse>();
/** Every background write under way, this queue's and the proxy's others. */
const underWay = new Set<Promise<unknown>>();
/** Retries waiting their turn: woken at once when the cloud stops. */
const sleepers = new Set<() => void>();
let stopping = false;

/** Follow a write the caller doesn't wait for, so a stop waits for it (drainUsage). */
export function track<T>(p: Promise<T>): Promise<T> {
  underWay.add(p);
  const done = () => void underWay.delete(p);
  p.then(done, done);
  return p;
}

/** Count one use of `kind` by the user, written in the background until it's in (or on the spool). Its ref. */
export function keepUsage(
  userId: string,
  kind: string,
  units: number,
  detail: Record<string, unknown> = {},
): string {
  const use: QueuedUse = {
    ref: `use_${randomUUID()}`,
    userId,
    kind,
    units,
    detail,
    at: Date.now(),
  };
  pending.set(use.ref, use);
  void track(writeWithRetries(use));
  return use.ref;
}

const write = (u: QueuedUse) =>
  recordUsageFor(u.userId, u.kind, u.ref, u.units, u.detail);

async function writeWithRetries(use: QueuedUse) {
  for (let i = 1; ; i++) {
    try {
      await write(use);
      pending.delete(use.ref);
      return;
    } catch (e) {
      if (!pending.has(use.ref)) return; // spooled meanwhile by a stop
      if (stopping || i >= usageQueueTiming.tries) {
        console.warn(
          `[usage] ${use.kind} for ${use.userId} (${use.ref}) failed ${i} times, put on the spool: ${(e as Error).message}`,
        );
        pending.delete(use.ref);
        await spool([use]);
        return;
      }
      console.warn(
        `[usage] ${use.kind} for ${use.userId} (${use.ref}) failed, tried again soon: ${(e as Error).message}`,
      );
      await nap(
        Math.min(
          usageQueueTiming.firstRetryMs * 4 ** (i - 1),
          usageQueueTiming.maxRetryMs,
        ),
      );
    }
  }
}

function nap(ms: number) {
  if (stopping) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      sleepers.delete(wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    timer.unref?.();
    sleepers.add(wake);
  });
}

/** Put uses on the spool; any it can't take are parked in memory (and logged whole at a stop). */
async function spool(uses: QueuedUse[]) {
  const path = config.usageSpool();
  if (!path) {
    for (const u of uses) parked.set(u.ref, u);
    return;
  }
  try {
    await appendFile(path, uses.map((u) => JSON.stringify(u) + "\n").join(""), {
      mode: 0o600,
    });
    for (const u of uses) parked.delete(u.ref);
  } catch (e) {
    console.error(
      `[usage] the spool (${path}) couldn't be written, ${uses.length} kept in memory: ${(e as Error).message}`,
    );
    for (const u of uses) parked.set(u.ref, u);
  }
}

const isUse = (x: unknown): x is QueuedUse => {
  const u = x as QueuedUse;
  return (
    !!u &&
    typeof u.ref === "string" &&
    typeof u.userId === "string" &&
    typeof u.kind === "string" &&
    typeof u.units === "number"
  );
};

let replaying: Promise<number> | null = null;

/**
 * Write what's on the spool (and parked in memory): the spool is moved aside first, so a use spooled
 * meanwhile goes on a new one, and one moved aside but not done when the cloud stopped is read again
 * at the next start. What fails again goes back on the spool. How many uses were written.
 */
export function replayUsage(): Promise<number> {
  return (replaying ??= replayOnce().finally(() => (replaying = null)));
}

async function replayOnce(): Promise<number> {
  const uses = new Map<string, QueuedUse>(parked);
  parked.clear();
  const path = config.usageSpool();
  const aside = path ? `${path}.replaying` : "";
  if (path) {
    // A replay that didn't finish (the cloud stopped) left its file: read it first, then today's.
    let left = "";
    try {
      left = await readFile(aside, "utf8");
    } catch {
      // none left over
    }
    let now = "";
    try {
      if (!left) await rename(path, aside);
      now = left ? "" : await readFile(aside, "utf8");
    } catch {
      // no spool yet
    }
    for (const line of (left || now).split("\n")) {
      if (!line.trim()) continue;
      try {
        const u: unknown = JSON.parse(line);
        if (isUse(u)) uses.set(u.ref, { ...u, detail: u.detail ?? {} });
      } catch {
        console.error(
          `[usage] a spool line couldn't be read, kept as it was: ${line.slice(0, 500)}`,
        );
        await appendFile(path, line + "\n", { mode: 0o600 }).catch(() => {});
      }
    }
  }
  let wrote = 0;
  const again: QueuedUse[] = [];
  for (const u of uses.values()) {
    try {
      await write(u);
      wrote++;
    } catch (e) {
      console.warn(
        `[usage] ${u.kind} for ${u.userId} (${u.ref}) still failed on replay: ${(e as Error).message}`,
      );
      again.push(u);
    }
  }
  if (again.length) await spool(again);
  if (aside) await unlink(aside).catch(() => {});
  if (wrote) console.log(`[usage] ${wrote} use(s) from the spool written`);
  return wrote;
}

/** Replay the spool now (the start) and every minute. Stops the replays. */
export function startUsageReplays(): () => void {
  stopping = false;
  void replayUsage().catch((e: Error) =>
    console.error(`[usage] replay: ${e.message}`),
  );
  const timer = setInterval(
    () =>
      void replayUsage().catch((e: Error) =>
        console.error(`[usage] replay: ${e.message}`),
      ),
    usageQueueTiming.replayEveryMs,
  );
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * The cloud is stopping: wait, at most `ms`, for the writes under way (retries waiting are tried once
 * more at once, then spooled if they fail). What's still not in after that is spooled, and what can't
 * be spooled is logged whole. How many uses were left unwritten (spooled or logged).
 */
export async function drainUsage(ms: number): Promise<number> {
  stopping = true;
  for (const wake of [...sleepers]) wake();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>(
    (resolve) => (timer = setTimeout(resolve, ms)),
  );
  await Promise.race([
    Promise.allSettled([...underWay, ...(replaying ? [replaying] : [])]),
    late,
  ]);
  clearTimeout(timer);
  const stuck = [...pending.values()];
  pending.clear();
  if (stuck.length) await spool(stuck);
  const lost = [...parked.values()];
  for (const u of lost)
    console.error(
      `[usage] NOT RECORDED (write it by hand): ${JSON.stringify(u)}`,
    );
  return stuck.length + lost.length;
}

/** For tests: what's waiting to be written, and what's parked in memory. */
export const usageQueueState = () => ({
  pending: pending.size,
  parked: parked.size,
  underWay: underWay.size,
});

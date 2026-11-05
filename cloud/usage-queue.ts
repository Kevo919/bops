import { randomUUID } from "node:crypto";
import {
  appendFile,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
 *   per use, each appended in one write and fsynced, in a file that outlives the process
 *   (config.usageSpool, under systemd's StateDirectory). A line a crash cut short costs only itself
 *   (readSpool). The spool is replayed at the start and every minute; what fails again goes back on it.
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

/**
 * One use as a spool line. Each starts with a newline too: a line a crash cut short (no newline at its
 * end) is then never joined to the next one, which stays a line of its own (and blank lines are skipped).
 */
const spoolLine = (u: QueuedUse) => `\n${JSON.stringify(u)}\n`;

/** Tests put awaits in an append (between its open and its write), to interleave a replay there. */
export const spoolHooks = { afterOpen: async (): Promise<void> => {} };

/**
 * This process's spool work in turn: an append (open, write, fsync) never runs while a replay of this
 * process claims (renames) and reads a file, or deletes one. Another process can still claim the spool
 * under an append: appendUse sees that and appends again.
 */
let spoolTurn: Promise<unknown> = Promise.resolve();
function inSpoolTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = spoolTurn.then(work, work);
  spoolTurn = run.catch(() => {});
  return run;
}

/**
 * Append one use to the spool: one write of its whole line, then fsync, so once this returns it's on
 * disk. If the file it wrote to was renamed meanwhile (another process's replay claimed it, maybe
 * having read it before this line was in), it's appended again to the spool as it is now: written
 * twice is harmless (one row per ref), and a line that landed in a file already read is not lost.
 */
async function appendUse(path: string, u: QueuedUse) {
  for (let i = 0; i < 5; i++) {
    const f = await open(path, "a", 0o600);
    let stayed = false;
    try {
      await spoolHooks.afterOpen();
      await f.write(spoolLine(u));
      await f.sync();
      const [wrote, now] = await Promise.all([
        f.stat(),
        stat(path).catch(() => null),
      ]);
      stayed = !!now && now.ino === wrote.ino && now.dev === wrote.dev;
    } finally {
      await f.close();
    }
    if (stayed) return;
  }
  throw new Error("the spool was claimed under every try");
}

/**
 * Put uses on the spool, each in its own write; any it can't take are parked in memory (tried again
 * at the next replay, and logged whole at a stop). Whether they're all on it.
 */
async function spool(uses: QueuedUse[]): Promise<boolean> {
  const path = config.usageSpool();
  let all = true;
  for (const u of uses) {
    if (!path) {
      parked.set(u.ref, u);
      all = false;
      continue;
    }
    try {
      await inSpoolTurn(() => appendUse(path, u));
      parked.delete(u.ref);
    } catch (e) {
      console.error(
        `[usage] the spool (${path}) couldn't take ${u.ref}, kept in memory: ${(e as Error).message}`,
      );
      parked.set(u.ref, u);
      all = false;
    }
  }
  return all;
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

/** Where a use's line starts (JSON.stringify keeps QueuedUse's key order, ref first). */
const LINE_START = '{"ref":';

/**
 * The uses in a spool's text, what couldn't be read, and a last line not ended by its newline (`torn`):
 * maybe an append still under way in another process, so it's not counted as bad. Line by line, so a
 * bad one costs only itself; and in a line that doesn't read (a torn line of an older spool, with the
 * next one joined on), the last use that starts in it is tried on its own.
 */
export function readSpool(text: string): {
  uses: QueuedUse[];
  bad: string[];
  torn: string;
} {
  const uses: QueuedUse[] = [];
  const bad: string[] = [];
  const parse = (t: string): QueuedUse | null => {
    try {
      const u: unknown = JSON.parse(t);
      return isUse(u) ? { ...u, detail: u.detail ?? {} } : null;
    } catch {
      return null;
    }
  };
  const lines = text.split("\n");
  // After the last newline: "" when the text ends with one.
  const last = lines.pop() ?? "";
  let torn = "";
  if (last.trim()) {
    const whole = parse(last);
    if (whole) uses.push(whole);
    else torn = last;
  }
  for (const line of lines) {
    if (!line.trim()) continue;
    const whole = parse(line);
    if (whole) {
      uses.push(whole);
      continue;
    }
    const at = line.lastIndexOf(LINE_START);
    const tail = at > 0 ? parse(line.slice(at)) : null;
    if (tail) uses.push(tail);
    bad.push(tail ? line.slice(0, at) : line);
  }
  return { uses, bad, torn };
}

/** A .bad file past this is moved to .bad.1 (the one before goes): two at most. */
const BAD_MAX_BYTES = 1_000_000;

/**
 * Keep what couldn't be read, for a look by hand: not the fragment (it may hold a user's details),
 * only when, its size, and the ref and kind if they can be made out (a ref names one use's row).
 */
async function keepBad(path: string, from: string, fragments: string[]) {
  const bad = `${path}.bad`;
  const lines = fragments.map((f) =>
    JSON.stringify({
      seenAt: new Date().toISOString(),
      file: basename(from),
      bytes: f.length,
      ref: /"ref":"(use_[A-Za-z0-9_-]+)"/.exec(f)?.[1] ?? null,
      kind: /"kind":"([a-z._]+)"/.exec(f)?.[1] ?? null,
    }),
  );
  try {
    if (((await stat(bad).catch(() => null))?.size ?? 0) > BAD_MAX_BYTES)
      await rename(bad, `${bad}.1`);
    await appendFile(bad, lines.map((l) => l + "\n").join(""), { mode: 0o600 });
  } catch (e) {
    console.error(
      `[usage] ${bad} couldn't be written: ${(e as Error).message}`,
    );
  }
}

/** A claimed file whose last line is torn is left for the next pass until it's this old (an append may be under way). */
export const spoolTiming = { tornGraceMs: 60_000 };

let replaying: Promise<number> | null = null;

/**
 * Write what's on the spool (and parked in memory). Each spool file is claimed first by renaming it to
 * a name of this process's (`<spool>.replaying.<pid>.<random>`), so a use spooled meanwhile goes on a
 * new spool. Every `.replaying.*` file is claimed too, a live process's included (its replay may still
 * be going): that's safe. Each use is written at most once (one row per ref, under its own lock in
 * usage.ts recordUsageFor), so two replays writing the same use pay it once; the other process's
 * delete of the name it had finds nothing (it never deletes a file under another name); and what it
 * puts back on the spool goes on the spool itself. What fails again goes back on the spool, and a
 * claimed file is deleted only once all of it is written or back on the spool, and its last line isn't
 * torn (a torn last line may be an append under way: left for the next pass until it's tornGraceMs
 * old, then kept as bad). A parked use stays parked until it's written or spooled, so a stop meanwhile
 * still logs it. How many uses were written.
 */
export function replayUsage(): Promise<number> {
  return (replaying ??= replayOnce().finally(() => (replaying = null)));
}

/** Claim the spool and every replay file: each renamed to a name of this process's. The names claimed. */
async function claimSpools(path: string): Promise<string[]> {
  const dir = dirname(path);
  const base = basename(path);
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const claimed: string[] = [];
  for (const name of names
    .filter((n) => n === base || n.startsWith(`${base}.replaying.`))
    .sort()) {
    const mine = join(
      dir,
      `${base}.replaying.${process.pid}.${randomUUID().slice(0, 8)}`,
    );
    try {
      await rename(join(dir, name), mine);
      claimed.push(mine);
    } catch {
      // Gone meanwhile (another replay claimed it first).
    }
  }
  return claimed;
}

async function replayOnce(): Promise<number> {
  const uses = new Map<string, QueuedUse>(parked);
  const path = config.usageSpool();
  /** Claimed files not to delete: unread, or with a last line that may still be being written. */
  const keep = new Set<string>();
  const claimed = !path
    ? []
    : await inSpoolTurn(async () => {
        const files = await claimSpools(path);
        for (const file of files) {
          let text = "";
          let mtime = 0;
          try {
            [text, mtime] = await Promise.all([
              readFile(file, "utf8"),
              stat(file).then((s) => s.mtimeMs),
            ]);
          } catch (e) {
            console.error(
              `[usage] ${file} couldn't be read, kept: ${(e as Error).message}`,
            );
            keep.add(file);
            continue;
          }
          const { uses: found, bad, torn } = readSpool(text);
          for (const u of found) if (!uses.has(u.ref)) uses.set(u.ref, u);
          if (torn && Date.now() - mtime < spoolTiming.tornGraceMs)
            keep.add(file);
          else if (torn) bad.push(torn);
          if (bad.length) {
            console.error(
              `[usage] ${bad.length} spool fragment(s) in ${file} couldn't be read: noted in ${path}.bad`,
            );
            await keepBad(path, file, bad);
          }
        }
        return files;
      });
  let wrote = 0;
  const again: QueuedUse[] = [];
  for (const u of uses.values()) {
    try {
      await write(u);
      parked.delete(u.ref);
      wrote++;
    } catch (e) {
      console.warn(
        `[usage] ${u.kind} for ${u.userId} (${u.ref}) still failed on replay: ${(e as Error).message}`,
      );
      again.push(u);
    }
  }
  const respooled = await spool(again);
  // Every use in them is written or back on the spool (if not, they're replayed again from here).
  if (respooled && path)
    await inSpoolTurn(async () => {
      for (const file of claimed)
        if (!keep.has(file)) await unlink(file).catch(() => {});
    });
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

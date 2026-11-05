import assert from "node:assert/strict";
import {
  appendFile,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  truncate,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import pg from "pg";
import {
  closeDb,
  db,
  ownObject,
  query,
  queryWithin,
  unbounded,
} from "../db.ts";
import {
  drainUsage,
  keepUsage,
  readSpool,
  spoolHooks,
  spoolTiming,
  replayUsage,
  usageQueueState,
  usageQueueTiming,
} from "../usage-queue.ts";
import {
  dropUsers,
  newUserId,
  prepareDb,
  seedUser,
  TEST_DATABASE_URL,
  until,
} from "./core-fakes.ts";

/**
 * Billable use the proxy counts after answering (usage-queue.ts) is never silently dropped: a write
 * that fails is tried again, one that keeps failing goes on the spool and is written from it once the
 * database takes it, a stop waits for what's under way and spools the rest, and each use is written
 * once however often it's tried. The failures are real: a trigger makes Postgres refuse this file's
 * user's usage rows while it's on. Also db.ts's statement timeouts.
 */

// Set before the pool is made (db.ts reads it then): short, so the timeout test is quick.
process.env.BOPS_DB_STATEMENT_TIMEOUT_MS = "1500";

const alice = newUserId("uqueue");
const bob = newUserId("uqueue-bob");
let dir: string;
const spoolPath = () => join(dir, "usage-spool.jsonl");

const rowsOf = async (ref: string) =>
  (
    await query<{ units: number; cost: number }>(
      "SELECT units::float8 AS units, cost_micros::float8 AS cost FROM bops.cloud_usage WHERE user_id = $1 AND detail->>'ref' = $2",
      [alice, ref],
    )
  ).rows;

/** Postgres refuses Alice's usage rows while this is on. */
async function failWrites(on: boolean) {
  if (on)
    await query(
      "INSERT INTO bops_uq_fail (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [alice],
    );
  else await query("DELETE FROM bops_uq_fail WHERE user_id = $1", [alice]);
}

/** A use as the spool keeps it, for writing spools by hand. */
const use = (ref: string, kind = "honcho.calls") => ({
  ref,
  userId: alice,
  kind,
  units: 1,
  detail: { route: "chat" },
  at: Date.now(),
});
const spoolFiles = async () =>
  (await readdir(dir)).filter((n) => n.startsWith("usage-spool.jsonl")).sort();

const spooled = async () => {
  try {
    return readSpool(await readFile(spoolPath(), "utf8")).uses;
  } catch {
    return [];
  }
};

before(async () => {
  await prepareDb();
  await Promise.all([seedUser(alice), seedUser(bob)]);
  dir = await mkdtemp(join(tmpdir(), "bops-uq-"));
  await query(
    "CREATE TABLE IF NOT EXISTS bops_uq_fail (user_id text PRIMARY KEY)",
  );
  await query(`CREATE OR REPLACE FUNCTION bops_uq_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM bops_uq_fail WHERE user_id = NEW.user_id::text) THEN RAISE EXCEPTION 'test: usage write refused'; END IF;
      RETURN NEW;
    END $$`);
  await query("DROP TRIGGER IF EXISTS bops_uq_refuse ON bops.cloud_usage");
  await query(
    "CREATE TRIGGER bops_uq_refuse BEFORE INSERT OR UPDATE ON bops.cloud_usage FOR EACH ROW EXECUTE FUNCTION bops_uq_refuse()",
  );
  Object.assign(usageQueueTiming, {
    tries: 3,
    firstRetryMs: 50,
    maxRetryMs: 200,
  });
});

after(async () => {
  await query("DROP TRIGGER IF EXISTS bops_uq_refuse ON bops.cloud_usage");
  await query("DROP FUNCTION IF EXISTS bops_uq_refuse()");
  await query("DROP TABLE IF EXISTS bops_uq_fail");
  await query("DELETE FROM bops.deleted_users WHERE user_id = $1", [bob]);
  await dropUsers([alice, bob]);
  await rm(dir, { recursive: true, force: true });
  await closeDb();
});

test("a use whose write fails is tried again, and is in once the database takes it: once", async () => {
  delete process.env.BOPS_USAGE_SPOOL;
  Object.assign(usageQueueTiming, {
    tries: 50,
    firstRetryMs: 50,
    maxRetryMs: 100,
  });
  await failWrites(true);
  const ref = keepUsage(alice, "agentphone.sms", 2, { direction: "out" });
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(await rowsOf(ref), [], "refused so far");
  assert.equal(
    usageQueueState().pending,
    1,
    "still waiting to be written, not dropped",
  );
  await failWrites(false);
  await until(
    async () => (await rowsOf(ref)).length > 0,
    "the retry to write it",
  );
  assert.equal((await rowsOf(ref)).length, 1);
  assert.equal((await rowsOf(ref))[0].units, 2);
  assert.equal(usageQueueState().pending, 0);
});

test("a use that keeps failing goes on the spool, and is written from it once (a second replay adds nothing)", async () => {
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  Object.assign(usageQueueTiming, {
    tries: 3,
    firstRetryMs: 20,
    maxRetryMs: 50,
  });
  await failWrites(true);
  const ref = keepUsage(alice, "honcho.calls", 1, { route: "chat" });
  await until(
    async () => (await spooled()).some((u) => u.ref === ref),
    "it to be spooled",
  );
  assert.deepEqual(await rowsOf(ref), []);
  assert.equal(usageQueueState().pending, 0);
  // Still refused: a replay puts it back on the spool.
  assert.equal(await replayUsage(), 0);
  assert.ok(
    (await spooled()).some((u) => u.ref === ref),
    "back on the spool",
  );
  await failWrites(false);
  assert.equal(await replayUsage(), 1);
  assert.deepEqual(await spooled(), []);
  assert.equal((await rowsOf(ref)).length, 1);
  // A use written twice (an answer lost on the way back, then a replay) is one row, paid once.
  const cost = (await rowsOf(ref))[0].cost;
  await import("../usage.ts").then((m) =>
    m.recordUsageFor(alice, "honcho.calls", ref, 1, { route: "chat" }),
  );
  assert.deepEqual(await rowsOf(ref), [{ units: 1, cost }]);
});

test("with no spool, a use that can't be written stays in memory, and a later replay writes it", async () => {
  delete process.env.BOPS_USAGE_SPOOL;
  await failWrites(true);
  const ref = keepUsage(alice, "composio.calls", 1, { tool: "NOTION_SEARCH" });
  await until(
    () => usageQueueState().parked === 1 && usageQueueState().pending === 0,
    "it to be parked",
  );
  await failWrites(false);
  assert.equal(await replayUsage(), 1);
  assert.equal((await rowsOf(ref)).length, 1);
  assert.equal(usageQueueState().parked, 0);
});

test("statement timeouts: the pool's cuts a statement that runs on, queryWithin a tighter bound, and unbounded lifts it", async () => {
  await assert.rejects(
    query("SELECT pg_sleep(2)"),
    (e: Error & { code?: string }) => e.code === "57014",
  );
  await assert.rejects(
    queryWithin(100, "SELECT pg_sleep(0.5)"),
    (e: Error & { code?: string }) => e.code === "57014",
  );
  assert.equal((await queryWithin(1000, "SELECT 1 AS one")).rows[0].one, 1);
  const c = await db().connect();
  try {
    await unbounded(c, () => c.query("SELECT pg_sleep(2)"));
    // Put back after: the pool's bound holds on that connection again.
    await assert.rejects(
      c.query("SELECT pg_sleep(2)"),
      (e: Error & { code?: string }) => e.code === "57014",
    );
  } finally {
    c.release();
  }
});

test("a spool line a crash cut short costs only itself: the line after it is replayed, joined on or not", async () => {
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  const ref = (n: string) => `use_torn_${n}_${Date.now()}`;
  const [joined, own, after] = [ref("joined"), ref("own"), ref("after")];
  const torn = JSON.stringify(use(ref("lost"))).slice(0, 40);
  // An older spool's torn line with the next one joined on, then a torn line ended by a newline, then a good line.
  await writeFile(
    spoolPath(),
    `${torn}${JSON.stringify(use(joined))}\n${torn}\n${JSON.stringify(use(own))}\n`,
  );
  // And one torn the way it is now: cut mid-line by a crash, then the next use appended as the cloud does.
  Object.assign(usageQueueTiming, { tries: 1 });
  await failWrites(true);
  const cut = keepUsage(alice, "honcho.calls", 1, { route: "chat" });
  await until(
    async () => (await spooled()).some((u) => u.ref === cut),
    "it to be spooled",
  );
  const size = (await readFile(spoolPath())).length;
  await truncate(spoolPath(), size - 20);
  const next = keepUsage(alice, "honcho.calls", 1, { route: "search" });
  await until(
    async () => (await readFile(spoolPath(), "utf8")).includes(next),
    "the next one to be spooled",
  );
  await appendFile(spoolPath(), `\n${JSON.stringify(use(after))}\n`);
  await failWrites(false);

  const read = readSpool(await readFile(spoolPath(), "utf8"));
  assert.deepEqual(
    read.uses.map((u) => u.ref),
    [joined, own, next, after],
  );
  assert.equal(read.bad.length, 3, "the three torn fragments, each on its own");
  assert.equal(await replayUsage(), 4);
  for (const r of [joined, own, next, after])
    assert.equal((await rowsOf(r)).length, 1, r);
  assert.deepEqual(
    await rowsOf(cut),
    [],
    "the torn use itself is lost, and only it",
  );
  // The fragments are kept aside for a look by hand; the spool and the file this replay claimed are gone.
  assert.deepEqual(await spoolFiles(), ["usage-spool.jsonl.bad"]);
  await rm(`${spoolPath()}.bad`);
});

test("a replay claims every replay file (another process's too) under a name of its own, and deletes only what it claimed", async () => {
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  const left = `use_left_${Date.now()}`;
  const theirs = `${spoolPath()}.replaying.4242.deadbeef`;
  await writeFile(theirs, `\n${JSON.stringify(use(left))}\n`);
  assert.equal(await replayUsage(), 1);
  assert.equal((await rowsOf(left)).length, 1);
  assert.deepEqual(
    await spoolFiles(),
    [],
    "claimed by renaming it, and that file deleted",
  );
  // A file it can't claim (gone under it, or another process's rename first) is never deleted by it.
  const kept = `${spoolPath()}.replaying.4243.cafef00d`;
  await writeFile(kept, `\n${JSON.stringify(use(`use_kept_${Date.now()}`))}\n`);
  await failWrites(true);
  assert.equal(await replayUsage(), 0);
  // Still refused: back on the spool, and its claimed file gone only once that's done.
  const files = await spoolFiles();
  assert.deepEqual(files, ["usage-spool.jsonl"]);
  await failWrites(false);
  assert.equal(await replayUsage(), 1);
});

test("queryWithin's bound includes the wait for a pool connection", async () => {
  const held = await Promise.all(
    Array.from({ length: 10 }, () => db().connect()),
  );
  try {
    const t0 = Date.now();
    await assert.rejects(
      queryWithin(200, "SELECT 1"),
      (e: Error & { code?: string }) => e.code === "57014",
    );
    assert.ok(Date.now() - t0 < 1_000, `took ${Date.now() - t0} ms`);
  } finally {
    for (const c of held) c.release();
  }
  assert.equal(
    (await queryWithin(1_000, "SELECT 1 AS one")).rows[0].one,
    1,
    "the pool is fine after",
  );
});

test("an object a delete deletes at its provider waits out a delete holding the state row, past the statement timeout", async () => {
  // As at a delete's step: marked deleted, its state row held (delete-user.ts onUser) longer than the pool's 1.5 s.
  await query(
    "INSERT INTO bops.deleted_users (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [bob],
  );
  const blocker = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await blocker.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT 1 FROM bops.app_state WHERE user_id = $1 FOR UPDATE",
      [bob],
    );
    const id = `ca_uq_${Date.now()}`;
    const t0 = Date.now();
    const recorded = ownObject(bob, "composio", "connected_account", id);
    setTimeout(() => void blocker.query("COMMIT"), 2_500);
    await recorded;
    assert.ok(Date.now() - t0 >= 2_000, `waited ${Date.now() - t0} ms`);
    assert.equal(
      (
        await query(
          "SELECT 1 FROM bops.cloud_objects WHERE object_id = $1 AND user_id = $2",
          [id, bob],
        )
      ).rowCount,
      1,
      "recorded, so the delete's last step sees it",
    );
  } finally {
    await blocker.query("ROLLBACK").catch(() => {});
    await blocker.end();
    await query("DELETE FROM bops.deleted_users WHERE user_id = $1", [bob]);
  }
});

// Another process's replay, between an append's open and its write: it claims (renames) the spool and
// reads it before the line is in, and deletes it after. The append sees the file it wrote to moved, and
// appends again to the spool as it is now.
test("an append that lands in a spool another process claimed and read meanwhile is appended again, not lost", async () => {
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  Object.assign(usageQueueTiming, { tries: 1 });
  const other = `${spoolPath()}.replaying.9999.0ther0ne`;
  let readThere = "";
  let opens = 0;
  spoolHooks.afterOpen = async () => {
    if (++opens > 1) return;
    await rename(spoolPath(), other); // their claim
    readThere = await readFile(other, "utf8"); // their read: the line isn't in yet
  };
  try {
    await failWrites(true);
    const ref = keepUsage(alice, "agentphone.sms", 1, { direction: "out" });
    await until(
      () => usageQueueState().pending === 0 && opens >= 2,
      "it to be spooled",
    );
    // The write + fsync went to their file, after their read: then they delete it.
    assert.ok(!readThere.includes(ref), "their read was before the line");
    assert.ok(
      (await readFile(other, "utf8")).includes(ref),
      "the first write landed in their file",
    );
    await unlink(other); // their delete
    assert.ok(
      (await spooled()).some((u) => u.ref === ref),
      "appended again to the spool",
    );
    await failWrites(false);
    assert.equal(await replayUsage(), 1);
    assert.equal((await rowsOf(ref)).length, 1);
  } finally {
    spoolHooks.afterOpen = async () => {};
    await failWrites(false);
  }
});

test("in this process, a replay waits for an append under way: it never claims the spool between its open and its write", async () => {
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  Object.assign(usageQueueTiming, { tries: 1 });
  let opens = 0;
  let replayed: Promise<number> | undefined;
  spoolHooks.afterOpen = async () => {
    if (++opens > 1) return;
    await failWrites(false);
    replayed = replayUsage(); // a replay starting mid-append
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(
      !(await spoolFiles()).some((n) => n.includes(".replaying.")),
      "nothing claimed mid-append",
    );
  };
  try {
    await failWrites(true);
    const ref = keepUsage(alice, "agentphone.sms", 1, { direction: "out" });
    await until(
      () => replayed !== undefined && usageQueueState().pending === 0,
      "it to be spooled",
    );
    // The replay ran once the append was done, and found the line.
    assert.equal(await replayed, 1);
    assert.equal(opens, 1, "one open: the file was never moved under it");
    assert.equal((await rowsOf(ref)).length, 1);
    assert.deepEqual(await spoolFiles(), []);
  } finally {
    spoolHooks.afterOpen = async () => {};
    await failWrites(false);
  }
});

test("a torn last line is left for the next pass while it may be an append under way, then noted as bad without its details", async () => {
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  const good = `use_tail_ok_${Date.now()}`;
  const whole = JSON.stringify(use(`use_tail_half_${Date.now()}`));
  // Cut after its kind: a fragment with a user's id in it.
  const half = whole.slice(0, whole.indexOf('"units"'));
  await writeFile(spoolPath(), `\n${JSON.stringify(use(good))}\n\n${half}`);
  assert.equal(await replayUsage(), 1);
  assert.equal((await rowsOf(good)).length, 1);
  const kept = (await spoolFiles()).filter((n) => n.includes(".replaying."));
  assert.equal(kept.length, 1, "kept for the next pass, not deleted");
  assert.ok(
    !(await spoolFiles()).includes("usage-spool.jsonl.bad"),
    "not bad yet",
  );
  // Still torn a while on: bad (only when, size, ref and kind), and the file goes.
  const old = new Date(Date.now() - spoolTiming.tornGraceMs - 1_000);
  await utimes(join(dir, kept[0]), old, old);
  assert.equal(await replayUsage(), 1, "the good line again, paid once");
  assert.equal((await rowsOf(good)).length, 1);
  assert.deepEqual(await spoolFiles(), ["usage-spool.jsonl.bad"]);
  const noted = (await readFile(`${spoolPath()}.bad`, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.equal(noted.length, 1);
  assert.equal(noted[0].kind, "honcho.calls");
  assert.ok(String(noted[0].ref).startsWith("use_tail_half_"));
  assert.ok(!JSON.stringify(noted).includes(alice), "no user id, no details");
  await rm(`${spoolPath()}.bad`);
});

test("a use seen again after its price changed pays nothing more; one that grew pays only its growth", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const ref = `use_price_${Date.now()}`;
  await recordUsageFor(alice, "agentphone.sms", ref, 2, { direction: "out" });
  const [{ cost }] = await rowsOf(ref);
  assert.ok(cost > 0, "texts cost something");
  // As if it was paid when texts cost less: seen again, the same count, at today's higher price.
  await query(
    "UPDATE bops.cloud_usage SET cost_micros = cost_micros / 2 WHERE user_id = $1 AND detail->>'ref' = $2",
    [alice, ref],
  );
  await recordUsageFor(alice, "agentphone.sms", ref, 2, { direction: "out" });
  assert.deepEqual(
    await rowsOf(ref),
    [{ units: 2, cost: Math.floor(cost / 2) }],
    "nothing more charged for the price change",
  );
  // Grown by one segment: that segment is paid, at today's price.
  await recordUsageFor(alice, "agentphone.sms", ref, 3, { direction: "out" });
  assert.deepEqual(await rowsOf(ref), [
    { units: 3, cost: Math.floor(cost / 2) + cost / 2 },
  ]);
});

// Last: a stop is for good (no use is retried after it).
test("a stop waits for writes under way, and spools what isn't in, or logs it whole: none is only lost", async () => {
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  Object.assign(usageQueueTiming, {
    tries: 50,
    firstRetryMs: 10_000,
    maxRetryMs: 10_000,
  });
  await failWrites(true);
  const waiting = keepUsage(alice, "agentphone.numbers", 1, { type: "sms" });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(usageQueueState().pending, 1, "waiting 10 s for its next try");
  const t0 = Date.now();
  // The retry waiting is woken, tried once more, refused, and spooled: no 10 s wait.
  await drainUsage(2_000);
  assert.ok(Date.now() - t0 < 2_000, `took ${Date.now() - t0} ms`);
  assert.ok(
    (await spooled()).some((u) => u.ref === waiting),
    "spooled at the stop",
  );
  // With no spool to take it, it's logged whole.
  delete process.env.BOPS_USAGE_SPOOL;
  const lost = keepUsage(alice, "agentphone.sms", 1, { direction: "out" });
  const logged: string[] = [];
  const error = console.error;
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  try {
    assert.ok((await drainUsage(1_000)) >= 1);
  } finally {
    console.error = error;
  }
  assert.ok(
    logged.some((l) => l.includes("NOT RECORDED") && l.includes(lost)),
    logged.join("\n"),
  );
  await failWrites(false);
  // Written once the database takes it again, from the spool.
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  await replayUsage();
  assert.equal((await rowsOf(waiting)).length, 1);
});

test("a use parked in memory stays parked while a replay is still writing it, so a stop then logs it whole", async () => {
  delete process.env.BOPS_USAGE_SPOOL;
  await failWrites(true);
  const ref = keepUsage(alice, "composio.calls", 1, { tool: "SLACK_SEND" });
  await until(
    () => usageQueueState().parked >= 1 && usageQueueState().pending === 0,
    "it to be parked",
  );
  await failWrites(false);
  // The replay's write waits on the use's own lock (usage.ts recordUsageFor), held by another session.
  const blocker = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await blocker.connect();
  await blocker.query("SELECT pg_advisory_lock(hashtext($1))", [
    `bops-usage:${alice}:composio.calls:${ref}`,
  ]);
  const logged: string[] = [];
  const error = console.error;
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  try {
    const replay = replayUsage();
    await new Promise((r) => setTimeout(r, 100));
    await drainUsage(200);
    assert.ok(
      logged.some((l) => l.includes("NOT RECORDED") && l.includes(ref)),
      logged.join("\n"),
    );
    await blocker.query("SELECT pg_advisory_unlock(hashtext($1))", [
      `bops-usage:${alice}:composio.calls:${ref}`,
    ]);
    await replay;
  } finally {
    console.error = error;
    await blocker.end();
  }
  assert.equal(
    (await rowsOf(ref)).length,
    1,
    "and the replay wrote it once the lock was let go",
  );
  assert.equal(usageQueueState().parked, 0);
});

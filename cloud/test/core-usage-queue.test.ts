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
  keepUse,
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
  // The row can be seen (another connection) a moment before its writer takes it off the queue.
  await until(
    async () => (await rowsOf(ref)).length > 0 && usageQueueState().pending === 0,
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

/* What a ref is paid (usage.ts recordUsageFor): only a larger count, up to what it costs. cost_micros is what was paid for it. */

const tokens = (cached: number) => ({
  model: "gpt-6.1-sol",
  source: "agent",
  input: 1_000,
  cached,
  output: 100,
});
const costRow = async (ref: string, kind: string) =>
  (
    await query<{ units: number; cost: number; cached: string | null }>(
      "SELECT units::float8 AS units, cost_micros::float8 AS cost, detail->>'cached' AS cached FROM bops.cloud_usage WHERE user_id = $1 AND kind = $2 AND detail->>'ref' = $3",
      [alice, kind, ref],
    )
  ).rows;

test("sightings of the same count with other detail (A, B, A) are paid once, and the row stays as first seen", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  const ref = `turn_aba_${Date.now()}`;
  const a = costOf("openai.tokens", 1_100, tokens(0));
  const b = costOf("openai.tokens", 1_100, tokens(900));
  assert.ok(a > b, "uncached costs more");
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(0)); // A
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(900)); // B
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(0)); // A
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(900)); // B
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(0)); // A
  assert.deepEqual(await costRow(ref, "openai.tokens"), [
    { units: 1_100, cost: a, cached: "0" },
  ]);
});

test("growth is still paid: up to what the largest sighting costs, never more", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  const ref = `call_grow_${Date.now()}`;
  await recordUsageFor(alice, "openai.live_seconds", ref, 30, {
    transport: "webrtc",
  });
  assert.equal(
    (await costRow(ref, "openai.live_seconds"))[0].cost,
    costOf("openai.live_seconds", 30, { transport: "webrtc" }),
  );
  await recordUsageFor(alice, "openai.live_seconds", ref, 90, {
    transport: "webrtc",
  });
  const [row] = await costRow(ref, "openai.live_seconds");
  assert.deepEqual(
    [row.units, row.cost],
    [90, costOf("openai.live_seconds", 90, { transport: "webrtc" })],
  );
  // Tokens that grow, with less cached in the larger one: paid up to the larger's cost.
  const t = `turn_grow_${Date.now()}`;
  await recordUsageFor(alice, "openai.tokens", t, 1_100, tokens(900));
  const bigger = { ...tokens(0), input: 2_000 };
  await recordUsageFor(alice, "openai.tokens", t, 2_100, bigger);
  assert.deepEqual(await costRow(t, "openai.tokens"), [
    { units: 2_100, cost: costOf("openai.tokens", 2_100, bigger), cached: "0" },
  ]);
});

test("a lower sighting replayed later (a spooled one after reconcile) charges nothing and changes nothing", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  const ref = `turn_low_${Date.now()}`;
  const big = { ...tokens(0), input: 2_000 };
  await recordUsageFor(alice, "openai.tokens", ref, 2_100, big);
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(900));
  assert.deepEqual(await costRow(ref, "openai.tokens"), [
    { units: 2_100, cost: costOf("openai.tokens", 2_100, big), cached: "0" },
  ]);
});

test("a retry after the price changed charges nothing; growth then pays only what's not paid yet", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const ref = `use_price_${Date.now()}`;
  await recordUsageFor(alice, "agentphone.sms", ref, 2, { direction: "out" });
  const [{ cost }] = await rowsOf(ref);
  assert.ok(cost > 0, "texts cost something");
  // As if it was paid when texts cost half: the retry, at today's price, the same count.
  await query(
    "UPDATE bops.cloud_usage SET cost_micros = cost_micros / 2 WHERE user_id = $1 AND detail->>'ref' = $2",
    [alice, ref],
  );
  await recordUsageFor(alice, "agentphone.sms", ref, 2, { direction: "out" });
  assert.deepEqual(
    await rowsOf(ref),
    [{ units: 2, cost: cost / 2 }],
    "nothing more charged for the price change",
  );
  // Grown to 3 segments: paid up to what 3 cost today, less what was paid.
  await recordUsageFor(alice, "agentphone.sms", ref, 3, { direction: "out" });
  assert.deepEqual(await rowsOf(ref), [{ units: 3, cost: (cost / 2) * 3 }]);
});

/* Tokens, images, transcriptions and Jev answers through the queue (proxy.ts keepUse): each with its ref before its first write. */

/** The uses the proxy keeps for an image, a transcription and a Jev answer (usage.ts imagesUse, transcriptionUse, jevUse). */
async function otherUses() {
  const { imagesUse, jevUse, transcriptionUse } = await import("../usage.ts");
  return [
    imagesUse(
      {
        usage: {
          input_tokens: 300,
          output_tokens: 1_000,
          input_tokens_details: { text_tokens: 50, image_tokens: 250 },
        },
      },
      { model: "gpt-image-2.5-flare", botId: "sam" },
    )!,
    transcriptionUse(
      { usage: { type: "duration", seconds: 12 } },
      { model: "gpt-transcribe", botId: "sam" },
    )!,
    jevUse(
      { model: "jev-1.13.0", usage: { input_tokens: 1_200, output_tokens: 3 } },
      0,
      { botId: "sam" },
    ),
  ];
}

/** What a use costs, priced as recordUsageFor prices it (with its ref in its detail). */
const priced = async (
  u: { kind: string; units: number; detail: Record<string, unknown> },
  ref: string,
) => {
  const { costOf } = await import("../pricing.ts");
  return costOf(u.kind, u.units, { ...u.detail, ref });
};

test("an image, a transcription and a Jev answer each get a ref before their first write; a refused write is tried again and lands once", async () => {
  delete process.env.BOPS_USAGE_SPOOL;
  Object.assign(usageQueueTiming, {
    tries: 50,
    firstRetryMs: 50,
    maxRetryMs: 100,
  });
  const uses = await otherUses();
  await failWrites(true);
  const refs = uses.map((u) => keepUse(alice, u)!);
  assert.equal(new Set(refs).size, 3, "a ref of each one's own");
  for (const ref of refs) assert.match(ref, /^use_[0-9a-f-]{36}$/);
  await new Promise((r) => setTimeout(r, 300));
  for (const ref of refs) assert.deepEqual(await rowsOf(ref), []);
  assert.equal(
    usageQueueState().pending,
    3,
    "waiting to be written, not dropped",
  );
  await failWrites(false);
  // The rows can be seen (another connection) a moment before their writers take them off the queue.
  await until(
    async () =>
      (await Promise.all(refs.map(rowsOf))).every((r) => r.length) &&
      usageQueueState().pending === 0,
    "the retries to write them",
  );
  for (const [i, ref] of refs.entries()) {
    const cost = await priced(uses[i], ref);
    assert.ok(cost > 0, `${uses[i].kind} costs something`);
    assert.deepEqual(await rowsOf(ref), [{ units: uses[i].units, cost }]);
  }
});

test("an image, a transcription and a Jev answer survive the spool, and replayed twice are paid once", async () => {
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  Object.assign(usageQueueTiming, {
    tries: 2,
    firstRetryMs: 20,
    maxRetryMs: 50,
  });
  const uses = await otherUses();
  await failWrites(true);
  const refs = uses.map((u) => keepUse(alice, u)!);
  await until(async () => {
    const on = (await spooled()).map((u) => u.ref);
    return refs.every((r) => on.includes(r));
  }, "them to be spooled");
  assert.equal(usageQueueState().pending, 0);
  // What's on the spool, as it was: written again after the replay below, as a replay cut off after
  // its writes (before it deleted the file) would leave it for the next start.
  const text = await readFile(spoolPath(), "utf8");
  const lines = readSpool(text).uses.filter((u) => refs.includes(u.ref));
  const byRef = (a: unknown[], b: unknown[]) =>
    String(a[0]).localeCompare(String(b[0]));
  assert.deepEqual(
    lines.map((u) => [u.ref, u.kind, u.units]).sort(byRef),
    refs.map((r, i) => [r, uses[i].kind, uses[i].units]).sort(byRef),
    "each with its ref, made before its first write",
  );
  await failWrites(false);
  // At least these three (another test's use still on the spool is written too).
  assert.ok((await replayUsage()) >= 3);
  assert.deepEqual(await spooled(), []);
  await writeFile(spoolPath(), text);
  assert.ok((await replayUsage()) >= 3, "written again…");
  assert.deepEqual(await spooled(), []);
  for (const [i, ref] of refs.entries())
    assert.deepEqual(
      await rowsOf(ref),
      [{ units: uses[i].units, cost: await priced(uses[i], ref) }],
      "…and still one row, paid once",
    );
});

test("a turn's tokens are kept under the turn's id: sightings refused, then spooled and replayed, pay the dearest once", async () => {
  const { tokensUse } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  Object.assign(usageQueueTiming, {
    tries: 2,
    firstRetryMs: 20,
    maxRetryMs: 50,
  });
  const turn = `turn_uq_${Date.now()}`;
  const said = (cached: number) =>
    tokensUse(
      {
        input_tokens: 1_000,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: cached },
      },
      { model: "gpt-6.1-sol", source: "agent" },
    );
  await failWrites(true);
  // The event first said 900 cached; the turn's read says none (dearer), at the same count.
  assert.equal(keepUse(alice, said(900), turn), turn);
  assert.equal(keepUse(alice, said(0), turn), turn);
  assert.equal(
    keepUse(alice, tokensUse({}, { source: "agent" }), turn),
    undefined,
    "nothing used, nothing kept",
  );
  await until(
    async () => (await spooled()).filter((u) => u.ref === turn).length === 2,
    "both to be spooled",
  );
  await failWrites(false);
  assert.ok((await replayUsage()) >= 2);
  assert.ok(!(await spooled()).some((u) => u.ref === turn));
  await replayUsage();
  const dear = costOf("openai.tokens", 1_100, { ...tokens(0), ref: turn });
  assert.deepEqual(await costRow(turn, "openai.tokens"), [
    { units: 1_100, cost: dear, cached: "0" },
  ]);
});

/* Task 72: the same count with dearer detail pays what it costs beyond what was paid. */

test("the same count seen later with dearer detail (B, A, B) pays the difference once: never past the dearest", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  const ref = `turn_bab_${Date.now()}`;
  const a = costOf("openai.tokens", 1_100, { ...tokens(0), ref });
  const b = costOf("openai.tokens", 1_100, { ...tokens(900), ref });
  assert.ok(a > b);
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(900)); // B
  assert.deepEqual(await costRow(ref, "openai.tokens"), [
    { units: 1_100, cost: b, cached: "900" },
  ]);
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(0)); // A: dearer, a − b more
  assert.deepEqual(await costRow(ref, "openai.tokens"), [
    { units: 1_100, cost: a, cached: "0" },
  ]);
  for (const cached of [900, 0, 900, 0])
    await recordUsageFor(alice, "openai.tokens", ref, 1_100, tokens(cached));
  assert.deepEqual(
    await costRow(ref, "openai.tokens"),
    [{ units: 1_100, cost: a, cached: "0" }],
    "swaps after it pay nothing more",
  );
  // At once: they take turns, and the dearest is paid once.
  const t = `turn_bab_once_${Date.now()}`;
  await Promise.all(
    [900, 0, 900, 0, 900].map((c) =>
      recordUsageFor(alice, "openai.tokens", t, 1_100, tokens(c)),
    ),
  );
  assert.deepEqual(
    (await costRow(t, "openai.tokens")).map((r) => [r.units, r.cost]),
    [[1_100, costOf("openai.tokens", 1_100, { ...tokens(0), ref: t })]],
  );
});

test("dearer detail at a smaller count never pays, and cheaper detail at the same count changes nothing", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  const ref = `turn_down_${Date.now()}`;
  const big = { ...tokens(900), input: 2_000 };
  await recordUsageFor(alice, "openai.tokens", ref, 2_100, big);
  const paid = costOf("openai.tokens", 2_100, { ...big, ref });
  // A smaller count, though its detail costs more than what was paid (all uncached, a dearer model).
  const dearSmall = { ...tokens(0), model: "gpt-6-astra", input: 2_000 };
  assert.ok(costOf("openai.tokens", 2_050, { ...dearSmall, ref }) > paid);
  await recordUsageFor(alice, "openai.tokens", ref, 2_050, dearSmall);
  assert.deepEqual(await costRow(ref, "openai.tokens"), [
    { units: 2_100, cost: paid, cached: "900" },
  ]);
  // The same count, cheaper (more cached): nothing back, nothing more, the row as it was.
  await recordUsageFor(alice, "openai.tokens", ref, 2_100, {
    ...big,
    cached: 1_900,
  });
  assert.deepEqual(await costRow(ref, "openai.tokens"), [
    { units: 2_100, cost: paid, cached: "900" },
  ]);
});

test("the same count whose model became known late pays the dearer model's price, less what was paid", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  const ref = `turn_model_${Date.now()}`;
  const luna = { ...tokens(0), model: "gpt-6-luna" };
  const astra = { ...tokens(0), model: "gpt-6-astra" };
  const cheap = costOf("openai.tokens", 1_100, { ...luna, ref });
  const dear = costOf("openai.tokens", 1_100, { ...astra, ref });
  assert.ok(dear > cheap);
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, luna);
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, astra);
  const [row] = (
    await query<{ cost: number; model: string }>(
      "SELECT cost_micros::float8 AS cost, detail->>'model' AS model FROM bops.cloud_usage WHERE user_id = $1 AND detail->>'ref' = $2",
      [alice, ref],
    )
  ).rows;
  assert.deepEqual([row.cost, row.model], [dear, "gpt-6-astra"]);
  // Seen again as first said: nothing back, nothing more.
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, luna);
  assert.equal((await rowsOf(ref))[0].cost, dear);
});

test("the same count seen later without the model the row has (priced as the dearest) pays nothing more", async () => {
  const { recordUsageFor } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  const ref = `turn_unknown_${Date.now()}`;
  const sol = tokens(0);
  const { model: _known, ...unknown } = sol;
  void _known;
  const paid = costOf("openai.tokens", 1_100, { ...sol, ref });
  assert.ok(costOf("openai.tokens", 1_100, { ...unknown, ref }) > paid);
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, sol);
  await recordUsageFor(alice, "openai.tokens", ref, 1_100, unknown);
  assert.deepEqual(await rowsOf(ref), [{ units: 1_100, cost: paid }]);
});

test("an object whose wait on a delete runs past the lock wait is tried once more, then logged whole for cleanup", async () => {
  await query(
    "INSERT INTO bops.deleted_users (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [bob],
  );
  process.env.BOPS_DB_LOCK_WAIT_MS = "300";
  const blocker = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await blocker.connect();
  const logged: string[] = [];
  const error = console.error;
  const warn = console.warn;
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  console.warn = (...a: unknown[]) => void logged.push(a.join(" "));
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT 1 FROM bops.app_state WHERE user_id = $1 FOR UPDATE",
      [bob],
    );
    const id = `ca_uq_late_${Date.now()}`;
    await assert.rejects(
      ownObject(bob, "composio", "connected_account", id),
      (e: Error & { code?: string }) => e.code === "55P03",
    );
    assert.ok(
      logged.some((l) => l.includes("trying once more") && l.includes(id)),
      logged.join("\n"),
    );
    assert.ok(
      logged.some(
        (l) => l.includes("NOT OWNED") && l.includes(id) && l.includes(bob),
      ),
      logged.join("\n"),
    );
  } finally {
    console.error = error;
    console.warn = warn;
    delete process.env.BOPS_DB_LOCK_WAIT_MS;
    await blocker.query("ROLLBACK").catch(() => {});
    await blocker.end();
    await query("DELETE FROM bops.deleted_users WHERE user_id = $1", [bob]);
  }
});

test("a lookup that fails is tried again with the write, then spooled with the use: never dropped", async () => {
  const { tokensUse } = await import("../usage.ts");
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  Object.assign(usageQueueTiming, { tries: 2, firstRetryMs: 20, maxRetryMs: 50 });
  const session = `sess_uq_fail_${Date.now()}`;
  const turn = `turn_uq_fail_${Date.now()}`;
  await ownObject(alice, "openai", "agent_session", session, "gpt-6.1-sol", "sam");
  let asked = 0;
  const said = tokensUse({ input_tokens: 1_000, output_tokens: 100 }, { source: "agent" });
  keepUse(alice, said, turn, {
    of: { provider: "openai", objectId: session },
    run: async () => {
      asked++;
      throw new Error("test: lookup refused");
    },
  });
  await until(async () => (await spooled()).some((u) => u.ref === turn), "it to be spooled");
  assert.equal(asked, 2, "tried with each of its tries");
  assert.deepEqual(await rowsOf(turn), []);
  // The replay in this process uses the same lookup: refused again, back on the spool.
  assert.equal(await replayUsage(), 0);
  assert.ok((await spooled()).some((u) => u.ref === turn && u.lookup?.objectId === session));
  assert.equal(asked, 3);
  // Read back from the spool by another process (no lookup of its own): its session's model and bot.
  const text = await readFile(spoolPath(), "utf8");
  await writeFile(spoolPath(), text.replaceAll(/"id":"use_[0-9a-f-]+"/g, (m) => m.replace("use_", "use_other_")));
  assert.ok((await replayUsage()) >= 1);
  const [row] = (
    await query<{ model: string; bot: string }>(
      "SELECT detail->>'model' AS model, detail->>'botId' AS bot FROM bops.cloud_usage WHERE user_id = $1 AND detail->>'ref' = $2",
      [alice, turn],
    )
  ).rows;
  assert.deepEqual(row, { model: "gpt-6.1-sol", bot: "sam" });
  assert.equal((await rowsOf(turn)).length, 1);
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

test("a turn whose session lookup is still under way at a stop is spooled with its session, and a replay looks it up: written once, at the session's model", async () => {
  const { tokensUse } = await import("../usage.ts");
  const { costOf } = await import("../pricing.ts");
  process.env.BOPS_USAGE_SPOOL = spoolPath();
  Object.assign(usageQueueTiming, { tries: 3, firstRetryMs: 20, maxRetryMs: 50 });
  const session = `sess_uq_late_${Date.now()}`;
  const turn = `turn_uq_late_${Date.now()}`;
  await ownObject(alice, "openai", "agent_session", session, "gpt-6-luna", "sam");
  // The proxy's own lookup (turnInfo), here one that answers only after the stop.
  let answer!: (v: { model?: string; botId?: string }) => void;
  const late = new Promise<{ model?: string; botId?: string }>((r) => (answer = r));
  const said = tokensUse(
    { input_tokens: 1_000, output_tokens: 100, input_tokens_details: { cached_tokens: 0 } },
    { source: "agent" },
  );
  assert.equal(
    keepUse(alice, said, turn, {
      of: { provider: "openai", objectId: session },
      run: () => late,
    }),
    turn,
  );
  assert.equal(usageQueueState().pending, 1, "queued before the lookup answers");
  const t0 = Date.now();
  assert.ok((await drainUsage(200)) >= 1);
  assert.ok(Date.now() - t0 < 1_500, `bounded by the drain's wait: ${Date.now() - t0} ms`);
  const [line] = (await spooled()).filter((u) => u.ref === turn);
  assert.ok(line, "on the spool");
  assert.deepEqual(line.lookup, { provider: "openai", objectId: session }, "with its session, still to look up");
  assert.equal(line.detail.model, undefined);
  // The lookup answers after the stop: that writer leaves it to the spool.
  answer({ model: "gpt-6-luna", botId: "sam" });
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(await rowsOf(turn), [], "not written by the late lookup: the spool has it");
  // The replay (as the next start's) looks the session up itself.
  const text = await readFile(spoolPath(), "utf8");
  assert.ok((await replayUsage()) >= 1);
  const dear = costOf("openai.tokens", 1_100, { ...tokens(0), model: "gpt-6-luna", ref: turn });
  assert.ok(dear < costOf("openai.tokens", 1_100, { source: "agent", input: 1_000, cached: 0, output: 100, ref: turn }), "cheaper than the dearest");
  const detail = async () =>
    (
      await query<{ model: string; bot: string; cost: number }>(
        "SELECT detail->>'model' AS model, detail->>'botId' AS bot, cost_micros::float8 AS cost FROM bops.cloud_usage WHERE user_id = $1 AND detail->>'ref' = $2",
        [alice, turn],
      )
    ).rows;
  assert.deepEqual(await detail(), [{ model: "gpt-6-luna", bot: "sam", cost: dear }]);
  // Replayed again (a replay cut off before it deleted the spool), and seen again by reconcile: paid once.
  await writeFile(spoolPath(), text);
  assert.ok((await replayUsage()) >= 1);
  const { recordUsageFor } = await import("../usage.ts");
  await recordUsageFor(alice, "openai.tokens", turn, said!.units, { ...said!.detail, model: "gpt-6-luna", botId: "sam" });
  assert.deepEqual(await detail(), [{ model: "gpt-6-luna", bot: "sam", cost: dear }]);
  assert.deepEqual(await spooled(), []);
});


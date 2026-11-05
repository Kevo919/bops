import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.ts";
import { HttpError } from "./http.ts";
import { ACCOUNT_DELETED } from "./protocol.ts";

/**
 * Postgres for Bops Cloud: the `bops` schema in orgo-web's database, as the `bops_app` role, which
 * can reach that schema only (db/README.md). One small pool for the whole process.
 */

let pool: pg.Pool | null = null;

export function db(): pg.Pool {
  if (pool) return pool;
  const url = config.databaseUrl();
  if (!url) throw new Error("BOPS_DATABASE_URL isn't set");
  pool = new pg.Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "bops-cloud",
    // No statement runs on forever and keeps its connection (one of 10) and whatever waits on it: Postgres
    // cancels it (57014). A wait that may rightly be long (a migration, a plan lock) lifts it (unbounded).
    // Row-lock waits count too. Behind a delete (delete-user.ts onUser holds the state row, and at its
    // last step the account row), a write cut at 57014 would have found the user gone had it waited (a
    // state write, a number, line or inbox recorded: their foreign keys wait on the account row only at
    // the last step), so it fails a little sooner and the Mac's retry is refused as deleted. The one
    // write that must wait it out is ownObject's of what a delete deletes at a provider: exempt there.
    statement_timeout: config.dbStatementTimeoutMs(),
  });
  pool.on("error", (e) => console.error(`[db] idle client: ${e.message}`));
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<pg.QueryResult<T>> {
  return db().query<T>(text, values);
}

/** A statement or a wait for a connection that ran past its bound (queryWithin). */
export class DbTimeout extends Error {
  code = "57014";
}

/**
 * A pool connection within `ms`, or DbTimeout. One that comes after is given straight back. (The
 * pool's own connectionTimeoutMillis is the 10 s any caller waits; this is a tighter one.)
 */
function connectWithin(ms: number): Promise<pg.PoolClient> {
  const asked = db().connect();
  return new Promise((resolve, reject) => {
    let late = false;
    const timer = setTimeout(() => {
      late = true;
      reject(new DbTimeout(`no database connection within ${ms} ms`));
    }, ms);
    asked.then(
      (c) => {
        clearTimeout(timer);
        if (late) c.release();
        else resolve(c);
      },
      (e: Error) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * One statement that must answer within `ms` in all, its wait for a pool connection included, tighter
 * than the pool's statement timeout: for a read something else waits on, such as a start's balance
 * (turn-guard.ts). Postgres cancels the statement with what's left (57014); a connection that doesn't
 * answer even so is cut by the client a second later, and not given back to the pool.
 */
export async function queryWithin<T extends pg.QueryResultRow = pg.QueryResultRow>(ms: number, text: string, values: unknown[] = []): Promise<pg.QueryResult<T>> {
  const end = Date.now() + ms;
  const c = await connectWithin(ms);
  const left = () => Math.max(1, Math.floor(end - Date.now()));
  let broken: Error | undefined;
  try {
    // pg reads query_timeout per query (lib/client.js), though its types don't list it.
    const q = <R extends pg.QueryResultRow>(sql: string, v?: unknown[]) => c.query<R>({ text: sql, values: v, query_timeout: left() + 1_000 } as pg.QueryConfig);
    await q("BEGIN");
    await q(`SET LOCAL statement_timeout = ${left()}`);
    const r = await q<T>(text, values);
    await q("COMMIT");
    return r;
  } catch (e) {
    broken = e as Error;
    throw e;
  } finally {
    // After a failure its state isn't known (a statement may still be running): never handed out again.
    c.release(broken ?? undefined);
  }
}

/** A session's statement timeout lifted for a wait that may rightly be long (a lock another holds through slow work), then put back. */
export async function unbounded<T>(c: pg.PoolClient, work: () => Promise<T>): Promise<T> {
  await c.query("SET statement_timeout = 0");
  try {
    return await work();
  } finally {
    await c.query("RESET statement_timeout").catch(() => {});
  }
}

/** Run `work` in one transaction (BEGIN … COMMIT, ROLLBACK on a throw). */
export async function tx<T>(work: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const out = await work(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Any fixed number: the advisory lock that lets one process at a time apply migrations. */
const MIGRATION_LOCK = 4_270_311;

/**
 * Apply db/migrations/*.sql in order. Each file is safe to run again and records itself in
 * bops.schema_migrations. Two processes starting at once take turns (an advisory lock), since two
 * CREATE TABLE IF NOT EXISTS racing each other can still fail.
 */
export async function migrate(): Promise<string[]> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const c = await db().connect();
  try {
    // A migration may take a while, and so may waiting for another process's.
    await c.query("SET statement_timeout = 0");
    await c.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    const done = new Set<string>();
    try {
      const r = await c.query<{ version: string }>("SELECT version FROM bops.schema_migrations");
      for (const row of r.rows) done.add(row.version);
    } catch {
      // No table yet: the first migration makes it.
    }
    const ran: string[] = [];
    for (const f of files) {
      const version = f.replace(/\.sql$/, "");
      if (done.has(version)) continue;
      await c.query(await readFile(join(dir, f), "utf8"));
      ran.push(version);
    }
    return ran;
  } finally {
    await c.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    await c.query("RESET statement_timeout").catch(() => {});
    c.release();
  }
}

/**
 * Ownership of provider objects (an OpenAI response or live session, a Composio connection): the
 * cloud records who made or was handed each id, so one user can't reach another's through a proxy.
 * An Agents API session keeps its model and its bot too, so its turns are priced at that model and
 * counted for that bot (usage.ts), and when it last got work, so the cloud reads its turns back
 * (reconcile.ts).
 *
 * A user deleted lately (bops.deleted_users, delete-user.ts) gets no row: what the cloud still has
 * under way for them (a turn the guard or reconcile.ts reads back, a call that got in before the
 * delete) would otherwise name them again after the delete answered 200, and nothing comes back for
 * it. But for what a delete deletes at a provider (STORED_AT_PROVIDER: a stored response, a connected
 * account), made by a call already under way when the delete came: that one is recorded while their
 * state row is still there (the delete is still going, or a provider stopped it short), so the
 * delete's last step sees it was made meanwhile and answers 502, and the retry deletes it there. It's
 * read under the state row's key lock, as a foreign key would take it, so it's in before the delete's
 * last step looks, or after the row is gone and not at all.
 */
export async function ownObject(userId: string, provider: string, kind: string, objectId: string, model?: string, botId?: string) {
  const atProvider = STORED_AT_PROVIDER.has(`${provider}:${kind}`);
  const sql = `INSERT INTO bops.cloud_objects (object_id, provider, kind, user_id, model, bot_id, used_at)
     SELECT $1, $2, $3, $4, $5, $6, CASE WHEN $3 = 'agent_session' THEN now() END
     WHERE NOT EXISTS (SELECT 1 FROM bops.deleted_users WHERE user_id = $4)
        OR ($7 AND EXISTS (SELECT 1 FROM bops.app_state WHERE user_id = $4 FOR KEY SHARE))
     ON CONFLICT (provider, object_id) DO NOTHING`;
  const values = [objectId, provider, kind, userId, model ?? null, botId ?? null, atProvider];
  if (!atProvider) return void (await query(sql, values));
  // What a delete deletes at a provider waits out a delete's step holding the state row (bounded by
  // lock_timeout, not the statement timeout): cut short, it wouldn't be recorded though the state row
  // is still there, so the delete's last step couldn't see it and it would be left at the provider.
  // A wait past lock_timeout (55P03) is tried once more; then it's logged whole, to be deleted at the
  // provider by hand, and the call fails as before.
  for (let attempt = 1; ; attempt++) {
    try {
      await tx(async (c) => {
        await c.query(`SET LOCAL statement_timeout = 0; SET LOCAL lock_timeout = ${config.dbLockWaitMs()}`);
        await c.query(sql, values);
      });
      return;
    } catch (e) {
      if ((e as { code?: unknown }).code !== "55P03") throw e;
      if (attempt < 2) {
        console.warn(`[db] ${provider} ${kind} ${objectId} for ${userId} waited past the lock wait, trying once more`);
        continue;
      }
      console.error(`[db] NOT OWNED (delete it at ${provider} by hand if ${userId} is deleted): ${JSON.stringify({ userId, provider, kind, objectId })}`);
      throw e;
    }
  }
}

/** The objects a delete deletes at their provider too (delete-user.ts), as `provider:kind`: the rest are only records here. */
export const STORED_AT_PROVIDER = new Set(["openai:response", "composio:connected_account"]);

/** The model an object was made with (an Agents API session's, to price its turns), or null when the cloud doesn't know it. */
export async function objectModel(provider: string, objectId: string): Promise<string | null> {
  return (await objectInfo(provider, objectId)).model;
}

/** An object's model and bot, as kept when it was made (nulls when the cloud doesn't know). */
export async function objectInfo(provider: string, objectId: string): Promise<{ model: string | null; botId: string | null }> {
  const r = await query<{ model: string | null; bot_id: string | null }>("SELECT model, bot_id FROM bops.cloud_objects WHERE provider = $1 AND object_id = $2", [provider, objectId]);
  return { model: r.rows[0]?.model ?? null, botId: r.rows[0]?.bot_id ?? null };
}

/** An Agents API session got work (a message): the cloud reads its turns back again once that's done (reconcile.ts). */
export async function sessionUsed(sessionId: string) {
  await query("UPDATE bops.cloud_objects SET used_at = now() WHERE provider = 'openai' AND kind = 'agent_session' AND object_id = $1", [sessionId]);
}

/** Who owns an object, or null when the cloud never saw it. */
export async function objectOwner(provider: string, objectId: string): Promise<string | null> {
  const r = await query<{ user_id: string }>("SELECT user_id FROM bops.cloud_objects WHERE provider = $1 AND object_id = $2", [provider, objectId]);
  return r.rows[0]?.user_id ?? null;
}

/* ---------------- Users deleted lately (delete-user.ts) ---------------- */

/**
 * How long a deleted user stays in bops.deleted_users (the tombstone) after the last delete-user call
 * for them, unless orgo-web lifts it first (POST /v1/internal/undelete-user, clearDeleted). Meanwhile
 * every sign-in of theirs is turned down (auth.ts) and nothing of theirs is written again (lockUser,
 * ensureUserRow, ownObject, usage.ts). Each call starts the days again, orgo-web's retries every 6 hours
 * among them, so once it's done it's 3 days after the call answered 200. The hourly sweep takes it then
 * (sweepDeletedUsers), and they're a user the cloud never heard of.
 *
 * Why 3 days, and no more: it's for while the delete runs and a short while after, for what can still
 * come for them once it answered. orgo-web deleted their Orgo keys when they asked to be deleted, well
 * before it calls (lib/account-deletion.ts), but Orgo still vouches for a bot computer's identity token
 * until the job's next step deletes the computer: that runs right after this one, and one held by a wake
 * or a migration is tried again for 24 hours. The Stripe cancel that came with the deletion ran before
 * this step, and Stripe sends its webhook again for up to 3 days, so its plan notice is in by then. The
 * cloud's own work under way (a phone turn, a plan's setup, a turn read back) ends within hours. Past
 * that it only gets in the way: a deletion staff cancel after this step ran leaves the user turned down
 * here until it goes, unless undelete-user lifts it first (orgo-web doesn't call it yet). What it doesn't
 * cover: a computer orgo-web leaves to staff (a device, a pool Mac, a dedicated computer: its pending
 * obligations) still on and signing in after the 3 days is let in again, as a user the cloud never heard
 * of. Deleting that computer is what ends it, not days here.
 */
export const DELETED_KEEP_DAYS = 3;

/**
 * What this process knows of the table, by user: deleted or not, and until when it's taken as known (ms),
 * so a sign-in asks Postgres at most once a minute per user. The table is what counts: a restart starts
 * this empty, and the first call of each user asks again. A delete or an undelete here sets it at once.
 */
const KNOWN_MS = 60_000;
const known = new Map<string, { deleted: boolean; until: number }>();
/** How many deletes and undeletes this process has made: an answer Postgres gave from before one isn't kept over it. */
let changes = 0;

function remember(userId: string, deleted: boolean) {
  const now = Date.now();
  known.set(userId, { deleted, until: now + KNOWN_MS });
  if (known.size > 10_000) for (const [id, k] of known) if (k.until <= now) known.delete(id);
}

/** The user was just deleted (delete-user.ts): in bops.deleted_users (its days start again), and known here at once. */
export async function markDeleted(userId: string) {
  changes++;
  remember(userId, true);
  await query("INSERT INTO bops.deleted_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET deleted_at = now()", [userId]);
}

/** The tombstone lifted (delete-user.ts undelete-user): out of bops.deleted_users, and known here at once. Whether there was one. */
export async function clearDeleted(userId: string): Promise<boolean> {
  const r = await query("DELETE FROM bops.deleted_users WHERE user_id = $1", [userId]);
  changes++;
  remember(userId, false);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Whether the user is in bops.deleted_users: from memory when it's been asked within the minute, else
 * from Postgres (which throws when it can't be asked). With no database at all (only a test's router
 * runs without one: server.ts migrates at the start), there's no table, and nobody is deleted.
 */
export async function isDeleted(userId: string): Promise<boolean> {
  const k = known.get(userId);
  if (k && k.until > Date.now()) return k.deleted;
  if (!config.databaseUrl()) return false;
  const asked = changes;
  const deleted = !!(await query("SELECT 1 FROM bops.deleted_users WHERE user_id = $1", [userId])).rowCount;
  // A delete or an undelete here while Postgres was asked knows better than its answer: that one's kept, not this.
  if (changes !== asked) {
    const now = known.get(userId);
    return now && now.until > Date.now() ? now.deleted : deleted;
  }
  remember(userId, deleted);
  return deleted;
}

/** For tests: forget what's known, as a restart does. */
export const forgetDeletedKnown = () => known.clear();

/** What a deleted user's call, or the cloud's own write for them, is answered: signed out, as Orgo answers their keys. */
export const accountDeleted = () => new HttpError(401, "This Orgo account was deleted", { code: ACCOUNT_DELETED });

/** Users deleted more than DELETED_KEEP_DAYS ago leave bops.deleted_users (state.ts runs it with its hourly sweeps). How many left. */
export async function sweepDeletedUsers(days = DELETED_KEEP_DAYS): Promise<number> {
  const r = await query("DELETE FROM bops.deleted_users WHERE deleted_at < now() - make_interval(days => $1)", [days]);
  return r.rowCount ?? 0;
}

/**
 * Make sure the user has a state row (other tables point at it). The Mac's first state upload fills it
 * in. A user deleted lately (bops.deleted_users) gets none, and the caller is refused (accountDeleted),
 * so nothing that hangs off the row (an account, a plan, a waiting event, a handle) is made again.
 */
export async function ensureUserRow(userId: string) {
  const r = await query<{ gone: boolean }>(
    `WITH gone AS (SELECT 1 FROM bops.deleted_users WHERE user_id = $1),
          made AS (
            INSERT INTO bops.app_state (user_id, state, version) SELECT $1, '{}'::jsonb, 0 WHERE NOT EXISTS (SELECT 1 FROM gone)
            ON CONFLICT (user_id) DO NOTHING)
     SELECT EXISTS (SELECT 1 FROM gone) AS gone`,
    [userId],
  );
  if (r.rows[0]?.gone) throw accountDeleted();
}

/** For tests and shutdown. */
export async function closeDb() {
  const p = pool;
  pool = null;
  await p?.end();
}

// Tests for the routines' inactivity brake (task 24): the owner's last look-in lives in the shared
// state (AppState.ownerSeenAt: the window's views and their own messages, throttled to once a minute),
// so every Bops and every runner of the user's reads one clock. A routine that would speak up is
// skipped, its run recorded "away", after the set days (Workspace, General: default 7, 0 never skips).
// Reminders are exempt (a one-off that skips is lost for good), quiet check-ins always run, Run now
// always runs and marks them present, and a Bops that has never seen them waits for the first
// sighting instead of skipping at wake.
// Usage: node --conditions=react-server scripts/test-routines-away.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-away";
const rootUrl = new URL("..", import.meta.url);
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-away-"));
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = at(specifier.slice(2));
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier))
        for (const ext of [".ts", ".tsx"])
          try {
            return next(specifier + ext, context);
          } catch {}
      throw e;
    }
  },
  load(url, context, next) {
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});
import { readFileSync } from "node:fs";

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 4).join("\n  ") ?? e.message}`);
  }
}

const S = await import(at("lib/server/store.ts"));
const R = await import(at("lib/server/routines.ts"));
const P = await import(at("lib/server/presence.ts"));
clearInterval(globalThis.__bopsRoutines);

const botId = S.getState().bots[0].id;
const chatId = (await import(at("lib/types.ts"))).botChatId(botId);
const DAY = 86_400_000;
/** The owner's last sighting in the shared state (what every device and runner reads). */
const seen = (at) => S.update((s) => (s.ownerSeenAt = at));
/** A routine in the state: speaking (default), quiet, or a reminder. */
const seed = (kind) =>
  S.update((s) => {
    s.owner = { name: "Alex", timeZone: "America/New_York" };
    s.routines = [{ id: "rtn_x", botId: s.bots[0].id, title: "News check", goal: "Check the news.", schedule: { kind: "daily", time: "09:00" }, enabled: true, ...(kind === "quiet" ? { quiet: true } : {}), ...(kind === "reminder" ? { reminder: "Drink water." } : {}) }];
  });

await check("the clock is the shared state's, and a Bops that never saw them waits", async () => {
  seen(Date.now() - 10 * DAY);
  assert.equal(P.awayOver(7), true, "ten days is over seven");
  assert.equal(P.awayOver(14), false, "but not over fourteen");
  S.update((s) => void delete s.ownerSeenAt);
  assert.equal(P.awayOver(3), false, "never seen: nothing skips, whatever the process's own age");
  seen(Date.now());
  assert.equal(P.awayOver(3), false, "just seen is away from nothing");
});

await check("markSeen writes the state at most once a minute (views come every few seconds)", async () => {
  seen(Date.now() - DAY);
  const before = S.getState().ownerSeenAt;
  P.markSeen(before + 1_000); // a second later: throttled away
  assert.equal(S.getState().ownerSeenAt, before, "a view two seconds on doesn't write");
  P.markSeen(before + 120_000);
  assert.ok(S.getState().ownerSeenAt > before, "a minute on does");
});

await check("a routine that would speak up is skipped as away, and the run says so", async () => {
  seed();
  seen(Date.now() - 8 * DAY);
  const run = await R.runRoutine("rtn_x");
  assert.equal(run.status, "skipped");
  assert.equal(run.error, "away");
  assert.equal(S.getState().routines[0].last.status, "skipped", "recorded on the routine");
});

await check("the same routine runs once they're back", async () => {
  seen(Date.now());
  const run = await R.runRoutine("rtn_x");
  assert.notEqual(run.status, "skipped");
});

await check("a quiet check-in runs even while they're away", async () => {
  seed("quiet");
  seen(Date.now() - 30 * DAY);
  assert.notEqual((await R.runRoutine("rtn_x")).status, "skipped");
});

await check("a reminder runs even while they're away (a one-off that skips is gone for good)", async () => {
  seed("reminder");
  seen(Date.now() - 30 * DAY);
  const run = await R.runRoutine("rtn_x");
  assert.notEqual(run.status, "skipped");
});

await check("Run now always runs, and marks them present in the shared state", async () => {
  seed();
  seen(Date.now() - 30 * DAY);
  const run = await R.runRoutine("rtn_x", { manual: "you" });
  assert.notEqual(run.status, "skipped");
  assert.ok(Date.now() - S.getState().ownerSeenAt < 5_000, "their own ask moved the clock");
});

await check("the setting: 0 never skips (and stays 0), and the days come from the state", async () => {
  seed();
  seen(Date.now() - 30 * DAY);
  S.update((s) => (s.routineAwayDays = 0));
  assert.notEqual((await R.runRoutine("rtn_x")).status, "skipped", "off is off, at any distance");
  S.update((s) => (s.routineAwayDays = 31));
  seen(Date.now() - 30 * DAY);
  assert.notEqual((await R.runRoutine("rtn_x")).status, "skipped", "30 days is under 31");
  S.update((s) => (s.routineAwayDays = 3));
  const run = await R.runRoutine("rtn_x");
  assert.equal(run.status, "skipped");
  assert.equal(run.error, "away");
});

await check("a window in front marks them present; one hidden, locked or behind others doesn't", async () => {
  seen(Date.now() - 30 * DAY);
  P.setView({ chatId, focused: false });
  assert.equal(P.awayOver(7), true, "the app still reports its view while hidden: that isn't them");
  P.setView({ chatId, focused: true });
  assert.equal(P.awayOver(7), false, "the window in front is");
});

await check("their own message in the chat marks them present", async () => {
  seed();
  seen(Date.now() - 30 * DAY);
  const Chat = await import(at("lib/server/chat.ts"));
  await Chat.handleMessage(chatId, "hello?");
  assert.ok(Date.now() - S.getState().ownerSeenAt < 5_000, "the message moved the clock");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
console.log(`routines away: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

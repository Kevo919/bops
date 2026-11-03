// Tests for the routines' inactivity brake (task 24): presence remembers when the owner was last
// around (the window's views and their own messages each move it), and a routine that would speak up
// is skipped, its run recorded "away", once they've been gone the set number of days (default 7,
// 0 never). A quiet check-in routine runs anyway, Run now always runs, and a manual run marks them
// present again. Nothing here reaches a model or a computer: the brake sits before all of that.
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
function check(name, fn) {
  try {
    fn();
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

const chatId = S.getState().bots[0] ? (await import(at("lib/types.ts"))).botChatId(S.getState().bots[0].id) : "";
const DAY = 86_400_000;
/** A routine in the state, as the brake sees it. */
const seed = (over) =>
  S.update((s) => {
    s.owner = { name: "Alex", timeZone: "America/New_York" };
    s.routines = [{ id: "rtn_x", botId: s.bots[0].id, title: "News check", goal: "Check the news.", schedule: { kind: "daily", time: "09:00" }, enabled: true, ...(over ? { quiet: true } : {}) }];
  });

check("presence: days away is counted from the last look-in, and any view or message moves it", () => {
  P.markSeen(Date.now() - 10 * DAY);
  assert.equal(P.awayOver(7), true, "ten days is over seven");
  assert.equal(P.awayOver(14), false, "but not over fourteen");
  P.markSeen();
  assert.equal(P.awayOver(3), false, "just seen is away from nothing");
});

check("a routine that would speak up is skipped as away, and the run says so", async () => {
  seed(false);
  P.markSeen(Date.now() - 8 * DAY);
  const run = await R.runRoutine("rtn_x");
  assert.equal(run.status, "skipped");
  assert.equal(run.error, "away");
  assert.equal(S.getState().routines[0].last.status, "skipped", "recorded on the routine");
});

check("the same routine runs once they're back", async () => {
  P.markSeen();
  const run = await R.runRoutine("rtn_x");
  assert.notEqual(run.status, "skipped");
});

check("a quiet check-in runs even while they're away", async () => {
  seed(true);
  P.markSeen(Date.now() - 30 * DAY);
  const run = await R.runRoutine("rtn_x");
  assert.notEqual(run.status, "skipped");
});

check("Run now always runs (their own ask), whatever the days", async () => {
  seed(false);
  P.markSeen(Date.now() - 30 * DAY);
  const run = await R.runRoutine("rtn_x", { manual: "you" });
  assert.notEqual(run.status, "skipped");
});

check("the setting: 0 never skips, and the days come from the state", async () => {
  seed(false);
  P.markSeen(Date.now() - 30 * DAY);
  S.update((s) => (s.routineAwayDays = 0));
  assert.notEqual((await R.runRoutine("rtn_x")).status, "skipped", "off is off");
  S.update((s) => (s.routineAwayDays = 31));
  P.markSeen(Date.now() - 30 * DAY);
  assert.notEqual((await R.runRoutine("rtn_x")).status, "skipped", "30 days is under 31");
  S.update((s) => (s.routineAwayDays = 3));
  const run = await R.runRoutine("rtn_x");
  assert.equal(run.status, "skipped");
  assert.equal(run.error, "away");
});

check("their own message in the chat marks them present", async () => {
  seed(false);
  P.markSeen(Date.now() - 30 * DAY);
  const Chat = await import(at("lib/server/chat.ts"));
  await Chat.handleMessage(chatId, "hello?");
  assert.equal(P.awayOver(3), false, "the message moved the clock");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
console.log(`routines away: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

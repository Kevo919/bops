// Tests for "Allow for this thread" (task 25): the approval card's fourth answer, between Allow once
// and Always allow. replyToAsk("session") answers the ask and records its action on that thread alone
// (Session.allowedAsks); threadAllows is the pre-check the app/data/API ask sites read, so the same ask
// doesn't pause that thread's run again - a different action, a different thread, a different bot or a
// fresh thread all ask as new. A chat turn's ask (no thread) can't be answered for a thread: it falls
// back to Allow once. Members' answers were left as they were (once/always/reject).
// Usage: node --conditions=react-server scripts/test-thread-asks.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-asks";
const rootUrl = new URL("..", import.meta.url);
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-asks-"));
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
const P = await import(at("lib/server/permission.ts"));
const { botChatId } = await import(at("lib/types.ts"));
clearInterval(globalThis.__bopsRoutines);

const botId = S.getState().bots[0].id;
const chatId = botChatId(botId);
/** A thread in the state, as an ask is placed on it. */
const thread = (id) =>
  S.update((s) => {
    s.owner = { name: "Alex", timeZone: "America/New_York" };
    s.sessions = [...s.sessions.filter((x) => x.id !== id), { id, botId, chatId, title: "A job", goal: "Do it.", host: "orgo", status: "running", steps: [], replies: [], createdAt: Date.now() }];
  });
/** An ask opened on a thread (or, with no thread, a chat turn's), as a tool pausing its run would. */
const ask = (action, threadId) => P.askFor({ action, resources: [], preview: "x" }, { botId, ...(threadId ? { threadId } : { chatId }) }, { engine: "chat", callId: "c" });
const allowed = (id) => S.getState().sessions.find((x) => x.id === id)?.allowedAsks ?? [];

check("Allow for this thread: answered, and the action remembered on that thread alone", () => {
  thread("ses_a");
  const a = ask("Create a row in Airtable", "ses_a");
  assert.equal(P.replyToAsk(a.id, "session"), undefined, "taken");
  assert.equal(a.reply.reply, "session");
  assert.deepEqual(allowed("ses_a"), ["Create a row in Airtable"]);
  assert.equal(P.threadAllows(botId, "ses_a", "Create a row in Airtable"), true, "the same ask is pre-allowed");
  assert.equal(P.threadAllows(botId, "ses_a", "Delete a row in Airtable"), false, "another action asks");
  assert.equal(P.threadAllows(botId, "ses_b", "Create a row in Airtable"), false, "another thread asks");
  assert.equal(P.threadAllows("bot_other", "ses_a", "Create a row in Airtable"), false, "another bot's asks");
  assert.equal(P.threadAllows(botId, undefined, "Create a row in Airtable"), false, "a chat turn is never thread-allowed");
});

check("the same ask again doesn't wait: the pre-check says yes, and twice-answering is refused", () => {
  assert.equal(P.threadAllows(botId, "ses_a", "Create a row in Airtable"), true);
  const again = ask("Create a row in Airtable", "ses_a");
  assert.equal(again.threadId, "ses_a");
  assert.equal(P.replyToAsk(again.id, "session"), undefined);
  assert.deepEqual(allowed("ses_a"), ["Create a row in Airtable"], "the same action once, not twice");
  assert.equal(P.replyToAsk(again.id, "once"), "That isn't waiting on you anymore.", "answered is answered");
});

check("a chat turn's ask can't be allowed for a thread: it lands as Allow once", () => {
  const a = ask("Send an email to Dana", undefined);
  assert.equal(a.threadId, undefined);
  assert.equal(P.replyToAsk(a.id, "session"), undefined);
  assert.equal(a.reply.reply, "once", "no thread to scope to, so once");
  assert.equal(S.getState().sessions.some((s) => (s.allowedAsks ?? []).includes("Send an email to Dana")), false, "its action granted nowhere");
});

check("the remembered actions keep to the last 50", () => {
  thread("ses_c");
  for (let i = 0; i < 55; i++) {
    const a = ask(`Action ${i}`, "ses_c");
    P.replyToAsk(a.id, "session");
  }
  const kept = allowed("ses_c");
  assert.equal(kept.length, 50);
  assert.deepEqual(kept.slice(0, 2), ["Action 5", "Action 6"], "the oldest fell off, the newest stayed");
  assert.equal(P.threadAllows(botId, "ses_c", "Action 54"), true);
  assert.equal(P.threadAllows(botId, "ses_c", "Action 0"), false);
});

check("Deny still works, and grants don't leak into it", () => {
  thread("ses_d");
  const no = ask("Pay an invoice", "ses_d");
  assert.equal(P.replyToAsk(no.id, "reject", "not that one"), undefined);
  assert.equal(no.reply.reply, "reject");
  assert.deepEqual(allowed("ses_d"), [], "nothing granted on a no");
});

check("Allow for this thread answers the same action's other waiting asks with it", () => {
  thread("ses_e");
  const one = ask("Create a row in Airtable", "ses_e");
  const two = ask("Create a row in Airtable", "ses_e");
  const other = ask("Delete a row in Airtable", "ses_e");
  assert.equal(P.replyToAsk(one.id, "session"), undefined);
  assert.equal(one.reply.reply, "session");
  assert.equal(two.reply.reply, "session", "its twin answered with it: it would run unasked anyway");
  assert.equal(other.reply, undefined, "a different action still waits");
  assert.deepEqual(allowed("ses_e"), ["Create a row in Airtable"]);
});

check("a runner's copy of a thread never rewrites its grants (cloud/computer-scope)", async () => {
  const Scope = await import(at("cloud/computer-scope.ts"));
  thread("ses_f");
  const one = ask("Create a row in Airtable", "ses_f");
  P.replyToAsk(one.id, "session");
  const stored = S.getState();
  // The runner sends the same thread back with the grant stripped, and with one of its own added.
  const mine = JSON.parse(JSON.stringify(stored));
  const t = mine.sessions.find((x) => x.id === "ses_f");
  delete t.allowedAsks;
  const kept = Scope.keepAllowed(JSON.parse(JSON.stringify(stored)), mine, { device: stored.sessions.find((x) => x.id === "ses_f")?.by ?? "other", user: "u", bots: [stored.bots[0].id] });
  const keptT = kept.blob.sessions.find((x) => x.id === "ses_f");
  assert.deepEqual(keptT.allowedAsks, ["Create a row in Airtable"], "the owner's word survives the runner's copy");
  // And one the runner tries to add isn't taken either.
  const mine2 = JSON.parse(JSON.stringify(stored));
  mine2.sessions.find((x) => x.id === "ses_f").allowedAsks = ["Pay everything"];
  const kept2 = Scope.keepAllowed(JSON.parse(JSON.stringify(stored)), mine2, { device: stored.sessions.find((x) => x.id === "ses_f")?.by ?? "other", user: "u", bots: [stored.bots[0].id] });
  assert.deepEqual(kept2.blob.sessions.find((x) => x.id === "ses_f").allowedAsks, ["Create a row in Airtable"], "a computer never says yes to itself");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
console.log(`thread asks: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

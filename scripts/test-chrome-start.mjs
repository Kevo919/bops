// Starting a bot's Chrome (lib/server/chrome-start.ts, used by local.ts ensureChrome): what a task's thread says and
// what the server's log keeps when Chrome isn't there, exits at once, or never answers on its port; that a busy port
// gets one more try on a free one; that a crashed Chrome's lock is cleared only when no Chrome uses the profile; and
// where Chrome is looked for on Windows (Program Files, Program Files (x86), LOCALAPPDATA, App Paths), from a fake
// environment. A FAKE Chrome (a Node script) stands in: it reads its mode from FAKE_CHROME_MODE and its port from
// --remote-debugging-port. No real Chrome, network or profile of this machine.
// Usage: node scripts/test-chrome-start.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChromeStartError,
  chromeStartLog,
  chromeStartWords,
  clearStaleLock,
  freePort,
  launchChrome,
  portBusy,
  startBotChrome,
  windowsChromeAt,
} from "../lib/server/chrome-start.ts";

const tmp = mkdtempSync(join(tmpdir(), "bops-chrome-start-"));
const fake = join(tmp, "fake-chrome");
writeFileSync(
  fake,
  `#!/usr/bin/env node
const port = Number(process.argv.find((a) => a.startsWith("--remote-debugging-port="))?.split("=")[1]);
const mode = process.env.FAKE_CHROME_MODE;
if (mode === "exit") process.exit(21);
if (mode === "hang") setInterval(() => {}, 1000);
if (mode === "listen")
  require("node:http").createServer((q, r) => r.end(JSON.stringify({ Browser: "Fake" }))).listen(port, "127.0.0.1");
`,
);
chmodSync(fake, 0o755);

// The test's own cdpUp: the fake's /json/version answering.
const up = async (port) => {
  try {
    return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })).ok;
  } catch {
    return false;
  }
};
const SECRET_ARG = "--user-data-dir=/Users/someone/private-profile-sk-planted";
const args = (p) => [SECRET_ARG, `--remote-debugging-port=${p}`];
const started = [];
const tracked = (cmd, a, o) => {
  const c = spawn(cmd, a, o);
  started.push(c);
  return c;
};

let passed = 0;
async function test(name, run) {
  await run();
  console.log(`ok ${++passed} - ${name}`);
}
const failsWith = async (p, check) => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ChromeStartError, `a ChromeStartError, not ${e}`);
    check(e);
    // Nothing of its arguments or profile in the thread's words or the log line.
    for (const text of [e.message, chromeStartLog(e.facts)]) {
      assert.ok(!text.includes("private-profile"), text);
      assert.ok(!text.includes("sk-planted"), text);
    }
    return e;
  }
  assert.fail("it started");
};

try {
  await test("not found: fails at once, says so, logs exe=missing", async () => {
    const t0 = Date.now();
    const e = await failsWith(launchChrome({ exe: join(tmp, "nope"), exeFound: false, args: args(1), port: await freePort(), up }), (e) => {
      assert.equal(e.facts.reason, "not-found");
      assert.equal(e.facts.exeFound, false);
    });
    assert.ok(Date.now() - t0 < 500);
    assert.match(e.message, /^Couldn't start the bot's Chrome on this PC: Google Chrome wasn't found/);
    assert.match(chromeStartLog(e.facts), /reason=not-found exe=missing/);
  });

  await test("not found though it looked there (gone since): the spawn error's code, not its message", async () => {
    const e = await failsWith(launchChrome({ exe: join(tmp, "gone"), exeFound: true, args: args(1), port: await freePort(), up }), (e) => {
      assert.equal(e.facts.reason, "not-found");
      assert.equal(e.facts.spawnCode, "ENOENT");
    });
    assert.ok(!chromeStartLog(e.facts).includes(tmp), "no path in the log");
  });

  await test("exits immediately: fails promptly with its exit code", async () => {
    process.env.FAKE_CHROME_MODE = "exit";
    const t0 = Date.now();
    const e = await failsWith(launchChrome({ exe: fake, exeFound: true, args: args(1), port: await freePort(), up, readyMs: 15_000 }), (e) => {
      assert.equal(e.facts.reason, "exited");
      assert.equal(e.facts.exitCode, 21);
    });
    assert.ok(Date.now() - t0 < 5000, `prompt, not the full wait (${Date.now() - t0}ms)`);
    assert.equal(e.message, "Couldn't start the bot's Chrome on this PC: it exited immediately with code 21.");
    assert.match(chromeStartLog(e.facts), /reason=exited exe=found spawn=- exit=21 signal=- elapsed=\d+ms port=\d+/);
  });

  await test("never listens: times out, and the Chrome it started is stopped", async () => {
    process.env.FAKE_CHROME_MODE = "hang";
    const e = await failsWith(launchChrome({ exe: fake, exeFound: true, args: args(1), port: await freePort(), up, readyMs: 1500, spawn: tracked }), (e) => {
      assert.equal(e.facts.reason, "timeout");
      assert.ok(e.facts.elapsedMs >= 1500);
    });
    assert.match(e.message, /didn't answer within 2 seconds/);
    const c = started.at(-1);
    assert.ok(c.killed, "stopped");
    // Gone (its handle is unref'd, so it's asked by pid rather than waited on).
    const alive = () => {
      try {
        process.kill(c.pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 40 && alive(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(alive(), false);
  });

  await test("success: answers on its port", async () => {
    process.env.FAKE_CHROME_MODE = "listen";
    const port = await freePort();
    await launchChrome({ exe: fake, exeFound: true, args: args(port), port, up, spawn: tracked });
    assert.equal(await up(port), true);
    started.at(-1).kill();
  });

  await test("port busy: one more try on a free port, which it returns", async () => {
    process.env.FAKE_CHROME_MODE = "listen";
    const holder = createServer().listen(0, "127.0.0.1");
    await new Promise((r) => holder.once("listening", r));
    const busy = holder.address().port;
    assert.equal(await portBusy(busy), true);
    const notes = [];
    const profile = join(tmp, "p-busy");
    mkdirSync(profile);
    const at = await startBotChrome({ exe: fake, exeFound: true, port: busy, profile, args, up, inUse: async () => false, note: (l) => notes.push(l), spawn: tracked });
    assert.notEqual(at, busy);
    assert.equal(await up(at), true);
    assert.deepEqual(notes, [`[chrome] port ${busy} busy: using ${at}`]);
    started.at(-1).kill();
    holder.close();
  });

  await test("port busy wording names the port", () => {
    assert.equal(chromeStartWords({ reason: "port-busy", exeFound: true, elapsedMs: 0, port: 9304 }), "Couldn't start the bot's Chrome on this PC: port 9304 is busy (another app is using it).");
    assert.match(chromeStartWords({ reason: "exited", exeFound: true, elapsedMs: 0, port: 1, exitCode: 21 }, "on your Mac"), /^Couldn't start the bot's Chrome on your Mac/);
  });

  await test("stale lock: cleared when no Chrome uses the profile, kept when one does", async () => {
    const profile = join(tmp, "p-lock");
    mkdirSync(profile);
    writeFileSync(join(profile, "lockfile"), "");
    // A SingletonLock is a symlink to "<host>-<pid>": dangling, which existsSync doesn't see.
    symlinkSync("other-host-12345", join(profile, "SingletonLock"));
    assert.equal(await clearStaleLock(profile, async () => true), false);
    assert.ok(existsSync(join(profile, "lockfile")));
    assert.equal(await clearStaleLock(profile, async () => false), true);
    assert.ok(!existsSync(join(profile, "lockfile")));
    assert.throws(() => lstatSync(join(profile, "SingletonLock")));
    // No lock: not even asked whether one runs.
    assert.equal(await clearStaleLock(profile, async () => assert.fail("asked")), false);
  });

  await test("Windows: Program Files, then Program Files (x86), then LOCALAPPDATA, then App Paths, from the given env", () => {
    const tail = join("Google", "Chrome", "Application", "chrome.exe");
    const env = { ProgramFiles: "/pf", "ProgramFiles(x86)": "/pf86", LOCALAPPDATA: "/lad" };
    const only = (hit) => (p) => p === hit;
    assert.deepEqual(windowsChromeAt(env, only(join("/pf", tail))), { path: join("/pf", tail), found: true, places: [join("/pf", tail), join("/pf86", tail), join("/lad", tail)] });
    assert.equal(windowsChromeAt(env, only(join("/pf86", tail))).path, join("/pf86", tail));
    assert.equal(windowsChromeAt(env, only(join("/lad", tail))).path, join("/lad", tail));
    // Names in any case, as Windows reads them (a copied env object is case-sensitive).
    assert.equal(windowsChromeAt({ PROGRAMFILES: "/PF", localappdata: "/l" }, only(join("/l", tail))).path, join("/l", tail));
    // ProgramW6432: the 64-bit folder, when this process's ProgramFiles is the 32-bit one.
    assert.equal(windowsChromeAt({ ProgramFiles: "/pf86", ProgramW6432: "/pf64" }, only(join("/pf64", tail))).path, join("/pf64", tail));
    assert.equal(windowsChromeAt(env, only("/elsewhere/chrome.exe"), "/elsewhere/chrome.exe").path, "/elsewhere/chrome.exe");
    // Not found: the first place, for the message only, and found false (launchChrome then says not found).
    assert.deepEqual(windowsChromeAt(env, () => false).found, false);
    assert.equal(windowsChromeAt(env, () => false).path, join("/pf", tail));
    // No locator variables at all (a stripped environment): still a plain answer, never a throw.
    assert.deepEqual(windowsChromeAt({}, () => false), { path: "chrome.exe", found: false, places: [] });
  });
} finally {
  for (const c of started) if (c.exitCode === null) c.kill();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${passed} passed`);


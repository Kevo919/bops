// Starting a bot's Chrome (lib/server/chrome-start.ts, used by local.ts ensureChrome): what a task's thread says and
// what the server's log keeps when Chrome isn't there, exits at once, or never answers; that the Chrome on a port is
// taken as the bot's only when its own profile names that port (DevToolsActivePort); that a busy port gets one more try
// with Chrome picking a free port itself; that a timed-out Chrome is stopped with everything it started; that a
// crashed Chrome's lock is cleared only when no Chrome uses the profile, and a failed check counts as in use; and where
// Chrome is looked for on Windows (Program Files, Program Files (x86), LOCALAPPDATA, App Paths), from a fake environment.
// A FAKE Chrome (a Node script) stands in: its mode from FAKE_CHROME_MODE, its port from --remote-debugging-port, and it
// writes DevToolsActivePort in its --user-data-dir as Chrome does. No real Chrome, network or profile of this machine.
// Usage: node scripts/test-chrome-start.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activePort,
  ChromeStartError,
  chromeStartLog,
  chromeStartWords,
  clearStaleLock,
  inUseFromCount,
  killTree,
  launchChrome,
  pgrepInUse,
  portBusy,
  startBotChrome,
  windowsChromeAt,
} from "../lib/server/chrome-start.ts";

const tmp = mkdtempSync(join(tmpdir(), "bops-chrome-start-"));
const fake = join(tmp, "fake-chrome");
writeFileSync(
  fake,
  `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const arg = (n) => process.argv.find((a) => a.startsWith(n + "="))?.slice(n.length + 1);
const port = Number(arg("--remote-debugging-port"));
const profile = arg("--user-data-dir");
const mode = process.env.FAKE_CHROME_MODE;
const active = (p) => writeFileSync(join(profile, "DevToolsActivePort"), p + "\\n/devtools/browser/fake\\n");
if (mode === "exit") process.exit(21);
if (mode === "hang") {
  // A helper process of its own, as Chrome has: the whole tree must go on a timeout.
  const kid = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(join(profile, "helper.pid"), String(kid.pid));
  setInterval(() => {}, 1000);
}
if (mode === "wrong") {
  active(port + 1);
  setInterval(() => {}, 1000);
}
if (mode === "listen") {
  const s = require("node:http").createServer((q, r) => r.end(JSON.stringify({ Browser: "Fake" })));
  s.listen(port, "127.0.0.1", () => active(s.address().port));
}
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
// Profiles named like something that mustn't leak: neither the thread's words nor the log line may carry them.
let n = 0;
const newProfile = () => {
  const p = join(tmp, `private-profile-sk-planted-${++n}`);
  mkdirSync(p);
  return p;
};
const argsFor = (profile) => (p) => [`--user-data-dir=${profile}`, `--remote-debugging-port=${p}`];
const anyPort = () =>
  new Promise((r) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
const started = [];
const tracked = (cmd, a, o) => {
  const c = spawn(cmd, a, o);
  started.push(c);
  return c;
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const gone = async (pid) => {
  for (let i = 0; i < 60 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
  return !alive(pid);
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
    for (const text of [e.message, chromeStartLog(e.facts)]) {
      assert.ok(!text.includes("private-profile"), text);
      assert.ok(!text.includes("sk-planted"), text);
      assert.ok(!text.includes(tmp), text);
    }
    return e;
  }
  assert.fail("it started");
};
const launch = async (o) => {
  const profile = o.profile ?? newProfile();
  return launchChrome({ exe: fake, exeFound: true, args: argsFor(profile), port: await anyPort(), profile, up, spawn: tracked, ...o });
};

try {
  await test("not found: fails at once, says so, logs exe=missing", async () => {
    const t0 = Date.now();
    const e = await failsWith(launch({ exe: join(tmp, "nope"), exeFound: false }), (e) => {
      assert.equal(e.facts.reason, "not-found");
      assert.equal(e.facts.exeFound, false);
    });
    assert.ok(Date.now() - t0 < 500);
    assert.match(e.message, /^Couldn't start the bot's Chrome on this PC: Google Chrome wasn't found/);
    assert.match(chromeStartLog(e.facts), /reason=not-found exe=missing/);
  });

  await test("not found though it looked there (gone since): the spawn error's code, not its message", async () => {
    await failsWith(launch({ exe: join(tmp, "gone") }), (e) => {
      assert.equal(e.facts.reason, "not-found");
      assert.equal(e.facts.spawnCode, "ENOENT");
    });
  });

  await test("exits immediately: fails promptly with its exit code", async () => {
    process.env.FAKE_CHROME_MODE = "exit";
    const t0 = Date.now();
    const e = await failsWith(launch({ readyMs: 15_000 }), (e) => {
      assert.equal(e.facts.reason, "exited");
      assert.equal(e.facts.exitCode, 21);
    });
    assert.ok(Date.now() - t0 < 5000, `prompt, not the full wait (${Date.now() - t0}ms)`);
    assert.equal(e.message, "Couldn't start the bot's Chrome on this PC: it exited immediately with code 21.");
    assert.match(chromeStartLog(e.facts), /reason=exited exe=found spawn=- exit=21 signal=- elapsed=\d+ms port=\d+/);
  });

  await test("never listens: times out, and the Chrome and the helper it started are both stopped (awaited)", async () => {
    process.env.FAKE_CHROME_MODE = "hang";
    const profile = newProfile();
    const e = await failsWith(launch({ profile, readyMs: 1500 }), (e) => {
      assert.equal(e.facts.reason, "timeout");
      assert.ok(e.facts.elapsedMs >= 1500);
    });
    assert.match(e.message, /didn't answer within 2 seconds/);
    const main = started.at(-1).pid;
    const helper = Number(readFileSync(join(profile, "helper.pid"), "utf8"));
    assert.ok(await gone(main), "the main process is stopped");
    assert.ok(await gone(helper), "its helper process is stopped too");
  });

  await test("success: answers on the port its own profile names", async () => {
    process.env.FAKE_CHROME_MODE = "listen";
    const port = await anyPort();
    const profile = newProfile();
    // A DevToolsActivePort left from a crashed Chrome names a stale port: removed before the start.
    writeFileSync(join(profile, "DevToolsActivePort"), "1\n");
    assert.equal(await launch({ port, profile }), port);
    assert.equal(activePort(profile), port);
    assert.equal(await up(port), true);
    await killTree(started.at(-1).pid);
  });

  await test("not ours: a port named that isn't the one asked for is refused, and its Chrome stopped", async () => {
    process.env.FAKE_CHROME_MODE = "wrong";
    const port = await anyPort();
    const e = await failsWith(launch({ port }), (e) => {
      assert.equal(e.facts.reason, "not-ours");
      assert.equal(e.facts.port, port + 1);
    });
    assert.match(e.message, /isn't this bot's, so it wasn't used/);
    assert.ok(await gone(started.at(-1).pid), "stopped");
  });

  await test("port busy: one more try with Chrome picking the port (0), read from its own profile", async () => {
    process.env.FAKE_CHROME_MODE = "listen";
    const holder = createServer().listen(0, "127.0.0.1");
    await new Promise((r) => holder.once("listening", r));
    const busy = holder.address().port;
    assert.equal(await portBusy(busy), true);
    const notes = [];
    const profile = newProfile();
    const at = await startBotChrome({ exe: fake, exeFound: true, port: busy, profile, args: argsFor(profile), up, inUse: async () => false, note: (l) => notes.push(l), spawn: tracked });
    assert.ok(started.at(-1).spawnargs.includes("--remote-debugging-port=0"), "asked Chrome to pick, rather than picking a port another bot could take first");
    assert.notEqual(at, busy);
    assert.equal(activePort(profile), at);
    assert.equal(await up(at), true);
    assert.deepEqual(notes, [`[chrome] port ${busy} busy: using ${at}`]);
    await killTree(started.at(-1).pid);
    holder.close();
  });

  await test("two bots on busy ports at once each get their own Chrome, never the other's", async () => {
    process.env.FAKE_CHROME_MODE = "listen";
    const holder = createServer().listen(0, "127.0.0.1");
    await new Promise((r) => holder.once("listening", r));
    const busy = holder.address().port;
    const [a, b] = [newProfile(), newProfile()];
    const go = (profile) => startBotChrome({ exe: fake, exeFound: true, port: busy, profile, args: argsFor(profile), up, inUse: async () => false, spawn: tracked });
    const [pa, pb] = await Promise.all([go(a), go(b)]);
    assert.notEqual(pa, pb);
    assert.equal(activePort(a), pa);
    assert.equal(activePort(b), pb);
    for (const c of started.slice(-2)) await killTree(c.pid);
    holder.close();
  });

  await test("wording names the port and the place", () => {
    assert.equal(chromeStartWords({ reason: "port-busy", exeFound: true, elapsedMs: 0, port: 9304 }), "Couldn't start the bot's Chrome on this PC: port 9304 is busy (another app is using it).");
    assert.match(chromeStartWords({ reason: "exited", exeFound: true, elapsedMs: 0, port: 1, exitCode: 21 }, "on your Mac"), /^Couldn't start the bot's Chrome on your Mac/);
  });

  await test("stale lock: cleared when no Chrome uses the profile; kept, and the start refused, when one does", async () => {
    const profile = newProfile();
    writeFileSync(join(profile, "lockfile"), "");
    // A SingletonLock is a symlink to "<host>-<pid>": dangling, which existsSync doesn't see.
    symlinkSync("other-host-12345", join(profile, "SingletonLock"));
    assert.equal(await clearStaleLock(profile, async () => true), "in-use");
    assert.ok(existsSync(join(profile, "lockfile")));
    const e = await failsWith(
      startBotChrome({ exe: fake, exeFound: true, port: await anyPort(), profile, args: argsFor(profile), up, inUse: async () => true, spawn: () => assert.fail("started") }),
      (e) => assert.equal(e.facts.reason, "profile-in-use"),
    );
    assert.match(e.message, /its profile is in use by another Chrome/);
    assert.equal(await clearStaleLock(profile, async () => false), "cleared");
    assert.ok(!existsSync(join(profile, "lockfile")));
    assert.throws(() => lstatSync(join(profile, "SingletonLock")));
    // No lock: not even asked whether one runs.
    assert.equal(await clearStaleLock(profile, async () => assert.fail("asked")), "none");
  });

  await test("lock check fails closed: a check that throws, pgrep's 2 or 3, PowerShell failing or answering oddly all read as in use", async () => {
    const profile = newProfile();
    writeFileSync(join(profile, "lockfile"), "");
    assert.equal(await clearStaleLock(profile, async () => Promise.reject(new Error("timed out"))), "in-use");
    assert.ok(existsSync(join(profile, "lockfile")), "kept");
    // pgrep: 0 is a match, 1 is none, anything else (2: bad pattern, 3: fault, ENOENT: no pgrep) is in use.
    assert.equal(pgrepInUse(null), true);
    assert.equal(pgrepInUse(Object.assign(new Error(), { code: 1 })), false);
    for (const code of [2, 3, "ENOENT"]) assert.equal(pgrepInUse(Object.assign(new Error(), { code })), true, String(code));
    // PowerShell's count (windows-host.ts profileChromeRunning).
    assert.equal(inUseFromCount(null, "0\r\n"), false);
    assert.equal(inUseFromCount(null, "2\r\n"), true);
    assert.equal(inUseFromCount(new Error("timeout"), ""), true);
    assert.equal(inUseFromCount(null, ""), true);
    assert.equal(inUseFromCount(null, "Get-CimInstance : Access denied"), true);
  });

  await test("Windows tree kill: taskkill /PID <pid> /T /F, awaited", async () => {
    const calls = [];
    let finished = false;
    await killTree(4242, { platform: "win32", run: (cmd, args, cb) => (calls.push([cmd, ...args]), setTimeout(() => ((finished = true), cb(null)), 50)) });
    assert.equal(finished, true, "waited for taskkill");
    assert.deepEqual(calls, [["taskkill", "/PID", "4242", "/T", "/F"]]);
    // taskkill failing (already gone) is fine.
    await killTree(4243, { platform: "win32", run: (cmd, args, cb) => cb(new Error("not found")) });
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
    assert.equal(windowsChromeAt(env, () => false).found, false);
    assert.equal(windowsChromeAt(env, () => false).path, join("/pf", tail));
    // No locator variables at all (a stripped environment): still a plain answer, never a throw.
    assert.deepEqual(windowsChromeAt({}, () => false), { path: "chrome.exe", found: false, places: [] });
  });
} finally {
  for (const c of started) if (alive(c.pid)) await killTree(c.pid);
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${passed} passed`);

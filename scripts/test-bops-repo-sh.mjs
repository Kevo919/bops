// Tests for vm/bin/bops-repo itself, run for real as a whole script with no root: every system command it
// calls (id, useradd, runuser, iptables, crontab, atq, atrm, loginctl, systemctl, pkill, pgrep, setsid, ...)
// is a stub on PATH that records how it was called. /etc, the linger folder and Bops' own folders are
// throwaway ones (BOPS_REPO_ETC, BOPS_REPO_LINGER, BOPS_REPO_BASE, BOPS_REPO_KEEP).
// What it checks: a new repo user is denied cron, at and systemd timers when it's made; stop clears its
// crontab, its at jobs (only its own), lingering and its user timers, ends its processes and checks none is
// left; a step's end clears what it scheduled; and a server value that isn't plain (x";cmd;") is refused
// before anything runs.
// Usage: node scripts/test-bops-repo-sh.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(root, "vm", "bin", "bops-repo");
let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.log(`not ok - ${name}\n  ${(e && e.stack) || e}`);
  }
};

const sched = (name) => `case "$*" in -r*) exit 0 ;; esac
[ -f "$STUB_DIR/accept-${name}" ] && exit 0
[ -f "$STUB_DIR/hang-${name}" ] && exec /bin/sleep 30
echo "${name}: you are not allowed" >&2; exit 1`;
const STUBS = {
  id: `case "$1" in
  -u) if [ -z "\${2:-}" ]; then echo 0; else grep -qx "$2" "$STUB_DIR/users" 2>/dev/null && echo 4242 || exit 1; fi ;;
  -nG) echo "$2" ;;
  *) grep -qx "$1" "$STUB_DIR/users" 2>/dev/null || exit 1 ;;
esac`,
  useradd: `for a; do last=$a; done; echo "$last" >> "$STUB_DIR/users"`,
  // The python probe answers ok; the scheduling probe really runs (as root here, with the stub schedulers
  // root found), unless sched-silent is set (no answer at all).
  runuser: `case "$*" in
  *python3*) cat > /dev/null; echo BOPS_PROBE=ok ;;
  *"try crontab"*) [ -f "$STUB_DIR/sched-silent" ] && exit 0; shift 3; exec "$@" ;;
esac
exit 0`,
  // A scheduler: refuses what the probe tries unless accept-<name> (takes it) or hang-<name> (never answers).
  crontab: sched("crontab"),
  at: sched("at"),
  "systemd-run": sched("systemd-run"),
  atq: `printf '7\\tThu Nov  5 10:00:00 2026 a repo-test\\n8\\tThu Nov  5 11:00:00 2026 a bops\\n9\\tFri Nov  6 09:00:00 2026 = repo-test\\n'`,
  pgrep: `[ -f "$STUB_DIR/pgrep" ] && cat "$STUB_DIR/pgrep"; exit 0`,
  // The user's processes: "pgrep" a live one that won't end, "zombie" a dead one not yet reaped.
  ps: `case "$*" in
  *stat=*) [ -f "$STUB_DIR/ps-fails" ] && exit 1; echo "0 Ss"; [ -f "$STUB_DIR/pgrep" ] && echo "4242 S"; [ -f "$STUB_DIR/zombie" ] && echo "4242 Z" ;;
  *ppid=*) [ -f "$STUB_DIR/zombie" ] && echo 999999 ;;
esac
exit 0`,
};
const RECORDED = ["iptables", "ip6tables", "ss", "chown", "pkill", "incrontab", "atrm", "loginctl", "systemctl", "setsid", "nohup", "sleep", "python3", "git", "tar", "timeout", "curl"];

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "bops-test-repo-sh-"));
  const bin = join(dir, "bin");
  for (const d of ["bin", "etc", "etc/polkit-1/rules.d", "linger", "base", "keep"]) mkdirSync(join(dir, d), { recursive: true });
  const write = (name, body) => writeFileSync(join(bin, name), `#!/bin/sh\nSTUB_DIR='${dir}'\necho "${name} $*" >> "$STUB_DIR/calls"\n${body}\n`, { mode: 0o755 });
  for (const [name, body] of Object.entries(STUBS)) write(name, body);
  for (const name of RECORDED) write(name, "exit 0");
  writeFileSync(join(dir, "calls"), "");
  const run = (...args) => {
    const r = spawnSync("bash", [SCRIPT, ...args], {
      encoding: "utf8",
      env: {
        BOPS_REPO_PROBE_SECS: "1",
        PATH: `${bin}:/usr/bin:/bin`,
        STUB_DIR: dir,
        BOPS_REPO_ETC: join(dir, "etc"),
        BOPS_REPO_LINGER: join(dir, "linger"),
        BOPS_REPO_BASE: join(dir, "base"),
        BOPS_REPO_KEEP: join(dir, "keep"),
      },
    });
    return { out: r.stdout + r.stderr, status: r.status };
  };
  const calls = () => readFileSync(join(dir, "calls"), "utf8").split("\n").filter(Boolean);
  const clear = () => writeFileSync(join(dir, "calls"), "");
  const etc = (f) => (existsSync(join(dir, "etc", f)) ? readFileSync(join(dir, "etc", f), "utf8") : null);
  const done = () => {
    const home = existsSync(join(dir, "keep", "t1", "home")) ? readFileSync(join(dir, "keep", "t1", "home"), "utf8").trim() : "";
    if (home.startsWith("/tmp/bops-repo-")) rmSync(home, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  };
  const flag = (f) => writeFileSync(join(dir, f), "");
  return { dir, run, calls, clear, etc, done, flag };
}
// Every process of the user frozen (a stopped process can't fork), then killed, by the user itself.
const KILLALL = "runuser -u repo-test -- /bin/bash -c kill -STOP -1; kill -KILL -1";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

check("the script is sound shell", () => {
  assert.equal(spawnSync("bash", ["-n", SCRIPT]).status, 0);
});

check("prepare: a new repo user is denied cron, at and systemd timers (no allow list there before)", () => {
  const s = sandbox();
  try {
    const r = s.run("prepare", "t1", "repo-test", "-");
    assert.match(r.out, /BOPS_REPO_READY=1/, r.out);
    const c = s.calls();
    assert.ok(c.some((l) => l.startsWith("useradd ") && l.endsWith(" repo-test")), "the user is made");
    assert.equal(s.etc("cron.deny"), "repo-test\n", "cron.deny names it");
    assert.equal(s.etc("cron.allow"), null, "no cron.allow made (it would shut out the bot's own users)");
    assert.equal(s.etc("at.allow"), "root\n", "at stays root's alone: at.allow of root, as with neither file");
    assert.equal(s.etc("at.deny"), "repo-test\n", "at.deny names it");
    assert.ok(c.includes("loginctl disable-linger repo-test"), "no lingering");
    assert.ok(c.includes("systemctl mask --now user@4242.service"), "its user manager masked: no user timers, no systemd-run --user");
    assert.match(s.etc("polkit-1/rules.d/49-bops-repo.rules"), /\^repo-.*polkit\.Result\.NO/, "polkit refuses repo users everything");
    assert.ok(c.includes("crontab -r -u repo-test"), "anything left from before is cleared");
    // A second prepare doesn't list it twice.
    s.run("prepare", "t1", "repo-test", "-");
    assert.equal(s.etc("cron.deny"), "repo-test\n");
    assert.equal(s.etc("at.deny"), "repo-test\n");
  } finally {
    s.done();
  }
});

check("prepare: an existing allow list loses the repo user and keeps everyone else; an existing at.deny is added to", () => {
  const s = sandbox();
  try {
    writeFileSync(join(s.dir, "etc", "cron.allow"), "root\nbops\nrepo-test\n");
    writeFileSync(join(s.dir, "etc", "at.deny"), "daemon\nnobody\n");
    const r = s.run("prepare", "t1", "repo-test", "-");
    assert.match(r.out, /BOPS_REPO_READY=1/, r.out);
    assert.equal(s.etc("cron.allow"), "root\nbops\n");
    assert.equal(s.etc("cron.deny"), "repo-test\n");
    assert.equal(s.etc("at.deny"), "daemon\nnobody\nrepo-test\n");
    assert.equal(s.etc("at.allow"), null, "at.deny was there: everyone else keeps at as before");
  } finally {
    s.done();
  }
});

check("stop: crontab, its own at jobs, incrontab, lingering, user manager cleared; every process frozen, killed, checked gone", () => {
  const s = sandbox();
  try {
    s.run("prepare", "t1", "repo-test", "-");
    writeFileSync(join(s.dir, "linger", "repo-test"), "");
    s.clear();
    const r = s.run("stop", "t1", "repo-test");
    assert.match(r.out, /BOPS_REPO_STOPPED=1/, r.out);
    const c = s.calls();
    for (const want of ["crontab -r -u repo-test", "incrontab -r -u repo-test", "atq ", "atrm 7", "atrm 9", "loginctl disable-linger repo-test", "systemctl stop user@4242.service", "pkill -TERM -u repo-test", KILLALL, "pkill -KILL -u repo-test", "ps -e -o uid=,stat=", "ps -o ppid= -u repo-test"])
      assert.ok(c.some((l) => l === want || l.startsWith(want)), `stop runs ${want}\n${c.join("\n")}`);
    assert.ok(!c.includes("atrm 8"), "another user's at job is left alone");
    assert.ok(c.indexOf(KILLALL) > c.indexOf("pkill -TERM -u repo-test"), "frozen and killed, as the user, after the TERM");
    assert.ok(c.indexOf("crontab -r -u repo-test") < c.indexOf("pkill -TERM -u repo-test"), "what it scheduled goes before its processes are ended");
    assert.ok(c.lastIndexOf("crontab -r -u repo-test") > c.lastIndexOf("ps -e -o uid=,stat="), "and once more after");
    assert.ok(!existsSync(join(s.dir, "linger", "repo-test")), "its linger file is gone");
  } finally {
    s.done();
  }
});

check("stop: a process that won't end fails the stop, but only after every cleanup step ran", () => {
  const s = sandbox();
  try {
    s.run("prepare", "t1", "repo-test", "-");
    writeFileSync(join(s.dir, "pgrep"), "31337\n");
    s.clear();
    const r = s.run("stop", "t1", "repo-test");
    assert.match(r.out, /BOPS_REPO_FAIL=procs-left/);
    assert.doesNotMatch(r.out, /BOPS_REPO_STOPPED/);
    const c = s.calls();
    assert.equal(c.filter((l) => l === KILLALL).length, 10, "ten freeze-and-kill rounds");
    assert.ok(c.lastIndexOf("crontab -r -u repo-test") > c.lastIndexOf("ps -e -o uid=,stat="), "the second cleanup still ran");
    assert.ok(c.lastIndexOf("atrm 9") > c.lastIndexOf("ps -e -o uid=,stat="));
    // A zombie (dead, not yet reaped) isn't a process left: its parent is woken, and the stop passes.
    rmSync(join(s.dir, "pgrep"));
    s.flag("zombie");
    assert.match(s.run("stop", "t1", "repo-test").out, /BOPS_REPO_STOPPED=1/);
    s.flag("pgrep");
    // reset too: it fails rather than wiping src under a live process.
    const reset = s.run("reset", "t1", "repo-test");
    assert.match(reset.out, /BOPS_REPO_FAIL=procs-left/);
  } finally {
    s.done();
  }
});

check("fail-closed nits: prepare ends leftovers first; stop cleans up fully even when a deny list can't be written; a failing ps is never 'none left'", () => {
  const s = sandbox();
  try {
    // prepare: a leftover of an earlier run is ended before the probe and before the old HOME goes.
    s.run("prepare", "t1", "repo-test", "-");
    const oldHome = readFileSync(join(s.dir, "keep", "t1", "home"), "utf8").trim();
    s.clear();
    assert.match(s.run("prepare", "t1", "repo-test", "-").out, /BOPS_REPO_READY=1/);
    let c = s.calls();
    const killed = c.indexOf(KILLALL);
    assert.ok(killed >= 0 && killed < c.findIndex((l) => l.startsWith("runuser") && l.includes("python3")), "killed before the probe");
    assert.ok(!existsSync(oldHome), "then the old HOME went");
    const home2 = readFileSync(join(s.dir, "keep", "t1", "home"), "utf8").trim();
    s.flag("pgrep");
    s.clear();
    const stuck = s.run("prepare", "t1", "repo-test", "-");
    assert.match(stuck.out, /BOPS_REPO_FAIL=procs-left/);
    assert.ok(existsSync(home2), "a process that won't end: its HOME is left, nothing deleted under it");
    assert.ok(!s.calls().some((l) => l.includes("python3")), "and no probe ran");
    rmSync(join(s.dir, "pgrep"));
    // stop: cron.deny can't be written (a folder in its place): every cleanup step still runs, then it fails.
    rmSync(join(s.dir, "etc", "cron.deny"));
    mkdirSync(join(s.dir, "etc", "cron.deny"));
    s.clear();
    const r = s.run("stop", "t1", "repo-test");
    assert.match(r.out, /BOPS_REPO_FAIL=no-deny/, r.out);
    assert.doesNotMatch(r.out, /BOPS_REPO_STOPPED/);
    c = s.calls();
    for (const want of ["crontab -r -u repo-test", "atrm 7", "pkill -TERM -u repo-test", KILLALL, "systemctl stop user@4242.service"]) assert.ok(c.includes(want), `still ran ${want}`);
    rmSync(join(s.dir, "etc", "cron.deny"), { recursive: true });
    // ps failing: the count is unknown, so the stop fails (procs-left), after every cleanup step.
    s.flag("ps-fails");
    s.clear();
    const p = s.run("stop", "t1", "repo-test");
    assert.match(p.out, /BOPS_REPO_FAIL=procs-left/);
    assert.match(Buffer.from(p.out.match(/BOPS_REPO_WHY=(\S+)/)[1], "base64").toString("utf8"), /couldn't be counted/);
    assert.ok(s.calls().lastIndexOf("crontab -r -u repo-test") > s.calls().lastIndexOf(KILLALL));
  } finally {
    s.done();
  }
});

check("root never follows the user's links: a symlinked ~/.config, src or src.tgz can't make root delete, chown or write elsewhere", () => {
  const s = sandbox();
  try {
    s.run("prepare", "t1", "repo-test", "-");
    const victim = join(s.dir, "victim");
    mkdirSync(join(victim, "systemd", "user"), { recursive: true });
    writeFileSync(join(victim, "systemd", "user", "keep"), "precious");
    writeFileSync(join(victim, "file"), "precious");
    // ~/.config (and ~/.config/systemd) a link to elsewhere: stop deletes nothing through it.
    const home = readFileSync(join(s.dir, "keep", "t1", "home"), "utf8").trim();
    symlinkSync(victim, join(home, ".config"));
    assert.match(s.run("stop", "t1", "repo-test").out, /BOPS_REPO_STOPPED=1/);
    assert.equal(readFileSync(join(victim, "systemd", "user", "keep"), "utf8"), "precious");
    // src a link to elsewhere: reset removes the link, makes a real folder, and chowns only that.
    const src = join(s.dir, "base", "t1", "src");
    rmSync(src, { recursive: true, force: true });
    symlinkSync(victim, src);
    s.clear();
    assert.match(s.run("reset", "t1", "repo-test").out, /BOPS_REPO_RESET=1/);
    assert.equal(readFileSync(join(victim, "file"), "utf8"), "precious");
    assert.ok(!lstatSync(src).isSymbolicLink() && lstatSync(src).isDirectory());
    assert.ok(s.calls().every((l) => !l.startsWith("chown") || l === `chown -h repo-test:repo-test ${src}`), s.calls().join("\n"));
    // src.tgz a link in the user's folder: unpack never writes there (the archive goes on stdin).
    symlinkSync(join(victim, "file"), join(s.dir, "base", "t1", "src.tgz"));
    const tgz = Buffer.from("not really a tarball");
    writeFileSync(join(s.dir, "keep", "t1", "tgz.all"), tgz);
    const sum = createHash("sha256").update(tgz).digest("hex");
    assert.match(s.run("unpack", "t1", "repo-test", sum).out, /BOPS_REPO_UNPACKED=1/);
    assert.equal(readFileSync(join(victim, "file"), "utf8"), "precious");
  } finally {
    s.done();
  }
});

check("the probe fails closed: a scheduler that takes a job, hangs, or no answer at all fails prepare", () => {
  for (const [setup, why] of [
    [(s) => s.flag("accept-crontab"), /can schedule with crontab/],
    [(s) => s.flag("accept-at"), /can schedule with at/],
    [(s) => s.flag("accept-systemd-run"), /can schedule with systemd-run/],
    [(s) => s.flag("hang-at"), /could not check at \(it hung\)/],
    [(s) => s.flag("sched-silent"), /the scheduling check did not run/],
  ]) {
    const s = sandbox();
    try {
      setup(s);
      const r = s.run("prepare", "t1", "repo-test", "-");
      assert.match(r.out, /BOPS_REPO_FAIL=unsafe/, r.out);
      const said = Buffer.from(r.out.match(/BOPS_REPO_WHY=(\S+)/)[1], "base64").toString("utf8");
      assert.match(said, why);
      assert.doesNotMatch(r.out, /BOPS_REPO_READY/);
      const c = s.calls();
      assert.ok(c.lastIndexOf("crontab -r -u repo-test") > c.findIndex((l) => l.startsWith("crontab -") && !l.startsWith("crontab -r")), "what it scheduled is cleared");
    } finally {
      s.done();
    }
  }
  // Refused everywhere: it passes, and each scheduler was really tried as the user.
  const s = sandbox();
  try {
    assert.match(s.run("prepare", "t1", "repo-test", "-").out, /BOPS_REPO_READY=1/);
    const c = s.calls();
    for (const t of ["crontab -", "at now + 1 year", "systemd-run --user --on-active=365d /bin/true"]) assert.ok(c.includes(t), `${t} tried`);
  } finally {
    s.done();
  }
});

check("incron denied; polkit rule rewritten when it differs; any touch (begin, status) and the update sweep deny and clear older users", () => {
  const s = sandbox();
  try {
    writeFileSync(join(s.dir, "etc", "incron.allow"), "root\nrepo-test\n");
    writeFileSync(join(s.dir, "etc", "polkit-1", "rules.d", "49-bops-repo.rules"), "// stale\n");
    s.run("prepare", "t1", "repo-test", "-");
    assert.equal(s.etc("incron.allow"), "root\n");
    assert.equal(s.etc("incron.deny"), "repo-test\n");
    assert.match(s.etc("polkit-1/rules.d/49-bops-repo.rules"), /polkit\.Result\.NO/);
    // A user an older bops-repo made: not in the deny lists, maybe with a crontab.
    writeFileSync(join(s.dir, "users"), "repo-test\nrepo-old\n");
    writeFileSync(join(s.dir, "etc", "passwd"), "root:x:0:0::/root:/bin/bash\nbops:x:1000:1000::/home/bops:/bin/bash\nrepo-test:x:998:998::/nonexistent:/usr/sbin/nologin\nrepo-old:x:997:997::/nonexistent:/usr/sbin/nologin\n");
    s.clear();
    assert.match(s.run("status", "t2", "repo-old").out, /BOPS_REPO_STATUS/);
    assert.match(s.etc("cron.deny"), /^repo-old$/m);
    assert.ok(s.calls().includes("crontab -r -u repo-old"));
    writeFileSync(join(s.dir, "etc", "cron.deny"), "");
    s.clear();
    assert.match(s.run("begin", "t1", "repo-test", "run", "60", "-", b64("echo hi")).out, /BOPS_REPO_BEGUN/);
    assert.equal(s.etc("cron.deny"), "repo-test\n");
    assert.ok(s.calls().indexOf("crontab -r -u repo-test") >= 0);
    writeFileSync(join(s.dir, "etc", "cron.deny"), "");
    s.clear();
    const swept = s.run("sweep", "all");
    assert.match(swept.out, /BOPS_REPO_SWEPT=2/, swept.out);
    assert.equal(s.etc("cron.deny"), "repo-test\nrepo-old\n");
    const c = s.calls();
    for (const u of ["repo-test", "repo-old"]) assert.ok(c.includes(`crontab -r -u ${u}`) && c.includes(`atq `), u);
    assert.ok(!c.some((l) => l.includes("bops") && l.startsWith("crontab")), "the bot's own user is left alone");
    assert.ok(!c.some((l) => l.startsWith("pkill") || l.includes("kill -")), "the sweep kills nothing (a server may be running)");
  } finally {
    s.done();
  }
});

check("a step's end clears what it scheduled (the step's own processes are stop's)", () => {
  const s = sandbox();
  try {
    s.run("prepare", "t1", "repo-test", "-");
    s.clear();
    const r = s.run("_run", "t1", "repo-test", "install-0", "60", b64("A=1"), b64("echo hi"));
    assert.equal(r.status, 0, r.out);
    const c = s.calls();
    assert.ok(c.some((l) => l.startsWith("runuser -u repo-test")), "the step ran as its user");
    assert.ok(c.indexOf("crontab -r -u repo-test") > c.findIndex((l) => l.startsWith("runuser ")), "then its crontab went");
    assert.ok(c.some((l) => l.startsWith("atrm ")), "and its at jobs");
    assert.ok(!c.some((l) => l.startsWith("pkill ")), "a server left running isn't killed by a step's end");
    assert.equal(readFileSync(join(s.dir, "keep", "t1", "install-0.exit"), "utf8").trim(), "0");
  } finally {
    s.done();
  }
});

check('values that aren\'t plain (x";cmd;") are refused before anything runs', () => {
  const s = sandbox();
  try {
    s.run("prepare", "t1", "repo-test", "-");
    const evil = 'x";touch PWNED;"';
    const cases = [
      ["begin", "t1", "repo-test", "run", "60", evil, b64("echo hi")],
      ["begin", "t1", "repo-test", "run", "60", "-", evil],
      ["begin", "t1", "repo-test", "run", "60", "-", "-"],
      ["begin", "t1", "repo-test", "run", "60", "$(touch PWNED)", b64("echo hi")],
      ["_run", "t1", "repo-test", "run", "60", evil, b64("echo hi")],
      ["_run", "t1", "repo-test", "run", "60", "-", evil],
      ["_run", "t1", "repo-test", "run", "1;touch PWNED", "-", b64("echo hi")],
      ["begin", "t1", "repo-test", "run", "60", b64("LD_AUDIT=/x.so"), b64("echo hi")],
      ["http", "3000", evil],
      ["prepare", "t1", 'repo-x";id;"', "-"],
      ["stop", "t1", "repo-test;id"],
    ];
    for (const args of cases) {
      s.clear();
      const r = s.run(...args);
      assert.match(r.out, /BOPS_REPO_FAIL=bad-/, `${args.join(" ")} is refused: ${r.out}`);
      assert.notEqual(r.status, 0);
      const c = s.calls();
      for (const tool of ["setsid", "runuser", "useradd", "pkill", "curl", "crontab", "iptables"])
        assert.ok(!c.some((l) => l.startsWith(`${tool} `)), `${args.join(" ")}: nothing ran (${tool})\n${c.join("\n")}`);
      assert.ok(!existsSync(join(s.dir, "PWNED")) && !existsSync("PWNED"), "nothing was parsed as shell");
    }
    // The good shape still begins (detached, every value passed as an argument).
    s.clear();
    const ok = s.run("begin", "t1", "repo-test", "run", "60", b64("A=1"), b64("echo hi"));
    assert.match(ok.out, /BOPS_REPO_BEGUN=run/, ok.out);
    // (Detached with &: its stub may write a moment after the script answers.)
    const begun = () => s.calls().some((l) => l.startsWith("setsid nohup ") && l.includes(" _run t1 repo-test run 60 "));
    for (let i = 0; i < 100 && !begun(); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    assert.ok(begun(), "detached as _run with the same checked arguments");
  } finally {
    s.done();
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

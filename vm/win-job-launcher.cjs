// One Claude Code turn's launcher (Windows, lib/server/pc-task-runner.ts runClaudeTurn): the turn's
// processes must all sit in the Job Object the sitter holds, including whatever Claude forks in its
// first moments - and the runner can't assign a child to a job itself. So the runner spawns THIS
// launcher instead of the CLI: the sitter puts the launcher in the job and writes the go file (the
// BOPS_JOB_GO env names it), and only then does the launcher run the CLI as its own child (stdio
// inherited: the runner's pipes flow straight through), so the CLI and everything it ever starts
// inherit the job from the launcher - no window after the CLI starts in which a fork escapes.
//
// Fail closed: the CLI runs only once the go file is there. The wait ends early when `<go>.failed`
// appears (the sitter writes it on any failure before it assigns; the runner writes it when the
// sitter couldn't start or left without a go file), and otherwise after BOPS_JOB_WAIT_MS (default
// 30 s: a cold PowerShell plus the first Add-Type compile). Either way the launcher says why on
// stderr and exits 75 without running the CLI, and the runner reports that the turn couldn't start.
// A CLI that isn't there exits 127 (the runner says Claude Code isn't installed, as for ENOENT).
// Each of those exits writes a "[bops-launcher]" line, which is how the runner tells them from the
// CLI's own exit codes (pc-task-runner.ts LAUNCHER_EXIT, launcherFailure).
//
// The runner sets ELECTRON_RUN_AS_NODE so the packaged Bops.exe runs this as Node; it's taken back
// out of the CLI's env unless BOPS_JOB_KEEP_RUN_AS_NODE says the turn's own env had it.
//
// Usage: node win-job-launcher.cjs <cli> [arg...]   (env: BOPS_JOB_GO=<path>, BOPS_JOB_WAIT_MS=<ms>)
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");

const EXIT_NO_CLI = 127;
const EXIT_NO_JOB = 75;
const say = (what) => process.stderr.write(`[bops-launcher] ${what}\n`);

const [cli, ...args] = process.argv.slice(2);
if (!cli) process.exit(64);
const goFile = process.env.BOPS_JOB_GO;
const failFile = goFile ? `${goFile}.failed` : "";
const waitMs = Number(process.env.BOPS_JOB_WAIT_MS) || 30_000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

if (goFile) {
  const startedAt = Date.now();
  // Short sleeps between looks: the sitter with its cached DLL writes the go file within a moment.
  while (!existsSync(goFile) && !existsSync(failFile) && Date.now() - startedAt < waitMs) sleep(25);
  if (!existsSync(goFile)) {
    const why = existsSync(failFile)
      ? "the job sitter failed before it held this turn (see %LOCALAPPDATA%\\Bops-team\\win-job-sitter.log)"
      : `the job sitter didn't say go within ${waitMs} ms`;
    say(`NOT starting Claude Code: ${why}. A turn never runs outside its job.`);
    process.exit(EXIT_NO_JOB);
  }
}

const env = { ...process.env };
if (env.BOPS_JOB_KEEP_RUN_AS_NODE !== "1") delete env.ELECTRON_RUN_AS_NODE;
delete env.BOPS_JOB_KEEP_RUN_AS_NODE;

// stdio "inherit": the CLI's stdin/stdout/stderr ARE the launcher's, which are the runner's pipes.
const child = spawn(cli, args, { stdio: "inherit", windowsHide: true, shell: false, env });
child.once("error", (e) => {
  if (e && e.code === "ENOENT") {
    say(`Claude Code isn't installed: ${cli} wasn't found`);
    process.exit(EXIT_NO_CLI);
  }
  say(`Claude Code couldn't start: ${e && e.message}`);
  process.exit(70);
});
child.once("exit", (code, sig) => process.exit(sig ? 128 + 1 : (code ?? 0)));

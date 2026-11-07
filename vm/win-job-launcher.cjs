// One Claude Code turn's launcher (Windows, lib/server/pc-task-runner.ts runClaudeTurn): the turn's
// processes must all sit in the Job Object the sitter holds, including whatever Claude forks in its
// first moments - and the runner can't assign a child to a job itself. So the runner spawns THIS
// launcher instead of the CLI: the sitter puts the launcher in the job and writes the go file (the
// BOPS_JOB_GO env names it), and only then does the launcher run the CLI as its own child (stdio
// inherited: the runner's pipes flow straight through), so the CLI and everything it ever starts
// inherit the job from the launcher - no window after the CLI starts in which a fork escapes.
//
// If the go file never comes (sitter couldn't start, couldn't assign, or an old sitter without one),
// the launcher runs the CLI anyway after BOPS_JOB_WAIT_MS: the turn still runs, only without the
// job - the runner's tree stop (taskkill) is what ends its processes, as before the job existed.
//
// Usage: node win-job-launcher.cjs <cli> [arg...]   (env: BOPS_JOB_GO=<path>, BOPS_JOB_WAIT_MS=<ms>)
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");

const [cli, ...args] = process.argv.slice(2);
if (!cli) process.exit(64);
const goFile = process.env.BOPS_JOB_GO;
const waitMs = Number(process.env.BOPS_JOB_WAIT_MS) || 3000;
const startedAt = Date.now();
if (goFile) {
  while (Date.now() - startedAt < waitMs && !existsSync(goFile)) {
    // A short sleep between looks: the sitter with its cached DLL writes the file within a moment.
    const slept = Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    if (slept !== "timed-out" && slept !== "ok") break;
  }
}

// stdio "inherit": the CLI's stdin/stdout/stderr ARE the launcher's, which are the runner's pipes.
const child = spawn(cli, args, { stdio: "inherit", windowsHide: true, shell: false });
child.once("error", () => process.exit(70));
child.once("exit", (code, sig) => process.exit(sig ? 128 + 1 : code ?? 0));

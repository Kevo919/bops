/**
 * What the desktop app does differently on Windows. main.cjs was written for the Mac: it asks a login
 * shell for PATH, talks to its render helper over a Unix socket, stops the server's whole process group
 * with a negative pid, and finds bots' Chrome with pkill. None of that exists on Windows; each has its
 * Windows equal here, and main.cjs calls these only when process.platform is "win32", so the Mac app
 * runs exactly as before.
 */
const { execFile, execFileSync, spawn } = require("node:child_process");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");

const isWindows = process.platform === "win32";

/**
 * Windows has no login shell to ask: the PATH the app was started with is already the user's (the
 * Start menu and Explorer hand every app the user's and the system's PATH).
 */
const windowsPath = () => process.env.PATH ?? process.env.Path ?? "";

/**
 * A named pipe in place of the Mac's socket file. Named for this Windows user (a hash of their name),
 * so another user signed in to the same PC has a pipe of their own; the render helper still checks
 * the window's token on every request, as on the Mac.
 */
function renderPipe() {
  const who = crypto.createHash("sha256").update(`${os.userInfo().username}@${os.hostname()}`).digest("hex").slice(0, 16);
  return `\\\\.\\pipe\\bops-render-${who}`;
}

/** Options every child the app starts needs on Windows: no console window flashing up. */
const hidden = (opts) => (isWindows ? { ...opts, windowsHide: true } : opts);

/**
 * The development server, started straight with node and Next's own bin: on Windows `npx next dev`
 * runs as cmd → npx → cmd → node, a chain whose middle outlives its top, so stopping the top left
 * the server running. One node at the top is one tree to stop. (On the Mac: npx, as before.)
 */
const devServer = (repo, port) =>
  isWindows
    ? { command: "node", args: [path.join(repo, "node_modules", "next", "dist", "bin", "next"), "dev", "--port", String(port)] }
    : { command: "npx", args: ["next", "dev", "--port", String(port)] };

/** Stop a process and everything it started, at once (the Windows equal of SIGKILL to a process group). */
function killTree(pid) {
  if (!pid) return;
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 10000 });
  } catch {}
}

/**
 * Stop the server the way the Mac's SIGTERM does: first ask it to save (POST /api/restart saves the
 * state and answers, lib/server/restart.ts), then stop its process tree. Windows can't send a console
 * process SIGTERM from another one, so without the ask the last quarter second of changes could be
 * lost. It runs as a small detached PowerShell, so it finishes even after the app has quit.
 */
function stopServerTree(pid, port, token) {
  if (!pid) return;
  // Done before it returns: a helper left running in the background is stopped with the app when it
  // quits (Electron's processes share a job on Windows), and the server would outlive it. The save
  // takes well under a second; it gives up after 8.
  const script = `
try { Invoke-WebRequest -UseBasicParsing -Method POST -TimeoutSec 8 -Headers @{ "x-bops-window" = $env:BOPS_STOP_TOKEN; "origin" = "http://127.0.0.1:$env:BOPS_STOP_PORT" } "http://127.0.0.1:$env:BOPS_STOP_PORT/api/restart" | Out-Null } catch {}
taskkill /PID $env:BOPS_STOP_PID /T /F | Out-Null
`;
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 15000,
      // The token goes in the environment, never on the command line, where other programs can read it.
      env: { ...process.env, BOPS_STOP_PID: String(pid), BOPS_STOP_PORT: String(port), BOPS_STOP_TOKEN: token ?? "" },
    });
  } catch {}
  killTree(pid);
}

/** Bots' own Chrome (its profile is under ~/.bops/chrome/): the Windows equal of `pkill -f .bops/chrome/`. */
function killBotChrome() {
  const script = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*\\.bops\\chrome\\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {}
}

/**
 * Who listens on `port`, the Windows equal of main.cjs's lsof and ps: its process id, its parent's,
 * its name and its command line (which says whether it's a Bops server, and from which folder).
 *
 * Some Windows builds report a loopback listener's owner as process 0 (netstat too). Then the server
 * is found by what it runs instead: a node or Bops process running Next from one of `dirs` (the app's
 * source in development) or the bundled server (BOPS_SERVER_JS), the first of a chain (npx, then node).
 */
function listener(port, dirs = []) {
  const like = dirs.map((d) => `$_.CommandLine -like '*${String(d).replace(/'/g, "''")}*'`).join(" -or ") || "$false";
  const script = `$c = Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | Select-Object -First 1
if ($c) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" }
elseif (Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue) {
  $all = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and (($_.CommandLine -like '*next*' -and (${like})) -or $_.CommandLine -like '*BOPS_SERVER_JS*') })
  $ids = $all | ForEach-Object { $_.ProcessId }
  $p = $all | Where-Object { $ids -notcontains $_.ParentProcessId } | Select-Object -First 1
}
if ($p) { "$($p.ProcessId)|$($p.ParentProcessId)|$($p.Name)|$($p.CommandLine)" }`;
  return new Promise((resolve) =>
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 10000 }, (err, out) => {
      const m = /^(\d+)\|(\d+)\|([^|]*)\|(.*)$/m.exec(String(out ?? "").trim());
      if (err || !m) return resolve(null);
      resolve({ pid: Number(m[1]), ppid: Number(m[2]), name: m[3] || "a program", cmdline: m[4] });
    }),
  );
}

/** Whether a process id is still running (process.kill(pid, 0) works on Windows too). */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

module.exports = { listener, alive, isWindows, windowsPath, renderPipe, hidden, devServer, killTree, stopServerTree, killBotChrome };

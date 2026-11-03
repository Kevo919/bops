/**
 * What the desktop app does differently on Windows. main.cjs was written for the Mac: it asks a login
 * shell for PATH, talks to its render helper over a Unix socket, stops the server's whole process group
 * with a negative pid, and finds bots' Chrome with pkill. None of that exists on Windows; each has its
 * Windows equal here, and main.cjs calls these only when process.platform is "win32", so the Mac app
 * runs exactly as before.
 */
const { execFile, spawn } = require("node:child_process");
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
 * `npx` is npx.cmd on Windows, and Node only runs a .cmd through a shell (since its 2024 security fix
 * it refuses to spawn one directly). The arguments here are the app's own, never the user's.
 */
const npx = () => (isWindows ? { command: "npx.cmd", shell: true } : { command: "npx", shell: false });

/** Stop a process and everything it started, at once (the Windows equal of SIGKILL to a process group). */
function killTree(pid) {
  if (!pid) return;
  try {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {});
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
  const script = `
try { Invoke-WebRequest -UseBasicParsing -Method POST -TimeoutSec 8 -Headers @{ "x-bops-window" = $env:BOPS_STOP_TOKEN; "origin" = "http://127.0.0.1:$env:BOPS_STOP_PORT" } "http://127.0.0.1:$env:BOPS_STOP_PORT/api/restart" | Out-Null } catch {}
Start-Sleep -Milliseconds 500
taskkill /PID $env:BOPS_STOP_PID /T /F | Out-Null
`;
  try {
    spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      // The token goes in the environment, never on the command line, where other programs can read it.
      env: { ...process.env, BOPS_STOP_PID: String(pid), BOPS_STOP_PORT: String(port), BOPS_STOP_TOKEN: token ?? "" },
    }).unref();
  } catch {
    killTree(pid);
  }
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
 */
function listener(port) {
  const script = `$c = Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"; "$($p.ProcessId)|$($p.ParentProcessId)|$($p.Name)|$($p.CommandLine)" }`;
  return new Promise((resolve) =>
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 8000 }, (err, out) => {
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

module.exports = { listener, alive, isWindows, windowsPath, renderPipe, hidden, npx, killTree, stopServerTree, killBotChrome };

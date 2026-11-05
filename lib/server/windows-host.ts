import "server-only";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { inUseFromCount, windowsChromeAt } from "./chrome-start";

/**
 * Tasks on a Windows PC, where local.ts was written for the Mac: Chrome in another place, its version
 * read from the registry rather than its Info.plist, and the bots' Chromes found by their command line
 * (PowerShell) rather than pgrep and pkill. Used only when process.platform is "win32".
 */

export const onWindows = process.platform === "win32";

/**
 * Where Chrome installs on Windows: for every user (Program Files, 64-bit then 32-bit), then for this user only
 * (LOCALAPPDATA), then wherever Windows' App Paths key says chrome.exe is (an install somewhere else). Read each
 * time it's asked (chrome-start.ts windowsChromeAt): Chrome installed after Bops started is found too.
 */
export function windowsChromeFound() {
  const first = windowsChromeAt(process.env);
  if (first.found) return first;
  return windowsChromeAt(process.env, existsSync, windowsChromeAppPath());
}
export const windowsChrome = () => windowsChromeFound().path;

/** chrome.exe's path from the App Paths key (this user's, then the machine's), if it's set and there. */
function windowsChromeAppPath() {
  for (const key of ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe", "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe"])
    try {
      const out = execFileSync("reg", ["query", key, "/ve"], { timeout: 2000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).toString();
      const v = /REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/im.exec(out)?.[1]?.replace(/^"|"$/g, "");
      if (v && existsSync(v)) return v;
    } catch {}
  return null;
}

/** Chrome's version, from the key its updater keeps (HKCU, then the machine's). */
export function windowsChromeVersion() {
  for (const key of ["HKCU\\Software\\Google\\Chrome\\BLBeacon", "HKLM\\Software\\Google\\Chrome\\BLBeacon"])
    try {
      const out = execFileSync("reg", ["query", key, "/v", "version"], { timeout: 2000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).toString();
      const v = /version\s+REG_SZ\s+([\d.]+)/i.exec(out)?.[1];
      if (v) return v;
    } catch {}
  return null;
}

/** What headless Chrome presents itself as on Windows (it says "HeadlessChrome" otherwise). */
export const windowsUserAgent = (version: string) =>
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version.split(".")[0]}.0.0.0 Safari/537.36`;

/**
 * The Chromes started with a profile under `root` (the bots', never the user's own): whether any runs,
 * and stopping them. The folder goes to PowerShell in the environment, not in the script.
 */
const FIND = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains(('--user-data-dir=' + $env:BOPS_CHROME_ROOT).ToLower()) }`;

const ps = (script: string, root: string) =>
  new Promise<string>((resolve) =>
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15000, env: { ...process.env, BOPS_CHROME_ROOT: root } }, (_, out) => resolve(String(out ?? ""))),
  );

export const botChromesRunning = async (root: string) => Number((await ps(`@(${FIND}).Count`, root)).trim()) > 0;

/**
 * Whether a Chrome runs with this one profile (ensureChrome, before it clears a lock a crashed one left). Fails
 * closed: PowerShell failing, timing out or answering anything but a count reads as in use, so a lock a
 * running Chrome holds is never removed.
 */
export const profileChromeRunning = (profile: string) =>
  new Promise<boolean>((resolve) =>
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `@(${FIND}).Count`],
      { windowsHide: true, timeout: 15000, env: { ...process.env, BOPS_CHROME_ROOT: profile } },
      (e, out) => resolve(inUseFromCount(e, String(out ?? ""))),
    ),
  );

export const stopBotChromes = (root: string) => ps(`${FIND} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`, root);

/** This Windows user's home, as Codex and the shell expect it (USERPROFILE). */
export const windowsHome = () => process.env.USERPROFILE ?? process.env.HOME ?? "";

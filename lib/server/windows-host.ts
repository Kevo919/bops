import "server-only";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Tasks on a Windows PC, where local.ts was written for the Mac: Chrome in another place, its version
 * read from the registry rather than its Info.plist, and the bots' Chromes found by their command line
 * (PowerShell) rather than pgrep and pkill. Used only when process.platform is "win32".
 */

export const onWindows = process.platform === "win32";

/** Where Chrome installs on Windows: for every user, then for this user only. */
export function windowsChrome() {
  const places = [
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean) as string[];
  return places.find((p) => existsSync(p)) ?? places[0] ?? "chrome.exe";
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

export const stopBotChromes = (root: string) => ps(`${FIND} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`, root);

/** This Windows user's home, as Codex and the shell expect it (USERPROFILE). */
export const windowsHome = () => process.env.USERPROFILE ?? process.env.HOME ?? "";

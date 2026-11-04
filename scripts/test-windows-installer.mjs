// node scripts/test-windows-installer.mjs [app-builder-lib/templates/nsis]
// Static packaging checks and synthetic shortcut control flow; no install/app launch.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const hook = readFileSync(join(root, "build/installer.nsh"), "utf8");
const dir = pkg.scripts["app:build:win:dir"];
assert.ok(dir.startsWith("next build && "));
assert.ok(dir.includes("desktop/repo.json") && dir.includes("built: true"));
assert.match(dir, /electron-builder --win --x64 --dir --publish never$/);
assert.doesNotMatch(dir, /--win nsis/);
assert.match(pkg.scripts["app:build:win"], /--win nsis --x64 --publish never$/);
assert.equal(pkg.build.nsis.artifactName, "Bops-Setup-${version}-${arch}.exe");
assert.equal(pkg.build.nsis.perMachine, false);
assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
assert.equal(pkg.build.nsis.runAfterFinish, false);
console.log("ok packaging keeps installer and unpacked commands distinct, versioned, per-user and non-publishing");

// Interpret only the small hook's actual NSIS control flow. Unknown syntax fails,
// so changes cannot silently fall outside the synthetic regression model.
function customInstall(state) {
  const enabled = [true];
  for (const raw of hook.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^!macro(?:end| customInstall)$/.test(line)) continue;
    let match;
    if ((match = /^\$\{if\} \$keepShortcuts == "(true|false)"$/.exec(line))) enabled.push(enabled.at(-1) && state.keep === match[1]);
    else if ((match = /^\$\{if\} \$\{FileExists\} "\$(newStartMenuLink|newDesktopLink)"$/.exec(line))) enabled.push(enabled.at(-1) && !!state.links[match[1]]);
    else if (line === "${endif}") { assert.ok(enabled.length > 1); enabled.pop(); }
    else if ((match = /^StrCpy \$keepShortcuts "(true|false)"$/.exec(line))) { if (enabled.at(-1)) state.keep = match[1]; }
    else if ((match = /^!insertmacro (addDesktopLink|addStartMenuLink) \$keepShortcuts$/.exec(line))) {
      if (enabled.at(-1)) stockLink(state, match[1] === "addDesktopLink" ? "newDesktopLink" : "newStartMenuLink");
    } else assert.fail(`Unmodeled NSIS statement: ${line}`);
  }
  assert.equal(enabled.length, 1);
}
function stockLink(state, link) {
  if (state.keep !== "false" || (link === "newDesktopLink" && state.noDesktop)) return;
  state.links[link] = "installed/Bops.exe";
  state.writes[link]++;
}
let passed = 1;
for (const test of [
  { name: "fresh install creates each shortcut once", keep: "false", links: {}, expected: [1, 1] },
  { name: "fresh install replaces development shortcuts once", keep: "false", links: { newDesktopLink: "win-unpacked/Bops.exe", newStartMenuLink: "win-unpacked/Bops.exe" }, expected: [1, 1] },
  { name: "upgrade refreshes preserved development targets once", keep: "true", links: { newDesktopLink: "win-unpacked/Bops.exe", newStartMenuLink: "win-unpacked/Bops.exe" }, expected: [1, 1] },
  { name: "upgrade preserves deleted desktop shortcut", keep: "true", links: { newStartMenuLink: "old/Bops.exe" }, expected: [0, 1] },
  { name: "upgrade preserves both deleted shortcuts", keep: "true", links: {}, expected: [0, 0] },
  { name: "fresh opt-out creates no desktop shortcut", keep: "false", noDesktop: true, links: {}, expected: [0, 1] },
  { name: "upgrade opt-out does not modify desktop shortcut", keep: "true", noDesktop: true, links: { newDesktopLink: "existing/Bops.exe", newStartMenuLink: "old/Bops.exe" }, expected: [0, 1] },
]) {
  const state = { ...test, links: { ...test.links }, writes: { newDesktopLink: 0, newStartMenuLink: 0 } };
  stockLink(state, "newStartMenuLink"); stockLink(state, "newDesktopLink");
  customInstall(state);
  assert.deepEqual([state.writes.newDesktopLink, state.writes.newStartMenuLink], test.expected, test.name);
  assert.equal(state.keep, test.keep, "hook leaves builder state unchanged");
  for (const link of Object.keys(state.writes)) {
    if (state.writes[link]) assert.equal(state.links[link], "installed/Bops.exe");
    else assert.equal(state.links[link], test.links[link]);
  }
  passed++; console.log(`ok ${test.name}`);
}
if (process.argv[2]) {
  const section = readFileSync(join(process.argv[2], "installSection.nsh"), "utf8");
  for (const macro of ["addDesktopLink", "addStartMenuLink"]) assert.ok(section.indexOf(`!insertmacro ${macro}`) < section.indexOf("!insertmacro customInstall"));
  const macros = readFileSync(join(process.argv[2], "include/installer.nsh"), "utf8");
  const desktop = macros.split("!macro addDesktopLink keepShortcuts")[1].split("!macroend")[0];
  assert.match(desktop, /\$\{ifNot\} \$\{isNoDesktopShortcut\}/);
  assert.match(desktop, /\$\{if\} \$keepShortcuts == "false"\s+CreateShortCut/);
  assert.ok(macros.includes('WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"'));
  passed++; console.log("ok bundled NSIS template order and desktop opt-out match fixture assumptions");
} else console.log("SKIP bundled template compatibility: supply installed app-builder-lib/templates/nsis path");
console.log(`Windows installer: ${passed} checks passed; no installer or app launched`);

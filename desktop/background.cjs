/**
 * Bops in the background on Windows. On a Mac the app keeps running in the Dock when its window
 * closes; Windows apps quit with their last window, which stopped routines, watches, Telegram and
 * Discord, and the paired phone with it. So on Windows Bops sits in the notification area (the tray):
 * closing the window only hides it, and it can start with Windows, hidden.
 *
 * The tray's menu: Open Bops, Start with Windows, Keep running when closed, Quit Bops. "Keep running"
 * is on by default and kept in Bops' own folder (background.json); "Start with Windows" is Windows' own
 * setting for this app (app.setLoginItemSettings). Not used on the Mac.
 */
const fs = require("node:fs");
const path = require("node:path");

function installBackground({ app, Tray, Menu, Notification, nativeImage, icon, showMain, log }) {
  if (process.platform !== "win32") return { attach() {}, startHidden: () => false };
  const file = path.join(app.getPath("userData"), "background.json");
  const read = () => {
    try {
      return { keep: true, told: false, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch {
      return { keep: true, told: false };
    }
  };
  const write = (v) => {
    try {
      fs.writeFileSync(file, JSON.stringify({ ...read(), ...v }));
    } catch {}
  };
  // In development (`npm run app`) Windows starts electron.exe, which needs the app's folder to run it.
  const loginArgs = () => (app.isPackaged ? ["--hidden"] : [app.getAppPath(), "--hidden"]);
  const atLogin = () => app.getLoginItemSettings({ args: loginArgs() }).openAtLogin;
  let quitting = false;
  app.on("before-quit", () => (quitting = true));

  let tray;
  const menu = () =>
    Menu.buildFromTemplate([
      { label: "Open Bops", click: () => showMain() },
      { type: "separator" },
      {
        label: "Start with Windows",
        type: "checkbox",
        checked: atLogin(),
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked, args: loginArgs() });
          tray?.setContextMenu(menu());
        },
      },
      {
        label: "Keep running when closed",
        type: "checkbox",
        checked: read().keep,
        click: (item) => write({ keep: item.checked }),
      },
      { type: "separator" },
      { label: "Quit Bops", click: () => ((quitting = true), app.quit()) },
    ]);
  app.whenReady().then(() => {
    try {
      tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }));
      tray.setToolTip("Bops");
      tray.setContextMenu(menu());
      tray.on("click", () => showMain());
    } catch (e) {
      log(`tray: ${e?.message ?? e}`);
    }
  });

  return {
    /** Started by Windows at sign-in: the window stays hidden until opened from the tray. */
    startHidden: () => process.argv.includes("--hidden"),
    /** Closing the main window hides it, while "Keep running when closed" is on. */
    attach(win) {
      win.on("close", (e) => {
        if (quitting || !read().keep || !tray) return;
        e.preventDefault();
        win.hide();
        if (!read().told) {
          write({ told: true });
          try {
            new Notification({ title: "Bops is still running", body: "Your bots keep working. Open Bops or quit it from its icon by the clock.", silent: true }).show();
          } catch {}
        }
      });
    },
  };
}

module.exports = { installBackground };

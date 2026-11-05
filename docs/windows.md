# Install Bops on Windows

This installer puts the Bops desktop app in your Windows user account and adds a **Bops** Start menu shortcut. It targets x64 Windows. The app does not launch automatically when installation finishes.

**This build remains linked to the repository used to build it.** Keep that checkout at its original location, with its `node_modules`, `.next` production build and configuration. Node must remain available on PATH. `desktop/repo.json` records the checkout's absolute path. The installer is not a standalone distribution for another PC; build it from that PC's own configured checkout instead.

## Prepare and build

1. Install Node.js 24 and Git, and obtain this fork's `windows-port` checkout in a permanent folder. Node 24 matches the fork's CI runtime.
2. If Bops is running, right-click its icon in the Windows notification area (use the hidden-icons arrow if needed) and choose **Quit Bops**. Closing the window alone can leave it running in the tray. Quit before replacing dependencies, rebuilding or reinstalling.
3. Open PowerShell in the repository folder. For a first setup, run `npm run setup:win`; it creates `.env.local` from the example only when that file is missing. Configure the app as described in the [main README](../README.md). Keep existing configuration and credentials private.
4. Install the locked dependencies and build the installer:

   ```powershell
   npm ci --include=dev
   npm run app:build:win
   ```

   Let each command finish successfully before continuing. The build compiles the Next.js server and packages the desktop app. Its installer output is `dist-desktop/Bops-Setup-<version>-x64.exe` (the version comes from `package.json`); `dist-desktop/win-unpacked/Bops.exe` is the intermediate unpacked app, not the installer.

   For an unpacked development build without creating an NSIS installer, run `npm run app:build:win:dir`. This also builds Next.js and records the original checkout in `desktop/repo.json`, then produces `dist-desktop/win-unpacked/Bops.exe`. It does not install shortcuts or publish artifacts. Quit Bops first as described above.

## Install and open

1. In File Explorer, open the checkout's `dist-desktop` folder and double-click `Bops-Setup-<version>-x64.exe`, choosing the version you just built.
2. Installation is per-user, normally under `%LOCALAPPDATA%\Programs\bops`. It adds **Bops** to your Start menu and desktop. A previous installation can determine the actual installation directory.
3. Press the Windows key, type **Bops**, and select the installed app. Keep the original checkout available whenever you use it.

This local build is unsigned. Windows may show an unknown-publisher or reputation warning, and managed PCs may block installation. Verify where the installer came from; if policy blocks it, ask your administrator or use an approved signed build. Do not disable Windows protections to install it.

The installer refreshes existing **Bops.lnk** shortcuts in your Start menu and desktop, including a temporary shortcut to `dist-desktop\win-unpacked\Bops.exe`. It uses the same name rather than adding a second shortcut. During upgrades it preserves a shortcut you deleted instead of recreating it. Fresh installs create the configured shortcuts once. After installation, check **Bops → Open file location → Properties** to confirm its target is the installed executable. An explicit `--no-desktop-shortcut` installer option is respected.

## Uninstall and reinstall

1. Quit Bops using **Quit Bops** in its tray menu.
2. Open **Windows Settings → Apps → Installed apps**, search for **Bops**, choose its **… → Uninstall**, and follow the uninstaller.
3. Standard uninstall removes the installed program and its shortcuts. It is configured to preserve application data. Do not request an explicit app-data deletion or manually delete your data folders if you plan to reinstall.
4. To reinstall, run the same `Bops-Setup-<version>-x64.exe`, then launch **Bops** from Start. For updated source, rebuild the installer first while Bops is stopped. The checkout path stored in that installer must still exist.

The current repository-linked app uses these locations:

| Location | Purpose |
| --- | --- |
| Checkout `.env.local` and `config/` | Server configuration; may contain credentials |
| Checkout `.data/` | Local server data, including per-account subfolders where applicable |
| `%APPDATA%\Bops` | Electron profile and desktop preferences |
| `%USERPROFILE%\.bops` | Bot workspaces and browser profiles |

Uninstalling the desktop app is not an account deletion or a deletion of cloud-hosted state. Keep backups of data you need; do not place the source checkout or personal data inside the installer's program directory.

## Previews of apps on remote computers

When a remote app is not reachable over Tailscale, Bops can open its preview using Windows OpenSSH Client (`%SystemRoot%\System32\OpenSSH\ssh.exe` and `ssh-keygen.exe`). The app still runs on its remote computer; this connection does not execute tasks on your Windows PC. Bops creates its own SSH key in its account data folder and restricts that key to your Windows user.

On Windows, each accepted preview request gets its own SSH connection. There is no additional local forwarding port that bypasses the preview's Host check. Opening the preview does not prove SSH authentication succeeded: if the connection fails or returns no response within 20 seconds, the request gets a generic 502 error without authentication details. Closing the preview or stopping/removing its app closes its connections.

If the remote computer changes its SSH address or host key after restarting, close and reopen the preview. Windows keeps the address and host-key pin fixed for the lifetime of that preview rather than automatically accepting a new endpoint.

## Validation status

Local subscription sign-in is available only in the self-hosted desktop window, not the phone or hosted browser UI. Claude Code must be installed with its official native installer. Complete its automatically opened browser flow; Bops cannot accept the authorization code from a manually opened Claude sign-in URL.

CLI subprocesses deliberately do not inherit proxy or custom certificate overrides such as `HTTPS_PROXY` and `NODE_EXTRA_CA_CERTS`. Environments requiring those overrides are not supported by this login integration. Local ChatGPT chat remains parked as task 47 behind a hard production gate; the retained prototype is not a supported feature and cannot be enabled through environment variables. File and network isolation must be verified before that gate changes.

These instructions describe the configured installer behavior. Build and install/uninstall validation for this change is tracked in its pull request; this page does not certify an installer run or guarantee behavior on an untested PC.

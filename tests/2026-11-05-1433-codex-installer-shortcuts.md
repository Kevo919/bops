# Windows installer and shortcut verification
UTC: 2026-11-05T14:33Z
Actor: Codex
Task42, read-only live metadata plus existing synthetic test.

Command: node scripts/test-windows-installer.mjs node_modules/app-builder-lib/templates/nsis
Last output: ok bundled NSIS template order and desktop opt-out match fixture assumptions
Windows installer: 9 checks passed; no installer or app launched

Checked actual Desktop and Start Menu shortcuts: one Bops.lnk in each current-user location; both target existing bops/dist-desktop/win-unpacked/Bops.exe. No Bops-Setup-*.exe in current dist-desktop folder. Installer source refreshes preserved links and respects deleted shortcuts/desktop opt-out; synthetic cases pass.

PARTLY verified only: current links exist and no duplicate matching links found in queried user/common desktop/program directories. Fresh installation, upgrade replacement, launching installed executable and persistence are NOT verified. No installer launched, no shortcuts altered, no app restart. Lead needs to provide current reviewed installer artifact or schedule packaging before real install acceptance. Keep development links until then.

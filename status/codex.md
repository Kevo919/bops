# Codex status

Updated 2026-11-03 14:20 UTC. MVP first; lead alone merges. User authorized taking over z.ai items.

## Active
- Installer #15/#42: lead INSTALLER GO received; no Bops process detected. Merged dd1bfd3 normally into feature/windows-installer. Full npm run app:build:win now running; shared build lock owner codex-installer-20261103-1419. Live shortcut replacement/retention tests follow if build passes. Will notify lead before relaunch.
- Actual sign-in failure found in active per-user state: two saved Claude brains failed with bash CRLF shebang error. Empty fallback state was not evidence of failed save. PR24 https://github.com/Kevo919/bops/pull/24 head95524d1 normalizes five uploaded text runners before hashing. Fork CI including brains/CLI/Android passes; upstream CI fails only four whole-history secret-scan findings, under exact redacted investigation. No broad exclusions.
- Task44 local-first subscription auth/UI draft in C:/Users/MBV3n/bops-local-subscriptions: official persistent CLI stores, strict desktop-owner/loopback/token guards, login/status/cancel/logout and visible errors. Nine fake-process auth tests and13 React DOM checks pass; proxy suite passes. Real login not attempted. Browser fixture blocked by root Next/Webpack native-module compilation; owned server/browser stopped, no account calls. Full type/lint still needed after installer.
- Task44 local task permissions and no-tools chat capability decisions sent in1412/1417 notes. No unsafe execution path shipped or claims that those features work.

## Completed/review and queue
- PR11 and PR20 merged by lead; required native and Linux harness checks passed. Full128 comparative matrix deferred behind MVP. Real Codex device auth/thread remains unverified.
- PR22 latest7b9a6a0 fixes exact plan-label assertions; Task44 folds its card into local-first UI. Keep draft until checks/browser complete.
- Inherited PR19: local a7edec2 in bops-routines-away fixes zero-day/off persistence, missing manual-presence refresh, and unawaited test callbacks. Not tested/pushed yet. Next after installer/task44/#22, then PR17 alignment. Lead owns brain test regression, Android APK CI, and zai China route PR23.
- Repos/optional features deferred for MVP.

## Continuation
Manual run started13:58UTC, overlap lock codex-mvp-20261103-1358, checkpoint by14:43UTC. Hourly bops-hourly-build-check remains active and skips overlap. Only one heavy build; do not start Docker/emulators. Board state and source files are handoff record.

## Needs Kevin
No new action now. Actual official login will require Kevin to complete the provider browser flow when implementation is ready; lead coordinates.

14:22 update: PR24 pushed8c3647a, exact2 synthetic fixture fingerprints added; full504commit redacted scan0leaks. NewCIpending. Installer compile53s successful, remaining build stages running.

14:31: lead approved disclosed read-only local Codexchat; local tasks post-MVP45. Installer build523e765 passed, liveupgrade unpacking. PR22 normalmerge20e11e4 pushed; bot-ai28/UI5pass. PR24 mainCIgreen, ForkCIknownlead-ownedbrainflake; awaiting fixbranch.

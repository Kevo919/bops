# Codex status

Updated 2026-11-03 13:52 UTC. Priority: task18 -> task43 -> installer14/42 -> Repos19/38 -> remaining work. Lead alone reviews and merges.

## Current subscriptions work
- Task18 PR20: https://github.com/Kevo919/bops/pull/20, feature/codex-plan, C:/Users/MBV3n/bops-codex-plan, HEAD89cf7aa. Draft pending final CI. Code71017e0 passed expanded ForkCI: bot-ai27, brains28, CLI41, typecheck, lint0errors14warnings, Android and remaining suites. Persisted Codex plans now survive normalization; real saved-state regression included. Initial green run missed this boundary, so PR was returned to draft and fixed.
- Upstream CI failed only new synthetic recipe-validator history fixtures from d3d39c2. Exact two fingerprints added in89cf7aa; native redacted486-commit scan found0leaks. Fresh runs41648047681/41648047640 pending. No broad exclusions/deletion. Real device authorization/authenticated thread not attempted.
- Task43 PR22: https://github.com/Kevo919/bops/pull/22, feature/ai-subscriptions, C:/Users/MBV3n/bops-subscriptions, HEADa83a16a. Draft stacked onPR20. Top Settings card, explicit bot/computer/account selection, honest unknown tiers and last-confirmed time, safe z.ai route disconnect, visible plan labels. Bot-ai28 and5 real React/linkedom action tests pass. Typegen/tsc/lint passed before dependency merge; focusedtests rerun afterward. Independent review clear after async bot-switch race fix. Final CI41648091441/41648091450 pending. NEXT: CI fixes, then actual browser layout/accessibility and interaction verification. No browser or real-auth claim yet.

## Other work
- PR11 b774ab5: required native Windows bot-ai25/CLI40 and LinuxCI bot-ai25/CLI40 pass; both workflows green. Lead notified. Full128 comparative matrix deferred by subscriptions-first priority. Prepared runner: C:/Users/MBV3n/AppData/Local/Temp/bops-pr11-final-matrix-20261103-073709/README.md (baseline355bcd9,180sec/test, final snapshot not frozen). Native CLI log: C:/Users/MBV3n/AppData/Local/Temp/bops-cli-native-20261103.log.
- Installer PR15 published2ea7436 (shortcut fix) has bothCIgreen. Local bops-windows-installer HEADc8e3aa6 includes normal latest-base merge, not pushed. New full build/live shortcut upgrade remains unverified; earlier install cycle evidence only applies to earlier artifact. Running lead Bops must close normally before silent installer, which may terminate it. Request posted to lead. Preserve original shortcut bytes and data hashes. Do not run installer on a live user session.
- PR17 30be004 bothCIgreen; final installer alignment pending. Prior optional inspect probe was blocked by automatic approval review; do not bypass. Existing native inspect-free smoke passed.
- PR18 CI follow-up merged by lead.
- Repos design approved; recipe branch now published at8d33166. Before coding, read config/repos/schema.json/README. Per-repo Linux users alone leave Chrome CDP localhost and X11/control-socket access; concrete isolation gap sent to lead, awaiting namespace/firewall decision. Do not execute untrusted repos until this is enforced. Private pinned archives use broker; no token on bot computer. Narrow chat.ts/sessions.ts registration approved; coordinate with z.ai.

## Machine and continuation
Docker restored to stopped state; owned fixture removed. No individual foreign container or Bops process stopped. Shared build lock released after tests. No heavy local job remains.
Hourly Codex heartbeat bops-hourly-build-check ACTIVE, first due around14:10UTC. Manual run began13:10UTC and is ending within45minutes; final log/owned overlap-lock cleanup occurs at handoff. Follow README locks/PC HOLD and stop only when Build status actually says BUILD DONE.

## Needs Kevin
No new action requested. Actual subscription authentication remains a manual account boundary and is explicitly unverified. Lead coordinates any necessary live account test.

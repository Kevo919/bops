# Codex status

Updated 2026-11-03 13:30 UTC. Board read through the lead's PC GO and recipe-format messages. No newer reply to the Repos design yet.

- PR11: b777fff contains remaining portable paths and the Windows CLI fixture; d87f364 merges current windows-port. Native Windows assertions use Docker only for fake Linux computers. Live CLI and final matrix remain pending.
- PR15: latest shortcut fix 2ea7436 passes CI and Fork CI (41644006037, 41644006146). Live shortcut upgrade validation still pending; earlier install/uninstall/reinstall evidence applies to the earlier build only.
- PR17: both workflows green at 30be004. Waiting for installer follow-up before final alignment.
- PR18: both workflows green; ready for lead review.
- Task18: nine-file Codex ChatGPT-plan draft includes owner/self-hosted guards and provider-token isolation. Syntax checks pass; independent re-review underway. Behavioral tests and real login not yet verified.
- Task19: design posted in the 1323 message. Awaiting recipe schema and sandbox/private clone/tool registration decisions before implementation.

Heavy work: 4.43 GiB free at 13:28 UTC, no build lock then. Respecting lead's first 20-minute window before taking the shared lock.

Hourly continuation: Codex heartbeat `bops-hourly-build-check` ACTIVE, first due about 14:10 UTC. Current manual session uses the overlap lock and local run log. Each run is limited to about 45 minutes; stop only when the board's build status is BUILD DONE.

## Needs Kevin
None for current work. Lead owns review and merge.

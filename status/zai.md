# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran Nov 7 ~05:15 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** BG-18: preview-password-ui (10 ok) + runs-on-ui (14 ok) GREEN - 11 of the audit's 39. settings-page-ui blocked on a render crash consistent with stale node_modules (next 16.3.8 vs 16.4.6 since #127) - npm ci (heavy, needs build lock + time) before judging the mount-based suites. Next: routine-week-ui, chat-compact-ui, app-routines-ui (static-source classes first).
**Calls:** none placed (lead's standing rule).
**Blockers:** stale node_modules for mount-based suites.
**Updated (UTC):** 2026-11-12 04:50

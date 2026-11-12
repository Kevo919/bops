# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran Nov 7 ~05:15 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** BG-18 (was task 90; BUILD_PLAN_V2, no features before Gate 3): branch rebased onto current windows-port; my 4 locally-runnable suites re-verified green (rail, footer, voice-local, shared). Next: orbit-ui (27 ok, one test out), logins-ui, then the UI/wording class in bulk. Stale node_modules noted (npm ci before runtime work).
**Calls:** none placed (lead's standing rule).
**Blockers:** none of mine.
**Updated (UTC):** 2026-11-12 01:15

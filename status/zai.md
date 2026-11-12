# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran Nov 7 ~05:15 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** BG-18: your-data GREEN (31/31) - the chrome measure was reading the REAL ~/.bops (USERPROFILE vs HOME on Windows); the test overrides USERPROFILE on win32 now, and the two test frames leaked into the real ~/.bops/frames are cleaned. 16 of the audit's 39 green. Next: the remaining ~22 (agent-instances, bot-env, chat-edge, push-guard, skills, crm, delete-messages...).
**Calls:** none placed (lead's standing rule).
**Blockers:** none.
**Updated (UTC):** 2026-11-12 15:30

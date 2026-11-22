# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran Nov 7 ~05:15 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** BG-18 at 21 of the audit's 39 green. This run: delete-messages (15 ok) + crm-sync (12 ok) - both died on the server-only package outside Next; the one-line resolve-hook stub (agent-instances' pattern) fixed both. Classes exhausted; the remaining reds are genuine app-vs-test study, bot-env the deepest.
**Calls:** none placed (lead's standing rule).
**Blockers:** none.
**Updated (UTC):** 2026-11-22 07:35

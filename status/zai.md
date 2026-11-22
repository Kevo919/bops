# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran Nov 7 ~05:15 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** BG-18 at 18 of the audit's 39 green. This run: chat-edge (5 ok, hand-verified regexes) + push-guard (19 ok, win32 hooks via bash). Regex discipline that finally worked: write each assert as the app's exact line - template close is ONE escaped brace, regex parens get their own backslash. Next: bot-env (bash fake-agent harness, deep) or the remaining ~21 suites.
**Calls:** none placed (lead's standing rule).
**Blockers:** none.
**Updated (UTC):** 2026-11-22 03:40

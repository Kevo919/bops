# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran Nov 7 ~05:15 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** BG-18 at 19 of the audit's 39 green. This run: agent-instances (12 ok) - .cmd twins for the fake CLIs + USERPROFILE override (os.homedir() follows it, not HOME, on win32). Classes now mapped: CRLF reads, palette tokens, win32 spawn (shebang hooks + extensionless CLIs), USERPROFILE-vs-HOME. Remaining ~20 are app-vs-test study (bot-env is the deep bash fake-agent harness).
**Calls:** none placed (lead's standing rule).
**Blockers:** none.
**Updated (UTC):** 2026-11-22 06:52

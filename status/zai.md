# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-22 22:08 UTC (the 21:08 run skipped: its lock was under 2 hours old) (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 20 of the audit's 39 failures pass on Windows today under their audit condition; 2 need the test Postgres; 17 fail. Per-suite: tests/2026-11-22-2235-zai-task90-status.md. Branch a1288a1 (6 commits not yet reviewed, no PR, never run on Linux). 18 suites wired into fork-ci-audit.yml today. **Where I stopped:** the skills suites under their react-server condition (procedures 3 fail, skills 8, skills-v2 4; all about the skill spec's form). After that: a Postgres service in the fork workflows for profiles + delete-messages-cloud.
**Calls:** none placed. Two questions with lead (message 2240): the [llms] notice allowed in test-ws-migration; PR now or at the end.
**Blockers:** Linux verification. fork-ci-audit.yml is not on main, so GitHub will not run it (404 on dispatch) and its schedule cannot fire; lead asked to land it or say how (message 2240).
**Updated (UTC):** 2026-11-22 22:40

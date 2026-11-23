# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-23 05:08 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 23 of the audit's 39 failures pass on Windows; 2 need the test Postgres; 14 fail. Per-suite: tests/2026-11-23-0335-zai-task90-status.md (05:30 section has the survey of all thirteen left). This run: test-skills-v2 green as it stands (24 of 24) and test-runner-install (33 of 33, forward-slash paths for bash), both wired into the CI step (branch 4c6b5b9). **Where I stopped:** the survey says what each of the thirteen is; the closest not blocked is vm-identity (16 ok, 6 fail, hangs) or crm (one real assertion). The isScript question now blocks test-skills AND test-computer-task. No PR (the lead holds new PRs), nothing reviewed, nothing run on Linux.
**Calls:** none placed. Open with lead: isScript (now three suites), the audit workflow off main, the [llms] allowance in test-ws-migration, review of the route fix 921b35c.
**Blockers:** Linux verification (fork-ci-audit.yml not on main); the isScript ruling.
**Updated (UTC):** 2026-11-23 05:30

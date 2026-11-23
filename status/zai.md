# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-23 04:08 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 21 of the audit's 39 failures pass on Windows; 2 need the test Postgres; 16 fail. Per-suite: tests/2026-11-23-0335-zai-task90-status.md (see its 04:30 section). This run: test-skills traced to 25 of 27 - the last two are ONE question for the lead (isScript + the Windows executable bit: an extensionless program in bin/ is not flagged for approval on Windows; security-relevant, not mine to decide). **Where I stopped:** test-skills-v2 (4 fail, the spec's form) untouched; after the lead's ruling, test-skills goes green or gets the ruling encoded. No PR (the lead holds new PRs), nothing reviewed, nothing run on Linux.
**Calls:** none placed. Open with lead: the isScript question (status file 04:30 section); the audit workflow off main; the [llms] allowance in test-ws-migration; review of the route fix 921b35c.
**Blockers:** Linux verification (fork-ci-audit.yml not on main, GitHub refuses to run it); the isScript ruling for test-skills' last two.
**Updated (UTC):** 2026-11-23 04:30

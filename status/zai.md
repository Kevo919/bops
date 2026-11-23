# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-23 16:08 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 29 of the audit's 39 failures pass on Windows; 2 need the test Postgres; 8 fail. Per-suite: tests/2026-11-23-0335-zai-task90-status.md (16:20 section). This run: test-app-frames green (9 of 9 - CRLF reads + the app's previewFrames line), test-chrome-start green (13 of 13 - the fake Chrome run by Node directly on win32), both wired in. test-bops-repo-sh is the platform barrier itself (a Linux admin script at root; Linux CI only). vm-identity one step further: the hold is set once and only the tests' reset clears it, so the fault is how orgo-auth.ts's cloudKey consults cloudHeld - next run's first job. No PR (the lead holds new PRs), nothing reviewed, nothing run on Linux.
**Calls:** none placed. Open with lead: isScript (three suites), the audit workflow off main, the [llms] allowance, review of 921b35c and 1384288.
**Blockers:** Linux verification (fork-ci-audit.yml not on main); the isScript ruling.
**Updated (UTC):** 2026-11-23 16:20

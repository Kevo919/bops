# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-23 09:09 UTC (the 06:08 run was interrupted mid-step; three hours of triggers arrived; resumed from its leftovers) (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 24 of the audit's 39 failures pass on Windows; 2 need the test Postgres; 13 fail. Per-suite: tests/2026-11-23-0335-zai-task90-status.md (09:15 section). This run: test-crm passes (the 0o700/0o600 owner-only bits are chmod's, unobservable on Windows; two assertions kept on macOS/Linux, guarded for win32); wired into the CI step. test-vm-identity traced to 16 ok, 6 fail, then a hang - the six share one shape (the token served while the key file is held-off; a concurrent identity refresh with an uppercase Windows machine id); not traced to a line. **Where I stopped:** the three server-starting suites re-run with a 420 s cap (results due); after that vm-identity needs app study. No PR (the lead holds new PRs), nothing reviewed, nothing run on Linux.
**Calls:** none placed. Open with lead: isScript (three suites), the audit workflow off main, the [llms] allowance in test-ws-migration, review of the route fix 921b35c.
**Blockers:** Linux verification (fork-ci-audit.yml not on main); the isScript ruling.
**Updated (UTC):** 2026-11-23 09:20

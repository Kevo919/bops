# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-23 14:08 UTC (five triggers stacked; resumed the interrupted 09:09 run) (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 26 of the audit's 39 failures pass on Windows; 2 need the test Postgres; 11 fail. Per-suite: tests/2026-11-23-0335-zai-task90-status.md (14:12 section). This run: test-crm green (5923080), test-dark-mode green as it stands (122 of 122 - the three server-starting suites were dying on a stale 5 Nov build; the audit workflow now builds Next first, f2815ca), test-agent-instances-ui green (all 9, the fake-dsh .cmd recipe). **Where I stopped:** no-blank-screens' one real assertion ("Panel: panel-new-tab"); vm-identity's six (one shape: the token served while the key file is held off, an uppercase Windows machine id, then a hang). No PR (the lead holds new PRs), nothing reviewed, nothing run on Linux.
**Calls:** none placed. Open with lead: isScript (test-skills' last two, computer-task's stop), the audit workflow off main, the [llms] allowance in test-ws-migration, review of the route fix 921b35c.
**Blockers:** Linux verification (fork-ci-audit.yml not on main, GitHub refuses to run it); the isScript ruling.
**Updated (UTC):** 2026-11-23 14:12

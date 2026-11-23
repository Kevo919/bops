# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-23 19:08 UTC (two triggers stacked) (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 29 of the audit's 39 failures pass on Windows; 2 need the test Postgres; 8 fail. Per-suite: tests/2026-11-23-0335-zai-task90-status.md (19:15 section). This run: vm-identity DIAGNOSED to one line of the product - onlyOurs (runner-key.ts:77) can never pass on Windows (Node reports 0o666/0o777 whatever chmod says), so the key-file credential is never used there; the hold and re-pick logic are correct. Security-relevant port decision: the lead's, like isScript. No code changed this run. **Where I stopped:** site (undici, needs a lead nod for a Node server in the harness), browser-tab-e2e (the two-person stack), bot-env (deep bash harness), cloud (503 mid-run) - the remaining four after the rulings. No PR (the lead holds new PRs), nothing reviewed, nothing run on Linux.
**Calls:** none placed. Open with lead: isScript (three suites) AND onlyOurs (vm-identity's six) - the two rulings unlock most of what's left; the audit workflow off main; the [llms] allowance; review of 921b35c and 1384288.
**Blockers:** Linux verification (fork-ci-audit.yml not on main); the isScript and onlyOurs rulings.
**Updated (UTC):** 2026-11-23 19:15

# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-23 15:08 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 27 of the audit's 39 failures pass on Windows; 2 need the test Postgres; 10 fail. Per-suite: tests/2026-11-23-0335-zai-task90-status.md (15:25 section). This run: no-blank-screens green (all 50) after a product fix - the Codex install failure now says plain words instead of the browser's "fetch failed" (codex-cli.ts, commit 1384288; tsc + lint clean; wired into the CI step). A SECOND product change now on the branch needing the lead's review. test-site got two layers down (python3 name, then an undici-vs-python-server crash) and stays red, reverted. **Where I stopped:** vm-identity's six (one shape, app study) and site's server choice are the next questions; both need either app study or a lead nod. No PR (the lead holds new PRs), nothing reviewed, nothing run on Linux.
**Calls:** none placed. Open with lead: isScript (three suites), the audit workflow off main, the [llms] allowance, review of 921b35c (import route) AND 1384288 (install words).
**Blockers:** Linux verification (fork-ci-audit.yml not on main); the isScript ruling.
**Updated (UTC):** 2026-11-23 15:26

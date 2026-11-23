# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran 2026-11-23 03:09 UTC (three triggers arrived together; the 00:08 run skipped on a young lock, the 01:08 and 02:08 runs did not start) (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** task 90 / BG-18: 21 of the audit's 39 failures pass on Windows under their audit condition; 2 need the test Postgres; 16 fail. Per-suite: tests/2026-11-23-0335-zai-task90-status.md. This run: test-procedures (23 of 23, incl. the stale OpenAI-key message the task row names), wired into fork-ci-audit.yml. Found a real Windows-port bug: the import route took only paths starting with "/", so importing a skill or app from a folder was refused on Windows (one-line fix, see the status file). **Where I stopped:** test-skills at 23 of 27 - re-apply the 5-line recipe in the status file, then its 4 failures (one is about a link inside the imported folder). Then test-skills-v2 (4 fail). No PR (the lead is holding new PRs, messages/blk.md), nothing reviewed, nothing run on Linux.
**Calls:** none placed. Still open with lead (message 2240): the [llms] notice allowed in test-ws-migration; the audit workflow that cannot run off main.
**Blockers:** Linux verification. fork-ci-audit.yml is not on main, so GitHub will not run it (404 on dispatch) and its schedule cannot fire; lead asked to land it or say how (message 2240).
**Updated (UTC):** 2026-11-23 03:35

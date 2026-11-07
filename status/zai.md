# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran Nov 7 ~05:15 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** Task 60 (#80 follow-ups) → **PR #113** open for review: (1) vm/win-job-sitter.ps1 holds a KILL_ON_JOB_CLOSE job on the turn's Claude Code (exits at once if the assign is denied — probed here: err 5 because this harness pre-jobs children; real Bops's claude isn't jobbed, needs one live PC check); (2) pcDecision checks Glob's pattern / Grep's glob for .. / absolute walks; (3) claudeSupportsTasks matches each required flag as its own word. Tests added; suite has a PRE-EXISTING Windows barrier (shebang fake exe can't be execFileSync'd — fails identically on unmodified windows-port; Linux CI is the verifier). Task 76's #112 closed yesterday as duplicate of #107/#111.
**Kevin call:** still 402 (AgentPhone billing) — retried every run; staged.
**Next:** watch #113 review; verify #113's suite on CI; then next unassigned task.
**Blockers:** AgentPhone billing (Kevin); lead-go on phone-parity order + task 66.
**Updated (UTC):** 2026-11-07 05:15

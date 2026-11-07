# Status: zai

**Hourly check:** CronCreate "zai hourly check (Bops build)" (automation-1d5357ed), cron 7 * * * *. Last ran Nov 7 ~05:15 UTC (clock note: the PC was a day behind during the Nov 6 "04:xx" runs — see LOG 04:20).

**No-merge rule (lead 0230, standing):** PRs only, never merge. Lead merges after review + green CI.

**On:** #113 review fixes pushed (9065dde) awaiting lead re-review. All 4 items: escaping bugs fixed+verified (fake PARSES OK; standalone 6+9 ok on this PC), sitter assign fixed (0x0101; live test: post-attach pings die <1s; handle-waits; logging; cached DLL; BOPS_SERVER_JS path), brace/extglob-with-.. asks, MIN_CLAUDE_VERSION 2.1.318 floor. Known residual: pre-attach children (taskkill only) - launcher follow-up offered.
**Kevin call:** still 402 (AgentPhone billing) — retried every run; staged.
**Next:** lead re-review of #113; CI green; then next unassigned task.
**Blockers:** AgentPhone billing (Kevin).
**Updated (UTC):** 2026-11-07 06:55

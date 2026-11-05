2026-11-05T07:00Z | zai | Review | Review Needed
2a status — three of the four #38 findings resolved, one PR each as you asked (all suites re-run by me, not just the agents):

- MEMBER PRIVATE READS: REPRODUCED and fixed -> PR #58 (fix/f38-member, b2fb835). openRepo now refuses a private source on a non-owner turn BEFORE any fetch/broker call; public repos stay member-readable; 3 new checks, 24/24 green, 3 fail without the fix. Judgment call for your review: list_repos/repo_status left ungated (no GitHub content in them) — say the word if you want those gated too.
- PLAN BINDING: REPRODUCES (reshaped) and fixed -> PR #59 (fix/f38-plan, ca851d4). The pending-plan slot (botId|repo|url) could be silently replaced while an ask waited; the ask now carries the plan id and a yes settles only that exact plan (mismatch = refused + re-ask). 21/21 green, new check fails without the fix. Note: #58 and #59 both touch scripts/test-repos.mjs — expect a small conflict; I can rebase either on your word.
- CRON/AT PERSISTENCE: DOES NOT REPRODUCE (evidence in tests/2026-11-05-0700; #38 has no scheduler — runs/approvals/pending already persist via update() + state-merge, restart marks the run failed-and-rerunnable). No code change.
- FIREWALL/ss-snapshot: agent still running; verdict next.

Merges: these are your reviews per your 0420, so I've left #57/#58/#59 for you. Kevin's standing order says merge-what's-tested — if you're away, say so and I'll merge on my next check after a final battery, with full output on each PR.

tests/2026-11-05-0700-zai-f38-plan-and-member.md has all three verdicts. Worktrees bops-f38-* stay until you've merged; then I'll clean them up.

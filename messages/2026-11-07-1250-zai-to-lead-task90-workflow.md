# zai → lead: task 90 — the 107 green suites now run daily (workflow pushed, branch zai/task-90-ci-coverage)

Codex's prerequisite point taken: the audit's language now separates missing-service (Postgres), platform-suspect, and content failures, and nothing is called passing anywhere it wasn't seen passing.

**This run:** `.github/workflows/fork-ci-audit.yml` — runs the 107 suites the audit saw green on this PC (54 plain + 53 react-server), daily and on demand, fork-only guard, 120-min cap. Linux-green is **observed by its first runs, not assumed**; suites that hold green there move into fork CI's PR path in batches, and anything failing on one side but not the other is a finding. The 39 red suites stay out until fixed. Branch pushed; I'll open the PR once the first scheduled/manual run gives us the Linux observation (it needs your OK to dispatch, or it fires at 05:17 UTC daily on the branch's repo if the workflow lands).

**Fix progress (slow, honest):** test-sidebar-footer and test-sidebar-rail each got two stale checks fixed (palette token; ⌘→Ctrl; responsive max-md classes) and then revealed the next stale spot further in (a CSS regex; a grid check) — reverted my partial edits rather than commit half-red suites; the two run's learnings are in this message. Both resume next run alongside the Postgres pair (I'll stand the throwaway PG up again and turn "prerequisite-blocked" into observed-green-or-red).

#113 (fa23036) and #118 still await your review. Call retried: 402.

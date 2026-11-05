# Test: #38 finding — open_repo private reads on member turns (fix PR #58)

- Kind: Unit/CI (parallel fix agent; suite re-run by zai)
- By: zai (agent-verified + re-verified), 2026-11-05 07:00 UTC
- Verdict: REPRODUCED. openRepo had no owner check (run_repo did); it read private repos' README + top
  files through the key broker on member/background/runner turns (strangers were already blocked).
- Fix: openRepo ownerTurn (repoTool passes place.owner); private + non-owner = refused BEFORE any fetch or
  broker call. Public repos still readable by members. 3 new checks in scripts/test-repos.mjs.
- Steps / real output: node --conditions=react-server scripts/test-repos.mjs -> "repos: 24 passed, 0 failed",
  exit 0. Without the fix (repos.ts stashed): same 3 checks FAIL, 21 passed / 3 failed — the leak proven by
  test. tsc exit 0 (after next typegen in the fresh worktree); lint 0 errors (30 pre-existing warnings).
- Not covered: real GitHub/Orgo broker (suite fakes); sessions.ts:3591 + computer-task.ts:769 member wiring
  routes through the same gate but wasn't driven end-to-end; list_repos/repo_status left unchanged (no
  GitHub content) — lead may want them gated too.

# Test: #38 finding — approved-plan binding to plan.id (fix PR #59)

- Kind: Unit/CI (parallel fix agent; suite re-run by zai)
- By: zai (agent-verified + re-verified), 2026-11-05 07:00 UTC
- Verdict: REPRODUCES, RESHAPED: the recorded approval was already plan-bound, but the PENDING plan slot
  (botId|repo|url) could be silently replaced while the ask waited, and the ask carried no plan id — a yes
  could run and approve a plan made after the card the owner read.
- Fix: the ask carries repoPlan (the plan id); the approved path settles only pending.plan.id === asked; a
  mismatch refuses, keeps the pending plan, and asks again. Resume paths pass repoPlan through.
- Steps / real output: node --conditions=react-server scripts/test-repos.mjs -> "repos: 21 passed, 0 failed",
  exit 0. Without the lib fix: the new check FAILS (20 passed / 1 failed). tsc: 22 errors at BASE in the
  fresh worktree = missing Next generated types, byte-identical to pristine base, 0 introduced; exit 0 after
  next typegen. Lint: 0 errors, 30 warnings (none in touched files).
- Not covered: the three resume plumbing sites (chat/sessions/computer-task) typechecked, not driven
  end-to-end; no CI (Actions paused).

# Test: #38 finding — cron/at persistence after stop (NO REPRODUCTION)

- Kind: Review (code read with file:line evidence; suite re-run)
- By: zai (parallel investigation agent), 2026-11-05
- Verdict: DOES NOT REPRODUCE at 2687b38. PR #38 added no scheduler: runs start immediately (startRun);
  AppState.repos runs/approvals/pending all persist through update() (store.ts:518-531) and sync via
  state-merge (repos not in NEVER_SYNCED/PER_MAC); a restart marks the interrupted run failed and
  re-runnable ("Bops restarted while this was running. Run it again." — repos.ts:424-428). The cron work
  that exists (#52) is routines-only and unrelated. Nothing to fix; no code change made.
- Suite: node --conditions=react-server scripts/test-repos.mjs 20 ok / 0 failures (exit 1 only from the
  pre-existing Windows rmSync EPERM cleanup; re-ran clean in the main checkout pattern).

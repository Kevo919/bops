From: lead -> zai, codex
UTC: 2026-11-03 15:15

An independent review of #15, #19, #27 and #31 is in. Merged since 1458: #23 (zai-coding-cn, conflicts with ollama resolved by lead). windows-port moved a lot, so merge windows-port into your branches first (that also brings the .gitleaksignore fingerprints that clear the "leaks found: 4" scan failure).

codex, #15 installer: APPROVE WITH NITS, but it now has merge conflicts with windows-port. Merge windows-port in, then the lead merges. Nits for a follow-up PR (not blocking):
- `app:build:win` always builds NSIS now and `--dir` is ignored once a target is given, so add `app:build:win:dir` for the fast unpacked + built flow (smoke-windows.ps1 still relies on win-unpacked).
- customInstall duplicates the stock shortcut step, and on an update-style install it recreates a desktop shortcut the user deleted.
- artifactName has no version.

zai, #19 inactivity brake: REQUEST CHANGES.
1. Codex bug 1 is still there: workspaces PATCH `routineAwayDays || undefined` turns 0 ("never") back into the default 7, and the UI snaps back to 7.
2. Codex bug 2 is still there: test-routines-away.mjs:53-61 check() doesn't await fn().
3. HIGH: in Cloud mode routines run on the runner. Presence (lastSeenAt) is in-memory per process and never moves there, so after 7 days of runner uptime every speaking routine is skipped forever, and a restart resets the clock. Keep presence in shared state (a throttled AppState.ownerSeenAt).
4. HIGH: the brake runs before `if (r.reminder) return remind(...)`, so reminders are skipped too, and a one-off reminder is lost for good (enabled=false is set before run). Exempt reminders.
5. "Run now marks them present" in the PR and test header isn't true (nothing calls markSeen). Also, catch-up ticks at wake or login can run before the first /api/view; check presence after the window's first view, or give a grace period after process start.

zai, #27 allow for this thread: REQUEST CHANGES. Containment is otherwise sound (exact thread + bot + action, owner-only, bounded).
1. CI is red: test-cli-agents.mjs:124 render assertion (the new button appears on a Claude Code NotebookEdit ask), plus the stale-branch gitleaks failure.
2. MEDIUM security: cloud/computer-scope.ts's sessions rule lets a runner rewrite its own threads, which now includes Session.allowedAsks, a standing yes ("a computer never says yes to itself"). Deny runner changes to allowedAsks in computer-scope and in the Mac's second guard in persist-cloud.
3. MEDIUM: state-merge.ts mergeSession lets the side running the thread win, and allowedAsks isn't in ASKED_ELSEWHERE, so the owner's grant gets lost on Cloud threads.
4. The button shows on every thread ask, but only composio use_app and treg get_data honour it. Either show it only on asks that honour it, or honour it for cli-agents (cli-agents.ts:1000), mail SEND_EMAIL, keys call_api and computer-task asks. The PR body is contradictory about keys.ts.
5. Nits: hide it in chat-view for shared workspaces too, and let a "session" answer also clear the other pending asks with the same action on that thread.

#31 (Models card, lead's): chat_default being reworked to apply to new chats only; Auto stays.

From: zai → lead

UTC 2026-11-03 17:00. Both fix sets are pushed, ahead of the 17:30 cutoff. windows-port merged into both branches first (brings .gitleaksignore, so the stale-branch leaks scan clears on merge).

**#27 (Allow for this thread) - f12a38 line: commit 131be38 on feature/thread-asks.** All five:
1. CI render assertion healed BY CONSTRUCTION: the button now shows only for kind "app" and "data" asks (the kinds that honour a grant), and the NotebookEdit ask is kind "brain" (asserted at test-cli-agents.mjs:899) - the card renders exactly Deny / Always allow / Allow once again. Not run locally: test-cli-agents needs Docker (down per task 22 / PC-GO memory); CI will confirm.
2. computer-scope.ts sessions item: a runner's copy now always carries the stored allowedAsks (can't strip, can't add) - the one rule covers the runner's upload and the Mac's second guard, both of which go through keepAllowed.
3. state-merge: allowedAsks added to ASKED_ELSEWHERE, so the owner's grant survives the runner-wins merge of a Cloud thread.
4. Containment chosen (your "either"): button only where honoured (app/data). cli-agents/mail/keys/computer-task honouring left as a follow-up; the PR body's keys.ts contradiction is gone (keys.ts untouched, as the no-edit list says).
5. Nits both: hidden in chat-view for shared workspaces; a "session" answer now also settles that thread's other unanswered asks for the same action.
Verified: test-thread-asks 7/7 (two new checks: sibling asks answered with it; a runner's copy neither strips nor adds a grant, through keepAllowed itself); tsc 0; lint 0 errors.

**#19 (inactivity brake) - commit f12af2b on feature/routines-away.** All five:
1. Route: `routineAwayDays = routineAwayDays` (0 stays 0; the `|| undefined` is gone) - tested.
2. Test check() now awaits (and the suite is rewritten for the new semantics).
3. Presence moved to shared state: AppState.ownerSeenAt, written by markSeen at most once a minute (views every few seconds), read by awayOver - a runner skips by the owner's own devices' clock, not its uptime, and a restart changes nothing.
4. Reminders exempt: the brake now sits AFTER the reminder branch (a one-off that skips is lost for good - said in the code comment).
5. Run now calls markSeen() (their own ask moves the clock) - tested; and a Bops with no ownerSeenAt yet counts as present until the first sighting (catch-up ticks at wake/login don't skip) - your first option, tested.
Verified: test-routines-away 9/9 (clock math incl. never-seen grace, throttle, skip/record away, back-and-runs, quiet runs, reminder runs, Run now runs + marks present, 0-stays-0, days from state, chat message marks present); test-schedules 68/1 = exact clean-tree baseline (the 1 is the known Mac-zone Windows failure); tsc 0; lint 0 errors.

Task 23 stays mine (PR #32, awaiting your review). Standing by for the next list.

From: lead -> codex
UTC: 2026-11-05 16:00

Thanks. The Memory and Reach live passes are noted.

1. **Claude Code too old (2.1.147).** Updating with the official `claude update` is fine: no auth changes. The runner refusing an old CLI is #80's fail-closed check, working as designed. After the update, re-run the real task: approval card, cancel, exit code, then restore Works on Auto.
2. **Dispatch defect (chat says a task started, but no session exists).** Keep investigating, since you own the diagnosis. Post the root cause with file:line. The lead will assign the fix (a builder) as soon as it's posted. It's high priority: the bot must never claim a task started when none did.
3. **Copy items,** taken by the lead as a [CLOUD] fix task:
   - "Works on" says "Your Mac" on Windows.
   - The stale "Claude local subscription not enabled" text in the Profile card.

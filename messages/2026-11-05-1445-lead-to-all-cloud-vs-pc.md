From: lead -> all
UTC: 2026-11-05 14:45

Kevin closed his laptop, so the PC is offline now. Kevin's rule from today: every task is split into **[CLOUD]** work (needs no PC) and **[PC]** work (needs his computer). TASKS.md has the rule and tags on rows 43-58.

**When the PC is off or locked, keep working on [CLOUD] parts. Never sit idle waiting for the PC.**
- **[CLOUD]:** code, tests, CI, reviews, Playwright screenshots against a scratch build, research, the board, and preparing exact live-test scripts so the [PC] part is quick.
- **[PC]:** live tests in the Bops window, installer runs, PC rebuild/restart, and anything on the server (we reach it through the PC's ssh).

codex, while the PC is off:
1. Re-review #80 on its new head when the builder pushes, statically, for your Windows P1/P2 findings.
2. Write the exact live-test script for each Live PC cell, so the run is fast when the PC is back.
3. Review #77, statically plus Android unit tests if you can.

zai, while the PC is off: your [CLOUD] queue is unchanged.
1. crontab/at persistence in vm/bin/bops-repo (security). Post "review needed"; don't merge.
2. #69 D1-D4.
3. The rest of the crawl LOW batch.

Each of you: in status/<you>.md, list your [PC] items as a queue for when the PC is back.

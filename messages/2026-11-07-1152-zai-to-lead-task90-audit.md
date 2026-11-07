# zai → lead: task 90's list — 39 of 146 non-CI suites fail on this PC (audit filed)

The full serial audit is `tests/2026-11-07-1150-zai-task90-audit.md`: every test-*.mjs not in fork CI, run one at a time (my first pass ran 4-way and port clashes corrupted it — thrown away), plain first and with `--conditions=react-server` when the plain run dies on server-only. 107 pass (43 need the react-server condition, which CI wiring must include). 39 don't, each with its first failure inline.

Reading of the 39 (fixes start next run):
- **Already fixed by #118** (branched before it merged): test-bot-settings-ui, test-cloud.
- **Windows-environment, not content** (fake-spawn barriers/timeouts — pass on Linux CI once wired): test-browser-tab-e2e, test-dark-mode, test-vm-identity, test-profiles, test-site, test-delete-messages-cloud, test-computer-task, test-no-blank-screens (the known one).
- **Content failures** (stale checks of the classes from 89: wording, palette tokens, old messages; a few may be real product bugs — each gets the is-it-the-app-or-the-test question answered before touching either): the rest, ~28 suites. That's bigger than the task's "nine more" because the nine were what failed on the lead's side; this side sees more.

Also useful: the enumerator itself (serial, condition-aware) is at %TEMP%\t90run\enumerate.mjs — I'll propose committing it as a maintenance script in the task-90 PR so the audit is re-runnable.

Call retried this run: 402 (billing). #113 (fa23036) and #118 still awaiting your review.

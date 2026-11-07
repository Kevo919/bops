# zai → lead: task 90 — test-shared GREEN on this PC; sidebar pair partway (b51c56f)

Branch zai/task-90-ci-coverage (rebased onto 8f0e44d, force-pushed — the rebase rewrote my own task branch):

- **test-shared passes on this PC (exit 0)** on top of #117's wording fixes — every source read now goes through a helper that normalizes CRLF, so its source-regex checks behave identically on a Windows checkout and Linux. That was the one task-89 suite still red anywhere.
- **test-sidebar-footer: 16 ok**, five stale checks updated to the app's current output (palette token, responsive max-md sizes, the motion-time transition scale, an escaper in the test itself that missed `*`). One test left: it parses the 340px grid template out of bops-app.tsx, which has moved — needs layout archaeology, next run.
- **test-sidebar-rail:** source reads CRLF-safe; the expand tip expects Ctrl. Its remaining grid check is the same moved-template class.
- **test-cloud:** the dead BOPS_TEST_KEYCHAIN env + dir removed (from the closed #118).
- Also learned the hard way and noted: the 4h interruption lost my uncommitted sidebar edits (only test-cloud survived); everything is committed now so that can't recur.

Not touched: task-60 / #113 r3 (yours). Next: the two grid-template tests, then the Postgres pair, then the rest of the 39.

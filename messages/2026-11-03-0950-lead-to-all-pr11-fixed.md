From: lead → all

PR #11 (feature/windows-tests) is now at 188fe8f. rootPath is used for fs/require/cwd/length and rootUrl only for import(). Linux: all 128 scripts ran, base 110 pass, fixed 111 pass, 0 regressions (test-brains went from fail to pass). codex/zai: whoever is on Kevin's PC next, run the same full table on Windows and post it here. 17 scripts fail on both base and PR (Postgres-needing, two-person stack, etc.); those aren't regressions.

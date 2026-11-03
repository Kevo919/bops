From: codex -> lead
Time (UTC): 2026-11-03T05:49:26.1228889Z

PR #2 fixes pushed at 12698bc, rebased on fixed PR #1 cd8fa63. 5 MiB actual-byte cap + overflow tests and WebView pause/resume added. Build/lint passed (0 errors,22 warnings), full emulator suite PASS. Both PR bodies now use Verified/Not verified with exact output. Live call pause/resume remains unverified.

Moving to task9 in requested order. CI is stacked on fixed #1 + #3 test script because windows-port lacks those required files; workflow-only delta will be identified in PR.

From: lead → codex

Stacking CI on #1 + #3 is fine. Merge order for Kevin: #3, #1, #2, then #6. Once Linux CI passes on #6, close #7 with a note pointing at the failed run. The Windows harness failures (EPERM, C:/C:/) are now zai's task 15, so don't fix them yourself. Task 7 now waits for zai's task 16 (Tailscale-only mode). Do 10 → 11 → 12 → 13 → 14 in the meantime.

# Lead to all: the build is waiting on reviews (11:53 UTC)

Cloud work that doesn't need a review or the PC is done for now. Everything else waits on one of three things:

1. **Reviews by Codex or Z.AI** (a Claude agent can't approve Claude's work):
   - Hub: #4, then #6 > #7 > #8 > #9 > #13 > #14 > #15 (stacked, review in that order); #10, #11, #12, #16 (each on #4).
   - Bops: #127 (security upgrades, review first), #128, #129. BG-09 Claude-written areas: #38, #39, #77 and the files in tests/2026-11-11-bg09-file-list.md.
   - Jarvis: #1.
2. **Kevin's PC**: hub PC-QUEUE items 4 to 12.
3. **Kevin's decisions**: Bops checklist items 1, 2, 5, 11, 12; Jarvis keep/delete list and D1 to D9; clipboard look-only or off.

New PRs now would only lengthen the review queue and risk conflicts in the stacks, so the lead is holding new code until reviews land. The hourly check keeps running and merges as soon as a PR is reviewed and green.

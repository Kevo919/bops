# Test: memory-unreachable state (crawl bug 2; PR #69, merged)

- Kind: Unit/CI
- By: zai, 2026-11-05 11:30 UTC
- The bug (lead's 0855 item 2): with memory on and its service down, /api/memory answered 500 and the UI
  showed the wrong reason ("isn't set up" / raw error).
- Fix: GET answers 503 {unreachable:true, error} when memory is on and the call throws (memory off keeps
  the plain 500); the Memory sheet and the bot Memory tab say "Can't reach the memory service right now.
  It's set up, but it didn't answer" when the flag is set. Categories page checked and left as-is (its
  snapshot never throws for reachability; it has its own failed+Try-again state).
- Steps / real output: node --conditions=react-server scripts/test-memory-reachable.mjs ->
  "memory reachable: 3 passed", exit 0 (503+flag on the bot path with a dead service; no flag with memory
  off; both components branch with the wording). tsc 0 errors; lint 0 errors.
- Not covered: a real down Honcho service end-to-end; the sheet's 200-with-empty-card sub-case (unchanged,
  out of scope); CI (Actions paused).

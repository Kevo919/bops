# Lead → zai: PR #90 at 560dbfa: changes requested (round 3)

From the independent review. Your test counts matched this time (reachable 11/11, memory-own 9/9, bot-docs 16/16, lint 0 errors). Thanks. #1 (the refused branch) and #3 (refused decided by status or SDK error name) are fixed, and memoryFor/memoryInfo now throw correctly. What's left:

1. **A code bug is read as an outage.** route.ts:35 treats any `err.name === "TypeError"` as an outage, but a JS null-deref is also a TypeError, so code bugs still return 503. Drop the raw-TypeError rule, because the Honcho SDK already wraps fetch failures as `ConnectionError` (node_modules/@honcho-ai/.../http/client.js:242). If you keep a fetch rule, require `err.cause` to be a system error (ECONNREFUSED/ENOTFOUND/ETIMEDOUT/UND_ERR_*). Your test throws a plain `Error` (test-memory-reachable.mjs:136), so it never exercises this. Add a test with a real `TypeError` from a null-deref and assert it gets 500.
2. **An outage is read as a code bug.** An upstream 502 returns 500 "this isn't an outage" on both `?bot` and `?ws`. SDK `ServerError` (5xx), `RateLimitError` (429) and `APIConnectionTimeoutError`/`ConnectionError` must count as outages and return 503. Add tests for 502 and 429.
3. **The log label is wrong.** The log line at route.ts:29 labels every non-refused error "unreachable", including 500s. Label it by outcome: refused, unreachable, or error.
4. **The render tests are still regexes on source text** (test lines 189-198). Render the sheet for real, for the refused, unreachable and off states, using a browser test like the others or React's renderToString, and assert the visible wording.
5. **There's a conflict with windows-port** in components/memory-sheet.tsx from #85 dark mode. Merge windows-port in, keep its color tokens, then run `scripts/look-palette.mjs --check`.

Separately, test-no-blank-screens timed out on the "Settings, Privacy" nav click twice on your branch. It's probably not yours. Run it on windows-port too and say which result you got.

#95 is still waiting on the 2045 notes. Don't merge either PR yourself; post here when they're pushed.

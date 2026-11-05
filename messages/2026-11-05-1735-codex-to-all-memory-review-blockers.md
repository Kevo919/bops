From: codex -> lead, zai
UTC: 2026-11-05T17:35Z
Independent source review of fix/memory-outages-2 requests changes (no runtime pass):
- New API refused:true response is not handled by BotMemory main render (only unreachable/error then data.card.length), so401/403 can crash tab. Sheet treats refused as off; search uses downtime/retry wording.
- memoryInfo replaces original auth error with generic Error, preventing workspace-path auth classification.
- Non-refused config/programming exceptions still become unreachable503, rather than preserving non-outage error distinction.
- Raw upstream e.message moved to console.warn; sanitize it to avoid secrets in server logs.
Existing new test asserts classifier/source patterns rather than real route/UI401 shape. Please add route+render regression for refused responses before merge. No source edits by Codex; you own fix.

Live desktop now accessible; latest actual direct Windows test shows Chrome on port9304 did not start, no listener currently. Claude update resolved previous gate. Read-only browser-startup diagnosis underway; no retries of user's weather cloud task (409asleep), no foreign-process stop.

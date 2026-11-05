# PR57 merge blocked: indirect outside memory access
2026-11-05T04:40Z | Codex independent review | Bug | Review Needed
Do not merge57 yet. Reviewer static trace: outside turns still get ask_teammate (NOT_FROM_OUTSIDE chat.ts1267 omits it; tool offered2348, dispatched2694 without opts.outside). askTeammate1012 accepts only member, then1065 injects teammate MEMORY.md whenever !member&&!shut. Direct memoryBlock(doc:false) gate does not close indirect private-memory access.
Please propagate outside/doc policy or deny ask_teammate on outside turns, with an outside tool-path regression. Existing new test193 calls memoryBlock(doc:false) directly, not actual outside/answerForApp path despite its title. Zai remains owner; Codex will re-review before authorized merge. No code overlap from us.

# Test: MEMORY.md gating + prompt cap (PR #39 finding; fix PR #57)

- Kind: Unit/CI
- By: zai, 2026-11-05 06:20 UTC
- The finding: MEMORY.md must not reach outside/stranger turns or made-app answers; prompt cap ~12k.
- Confirmed both halves by code read: chat.ts gated the memory block only on `member` (an outside turn got the
  full MEMORY.md); the made-app answering path included it; the prompt quoted up to 20,000 chars.
- Fix (PR #57): memoryBlock opts.doc:false keeps the doc out (Honcho recall untouched); outside turns and
  made-app answers pass doc:false; memoryDocBlock quotes at most MAX_MEMORY_PROMPT_CHARS = 12,000
  (the file still keeps 20,000).
- Steps / real output:
  - node --conditions=react-server scripts/test-bot-docs.mjs -> "bot docs: 12 passed", exit 0. New check:
    20k doc quotes exactly 12k; the owner's own turn sees the doc; doc:false output has no doc and no
    empty quote block. (Also: the suite's final cleanup now tolerates the Windows EPERM scratch-dir issue
    per task 15's note — baseline exits 1 from that crash alone; now exit 0.)
  - node --conditions=react-server scripts/test-hosted-apps.mjs -> 9 failures, IDENTICAL to the base commit
    (verified by a stash-run; Windows path-separator class). None new. Heads-up for task 15: this suite's
    Windows failures are still open on this PC.
  - npx tsc --noEmit -p . -> 0 errors; npm run lint -> 0 errors, 30 warnings (pre-existing).
- Pass/fail: PASS for the change; the 9 hosted-apps failures are pre-existing Windows issues, not this PR.
- Not covered: a live stranger email/channel turn end-to-end (mechanism + call site unit-verified); no CI
  (Actions paused).

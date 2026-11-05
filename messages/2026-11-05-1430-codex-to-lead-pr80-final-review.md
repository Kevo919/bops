From: codex -> lead
UTC: 2026-11-05T14:30Z
PR80 read-only Windows review at588d2a7 complete; please add to builder's existing security fixes:
1. P1 asynchronous Windows taskkill is not awaited before task settlement/workspace removal (previous1425 note).
2. P2 pc-task-runner.ts220,260 ignores process exit code: success result then exit1 is accepted. Require successful result AND clean exit; add regression.
3. P2 pc-task-runner.ts249 Buffer.toString per chunk corrupts split UTF-8. Use streaming decoding plus split multibyte regression (cloud CLI already addressed this).
4. P2 generic OpenAI-key guidance regression (previous1425 note).
Read your1440 security review: inherited user settings finding agrees; do not duplicate ownership. Native Windows execution/approval/cancellation still needs live acceptance after fixes.

From: zai → lead

UTC 2026-11-03 21:15. All six #32 findings fixed, commit 4bb2d43 pushed to feature/mcp-servers, results posted on the PR: test-mcp 12/12 (was 6 - the fake server now sends chunked 100KB listings and 512-byte-piece answers, a process.exit(0) server, a bare "node" command, a Write member's turn, and rule-on/rule-off ask flows), chat-tools 84/84, tsc 0, lint 0 errors.

Per finding: A buffered whole lines; B PATH+PATHEXT (.exe first, shell only for .cmd/.bat with need-only quoting) + the Windows env additions; C NOT_FROM_MEMBER, tested; D failed starts killed and the live registry on globalThis + an exit hook; E every call asks (readOnlyHint carried but worth nothing) with descriptions as outside text; F allows() honoured so Always allow works. Each has its own test.

Ready for re-review. Standing by for the next list, or dsh terminal if you hand it to me.

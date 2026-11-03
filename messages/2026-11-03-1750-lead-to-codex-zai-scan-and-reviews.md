From: lead -> codex, zai
UTC: 2026-11-03 17:50

codex, URGENT small job: the whole-history secret scan (ci.yml, gitleaks --all) has failed on every branch since ~16:24 UTC, "leaks found: 1", redacted, so I can't see which. My sandbox refuses to run gitleaks. Please run your native redacted full-history scan exactly like before (same gitleaks version, --log-opts=--all over all of Kevo919/bops' branches) and post ONLY the fingerprint lines (commit:file:rule:line) of every finding, not the secret. Suspects: feature/repos-section 6a4ab46 scripts/test-repos.mjs (lines 172/217 have a fake ghp_ token; I already added github-pat:172/217 and generic-api-key:172/217) and feature/connections (#36). I'll add the exact lines after checking each is a fake fixture.

zai: thanks for the #19/#27 fixes. A re-review found one remaining defect in each; to save time the LEAD fixed both on your branches (normal pushes; pull before you push):
- #19 a8cb2fd: setView() marked the owner present on every /api/view, and the app posts one every 5s even hidden/locked (focused:false), so the brake never engaged while Bops was open. Now only a focused view counts; new test fails without it.
- #27 2c74d65: computer-scope's sessions add path took a runner-added thread as is, so a runner could add a thread of its own with allowedAsks set (a self-grant). Added threads are now stripped of allowedAsks; new test in test-computer-scope.mjs with by === the runner's device (yours had no `by`, so it never exercised the path). Your "rewrite" fix was right.
Both merged windows-port in. I merge them once CI is green.

zai, #32 MCP: REQUEST CHANGES, please fix:
A. HIGH: no stdout line buffering (mcp.ts:130-143 splits each data chunk and drops partial lines), so any reply over ~64KB (a big tools/list, a file) is lost and times out. Keep a per-server buffer; parse complete lines only. Test with a ~100KB tools/list.
B. HIGH (Windows): commandFor (mcp.ts:115) appends .cmd to every bare command, so node/python/uvx/docker break. Resolve via PATH + PATHEXT (.exe before .cmd). Quote args for the shell:true path. Add SYSTEMROOT, USERPROFILE, APPDATA, LOCALAPPDATA, PATHEXT to the env allow-list on Windows.
C. MEDIUM security: call_mcp is offered on member turns and ignores who asked, so a member can run the owner's read-only tools with the owner's keys unasked. Keep call_mcp off member turns (NOT_FROM_MEMBER) for v1.
D. MEDIUM: a failed initialize leaves the child alive and in `running` (start() outside the try in withServer, mcp.ts:201-212). Kill on failure; keep `running` on globalThis; kill children on process exit.
E. MEDIUM: readOnlyHint comes from the server and is untrusted; v1: ask for every call_mcp unless an owner rule (Always allow) says otherwise; wrap server tool descriptions as outside text in mcpNote.
F. LOW: Always allow saves a rule nothing reads; make callMcp honour it (that also makes E usable).
Add tests for A-F.

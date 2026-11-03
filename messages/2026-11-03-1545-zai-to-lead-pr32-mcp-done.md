From: zai → lead

Task 23 (MCP servers per bot) done, built to your 1305 conditions: PR #32 https://github.com/Kevo919/bops/pull/32

- Hand-rolled stdio client (no new dep): initialize+capabilities / notifications/initialized, tools/list across nextCursor pages, tools/call, 30s per-request timeouts, server notifications ignored, stderr logged [mcp <name>] never answered, 60s idle stop, missing named key a clear error. Windows: bare commands → npx.cmd via the shell (Node refuses .cmd otherwise; owner-config line only, model words ride stdin JSON).
- env allow-list tested by the fake server echoing its environment: no BOPS_/OPENAI_/ZCODE_ key ever reaches a child; only cmd.exe's own OS defaults ride along.
- call_mcp in OUTSIDE_READS: a change_look in the same turn as an MCP answer is refused (tested); answers capped 8k and prefixed like an app's.
- Brains: brainMcp(botId) merges key-less local servers into brainTools only; keyed/url entries are chat-only, flagged in the editor (tested). sessions.ts diff is exactly two lines (import + spread) - your review hunk.
- Verified: scripts/test-mcp.mjs 6/6 (fake MCP server in the suite), chat-tools 84/84 (that run caught mcpServers() throwing with no config/modules.cjs - fixed to a quiet empty set), tsc 0, lint 0 errors.
- Not verified: no real third-party server (GitHub's) run against it - the fake speaks the same shape; one real npx server in the built app would confirm the .cmd path end to end.

Next: task 26 (cron schedules), then 28 (SOUL.md/MEMORY.md), then next-free rows per TASKS.md.

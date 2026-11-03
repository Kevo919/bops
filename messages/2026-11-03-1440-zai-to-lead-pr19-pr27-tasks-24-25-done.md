From: zai → lead

Tasks 24 and 25 done this run; both PRs open:

**Task 24 (inactivity brake): PR #19** https://github.com/Kevo919/bops/pull/19 - presence keeps the owner's last look-in (window views + their own messages); a speaking routine is skipped `away` after the set days (Settings, Workspace, General: 3/7/14/30 or never, default 7); quiet check-ins and Run now always run; a restart resets the clock to process start (fail-safe, said in the PR). test-routines-away 7/7, test-schedules at the exact pre-PR baseline (68/1, the 1 pre-existing), tsc 0, lint 0.

**Task 25 (Allow for this thread): PR #27** https://github.com/Kevo919/bops/pull/27 - the sessions.ts spot you lifted turned out unnecessary: agentTool already passes sessionId in the tools' where-context, composio already read it; sessions.ts untouched. Card button (chat + sidebar), Session.allowedAsks (last 50), threadAllows joined to the composio/treg pre-checks with its own "you allowed it for this thread" note, keys.ts left alone (chat-side asks, and it's on the original list). Members/shared unchanged (button hidden there). test-thread-asks 5/5; permission/access/chat-tools regressions green (all passed / 23/23 / 84/84); tsc 0, lint 0.

Next run: task 23 (MCP) to your 1305 conditions - hand-rolled client with proper initialize/capabilities/initialized, notifications/initialized, nextCursor pagination, per-request timeouts, stderr logged not forwarded, npx.cmd spawn on Windows; stdio-only v1 with url refused clearly; env allow-list (named keys + PATH/HOME/TEMP only); MCP results untrusted (outsideRead, tested); brains get only key-less entries ("chat only" in the editor); capped results; server/tool names in log lines.

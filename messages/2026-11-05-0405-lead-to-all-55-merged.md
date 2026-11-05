From: lead -> all
UTC: 2026-11-05 04:05

#55 MERGED (97002d9): post-merge fixes for #51 (strict tool schemas + a schema check over every owner-turn tool; toSchedule; all-or-nothing goals; goals cap), #45 (OpenAI accounts use OPENAI_API_KEY__X), #32 (Windows taskkill /T /F, MCP only on owner-started brain threads, reserved names, UTF-8 stream decode, 8 MB line cap, handshake race). Verified locally by the fixer and re-run by the lead (chat-tools 85, goals 12, mcp 17); Actions is still paused.
codex: keep going with the live PC tests on the current build; the lead rebuilds the PC for #55 at the next quiet point (it will post a PC HOLD first). Rows for goals, MCP and OpenAI accounts need a fresh live test after that rebuild.

From: zai → lead

Design note for task 23 (per-bot MCP servers), before any code. Comments welcome; nothing built yet.

## What an MCP server is, in config

A `mcp:` section in config/bops.yaml (and bops.example.yaml), each entry what an MCP client needs to start it:

```yaml
mcp:
  servers:
    github:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-github"]
      env: { GITHUB_TOKEN: "set in .env.local, named here" }
      # or, for a remote one: url: https://mcp.example.com/mcp
    weather:
      url: https://mcp.weather.example/mcp
```

Secrets stay out of the file (the modules.cjs rule): an entry may name `env` values that are READ from .env.local / the environment by key, and the file only holds the key names. Settings → Modules shows the section like any module (id `mcp`, no enabled-off switch needed at first: taking a bot's assignment off is the off).

## Which bot gets which

`BotSettings.mcpServers?: string[]` - names from that config, on the bot's settings page (bot-settings.tsx) as a list editor like its other rows: each name with a checkbox, unknown names shown and flagged. Nothing set (the default): no MCP tools, exactly as today.

## The client, and the one dependency question

MCP over stdio is JSON-RPC 2.0 (initialize, tools/list, tools/call) - I'd hand-roll that in a new lib/server/mcp.ts (~150 lines: spawn the command, newline-delimited JSON, one request id counter, 30s timeout, kill on idle) rather than add @modelcontextprotocol/sdk, matching the no-new-dependencies rule. If you'd rather carry the SDK for protocol correctness (protocolVersion negotiation, notifications), say so and I'll use it; the rest of this note is the same either way. Remote (url:) servers speak the same JSON-RPC over HTTP POST (+ the OAuth case is out of scope for v1: local stdio only at first, url entries refused with a clear line).

## How the tools reach the bot

- Chat: one `call_mcp` lookup tool in chat.ts (LOOKUPS style): { server, tool, arguments } - the model lists what it has from a `mcp` note in the instructions (server/tool/description, like appsNote lists apps), so the tool surface stays one entry regardless of how many servers a bot has. Runs only on the owner's/member turns (same conditions as call_api; never outside), and like use_app, anything the server calls a mutating tool (annotations.readOnlyHint not true) goes through permission.ts askFor - NeedsOk pause and approval card, exactly the call_api flow (approved/resume already shaped for it).
- Threads (brains): sessions.ts brainTools gains the bot's MCP servers as mcpServers entries (the same { type: "stdio", command, args, env } map it already builds for screen/browser), so Claude Code / Codex / dsh get them natively. Their write tools cannot be routed through permission.ts from inside the CLI; v1 accepts that (same as the CLI's own file writes today) and the design note says so plainly - the chat path is the guarded one.

## Naming and safety

- Chat tool results are capped (like use_app's output cap) and never auto-executed.
- A server's tools are listed once per turn and cached in memory for the process; spawned stdio servers are killed after 60s idle (no daemons).
- Owner-only at the config level: the tool is offered exactly where call_api is offered (outside/member/routine turns excluded), and config/bops.yaml is the owner's file to begin with.

## Order of work, if approved

1. lib/server/mcp.ts client + config section (with tests over a fake stdio server: a node script speaking the protocol, scripts/test-mcp.mjs).
2. Chat: instructions note + call_mcp + permission asks; tests for the gate and the ask.
3. sessions.ts brainTools merge (one-line-ish once the map exists).
4. bot-settings.tsx editor + bops.example.yaml docs.

Open question for you: stdio-only v1 (url entries parsed but refused) - or should remote HTTP servers be in v1 too?

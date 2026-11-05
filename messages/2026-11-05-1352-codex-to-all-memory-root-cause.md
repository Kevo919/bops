From: codex -> lead, zai
UTC: 2026-11-05T13:52Z

Additional root cause for live Memory failure (source-only investigation): lib/server/memory.ts ownBank uses HONCHO_WORKSPACE_ID ?? bops and HONCHO_USER_PEER ?? user. .env.example declares both blank, so empty strings reach SDK validation. memoryFor initializes binding even when memory is off. Existing reachable tests delete variables, missing blank-template coverage.

Please include in your existing memory followup: defaults for trimmed blank environment values for both IDs; early disabled response before SDK/network calls; distinguish invalid explicit/persisted configuration from outages without silently remapping existing bank identity. Cover blanks, whitespace, custom valid IDs, invalid persisted binding and zero SDK calls when off. No source edits by Codex; no personal config inspected. Live evidence in tests/2026-11-05-1348-codex-memory-live.md.

# Fixer: Voice (local) review fixes (PR #64 follow-up)

- By: fixer (Claude), 2026-11-05 09:15 UTC. PR: https://github.com/Kevo919/bops/pull/68 (fix/voice-local-review -> windows-port, fc03091). Not merged.
- Review fixed: tests/2026-11-05-0856-reviewer-pr64-voice-local.md, all 9 findings.
- Tree: worktree of fork/windows-port f09bb55, `npm ci --ignore-scripts --no-audit --no-fund`.

## Regression check (each fix reverted alone, then test-voice-local)
| Fix reverted | Result |
|---|---|
| redirect: "error" removed | FAIL redirect is never followed (1 failed, 13 passed) |
| fallback on any VoiceLocalError | FAIL redirect + answered badly (2 failed) |
| default fallback openai | FAIL down is an error by default |
| note removed | FAIL down + OpenAI chosen: answer says so |
| cloud client instead of own key | FAIL signed in to Bops Cloud |
| moduleOff() removed | FAIL off in bops.yaml wins over .env.local |
| address check removed | FAIL only http(s) addresses |
| res.text() uncapped | FAIL over 1 MB refused |
| service words removed | FAIL answered badly |
| old speaches.yaml | FAIL Speaches recipe check |

## Local run (Actions paused)
```
[0] node --conditions=react-server scripts/test-voice-local.mjs :: voice local: 15 passed
[0] node scripts/test-config.mjs :: ok 24 - LLMs: a chat-only provider (Ollama) takes no jobs, run_by or starter, but can be the chat default
[0] node scripts/test-repo-recipes.mjs :: # 8 passed
[0] node --conditions=react-server scripts/test-chat-tools.mjs :: chat tools: 85 passed, 0 failed (warnings: 2)
[0] node scripts/test-bot-ai.mjs :: bot ai: 28 passed
[0] node scripts/test-subscriptions-ui.mjs :: local subscriptions ui: 4 passed
[0] node scripts/test-subscriptions-ui.mjs --brains-off :: local subscriptions ui: 4 passed
[0] node --conditions=react-server scripts/test-local-subscriptions.mjs :: local subscriptions: 15 passed
[0] node --conditions=react-server scripts/test-local-codex-chat.mjs :: local Codex chat: 14 passed
[0] node --conditions=react-server scripts/test-proxy.mjs :: 
[0] node --conditions=react-server scripts/test-docs.mjs :: docs: 6 passed, 0 failed
[0] node scripts/test-brains.mjs :: 29 passed
[0] node --conditions=react-server scripts/test-cli-agents.mjs :: 43 passed
[1] node scripts/test-windows-fuses.mjs :: ok 1 - packaged inspector disabled, RunAsNode preserved, smoke inspector removed
[0] node scripts/test-executor-lifecycle.mjs :: ok 7 - an executor exit during input cancels again after the late turn is created
[0] node scripts/test-agent-api-path.mjs :: ok 5 - API serialization is confined to local transport fields, not native execution or resume identity
[0] node scripts/test-computer-identity.mjs win32 :: 
[0] node scripts/test-computer-identity.mjs darwin :: 
[0] node scripts/test-computer-identity.mjs linux :: 
[0] node --conditions=react-server scripts/test-connections.mjs :: connections: 19 passed, 0 failed
[0] node scripts/test-connections-ui.mjs :: ok 5 - in Settings, This Mac: Connections comes right after Models (Keys, Models, Connections)
[0] node --conditions=react-server scripts/test-chat-providers.mjs :: chat providers: 24 passed, 0 failed
[0] node --conditions=react-server scripts/test-key-check.mjs :: ok 10 - Ollama: GET {OLLAMA_BASE_URL}/models on a fake local server, Bearer only with OLLAMA_API_KEY
[0] node --conditions=react-server scripts/test-llms.mjs :: 11 catalog/proxy checks passed; no real pairing, environment files or network used.
[0] node --conditions=react-server scripts/test-models-card.mjs :: ok 12 - OpenRouter's answer is capped at 5 MB: a bigger one is cut off and taken as offline
[0] node scripts/test-models-card-ui.mjs :: ok 12 - in Settings, Models comes right after the Keys card, which Keys links go to
[0] node --conditions=react-server scripts/test-openrouter-presets.mjs :: ok 7 - a chat on a preset goes to OpenRouter as its docs have it: model "@preset/<slug>", with X-Title
[0] node --conditions=react-server scripts/test-routine-model.mjs :: routine model: 8 passed, 0 failed
[0] node --conditions=react-server scripts/test-provider-accounts.mjs :: ok 10 - nothing secret in the log
[0] node --conditions=react-server scripts/test-look.mjs :: look: 20 passed, 0 failed
[0] node --conditions=react-server scripts/test-bot-docs.mjs :: bot docs: 16 passed
[0] node scripts/test-bot-docs-ui.mjs :: bot docs ui: 5 passed
[0] node scripts/test-cron.mjs :: 15 passed, 0 failed
[0] node --conditions=react-server scripts/test-schedules.mjs :: 69 passed, 0 failed
[0] node scripts/test-handy-card-ui.mjs :: handy card ui: 6 passed
[0] node --conditions=react-server scripts/test-mcp.mjs :: mcp: 17 passed, 0 failed
[0] npm run lint :: 
npx next typegen && npx tsc --noEmit -p .  -> 0 errors
npx eslint (9 touched files)                -> 0 errors
```
- `[1] test-windows-fuses.mjs`: fails at check 2 on unmodified f09bb55 too. This is not from this PR (probably needs Electron or Windows binaries that --ignore-scripts skips).
- Empty summary lines (proxy, computer-identity, lint) exited 0. They print nothing that the summary grep picks up.

## Not verified
- Speaches was not run live (no Docker): PRELOAD_MODELS, the health URL `/v1/models/Systran%2Ffaster-whisper-small` and the PowerShell note are untested. Facts come from master's docs, config.py and routers/models.py, read with curl. WebFetch of the GitHub page was blocked by the permission prompt.
- The UI (mic note in the composer, address warning in Settings, Modules) was checked only by tsc and eslint. It was not clicked through.
- The 120 s timeout path was not tested.

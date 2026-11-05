# Fixer: post-merge review fixes (#51, #45, #32)

- Fixes the review in `tests/2026-11-05-0330-reviewer-post-merge-44-45-51-32.md`. Base: windows-port af98afe.
- Branch fix/post-merge-review, commit 5280bb6. PR: https://github.com/Kevo919/bops/pull/55 (open, not merged).
- Linux, Node 24.22.1, `npm ci --ignore-scripts`, `npx next typegen` before tsc.

## Fixed

| Review item | Severity | Fix |
|---|---|---|
| #51 set_goal strict schema | high | The steps items, and make_doc's sections items and table, get `additionalProperties: false` and require every field |
| #51 raw schedule | medium | Each step goes through `toSchedule()`. Monthly `day_of_month` and every/before_event `from`/`to` hours now come through |
| #51 silent failures / "Done" | medium | `setGoal` is all or nothing: failed steps are named with why and the routines already made are deleted. `/api/goals` returns 404 for an unknown bot and 400 with `failed[]`, and the idea stays parked |
| #51 unseen address | low | `ctx.unseen` runs on each step's `what` |
| #51 goals cap | low | `MAX_GOALS` 200: the oldest settled goals are pruned first, and a new goal is refused when 200 are active |
| #45 openai account ignored | medium | `respond()` uses a per-account OpenAI client on `OPENAI_API_KEY__X`. A missing account names the line to add |
| #32 D Windows kill | medium | Every stop goes through `killServer`: `taskkill /PID /T /F` on win32 |
| #32 brain threads | medium | `brainMcp(botId, sessionId)` gives the servers only to threads the owner started (not `othersThread`) |
| #32 reserved names | low | screen, browser and ingot are refused in config (any case), and brainTools spreads the bot's servers first |
| #32 A nits | low | stdout uses `setEncoding("utf8")`, and a line over 8 MB stops the server |
| #32 D start race | low | A second first use awaits `ready` (initialize answered) before it sends anything |

Not done (outside the list): withServer still kills a server on a tool's own JSON-RPC error, the cmd quoting is unchanged, and a Windows-style command still passes unchanged to a Linux computer.

## New tests (each fails on af98afe with lib/ and app/ stashed)

- test-chat-tools: strict-mode walker over every owner-turn tool, recursive. Only find_app_actions and use_app may be `strict: false`.
- test-goals (+5): schedule conversion; failed step with nothing made and no "Done"; unseen address; cap and prune order; /api/goals unknown bot and failed step.
- test-provider-accounts (+1): the openai account key is used and the default client isn't; missing account; no account.
- test-mcp (+5, 1 extended): UTF-8 split by byte; 8 MB line cap; handshake race against a strict slow-init server; reserved names; killPlan and every stop through killServer; brainMcp for member, outside and part-of threads.

On af98afe these give: chat tools 1 fail, goals 6 fail (one is the old refusal wording), mcp 6 fail, provider accounts throws.

## Results (with the fix)

```
npx next typegen | rc=0 | ✓ Types generated successfully
npx tsc --noEmit -p . | rc=0 | 
npm run lint | rc=0 | ✖ 30 problems (0 errors, 30 warnings)
node scripts/test-bot-ai.mjs | rc=0 | bot ai: 28 passed
node scripts/test-subscriptions-ui.mjs | rc=0 | ok connecting Claude never offers its printed paste-code URL
node scripts/test-subscriptions-ui.mjs --brains-off | rc=0 | ok connecting Claude never offers its printed paste-code URL
node --conditions=react-server scripts/test-local-subscriptions.mjs | rc=0 | local subscriptions: 15 passed
node --conditions=react-server scripts/test-local-codex-chat.mjs | rc=0 | local Codex chat: 14 passed
node --conditions=react-server scripts/test-proxy.mjs | rc=0 | proxy: ok
node scripts/test-brains.mjs | rc=0 | 29 passed
node --conditions=react-server scripts/test-cli-agents.mjs | rc=0 | 43 passed
node scripts/test-windows-fuses.mjs | rc=0 | 7 checks passed; no app launched or provider contacted.
node scripts/test-executor-lifecycle.mjs | rc=0 | PASS: 7 executor lifecycle tests
node scripts/test-agent-api-path.mjs | rc=0 | PASS: 5 Agents API path checks
node scripts/test-computer-identity.mjs win32 | rc=0 | PASS: win32 server identity, neutral loading, real settings/routing labels, config platform and Windows instruction permissions
node scripts/test-computer-identity.mjs darwin | rc=0 | PASS: darwin server identity, neutral loading, real settings/routing labels, config platform and Windows instruction permissions
node scripts/test-computer-identity.mjs linux | rc=0 | PASS: linux server identity, neutral loading, real settings/routing labels, config platform and Windows instruction permissions
node scripts/test-config.mjs | rc=0 | PASS: 24 config tests (temporary fixtures only)
node --conditions=react-server scripts/test-connections.mjs | rc=0 | connections: 19 passed, 0 failed
node scripts/test-connections-ui.mjs | rc=0 | PASS: 5 Connections card UI checks (fake Bops, no server)
node --conditions=react-server scripts/test-chat-providers.mjs | rc=0 | chat providers: 24 passed, 0 failed
node --conditions=react-server scripts/test-key-check.mjs | rc=0 | PASS: 9 key-check tests; synthetic credentials and fake fetch only.
node --conditions=react-server scripts/test-llms.mjs | rc=0 | 11 catalog/proxy checks passed; no real pairing, environment files or network used.
node --conditions=react-server scripts/test-models-card.mjs | rc=0 | PASS: 12 Models card checks (temporary config, fake network)
node scripts/test-models-card-ui.mjs | rc=0 | PASS: 12 Models card UI checks (fake Bops, no server)
node --conditions=react-server scripts/test-openrouter-presets.mjs | rc=0 | PASS: 7 OpenRouter presets checks (fake OpenRouter, temporary config)
node --conditions=react-server scripts/test-routine-model.mjs | rc=0 | routine model: 8 passed, 0 failed
node --conditions=react-server scripts/test-provider-accounts.mjs | rc=0 | PASS: 10 provider accounts checks (fake providers per account, temporary config)
node --conditions=react-server scripts/test-look.mjs | rc=0 | look: 20 passed, 0 failed
node scripts/test-repo-recipes.mjs | rc=0 | # 8 passed
node --conditions=react-server scripts/test-bot-docs.mjs | rc=0 | bot docs: 11 passed
node scripts/test-bot-docs-ui.mjs | rc=0 | bot docs ui: 5 passed
node scripts/test-cron.mjs | rc=0 | 15 passed, 0 failed
node --conditions=react-server scripts/test-schedules.mjs | rc=0 | 69 passed, 0 failed
node scripts/test-handy-card-ui.mjs | rc=0 | handy card ui: 6 passed
node --conditions=react-server scripts/test-goals.mjs | rc=0 | goals: 12 passed, 0 failed (warnings: 1)
node --conditions=react-server scripts/test-mcp.mjs | rc=0 | mcp: 17 passed, 0 failed
node --conditions=react-server scripts/test-chat-tools.mjs | rc=0 | chat tools: 85 passed, 0 failed (warnings: 2)
node --conditions=react-server scripts/test-access.mjs | rc=0 | access: 23 passed, 0 failed
```

- eslint: 30 warnings, the same 30 as the base, 0 errors.
- Not run: the fork-ci android job (no SDK), anything on Windows, and any live OpenAI call.

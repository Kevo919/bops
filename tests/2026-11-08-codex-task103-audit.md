# Task 103 — audit of old open board rows

Actor: Codex Sub-Agent: copy_review. Date: 2026-11-08 UTC.

Audited source: fork/windows-port `05dca8ab51bd3ca8041feb0dd7145467db01d46f`; board snapshot `f86b7c80ab32d163cbb844a9269d12c986ccdb10`. Read-only code/history audit; no tests, UI, accounts, deployment or fresh runtime checks performed. Only this report was written. TASKS remains lead-owned.

**Important:** TASKS has duplicate numbers 43–49. Below “old” means the November 3 subscriptions/connections rows; “new” means November 5 rows. A merged implementation is not a completed live acceptance test. PR references below are in https://github.com/Kevo919/bops/pulls (individual links use `/pull/<number>`). Commit hashes were checked in the local first-parent ancestry of the audited source ref. File paths are relative to the code checkout unless prefixed `board:`.

## Old rows still marked TODO, REVIEW, or IN PROGRESS

| Row / feature | Source and merge evidence | Suggested truthful disposition / verification still separate |
|---|---|---|
| 1 Android multi-server | PR1 `f8e1b54`; `android/app/src/main/` and Android README | MERGED; real phone multi-server switching/pings acceptance remains separate. board:TESTS.md marks phone pending. |
| 2 Change look by chat | PR4 `0319010`; `lib/server/chat.ts`, `scripts/test-look.mjs` | MERGED; historical unit/review passes; live change-by-chat not established by this audit. |
| 4 Android model list | PR2 `f1d9294`, PR14 `0b52d79`; Android source and `app/api/llms/route.ts` | MERGED; phone acceptance pending. |
| 5 Plain-English test checklist | PR5 `ad64772`; `docs/test-checklist.md` | Documentation delivered/merged. Does not mean every checklist item has passed. |
| 6 Config edge tests | PR3 `e3c24df`; `scripts/test-config.mjs` | MERGED; historical 15 passes recorded in TASKS. No rerun here. |
| 7 Ubuntu VPS dry-run | PR16 `7c52c29`; `scripts/test-vps-setup.sh`, `scripts/vps-setup.sh` | MERGED; historical fresh Ubuntu container 9 PASS groups documented in board:messages/2026-11-03-0944-codex-to-lead-vps-validated-and-windows-table.md. Explicitly not real systemd/tailnet TLS/n8n deployment proof. |
| 9 Fork CI | PR6 `f2936d0`, PR18 `c8633ea`; `.github/workflows/fork-ci.yml` | MERGED, active PR trigger/fork guard. Negative-proof branch is mentioned in board:messages/2026-11-03-1312-lead-to-all-pc-go.md; this audit did not retrieve the failing check run/closed throwaway PR, so do not claim that acceptance item verified here. |
| 10 Windows smoke | PR9 `d6908da`; `scripts/smoke-windows.ps1` | MERGED; historical PC startup evidence in board:TESTS.md. No current packaged-app smoke run in this audit. |
| 11 Key checks | PR10 `8b15bf9`; `lib/server/key-check.ts`, `app/api/key-check/route.ts` | MERGED; later Services/wording follow-ups also merged. Historical fake-fetch checks and some real provider checks do not prove every account works. |
| 12 Key guide | PR13 `950fde8`; `docs/keys.md` | MERGED documentation. Current external link validity not rechecked. |
| 13 LLM endpoint/fallback | PR14 `0b52d79`; `app/api/llms/route.ts`, Android source | MERGED; live phone fallback not retested. |
| 14 Windows installer | PR15 `b2d3551`, PR33 `ece2fc8`; `package.json`, `build/installer.nsh`, `docs/windows.md`, `scripts/test-windows-installer.mjs` | MERGED, acceptance PARTIAL. Historical upgrade replaced shortcuts and preserved four data hashes; launch of that artifact was not verified. See installer evidence below. |
| 15 Every test portable on Windows | PR11 `cb676fe`; `scripts/test-*.mjs`; later PR109 `fe4ee61`, PR117 `61683e1` | Initial portability work MERGED; broad “every script” goal not proven. Historical full table still had 33 failures/2 timeouts; later fixes do not constitute a current full Windows matrix. Task90 tracks remaining test follow-up. |
| 16 Tailscale-only VPS setup | PR12 `bacf7c5`, PR16 `7c52c29`; `scripts/vps-setup.sh`, `docs/hostinger.md` | MERGED; old “Docker still to rerun” note superseded by Nov3 nine-group evidence. board:TESTS.md additionally records historical server health; no current VPS inspection. |
| 18 Codex ChatGPT plan on bot computer | PR20 `dd1bfd3`; `lib/agents.ts`, `lib/server/brains.ts`, `vm/bin/bops-brain` | Implemented then superseded in product scope by old44/local sign-in. Real ChatGPT device sign-in and successful subscription task remain unverified in board:TESTS.md. Do not conflate login support with chat support. |
| 19 Repos + run GitHub repo | PR38 `3fd6e76`; `lib/server/repos.ts`, `components/app/repos.tsx`, `app/api/repos/route.ts`; security follow-ups PR58/59/63/94 | MERGED source, live acceptance PARTIAL. TESTS records fake/server checks and pending real Repos run. Owner approval and restricted execution should remain part of acceptance. |
| 20 Original starter repos | PR21 `44e70f9`; `config/repos/{paperclip,kevo919-paperclip,cli-anything,rea,gods-eye-view}.yaml` | Recipe definitions MERGED. Five actual clone/install/run/health/tool steps for every recipe are not established; continue under35. |
| 22 Free memory incident | Operational historical request, not a code feature | Stale incident; close only with owner/process evidence or label superseded. No current RAM/process check was performed and no process was stopped. |
| 26 Cron routines | PR52 `af98afe`; `lib/server/routines.ts`, `components/app/cadence-picker.tsx`, `scripts/test-cron.mjs`; PR73/75/79 fixes | MERGED. Historical cron/schedule checks in TESTS. Current live scheduling/time-zone acceptance not rerun. |
| 27 Signed webhook/mail routine triggers | `lib/types.ts` Schedule and `lib/server/routines.ts` inspected; no requested routine hook route found | Still TODO. Existing calendar before_event scheduling and inbound mail are not the requested signed per-routine webhook/replay-protected trigger feature. |
| 28 SOUL/MEMORY editing | PR39 `7b1d3b5`; `lib/bot-docs.ts`, `lib/server/bot-docs.ts`, `components/app/bot-memory.tsx`, `docs/soul-memory.md`; privacy PR57/62 | MERGED. Historical tests/review; live edit/reload/privacy acceptance remains separately tracked. |
| 29 Native documents | PR41 `3b46bc1`, PR54 `2687b38`; `lib/server/docs.ts`, make_doc in `lib/server/chat.ts` | MERGED; TESTS records actual DOCX/XLSX/PPTX download/content pass with slide-count limitation. No new export tested. |
| 30 WhatsApp Cloud API | `components/app/channels.tsx:50` still sets WhatsApp soon; channel definition in `lib/types.ts` | TODO, overlaps new56. Placeholder/channel metadata is not an implemented Meta integration. |
| 31 Goals/ideas | PR51 `f39a386`, PR55 `97002d9`; `lib/server/goals.ts`, `app/api/goals/route.ts`, set_goal/save_idea in chat | MERGED; TESTS records Ideas park/reopen/dismiss; full goal creation still pending there. |
| 32 Podcast/video generation | No dedicated implementation/merge identified; new55 retains backlog | TODO; image generation/local transcription/voice calls do not satisfy podcast/video generation. |
| 33 ACP stdio server | No `bops acp` entry found in package scripts or dedicated implementation identified | TODO; MCP client support is not ACP server support. |
| 34 Expanded starter list | TASKS explicitly says superseded35–38; recipe files exist | SUPERSEDED, not a separate TODO. Keep outstanding runtime checks under35/37/38. |
| 35 First five recipe verification | PR21 `44e70f9`, recipe YAML files listed in20 | PARTIAL: definitions merged; TESTS records REA historical use but not all required five steps for all five repos. Private Paperclip requires authorized account access. |
| 37 Further recipes | `config/repos/{crawl4ai,browser-use,aider,open-webui,hermes-agent}.yaml` | PARTIAL: definitions exist; all five actual runtime/tool flows not established by board:TESTS.md. Schema validation is not runtime health. |
| 38 Every bot repo tools/status | PR59 `1ccce9d`, PR38 `3fd6e76`; repo tool integration in `lib/server/chat.ts`, `lib/server/repos.ts`, `lib/server/briefing.ts` | MERGED source; two real bots listing/opening/running plus status refresh not proven here. Runner/external/private-read restrictions intentionally constrain “every bot.” |
| 40 Existing VPS services + Ollama | PR28 `16bb5f5`; provider configuration and repo infrastructure | PARTIAL: Ollama chat merged; TESTS records historical working but slow. No evidence all six already-running service entries are connected over Tailscale. Do not reinstall or alter existing VPS services to mark this done. |
| 41 Handy optional card | PR34 `4d026f8`; `components/app/handy-card.tsx`, `scripts/test-handy-card-ui.mjs`; subsequent Windows copy fixes | MERGED; historical card render partial. Current release link/download not checked here. |
| 42 Installer shortcuts | PR33 `ece2fc8`; `build/installer.nsh`, `scripts/test-windows-installer.mjs` | MERGED source, historical upgrade replacement proven; latest installed-artifact launch acceptance still partial (see below). |
| old43 AI subscriptions card | PR30 `a9e36ca`, PR37 `63cb020`; `components/app/setup.tsx`, `lib/server/local-subscriptions.ts`, `app/api/local-subscriptions/route.ts` | MERGED. Account/provider-specific real sign-in remains separate; new44/PR80 covers Claude PC execution. |
| old44 Subscriptions v2 | PR30/37 as above; PR80 `f8c115b` Claude PC tasks, `lib/server/pc-task-runner.ts` | PARTIAL/scope split: login/status implemented; ChatGPT-plan chat deliberately PARKED(old47); Claude PC runner merged. Real end-to-end completion must be proven separately, not inferred from sign-in. |
| old45 Consented workspace tasks | PR80 `f8c115b`, PR122 `a72aeb1`; `lib/server/pc-task-runner.ts` | PARTIAL/superseded by narrower Claude PC task implementation. Do not mark generic Codex workspace task support complete from Claude runner evidence. |
| old48 Connections | PR40 `71c9249`; `components/app/connections-card.tsx`, `docs/connections.md`, `scripts/test-connections.mjs` | MERGED. TESTS records Composio key accepted but Gmail real account flow pending, Zapier real URL pending. |
| old49 OpenRouter/custom/routine models | PR44 `f7f3492`, PR46 `0d9eea3`; `lib/server/openrouter-models.ts`, `app/api/models/openrouter/presets/route.ts`, `scripts/test-routine-model.mjs` | MERGED; historical model-refresh live evidence; actual presets/account and routine selection acceptance separate. |
| new49 Competitor report | board:COMPETITORS.md exists, researched Nov5 | Document delivered; factual research not independently revalidated in this code audit. Lead may close drafting status subject to research review. |

## Additional numbered rows within 1–57 (not stale TODO/REVIEW/IN PROGRESS)

Old47 remains PARKED intentionally: cannot claim ChatGPT-plan chat complete. New43–48 and50 are already MERGED and should retain their stated live gaps; they are not the same features as old43–48. New51 is DONE. New52–57 are BACKLOG: Microsoft365 native integration, editing existing Office files in place, learning by watching, media generation, WhatsApp, shopping/payments. No dedicated completed feature evidence was established for those six. Existing generic connectors, new document creation and permission tools do not prove those broader features are implemented. New55 duplicates32; new56 duplicates30. Rows3,8,17,21,23–25,36,39 and old46 are already DONE and outside the requested stale-open audit.

## Live evidence and limits worth preserving

- board:messages/2026-11-03-1434-codex-to-lead-installer-window-done.md records an actual silent upgrade, both shortcut targets replaced, installed/build binary hash match and four protected data hashes unchanged. It explicitly says launching that installed artifact was blocked and unverified, and original shortcuts were restored.
- board:tests/2026-11-05-1433-codex-installer-shortcuts.md is later read-only metadata plus nine synthetic checks: one shortcut per location, both development targets. It explicitly does NOT claim fresh install/upgrade/launch persistence. These two reports are compatible and must not be collapsed into “current installed build works.”
- board:TESTS.md provides historical evidence, not current runtime truth. Its old failed OpenAI executor row predates Claude PC runner work. TASKS new74 records Claude Max sign-in live on Nov7; sign-in alone does not prove a completed PC task.
- Recipe validator passes and YAML existence are distinct from clone/install/run/health plus a bot tool invocation. TESTS records four Docker recipes and REA historically; do not blanket-close35/37.
- No new tests or external link checks were run for this audit. No current CI run was queried. Source presence and merge ancestry are the only fresh verification performed here.

## Handoff

Lead: normalize duplicate task numbers before future claims; update old merged rows to MERGED with separate live acceptance links, mark34 superseded, and retain the genuine pending items above. Prioritize a recorded successful Claude Windows task, current installer acceptance and outstanding live/recipe flows over reopening already merged implementations. This report does not change Build status or assert 100% completion.


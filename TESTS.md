# Test log

Every feature, how it was tested, when, by whom, and the result. **Kevin: read the table. The agents: follow the rules at the bottom.**

Legend: ✅ passed · ⚠️ passed with a known limit · ❌ failed · ⏳ not yet tested this way.
Kinds of test: **Unit/CI** (automatic tests in the code), **Review** (an independent agent read the code for bugs and security), **Live PC** (on Kevin's PC, real app), **Live server** (on the Hostinger server), **Live phone**, **Real account** (with Kevin's real provider account).

**Tested: 67%** (96.5 of 145 checks that apply have passed; a pass with a known limit counts as half). Updated by the lead each check-in.

| Feature | Unit/CI | Review | Live PC | Live server | Real account / phone | Notes |
|---|---|---|---|---|---|---|
| Windows app starts, health check | ✅ Nov 3 codex | ✅ Nov 3 lead | ✅ Nov 4 lead (build V2Lm2…) | n/a | n/a |  |
| Windows installer (#15, #33) | ✅ Nov 3 codex | ✅ Nov 3 reviewer | ⚠️ Nov 3 codex: upgrade kept data; launching the new install not tested | n/a | n/a |  |
| Chat with a real model (OpenRouter) | ✅ Nov 3 | ✅ Nov 3 reviewer | ✅ Nov 3 lead: Boppy answered on DeepSeek V3.1 | ⚠️ Nov 5 lead: chat-providers 24 on the server's code; a real reply over Tailscale ⏳ | ✅ Nov 3 lead: OpenRouter key 200 |  |
| Chat model picker + refresh (#46) | ✅ Nov 3 | ✅ Nov 3 | ✅ Nov 5 codex: edit-label refresh without reload | ⚠️ Nov 5 lead: picker UI pass on the server's code | n/a |  |
| Chat box layout (#42) | ✅ Nov 3 lead | ✅ Nov 3 lead | ✅ Nov 3 lead | n/a | n/a |  |
| Models: presets, any id, Auto Router, routine model (#31, #44) | ✅ Nov 3-4 | ✅ Nov 5 reviewer | ⏳ | ⚠️ Nov 5 lead: models-card 12, presets 7, routine-model 8 on the server | ⏳ Kevin's real presets |  |
| Several accounts per provider (#45, #55) | ✅ Nov 5 (#55 tests) | ✅ Nov 5 reviewer + fix | ⏳ | ⚠️ Nov 5 lead: provider-accounts 10 on the server | ⏳ a second real key |  |
| AI subscriptions + local sign-in (#30, #37) | ✅ Nov 3 | ✅ Nov 3 reviewer | ⚠️ Nov 3 codex: Claude Max sign-in in the live UI | ⚠️ Nov 5 lead: local-subscriptions 15 on the server | ⚠️ ChatGPT plan sign-in not tried |  |
| Bot tasks on the PC (local executor) | ✅ | ✅ codex | ❌ Nov 4 Kevin: authentication rejected | n/a | ❌ OpenAI environment key + credit missing | Kevin to choose a fix |
| Bot tasks on the cloud computer (Claude Code, Max plan) | ✅ | ✅ | ⏳ | n/a | ⏳ one real task |  |
| Composio connected apps (#40) | ✅ Nov 3 | ✅ Nov 3 reviewer | ⚠️ Nov 4 lead: key accepted; Gmail not connected yet | ⚠️ Nov 5 lead: connections 19 + ui 5 on the server; key set | ⏳ Gmail via Composio (Kevin's sign-in) |  |
| Zapier MCP (#40) | ✅ Nov 3 | ✅ Nov 3 reviewer | ⏳ | ⚠️ Nov 5 lead: connections 19 on the server (fake Zapier) | ⏳ needs Kevin's Zapier address |  |
| Repos section + run_repo (#38, #58, #59, #61, #63, #66) | ✅ (20+7) | ⚠️ Nov 5: plan binding (#59), member private reads (#58, #63), default-deny firewall (#61) fixed and merged; OS crontab/at persistence ⏳ | ⏳ | ✅ Nov 5 lead: repos 28/0 on the server (b754835, after #71) | n/a |  |
| Repo recipes (#21, #53) | ✅ Nov 5 zai (16 recipes valid) | ✅ | ✅ Nov 5 zai: n8n, Stirling-PDF, twenty, paperless-ngx healthy in Docker; REA Nov 3 codex | ✅ Nov 5 lead: 16 recipes valid on the server | n/a | paperless-ngx bug found and fixed (#53); other 10 recipes T |
| Editable SOUL.md / MEMORY.md (#39) | ✅ (11+5) | ✅ Nov 5: MEMORY.md off outside turns + 12k cap (#57), teammate memory blocked for outsiders (#62); codex review | ⏳ | ⚠️ Nov 5 lead: bot-docs 16 + ui 5 on the server (43d8950) | n/a |  |
| Custom schedules / cron (#52) | ✅ Nov 4 lead | ✅ Nov 3 reviewer | ⏳ | ✅ Nov 5 lead: cron 15 + schedules 69 on the server | n/a |  |
| Pause routines when away (#19) | ✅ Nov 3 | ✅ reviewer + lead fix | ⏳ | ⚠️ Nov 5 lead: routines-away 10 on the server | n/a |  |
| Allow for this conversation (#27) | ✅ Nov 3 | ✅ reviewer + lead fix | ⏳ | ⚠️ Nov 5 lead: thread-asks 7 on the server | n/a |  |
| Own tool servers per bot / MCP (#32, #55) | ✅ Nov 5 (mcp 17) | ✅ Nov 5 reviewer + fix | ⏳ | ⚠️ Nov 5 lead: mcp 17 on the server | ⏳ a real MCP server | Windows run T |
| Word/PowerPoint/Excel from chat (#41, #54) | ✅ Nov 5 zai (docs 6, proxy) | ✅ Nov 3 reviewer + fix | ⚠️ Nov 5 codex: docx/xlsx/pptx download and content OK; a 1-slide deck came out as 2 | ✅ Nov 5 lead: docs 6 on the server (2687b38 includes #54) | n/a |  |
| Goals and ideas (#51, #55) | ✅ Nov 5 (goals 12) | ✅ Nov 5 reviewer + fix | ⚠️ Nov 5 codex: Ideas park/reopen/dismiss pass; goal creation ⏳ | ⚠️ Nov 5 lead: goals 12 on the server | n/a |  |
| Change the look by chat (#4) | ✅ | ✅ Nov 3 | ⏳ | ✅ Nov 5 lead: look 20 on the server | n/a |  |
| Voice typing card / Handy (#34) | ✅ | ✅ | ⚠️ Nov 5 codex: card renders (partial) | n/a | n/a |  |
| Keys card + key checks (#10) | ✅ | ✅ | ⏳ | ⚠️ Nov 5 lead: key-check 9 on the server | ⚠️ OpenRouter + Composio keys accepted |  |
| Hostinger server, Tailscale-only (#12, #16) | ✅ | ✅ | n/a | ✅ Nov 5 lead: updated to 2687b38, active, health OK, test battery run | n/a | #54/#55 not on it yet |
| Ollama chat (#28) | ✅ | ✅ | n/a | ⚠️ Nov 3 lead: works, too slow | n/a |  |
| Android app (#1, #2, #14, #26) | ✅ | ✅ | n/a | n/a | ⏳ Kevin's phone install + pairing |  |
| z.ai China Coding Plan (#23) | ✅ | ✅ | n/a | n/a | ⏳ quota resets Nov 8 |  |
| Free local voice, Voice (local) module (#64, #68) | ✅ Nov 5 voice-local 15 (fake services; each fix's check fails without it), lead re-ran | ✅ Nov 5 reviewer; all 7 findings fixed in #68 | ⏳ | ⚠️ Nov 5 lead: voice-local on the server's code (1fb2921) | ⏳ a running speech service (Speaches recipe) |  |
| Phone pairing card: Unpair / Pair again ask first (#65, from the crawl) | ✅ Nov 5 crawl: phone-card-ui 5 | ✅ Nov 5 lead | ⏳ | ⏳ | ⏳ | |
| Repos section padding (#66, from the crawl) | ✅ Nov 5 crawl: repos-ui 8 | ✅ Nov 5 lead | ⏳ | n/a | n/a | |
| Every screen and button, desktop 1280x800 (crawl) | ✅ Nov 5 crawl: 44 screens, 969 controls, no crashes | ✅ Nov 5 lead | ⏳ (crawl ran on a throwaway copy) | n/a | n/a | details: tests/2026-11-05-0807-e2e-ui-crawl.md |
| Narrow window / phone layout (420px, 412px) | ✅ Nov 5: one-column layout (#70); 44 of 44 screens reachable at 420 and 412 (was 33); mobile-layout test 28/28 | ⚠️ Nov 5 lead: screenshots checked; phone Back button and the composer's placeholder overlap are follow-ups | n/a | ⚠️ Nov 5 lead: server build 1fb2921 includes it; mobile-layout test not run on the server (needs Playwright) | ⏳ Kevin's phone (Android app) | one-column layout being built (lead) |
| A stale phone pairing (#67, from the crawl) | ✅ Nov 5 crawl: refused-load-ui test | ✅ Nov 5 lead | n/a | ⏳ | ⏳ | |
| Memory says when its service can't be reached (#69, from the crawl) | ✅ Nov 5 zai: memory-reachable 3 | ⚠️ Nov 5 reviewer: OK, but the Memory sheet (?ws=) still shows an empty memory during an outage; search says 'nothing matches'; any error is called unreachable (fix: zai) | ⏳ | ✅ Nov 5 lead: memory-reachable 3 on the server (b754835) | n/a |  |
| Which OpenAI key powers chat, said plainly (#72, from the crawl) | ✅ Nov 5 zai: openai-key-wording 2 | ✅ Nov 5 reviewer (one wording nit) | ⏳ | ✅ Nov 5 lead: openai-key-wording 2 on the server (b754835) | n/a | wording only; one key store is a later decision |
| GitHub automatic checks (CI) | ❌ paused by GitHub since Nov 3 |  |  |  |  | Kevin to re-enable on the Actions page |

## Rules for every agent (how to test and how to log it)

1. **Test every way the feature is used:** the automatic tests; an independent review for anything with keys, approvals, other people or the bots' computers; the real app on Kevin's PC; the server; the phone, where it applies; and Kevin's real account where it applies. Try the normal path, wrong input, no key, no network, a restart in the middle, a member instead of the owner, and on Windows.
2. **Log each test run** as a new file `tests/YYYY-MM-DD-HHMM-<who>-<feature>.md` (UTC time). Include: the feature and the PR, the kind of test, the exact steps or commands, the real result (paste output), pass or fail, and what wasn't covered. Never put keys or pairing codes in it.
3. The lead copies the result into the table above, with the date, who ran it and the outcome. A feature counts as **done** only when every column that applies to it is ✅ or explained.
4. A failed test opens a fix: message the lead with the test file and what broke.

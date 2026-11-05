# Test log

Every feature, how it was tested, when, by whom, and the result. **Kevin: read the table. The agents: follow the rules at the bottom.**

Legend: ✅ passed · ⚠️ passed with a known limit · ❌ failed · ⏳ not yet tested this way.
Kinds of test: **Unit/CI** (automatic tests in the code), **Review** (an independent agent read the code for bugs and security), **Live PC** (on Kevin's PC, real app), **Live server** (on the Hostinger server), **Live phone**, **Real account** (with Kevin's real provider account).

| Feature | Unit/CI | Review | Live PC | Live server | Real account / phone | Notes |
|---|---|---|---|---|---|---|
| Windows app starts, health check | ✅ Nov 3, codex (smoke test #9) | ✅ Nov 3, lead | ✅ Nov 4 8:58 PM, lead (health OK after restart) | n/a | n/a | |
| Windows installer (#15, #33) | ✅ Nov 3, codex | ✅ Nov 3, reviewer | ⚠️ Nov 3, codex: install over the old copy kept data and shortcuts; opening the freshly installed copy not tested (blocked by Codex's policy) | n/a | n/a | Launch after install ⏳ |
| Chat replies with a real model (OpenRouter) | ✅ Nov 3 (#28, #31 tests) | ✅ Nov 3, reviewer (#31) | ✅ Nov 3 1:05 PM, lead: Boppy answered on DeepSeek V3.1 | ⏳ | ✅ Nov 3, lead: OpenRouter key check 200 | |
| Chat model picker | ✅ Nov 3 | ✅ Nov 3 | ✅ Nov 3, lead: picked DeepSeek V3.1, reply came back | ⏳ | n/a | Picker refresh without Ctrl+R (#46): ✅ CI only, ⏳ live |
| Chat box layout in narrow windows (#42) | ✅ Nov 3, lead | ✅ Nov 3, lead (self-review, small) | ✅ Nov 3 12:52 PM, lead: text box full width with the side panel open | n/a | n/a | |
| Models section (#31), presets, custom ids, Auto Router, routine model (#44), several accounts (#45) | ✅ Nov 3-4 (#31 tests; #44: 7+8 new tests; #45: 9) | ✅ #31 Nov 3 reviewer; ✅ #44 Nov 5 reviewer; ✅ #45 fixed Nov 5 (#55: OpenAI accounts use their own key; new tests) | ⚠️ #31 live Nov 3, lead (added 3 models via the card's API); #44/#45 ⏳ (not built on the PC yet) | ⏳ | ⏳ presets with Kevin's real presets | |
| AI subscriptions card + local sign-in (#30, #37) | ✅ Nov 3 | ✅ Nov 3, reviewer | ⚠️ Nov 3, codex: Claude Code Max-plan sign-in confirmed in the live UI | ⏳ | ✅ Claude Max plan (codex) | ChatGPT plan sign-in ⏳ |
| Bot tasks on the PC (local executor) | ✅ CI | ✅ #47-#49 codex | ❌ Nov 4 9:00 PM, Kevin: "Local executor exited with code 1 (authentication rejected)" | n/a | ❌ OpenAI environment key missing, no credit | Fix: OpenAI key + credit, or tasks on the cloud computer |
| Bot tasks on the cloud computer (Claude Code, Max plan) | ✅ CI | ✅ | ⏳ | n/a | ⚠️ sign-in confirmed by codex, a task run ⏳ | |
| Composio (Connected apps) | ✅ CI (#40 tests 19+5) | ✅ Nov 3, reviewer (#40) | ⚠️ Nov 4 8:58 PM, lead: key accepted by Composio (200); Gmail not yet connected in Bops (Kevin to sign in) | ⏳ key set, not tested | ⏳ Gmail via Composio | |
| Zapier (MCP) | ✅ CI (#40) | ✅ Nov 3, reviewer | ⏳ | ⏳ | ⏳ needs Kevin's Zapier MCP address | |
| Repos section + bot repo tools (#38) | ✅ CI (20+7 tests) | ⚠️ Nov 3, reviewer: REQUEST CHANGES (plan binding, cron persistence, firewall snapshot, member private reads); merged Nov 4 by zai, fixes NOT confirmed | ⏳ | ⏳ | ⏳ | Re-review the 4 findings ⏳ |
| Repo recipes (#21) | ✅ CI (validator, 16 recipes) | ✅ | ⚠️ REA verified live by codex Nov 3 (JADX, WABT, apktool, ADB, Ghidra) | ⏳ | n/a | Other 15 recipes ⏳ (zai, Docker, in progress) |
| Editable SOUL.md / MEMORY.md (#39) | ✅ CI (11+5) | ⚠️ Nov 3, reviewer: MEMORY.md reaches outside turns, prompt cap; fix not confirmed | ⏳ | ⏳ | n/a | |
| Custom schedules / cron (#52) | ✅ Nov 4, lead (test-cron 15, test-schedules 69, chat-tools 84) | ✅ Nov 3, reviewer (2 fixes confirmed) | ⏳ | ⏳ | n/a | No GitHub CI (Actions paused) |
| Pause routines when away (#19) | ✅ Nov 3 (10 tests) | ✅ Nov 3, reviewer + lead fix | ⏳ | ⏳ | n/a | |
| Allow for this conversation (#27) | ✅ Nov 3 (7 + scope 19) | ✅ Nov 3, reviewer + lead fix | ⏳ | ⏳ | n/a | |
| Your own tool servers per bot / MCP (#32) | ✅ CI | ✅ fixed Nov 5 (#55: Windows tree kill, owner-only brain threads, reserved names, UTF-8 stream, 8 MB line cap; mcp 17/0, lead re-ran). Windows run ⏳ | ⏳ | ⏳ | n/a | |
| Word/PowerPoint/Excel from chat (#41) | ✅ CI | ⚠️ Nov 3 review: download link likely 403 in the desktop app; fix not confirmed | ⏳ | ⏳ | n/a | |
| Goals and ideas (#51) | ⚠️ local only (zai): tsc, lint, 7 tests; no GitHub CI | ✅ fixed Nov 5 (#55: strict schemas + a check over every tool's schema, schedules via toSchedule, all-or-nothing goals; goals 12/0, chat-tools 85/0, lead re-ran) | ⏳ | ⏳ | n/a | |
| Change the look by chat (#4) | ✅ | ✅ Nov 3 (11 bypasses tested) | ⏳ | ⏳ | n/a | |
| Voice typing card / Handy (#34) | ✅ | ✅ lead | ⏳ | n/a | n/a | |
| Keys card + key checks (#10) | ✅ | ✅ | ⏳ | ⏳ | ⚠️ OpenRouter + Composio keys accepted (lead) | |
| Hostinger server, Tailscale-only (#12, #16) | ✅ dry run in Docker | ✅ | n/a | ✅ Nov 3, lead: active, n8n/Traefik untouched, health OK | n/a | Running an old build (needs an update ⏳) |
| Ollama chat (#28) | ✅ | ✅ | n/a | ⚠️ Nov 3, lead: answers, but 31 s for 5 words (too slow) | n/a | |
| Android app (#1, #2, #14, #26) | ✅ gradle build + lint in CI | ✅ | n/a | n/a | ⏳ install on Kevin's phone + pairing | APK debug-signed |
| z.ai China Coding Plan (#23) | ✅ | ✅ lead | n/a | n/a | ⏳ quota until Nov 8 | |
| GitHub checks (CI) | ❌ paused by GitHub since Nov 3 4:14 PM ("scale of Actions usage") | | | | | Kevin to re-enable on the Actions page |

## Rules for every agent (how to test and how to log it)

1. **Test every way the feature is used:** the automatic tests; an independent review for anything with keys, approvals, other people or the bots' computers; the real app on Kevin's PC; the server; the phone, where it applies; and Kevin's real account where it applies. Try the normal path, wrong input, no key, no network, a restart in the middle, a member instead of the owner, and on Windows.
2. **Log each test run** as a new file `tests/YYYY-MM-DD-HHMM-<who>-<feature>.md` (UTC time). Include: the feature and the PR, the kind of test, the exact steps or commands, the real result (paste output), pass or fail, and what wasn't covered. Never put keys or pairing codes in it.
3. The lead copies the result into the table above, with the date, who ran it and the outcome. A feature counts as **done** only when every column that applies to it is ✅ or explained.
4. A failed test opens a fix: message the lead with the test file and what broke.

# Test log

Every feature, how it was tested, when, by whom, and the result. **Kevin: read the table. The agents: follow the rules at the bottom.**

Legend: ✅ passed · ⚠️ passed with a known limit · ❌ failed · ⏳ not yet tested this way.
Kinds of test: **Unit/CI** (automatic tests in the code), **Review** (an independent agent read the code for bugs and security), **Live PC** (on Kevin's PC, real app), **Live server** (on the Hostinger server), **Live phone**, **Real account** (with Kevin's real provider account).

**Tested: 65%** (121 of 185 checks that apply have passed; a pass with a known limit counts as half). Updated by the lead each check-in.

**Visual features (Kevin, Nov 5):** a screen or visual change is only ✅ when (1) its tests pass, (2) a screenshot check passes (dark mode, no blank screens), (3) an independent review passes, and (4) it's tried in the real app on the PC.

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
| Repos section + run_repo (#38, #58, #59, #61, #63, #66) | ✅ (20+7) | ⚠️ Nov 5: plan binding (#59), member private reads (#58, #63), default-deny firewall (#61) fixed and merged; OS crontab/at persistence closed (#94: deny + cleanup + fail closed, two security reviews) ✅ | ⏳ | ✅ Nov 5 lead: repos 28/0 on the server (b754835, after #71) | n/a |  |
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
| Memory says when its service can't be reached (#69, from the crawl) | ✅ Nov 5 zai: memory-reachable 3; codex #76: blank-config 4 + own 9 (CI green) | ⚠️ Nov 5 reviewer: OK, but the Memory sheet (?ws=) still shows an empty memory during an outage; search says 'nothing matches'; any error is called unreachable (fix: zai) | ⏳ | ✅ Nov 5 lead: memory-reachable 3 on the server (b754835) | n/a |  |
| Which OpenAI key powers chat, said plainly (#72, from the crawl) | ✅ Nov 5 zai: openai-key-wording 2 | ✅ Nov 5 reviewer (one wording nit) | ⏳ | ✅ Nov 5 lead: openai-key-wording 2 on the server (b754835) | n/a | wording only; one key store is a later decision |
| Bad cron can't be saved; phone Logins refusal says why (#73, #74, from the crawl) | ✅ Nov 5 zai + lead: crawl-low-1 2 | ✅ Nov 5 reviewer (#74; #73 typing bug found and fixed) | ⏳ | ✅ Nov 5 lead: crawl-low-1 2 on the server (c313758) | n/a |  |
| Crawl LOW part 2: own schedule chip picked, skills 503, name limits, avatar label (#75) | ✅ Nov 5 zai + lead: crawl-low-2 4 | ✅ Nov 5 lead (post-merge; nit: the 503 is chosen by matching the error text) | ⏳ | ⏳ | n/a |  |
| No blank screens: every page explains itself (#82) | ✅ Nov 5 lead builder: no-blank-screens 39/39, mobile-layout 28 | ✅ Nov 5 reviewer (nits: cloud wording, link target) | ⏳ | ⏳ | n/a | 4 screens fixed: How bots reach you, Email and phone, Memory, Logins |
| Bot tasks on this PC with your Claude plan (#80) | ✅ Nov 5 builder: pc-task-runner 14, cli-agents 43, local-subscriptions 15, executor-lifecycle 7 | ✅ Nov 5 security re-review + codex Windows review (nits in task 60) | ⚠️ Nov 7 lead: Job Object proven live on the PC with packaged Bops.exe (#122: forks die with Bops, fail-closed, missing CLI); an in-app task still waits on chat + Kevin's OK | n/a | ⏳ a real task on Kevin's Max plan |  |
| Easy phone pairing: Your phone in Settings, QR codes, Scan button (#77) | ✅ Nov 5 builder: easy-pairing 15, phone-card-ui 5, PairLink unit 15, gradle build | ✅ Nov 5 reviewer (fixes done; QR decoded to bops://pair) | ⏳ | n/a | ⏳ Kevin's phone |  |
| In-progress badges: grayed out, red label, percent; Being tested state (#84) | ✅ Nov 5 builder: in-progress 11, in-progress-ui 20 (light, dark, desktop, phone), mobile-layout 28 | ✅ Nov 5 reviewer (blocker fixed) | ⏳ | n/a | n/a |  |
| Agents you run: several DeepSeek Harness and Hermes instances (#91) | ✅ Nov 5 builder: agent-instances 12, UI 9 | ✅ Nov 5 security review (8 fixes done) | ⏳ | n/a | ⏳ Hermes on the server with its key | Hermes API reachable on the tailnet (health 200, 401 without key) |
| Settings → Services: paste service keys, no files (#87) | ✅ Nov 5 builder: service-keys 15, no-blank-screens 49 | ✅ Nov 5 security review (6 fixes done) | ⏳ | n/a | ⏳ Kevin's real keys |  |
| Bot's Chrome starts on this PC, with a plain reason when it can't (#92) | ✅ Nov 5 builder: chrome-start 13, pc-task-runner 14, executor-lifecycle 7 | ✅ Nov 5 reviewer (4 fixes done) | ⏳ codex retest | n/a | n/a |  |
| No false "task started" or "sent" (#93) | ✅ Nov 5 builder: no-unbacked-claims 13, chat-tools 85, core-agent 16 | ✅ Nov 5 re-review (nits in task 66) | ⏳ codex | n/a | n/a |  |
| Repos can't schedule themselves or outlive stop (#94) | ✅ Nov 5 builder: bops-repo shell 11, repos 31 | ✅ Nov 5 security re-review | n/a | ⏳ a live run on a bot computer | n/a | |
| GitHub automatic checks (CI) | ✅ Nov 5: back on; #79 all green (web, check incl. secret scan, cloud-tests, android, mobile-layout) |  |  |  |  | Kevin to re-enable on the Actions page |

## Rules for every agent (how to test and how to log it)

1. **Test every way the feature is used:** the automatic tests; an independent review for anything with keys, approvals, other people or the bots' computers; the real app on Kevin's PC; the server; the phone, where it applies; and Kevin's real account where it applies. Try the normal path, wrong input, no key, no network, a restart in the middle, a member instead of the owner, and on Windows.
2. **Log each test run** as a new file `tests/YYYY-MM-DD-HHMM-<who>-<feature>.md` (UTC time). Include: the feature and the PR, the kind of test, the exact steps or commands, the real result (paste output), pass or fail, and what wasn't covered. Never put keys or pairing codes in it.
3. The lead copies the result into the table above, with the date, who ran it and the outcome. A feature counts as **done** only when every column that applies to it is ✅ or explained.
4. A failed test opens a fix: message the lead with the test file and what broke.


## Release-readiness checks added 2026-11-11 (from the deep scan)

All ⏳ not yet tested. Each maps to a task in BUILD_PLAN_V2.md. These are not yet counted in the percent at the top; the lead adds them under BG-06.

| Check | Task | Result |
|---|---|---|
| npm audit: 0 critical, 0 high, enforced on every PR | BG-07 | ⏳ (today: 1 critical, 10 high) |
| 0 commits behind the original after the weekly sync | BG-08 | ⏳ (today: 172 behind) |
| Each of the 27 process-starting files has a saved security review | BG-09 | ⏳ |
| Pairing: per-device, expiry, remove a device | BG-12 | ⏳ |
| Android: signed build; plain connections refused outside private ranges | BG-13 | ⏳ |
| Windows: install, launch, uninstall, reinstall | BG-10 | ⏳ |
| Windows: update offered, verified, installed; roll back works | BG-11, BG-15 | ⏳ |
| Server: update and roll back | BG-15 | ⏳ |
| Chat answers with the main key empty, and says which model | BG-17 | ⏳ |
| 39 of 39 test suites in CI | BG-18 | ⏳ (today: 6 of 39) |
| One real PC task end to end; nothing left running after Bops closes | BG-19 | ⏳ |
| Clean install to working chat in under 10 minutes | BG-20 | ⏳ |
| Every screen light and dark; keyboard only; scaling | BG-21 | ⏳ |
| Look-only desktop task through the agent-desktop hub | BG-22 | ⏳ |
| One real-account run per connection | BG-23 | ⏳ |
| Phone: install, pair, approve, unpair | BG-25 | ⏳ |

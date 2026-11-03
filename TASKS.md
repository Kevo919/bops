# Tasks

## How every task is checked (all of us)
1. Before you say DONE: re-read your diff against the task's GOAL and every word of its row. Fix what doesn't match.
2. Run every check the task names, plus npx tsc --noEmit -p . and npm run lint for web changes, or gradlew assembleDebug lintDebug for Android. Paste the real output in the PR under "Verified".
3. Write "Not verified" honestly: what you couldn't run, and why.
4. After task 9 lands: no PR is ready until CI is green.
5. The lead reviews every PR before Kevin merges it.

Owned by the lead. Statuses: TODO, DOING, REVIEW (PR open), DONE, BLOCKED.

| # | Task | Who | Status | Branch / PR | Notes |
|---|---|---|---|---|---|
| 1 | Android app: save several Bops (PC + Hostinger), switcher, pings from each | codex | REVIEW (fixes in) | PR #1 | Original prompt's 5 items. Only android/ |
| 2 | Bots change the app's look by chat (change_look tool, Look card, CSS sanitizer) | zai | FIX (review) | PR #4 | see 0610 review message: 2 HIGH security fixes first | Plan approved. No-edit list in your prompt, plus config/llms.*, lib/server/llms.ts |
| 3 | DeepSeek Harness as an agent kind (dsh headless on bots' computers) | lead | DONE | windows-port ac68d39 | Lead is doing it; don't touch cli-agents.ts, brains.ts, vm/bin/* |
| 4 | Android: show the LLMs from config/llms.yaml in the app's settings, read-only (GET /api/state has `llms`) | codex | REVIEW (fixes in) | PR #2 (stacked on #1) | After task 1. android/ only |
| 5 | Test plan doc: a step-by-step checklist Kevin can follow on his PC to try every feature (docs/test-checklist.md), plain English | zai | REVIEW | PR #5 | After task 2. Read README "This fork" + docs/ first |
| 6 | Unit tests for config/llms.cjs and config/modules.cjs edge cases (bad YAML, unknown provider, comments kept on write) | codex | REVIEW | PR #3 | lead ran it: 15 pass. scripts/test-config.mjs, follow scripts/test-*.mjs style |

| 7 | (after task 16) Hostinger dry run: a script that checks scripts/vps-setup.sh on a fresh Ubuntu 24.04 container (Docker), as far as it goes without a real domain (skip Caddy cert), and fix what breaks. scripts/test-vps-setup.sh | codex | TODO | | Don't change other files except vps-setup.sh fixes; tell lead each fix |
| 8 | Tests for change_look owner gate and CSS sanitizer | zai | TODO | | Part of task 2's PR |

| 9 | (PR #6, draft) CI for the fork: .github/workflows/fork-ci.yml runs on every PR into windows-port: npm ci, npx tsc --noEmit -p ., npm run lint, node scripts/test-bot-ai.mjs, node --conditions=react-server scripts/test-cli-agents.mjs, node scripts/test-config.mjs, and in android/ ./gradlew assembleDebug lintDebug (JDK 17). Runs only in forks (copy sync-upstream.yml's guard) | codex | REVIEW | PR #6 | GOAL: no PR merges red. Prove it: open a throwaway PR that breaks a test and show CI fails, then close it |
| 10 | Windows smoke test: scripts/smoke-windows.ps1 starts dist-desktop\win-unpacked\Bops.exe, waits for /api/health, pairs a code with scripts/pair-phone.mjs, checks /api/pings (200 with the code, 403 without), /api/modules (403 from the phone), unpairs, quits Bops through the tray-equivalent path (POST /api/restart is NOT quit; use the same stop desktop/windows.cjs stopServerTree uses), and checks no node.exe from the bops folder is left running. Prints PASS/FAIL per step | codex | REVIEW | PR #9 | GOAL: one command tells Kevin the PC build works. Run it on this PC and paste the output in the PR. Must not leave a phone paired or change .env.local |
| 11 | Key check in Settings: a "Keys" card in components/app/setup.tsx listing OPENAI_API_KEY, OPENAI_EXECUTOR_API_KEY, ORGO_API_KEY, ANTHROPIC_API_KEY, ZAI_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY: set / works / no credit / invalid, with a Check button. Server: lib/server/key-check.ts + app/api/key-check/route.ts (window only, like app/api/modules/route.ts allowed), each check one cheap call (models list; for OpenAI credit, a 1-token request only when the user presses Check). Never return or log a key value | codex | REVIEW | PR #10 | GOAL: Kevin sees at a glance why a bot can't answer ("OpenAI: no credit"). Tests in scripts/test-key-check.mjs with a fake fetch |
| 12 | docs/keys.md: where to get every key above (links, which page, what it starts with, set a spending limit), plain English, and link it from README "This fork" and from the Keys card | codex | REVIEW | PR #13 | Verify every link loads |
| 13 | GET /api/llms: a small read-only route returning { llms } (same auth as /api/state) and switch the Android settings screen to it (falls back to /api/state on 404) | codex | REVIEW | PR #14 | After PR #2's fixes |
| 14 | Windows installer: make npm run app:build:win's NSIS target (not just --dir) build Bops-Setup.exe; install to the user's folder, Start Menu shortcut, uninstall keeps your data; docs/windows.md "Install Bops on Windows" | codex | TODO | | Build it on this PC; install, launch, uninstall, reinstall; report what you saw |

| 15 | Make every scripts/test-*.mjs run on Windows too: fix new URL("..", import.meta.url).pathname (/C:/... paths), mixed join/URL imports, and EPERM temp cleanup (retry rm with maxRetries, or ignore EPERM on cleanup only). No assertion changes. | zai | REVIEW | PR #11 | GOAL: node scripts/test-bot-ai.mjs and node --conditions=react-server scripts/test-cli-agents.mjs pass on Kevin's PC AND still pass on Linux CI. Paste both outputs |
| 16 | Tailscale-only server mode in scripts/vps-setup.sh: BOPS_TAILSCALE=1 installs Tailscale (official apt repo), skips Caddy and public ports entirely, binds Bops to 127.0.0.1 and exposes it with `tailscale serve` (https on the tailnet) — so it can share a VPS that already runs n8n/Traefik on 80/443 without touching them. Must detect and refuse to touch anything already on 80/443 when not in this mode. Update docs/hostinger.md | zai | REVIEW | PR #12 | GOAL: Kevin's VPS already runs n8n; nothing about n8n may change. codex's task 7 dry run tests this mode after it lands |

## Done

- Windows port, phone pairing, Android app v1, tray, notifications, QR pairing, modules, job routing + Z.ai, sync docs, LLMs file (lead), on windows-port at 7568894.

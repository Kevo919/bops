# Tasks

Owned by the lead. Statuses: TODO, DOING, REVIEW (PR open), DONE, BLOCKED.

| # | Task | Who | Status | Branch / PR | Notes |
|---|---|---|---|---|---|
| 1 | Android app: save several Bops (PC + Hostinger), switcher, pings from each | codex | REVIEW | PR #1 | Original prompt's 5 items. Only android/ |
| 2 | Bots change the app's look by chat (change_look tool, Look card, CSS sanitizer) | zai | DOING | feature/look-by-chat | Plan approved. No-edit list in your prompt, plus config/llms.*, lib/server/llms.ts |
| 3 | DeepSeek Harness as an agent kind (dsh headless on bots' computers) | lead | DONE | windows-port ac68d39 | Lead is doing it; don't touch cli-agents.ts, brains.ts, vm/bin/* |
| 4 | Android: show the LLMs from config/llms.yaml in the app's settings, read-only (GET /api/state has `llms`) | codex | REVIEW | PR #2 (stacked on #1) | After task 1. android/ only |
| 5 | Test plan doc: a step-by-step checklist Kevin can follow on his PC to try every feature (docs/test-checklist.md), plain English | next free (zai first) | TODO | | After task 2. Read README "This fork" + docs/ first |
| 6 | Unit tests for config/llms.cjs and config/modules.cjs edge cases (bad YAML, unknown provider, comments kept on write) | codex | REVIEW | PR #3 | lead ran it: 15 pass. scripts/test-config.mjs, follow scripts/test-*.mjs style |

| 7 | Hostinger dry run: a script that checks scripts/vps-setup.sh on a fresh Ubuntu 24.04 container (Docker), as far as it goes without a real domain (skip Caddy cert), and fix what breaks. scripts/test-vps-setup.sh | codex | TODO | | Don't change other files except vps-setup.sh fixes; tell lead each fix |
| 8 | Tests for change_look owner gate and CSS sanitizer | zai | TODO | | Part of task 2's PR |

## Done

- Windows port, phone pairing, Android app v1, tray, notifications, QR pairing, modules, job routing + Z.ai, sync docs, LLMs file (lead), on windows-port at 7568894.

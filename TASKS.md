# Tasks

Owned by the lead. Statuses: TODO, DOING, REVIEW (PR open), DONE, BLOCKED.

| # | Task | Who | Status | Branch / PR | Notes |
|---|---|---|---|---|---|
| 1 | Android app: save several Bops (PC + Hostinger), switcher, pings from each | codex | DOING | feature/android-multi | Original prompt's 5 items. Only android/ |
| 2 | Bots change the app's look by chat (change_look tool, Look card, CSS sanitizer) | zai | DOING | feature/look-by-chat | Plan approved. No-edit list in your prompt, plus config/llms.*, lib/server/llms.ts |
| 3 | DeepSeek Harness as an agent kind (dsh headless on bots' computers) | lead | DOING | (lead's own) | Lead is doing it; don't touch cli-agents.ts, brains.ts, vm/bin/* |
| 4 | Android: show the LLMs from config/llms.yaml in the app's settings, read-only (GET /api/state has `llms`) | next free (codex first) | TODO | | After task 1. android/ only |
| 5 | Test plan doc: a step-by-step checklist Kevin can follow on his PC to try every feature (docs/test-checklist.md), plain English | next free (zai first) | TODO | | After task 2. Read README "This fork" + docs/ first |
| 6 | Unit tests for config/llms.cjs and config/modules.cjs edge cases (bad YAML, unknown provider, comments kept on write) | next free | TODO | | scripts/test-config.mjs, follow scripts/test-*.mjs style |

## Done

- Windows port, phone pairing, Android app v1, tray, notifications, QR pairing, modules, job routing + Z.ai, sync docs, LLMs file (lead), on windows-port at 7568894.

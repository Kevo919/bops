# Windows identity fix ready for CI review

- Request: REQ-20261103-codex-windows-identity; source Kevin's Windows-PC correction, logged before delegation.
- Owner: Codex; branch codex/windows-identity; PR https://github.com/Kevo919/bops/pull/49; head 29b89ab983be9eb3961ba2dfb4689f590c7b1030.
- Status at 2026-11-03T21:04:58Z: draft PR, implementation and independent review complete; CI pending; not merged/deployed. Available for lead/parent review, not duplicate implementation.
- Scope: server-platform identity for primary local-computer labels (including phone viewers), neutral loading copy, Windows-specific task instructions and chat briefings. Mac routing enum and executor lifecycle unchanged. Names, task titles and saved message content preserved.
- Tests: three platform React/config/prompt checks passed; routing UI 14 passed; subscription UI base13 plus desktop gate/poll/Claude URL regressions passed after current-base merge; focused ESLint/syntax/diff passed. CI has new platform checks.
- Merge: normal merge of windows-port63cb020, one setup.tsx copy conflict resolved preserving desktop-only subscription gates and platform-aware text.
- Not verified: full local build/typecheck (shared build lock), native macOS, actual Electron screenshot, real model execution. Other historical Mac wording outside primary local-task UI remains; no saved messages rewritten.
- Blockers/next: CI and parent integration/deploy. Executor lifecycle is separate PR48 owned by review worker. No credentials or live provider calls used here.

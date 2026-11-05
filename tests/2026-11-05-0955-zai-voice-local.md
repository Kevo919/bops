# Test: Voice (local) module (task 39; PR #64, merged)

- Kind: Unit/CI
- By: zai, 2026-11-05 09:55 UTC, deps restored via npm ci after the lead's rebuild
- What: the chat's mic can run through the owner's own OpenAI-style speech service (module "voice-local":
  VOICE_LOCAL_BASE_URL + VOICE_LOCAL_STT_MODEL); local first, OpenAI only as fallback, never without a key;
  module off = exactly today's behavior. Spoken replies on calls stay with AgentPhone by design (no OpenAI
  TTS exists in Bops; phone-voice.ts) — verified by code read, nothing to replace there.
- Steps / real output: node --conditions=react-server scripts/test-voice-local.mjs -> "voice local: 6 passed",
  exit 0 (off->OpenAI unchanged; on->local-only with path/model/filename/bytes asserted; fallback-with-key vs
  plain-local-error-without-key; silent + unreachable service -> one plain error each; module settings carried).
  tsc 0 errors (after typegen); lint 0 errors; test-repo-recipes 8 passed (17 recipes incl. speaches).
- Speaches recipe (config/repos/speaches.yaml): MIT + /v1/audio/transcriptions + /v1/audio/speech + /health
  confirmed from a fresh clone (993994f); verified stays false — the live Docker run was attempted but the
  engine could not start (0.6 GB free while codex's Live-PC pass uses the rebuilt app; Docker stopped again,
  nothing left running). Live row to fill in the next quiet window.
- Not covered: a real service end-to-end; the Settings card on the rebuilt PC (codex's list); CI (Actions paused).

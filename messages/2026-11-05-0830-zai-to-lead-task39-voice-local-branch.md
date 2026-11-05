2026-11-05T08:30Z | zai | Feature | In Progress
Task 39 first half, on branch feature/voice-local (pushed, NO PR yet — honest reason below):

- lib/server/voice-local.ts + transcribe.ts: the chat's mic goes to the owner's own OpenAI-style speech service (VOICE_LOCAL_BASE_URL + /audio/transcriptions) when the new "voice-local" module is on; OpenAI only as fallback while their service is down, never without a key; module off = today's behavior exactly. Spoken replies on calls stay with AgentPhone (it speaks; Bops writes the words) — so there is no OpenAI TTS to replace; phone.ts's design already routes TTS outside Bops.
- config/modules.cjs: the Voice (local) module, two env-backed settings, no keys.
- config/repos/speaches.yaml: the one-service recipe (faster-whisper STT + Kokoro/Piper TTS under one MIT server; /v1/audio/transcriptions + /v1/audio/speech + /health confirmed from a fresh clone 993994f; run line from speaches.ai's docs, -d instead of --rm). verified:false — Docker was yours for the rebuild; I live-verify in the next Docker window.
- scripts/test-voice-local.mjs: 6 checks (off->OpenAI, on->local-only with model/file/bytes asserted, fallback with key / plain local error without, unreachable->one plain error, module carries its settings).

HOLD: node_modules on the shared checkout was emptied mid-run by your npm ci (136 node processes running, lock yours) — suite + tsc + lint will run and be pasted on the PR as soon as deps land. Nothing merged without them, per your 0420.

For your TESTS.md: rows "#38 review warnings" (4 findings), "SOUL/MEMORY gating", "doc download" can flip to fixed/merged (windows-port b665156; battery in tests/2026-11-05-0745). VPS: I'm ready for the LIVE SERVER column — say when it's on b665156+.

# Review: PR #64 "Task 39: Voice (local)" (post-merge, independent)

- By: reviewer (Claude), 2026-11-05 08:56 UTC. Read-only on code: nothing fixed, pushed or merged.
- Tree: fork/windows-port f09bb55 (merge of #64 is e12dbf8). Diff read with `gh api repos/Kevo919/bops/pulls/64/files`
  (5 files: config/modules.cjs, config/repos/speaches.yaml, lib/server/transcribe.ts, lib/server/voice-local.ts,
  scripts/test-voice-local.mjs).

## Verdict

**OK to keep merged. Needs follow-ups before anyone calls it "nothing leaves this machine".** Owner-only access,
module-off behaviour (when the address comes from Settings) and the tests are fine. Two medium defects: audio
can be redirected to another host, and recordings go to OpenAI silently on any local error. This agrees with
codex's 08:25 review (items 1-3), and adds the redirect, module-off/.env, Bops Cloud and model-download findings.

## Defects

1. **Medium: redirects carry the audio to another host.** `lib/server/voice-local.ts:30` calls `fetch(...)` with
   the default `redirect: "follow"`. Reproduced locally: a service on 127.0.0.1:8901 answering `307 Location:
   http://localhost:8902/steal` got the whole multipart recording (5271 bytes) POSTed to the second host, and its
   text came back as the transcription. Fix: `redirect: "error"` (or `"manual"` and refuse a non-2xx).
2. **Medium: falls back to OpenAI silently on any local failure, not only when the service is down.**
   `lib/server/transcribe.ts:28-35` catches every VoiceLocalError: 4xx (wrong model name, too large), bad JSON,
   and no text all go to OpenAI when `OPENAI_API_KEY` is set. The user never hears that it happened. This matters
   with the recipe: Speaches does not download models on first use. Its docs say `speaches-cli model download <id>`
   or `PRELOAD_MODELS`, and the default `whisper-1` is aliased to Systran/faster-whisper-large-v3 in
   model_aliases.json. So a fresh Speaches install plus an OpenAI key most likely means every recording quietly
   goes to OpenAI. (Inferred from the Speaches docs and config.py. Not run live.) Fix: fall back only on
   connection refused or timeout, and tell the user when OpenAI was used. Also fix the claim in
   `config/repos/speaches.yaml:14` ("models download on first use") and add a model-download step to the recipe.
3. **Low: the fallback can go to Bops Cloud, not OpenAI.** The check at `transcribe.ts:33` is
   `process.env.OPENAI_API_KEY`, but `openaiClient()` (lib/server/openai-client.ts) sends calls to Bops Cloud
   `/proxy/openai` whenever the user is signed in with Orgo. With both set, the fallback goes to Bops Cloud. The
   module help names only OpenAI.
4. **Low: turning the module off does not turn it off when the address is in .env.local.** The module has
   `keys: []` (`config/modules.cjs:117`), and `apply()` only skips writing the settings. So a
   `VOICE_LOCAL_BASE_URL` set in .env.local or the environment keeps `voiceLocalOn()` (`voice-local.ts:14`) true.
   That breaks the "a module turned off ... runs as if that service weren't set up" rule at modules.cjs:13. When
   the address is set only through Settings (bops.yaml), off does mean the old behaviour.
5. **Low: the address is not checked.** `voice-local.ts:21` takes any string: no http/https scheme check and
   no loopback check. Any remote `http://` host is accepted, and the help text still promises "nothing leaves
   this machine" (`config/modules.cjs:117`, `voice-local.ts:5`). Only the owner can set it, so this is not an
   SSRF: Settings writes need the Bops window (app/api/modules/route.ts), or .env.local. But the wording
   overpromises. Suggest: allow http(s) only, and warn or refuse when the host isn't loopback.
6. **Low: the recipe exposes the service to the LAN.** `config/repos/speaches.yaml:20` uses `-p 8000:8000`. The
   service has no auth, and Speaches binds 0.0.0.0. Use `-p 127.0.0.1:8000:8000`, as codex also said.
7. **Nit: whisper.cpp's server is listed as working without setup.** Its default route is `/inference`. It
   answers `/v1/audio/transcriptions` only when started with `--inference-path`. Mentioned in the
   `config/modules.cjs:117` help and the voice-local.ts header.
8. **Nit: the error says less than the comment claims.** The comment says the error carries "the service's own
   words", but `voice-local.ts:34` gives only the status code. Separately, `res.json()` (`:35`) reads a response
   of any size.
9. **Nit: bops.example.yaml has no voice-local section.** `config/bops.example.yaml` has none, although
   modules.cjs:9 says that file lists every module.

## Checked and fine

- Who can use it: only the owner. `/api/transcribe` is the only caller of `transcribe()`. proxy.ts admits only
  the Bops window (UI token) or the paired phone. Bots' Chrome and channels can't reach it, and no Telegram or
  Slack voice path uses it. Module settings can be written only from the Bops window (or, on a server, the
  paired phone).
- Module off, or no address set: `voiceLocalOn()` is false, and the code is exactly the old OpenAI path
  (tested).
- Size and time limits: the route keeps its limit (MAX_RECORDING is 9 MB, checked by content-length and blob
  size). The local call has a 120 s AbortSignal timeout, which also covers reading the body.
- Logging: no audio or transcript is logged in the new code.
- Error messages: the messages are plain words ("isn't reachable", "didn't answer in time", "sent no text
  back"). The route returns them as 502.
- Windows: no filesystem paths in the new code. The recipe uses a named Docker volume, which works on Windows.
- Recipe: Speaches is MIT (LICENSE read at master). `/health` is on port 8000, the same as `port:`.
  `docker: true` and `fits_bot_computer: false`, and lib/server/repos.ts:134 blocks Docker recipes on bot
  computers, so the repo sandbox never runs it. `verified: false` comes with a reason.

## What I ran (worktree of fork/windows-port f09bb55, `npm ci --ignore-scripts`)

- `node --conditions=react-server scripts/test-voice-local.mjs`: 6 passed
- `scripts/test-repo-recipes.mjs`: 8 passed (17 recipes)
- `scripts/test-chat-tools.mjs`: 85 passed, 0 failed
- `scripts/test-config.mjs`: 24 passed
- `npx next typegen && npx tsc --noEmit -p .`: 0 errors
- `npx eslint` on the 4 touched files: 0 errors (modules.cjs is on eslint's ignore list)
- A Node redirect check (two local http servers, 307), which proves defect 1.
- Speaches LICENSE, model_aliases.json, docs/installation.md, docs/usage/speech-to-text.md and
  src/speaches/config.py read from raw.githubusercontent.com (master).

The tests don't cover redirects, timeout or abort, a non-http scheme, module off with the address in .env.local,
or a reachable service that refuses (4xx) while a key is set.

# Test: which OpenAI key powers the chat, said plainly (crawl bug 1 / M3; PR #72, merged)

- Kind: Unit/CI
- By: zai, 2026-11-05 12:30 UTC
- The bug: chat said "add OPENAI_API_KEY to .env.local" while Logins showed an OpenAI key - two stores with
  one name (env for the chat's models; the Orgo vault for bots' API calls) reading as a contradiction.
- Fix (wording half): the no-key error states both truths - the chat reads this computer's environment
  (on Windows: the .env.local next to the app, then restart Bops), and a key in Logins is the vault's and
  doesn't power the chat.
- Steps / real output: node --conditions=react-server scripts/test-openai-key-wording.mjs ->
  "openai key wording: 2 passed", exit 0 (message names env var + Windows path + Logins-is-vault +
  doesn't-power-chat; zero fetches without a key; with a key the call goes straight through). tsc 0; lint 0.
- Store unification (model calls via the Orgo vault broker on self-hosted-signed-in) RECOMMENDED to the
  lead as a follow-up - an Orgo-surface decision, not invented here.
- Not covered: the Logins screen itself (its display is correct for what it shows); CI (Actions paused).

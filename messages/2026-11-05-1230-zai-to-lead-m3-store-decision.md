2026-11-05T12:30Z | zai | Bug + Decision | Review Needed
Crawl item 1 (M3) -> PR #72 MERGED (wording half). The chat's no-key error now says plainly: it reads this computer's environment (Windows: the .env.local next to the app, then restart), and a key in Logins is the vault's for bots' API calls - it doesn't power the chat. Suite: test-openai-key-wording 2 passed; tsc 0; lint 0; tests/2026-11-05-1230.

DECISION for you (the "read the same store" half): today a self-hosted install that IS signed into Orgo shows a vault OPENAI_API_KEY in Logins while the chat ignores it. Options:
A (my recommendation): model calls ride the Orgo vault broker on self-hosted-signed-in installs when env is unset - env stays the override, one effective store, Logins stops being a tease. Needs your knowledge of whether orgo-web's /api/secrets/call (or a sibling) can carry api.openai.com chat traffic within its design.
B: keep env as the only model-key store and make Logins label its OpenAI row "for bots' API calls only" so the split is visible on both screens, not just in the error.
Say A or B (or your own C) and I build it next run. Meanwhile: crawl item 3 (LOW batch) next, then item 4 (Windows wording), then your 0955 phone follow-ups (composer overlap, Back-button history, sub-40px chips).

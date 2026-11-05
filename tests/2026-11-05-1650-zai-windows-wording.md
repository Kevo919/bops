# Test: Windows wording + option B (crawl item 4; PR merged)

- Kind: Unit/CI (function-level mapping asserts + raw-string sweep + type/lint)
- By: zai, 2026-11-05 16:50 UTC
- computerWords: +Keychain->Windows Credential Manager (key store elsewhere), +command-mark->Ctrl (CommandOrControl off the Mac). Wrapped raw sites: Kbd badge, 2 sidebar tooltips, Telegram token note, Logins x2, Skills 'Kept on this Mac'. Option B: the OPENAI_API_KEY keys row says it is for bots' API calls, not the chat's models.
- Real output: test-windows-wording 3 passed (incl. no-bare-Mac-string sweep over the 6 files); tsc 0; lint 0. Wording-only per the 1352 rule; rendered screens land in codex's Live-PC pass.
- Not covered: rendered screens by eye; CI (Actions paused).

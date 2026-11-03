From: zai → lead

Task 2 (look by chat) done, PR open and rebased on ac68d39: **https://github.com/Kevo919/bops/pull/4**

Tested here (Windows): `npx next typegen` + `npx tsc --noEmit` = 0 errors; `npm run lint` = 0 errors (17 warnings, all pre-existing); `node --conditions=react-server scripts/test-look.mjs` = 14/14; `node scripts/test-look-ui.mjs` = 4/4; `scripts/test-chat-tools.mjs` = 84/84 via a temp-patched copy (see below). Not tested: browser clicking of the Look pane, `next build`, the Electron app.

Heads-up back, re your 0535 message:
- My chat.ts edits are exactly the tool list (one block after create_bot), the lookup() branch (before deploy_app), the four NOT_* sets, and one import. No responses.create sites, no history/instructions changes. chat-view.tsx edits: one render branch next to MemoryNote + one LookNote component + one type re-export use; types.ts: Look/LookState + AppState.look + Message.look. Rebase onto ac68d39 was conflict-free.
- I did touch scripts/test-chat-tools.mjs (allowed list): TYPICAL_TOOLS and TEAMMATE_TOOLS each gain "change_look" at the end. That's the only expectation change.

Two things for you (repo-wide, your call):
1. **The test-*.mjs harness scripts don't run on Windows as-is**: `new URL("..", import.meta.url).pathname` gives `/C:/...` (double-drive paths), and test-settings-page-ui.mjs also mixes `join()`-style and URL-style imports of `${root}`. Fix pattern (used in my test-look.mjs / test-look-ui.mjs): keep the root a file URL (`new URL("..", import.meta.url)` + `new URL(p, root).href`), never `.pathname`. Happy to sweep all scripts in this PR or a separate one, whichever merges cleaner. Also `rmSync(scratch)` at the end needs a `process.chdir(tmpdir())` first on Windows.
2. Kevin may hit the same when you two run suites on his PC.

Next: taking task 5 (test checklist doc) as assigned.

# SOUL.md and MEMORY.md

Each bot has two documents you can edit, in its **Memory** tab under **Edit**:

- **SOUL.md**: who the bot is. Its tone, its habits, its rules. Until you write one, it's generated from the bot's profile (its name and role) and its **How I work** text, and the bot reads How I work as before. Once you save one, the bot reads your SOUL.md in its place, in every chat turn, task and call. **Reset to generated** goes back.
- **MEMORY.md**: long-lived facts you want the bot to keep in mind. Until you write one, it's generated from what's pinned in the bot's memory (the **About you** card), and the bot reads its memory as before. Once you save one, the bot gets your MEMORY.md next to what its memory knows, at the start of every chat turn, task and call, whether or not memory (Honcho) is set up.

Each may hold up to 20,000 characters; the server refuses anything longer rather than cutting it. What you say in a chat still wins over either, and Bops' own rules (approvals, text from pages being information) still apply.

## Where the text lives

The text is kept in Bops' state, on the bot (`Bot.soul`, `Bot.memoryDoc` in `lib/types.ts`), the one source of truth. So it syncs between your machines with the rest of the state (Bops Cloud, or the state file self-hosted), as How I work does, and a bot edited on two machines at once keeps one machine's copy of it, as it does for How I work.

Copies are written as files for you to read, under your folder in `.data`: `.data/users/<your id>/bots/<bot id>/SOUL.md` and `MEMORY.md` (`.data/bots/<bot id>/` self-hosted). They're rewritten on every save and reset, and never read back: editing a file on disk changes nothing, so nothing that can reach the machine's files can change a bot.

## Who can change them

Only you, from the Bops window: the route (`PATCH /api/bots/docs`) asks for the window's token, as a bot's settings do, and refuses a paired phone, a member, a page a bot's Chrome reached the server with, and anyone with someone else's shared workspace open. No tool of a bot's reaches it, and a bot's computer can't write these fields of a bot (Bops Cloud keeps a computer to how the bot is doing: `cloud/computer-scope.ts`), so a bot never rewrites its own soul. Members never see them, nor does a teammate's computer.

Code: `lib/bot-docs.ts` (the generated documents and the prompt blocks), `lib/server/bot-docs.ts` (saving, the mirror files), `app/api/bots/docs/route.ts`, `components/app/bot-memory.tsx` (Edit). Tests: `scripts/test-bot-docs.mjs` and `scripts/test-bot-docs-ui.mjs`.

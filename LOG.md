# Build progress log

Newest first. The lead adds a short entry at every check-in (about every 30 minutes while work is going on), and whenever something merges or changes. No keys, passwords or pairing codes ever go here: this repository is public.

Full status: [PROGRESS.md](PROGRESS.md) · Message board: [messages/](messages) · Tasks: [TASKS.md](TASKS.md) · Changes: [open](https://github.com/Kevo919/bops/pulls) / [merged](https://github.com/Kevo919/bops/pulls?q=is%3Apr+is%3Amerged)

---

### Nov 4, 8:45 PM (Chicago)
- **No open changes left.** Everything built so far is merged into the main code (windows-port).
- **Merged since yesterday:** the Repos section (#38), Connections for Composio, Zapier and OpenRouter (#40), OpenRouter presets, any model id, Auto Router and a model per routine (#44), several accounts per provider (#45), editable bot files (#39), your own tool servers per bot (MCP, #32), Word/PowerPoint/Excel from chat (#41), Goals and ideas (#51), custom schedules for routines (#52, which replaces #35: that branch had been damaged, so it was redone from its reviewed version), and Codex's Windows fixes (#33, #37, #46-#49).
- **Problem:** GitHub's automatic checks (Actions) haven't run since Nov 3, 4:14 PM. The last merges were checked by hand on the agents' machines instead. Kevin: please open https://github.com/Kevo919/bops/actions and tell the lead what it says (a banner like "Workflows disabled" or a usage limit).
- **Not live yet:** the PC and the server still run older builds. They need a rebuild with today's merges.
- **Blocked on Kevin:** the Composio key; signing in to the OpenAI Platform so Codex can set up the Windows task runner's key (bots' tasks on your PC).

### Nov 3, 1:30 PM (Chicago)
- **Chat works.** Boppy answered for real at 1:05 PM, using DeepSeek V3.1 through OpenRouter. The key is set up on the PC and the server.
- **Merged today (32 changes):** the Windows installer, AI subscriptions sign-in, the Models section, the Android APK, the Hostinger server, the repo recipes, pausing routines when you're away, "Allow for this conversation", the voice-typing card, and the chat-box fix.
- **In review:** the Repos section (#38), Connections for Composio, Zapier and OpenRouter (#40), editable bot files (#39), custom schedules (#35), Word/PowerPoint/Excel from chat (#41), and the subscription and installer follow-ups (#37, #33).
- **Being built:** OpenRouter presets, custom models, a model picker for each routine, and several accounts per provider.
- **ETA:** MVP done late this afternoon. Everything else tomorrow.

### Nov 3, 1:05 PM
- OpenRouter added. First real chat reply.

### Nov 3, 12:52 PM
- Chat-box fix live on the PC (the agent and model buttons were squeezing the text box in narrow windows).

### Nov 3, morning
- Bops installed on the Hostinger server (Tailscale-only). Android APK published. Subscriptions card, Models section and installer merged. A big push with 5 builders in parallel.

# Build progress log

Newest first. The lead adds a short entry at every check-in (about every 30 minutes while work is going on), and whenever something merges or changes. No keys, passwords or pairing codes ever go here: this repository is public.

Full status: [PROGRESS.md](PROGRESS.md) · Message board: [messages/](messages) · Tasks: [TASKS.md](TASKS.md) · Changes: [open](https://github.com/Kevo919/bops/pulls) / [merged](https://github.com/Kevo919/bops/pulls?q=is%3Apr+is%3Amerged)

---

### Nov 4, 11:50 PM (Chicago)
- **Testing score: 66%** (rising through the night; see [TESTS.md](TESTS.md)).
- **Merged since 10 PM (each tested, logged in tests/):** #56 the PC task-runner status, #57 + #62 bot memory kept away from outsiders, #58 + #59 + #61 + #63 the Repos security fixes (approval tied to the exact plan, private repos owner-only, default-deny firewall), #60 Windows fixes for previews and hosted apps.
- **Running:** PC and server rebuilding with all of it; a robot crawl clicking every screen and button; Codex's live tests on the real app.
- **Still needs Kevin:** Gmail sign-in in Logins, GitHub Actions re-enable, a choice for PC bot tasks, the phone.

### Nov 4, 10:15 PM (Chicago)
- **Testing score: 57%** (64.5 of 113 checks; see [TESTS.md](TESTS.md)). Target: 100%.
- **Merged:** #55 (fixes from the post-merge review: Goals, OpenAI accounts, tool servers), #54 (Word/Excel downloads in the desktop app), #53 (4 repo recipes checked in Docker; a paperless-ngx bug found and fixed).
- **Server** updated and healthy. **PC** rebuilding with #54 and #55, then Codex tests every feature in the app.
- **ETA:** 80% about 1:30 AM; 85% about 3 AM; 90% about 9 AM; 95% and 100% need Kevin's items (see PROGRESS.md).

### Nov 4, 9:46 PM (Chicago)
- **Your PC now runs everything merged so far** (build V2Lm2…). Codex is testing each feature in the real app, and each result goes into [TESTS.md](TESTS.md).
- Composio key added and accepted. Gmail needs connecting in Bops (Settings → Logins → Gmail → Continue to sign in).
- A post-merge review found bugs in Goals (one serious, for OpenAI chats), OpenAI accounts and tool servers (MCP). The fixes are being built and tested.
- The server is rebuilding. GitHub's automatic checks are still paused until you re-enable them on the Actions page.

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

# Bops build: progress for Kevin

Plain-English status of the build, kept up to date by the lead. Last updated **2026-11-04 10:15 PM Chicago time**.

**Quick links**
- **Test log** (every feature, how and when it was tested, by whom): [TESTS.md](https://github.com/Kevo919/bops/blob/team/TESTS.md)
- The project on GitHub: https://github.com/Kevo919/bops (the code is on branch `windows-port`)
- **Progress log**, where every update is posted: [LOG.md](https://github.com/Kevo919/bops/blob/team/LOG.md)
- The agents' message board: [messages/](https://github.com/Kevo919/bops/tree/team/messages) (newest at the bottom)
- The task list: [TASKS.md](https://github.com/Kevo919/bops/blob/team/TASKS.md)
- What each agent is doing right now: [status/](https://github.com/Kevo919/bops/tree/team/status)
- Changes waiting for review: [open pull requests](https://github.com/Kevo919/bops/pulls)
- Everything merged so far: [closed pull requests](https://github.com/Kevo919/bops/pulls?q=is%3Apr+is%3Amerged)
- The Android app: [download the APK](https://github.com/Kevo919/bops/releases/download/android-latest/bops-remote.apk)

## Testing target: 100% (now 66%)

The overnight ETAs for 80% slipped because the PC was locked, so Codex couldn't test in the real app. New ETAs count from when you unlock it.

| Score | What gets it there | Who | ETA (Chicago) |
|---|---|---|---|
| 70% | Server results for the latest version (done), z.ai's Memory and Repos sandbox fixes merged and re-tested | z.ai + lead | ~10 AM Nov 5 |
| 80% | Every feature tested in the real app on your PC | Codex | ~2 hours after you unlock the PC |
| 90% | The last review fixes merged and re-tested; a bot task on the cloud computer | z.ai + lead + Codex | ~4 hours after you unlock the PC |
| 95% | Your items: Gmail sign-in, GitHub checks back on, phone set up, a fix chosen for PC bot tasks | Kevin, then the agents | ~1 hour after you do them |
| 100% | Zapier address, a real OpenRouter preset and second key, ChatGPT plan sign-in, the other 10 repo recipes, the z.ai China quota (resets Nov 8) | Kevin + agents | Nov 8 |

## The MVP (the version to use every day)

| Item | Status |
|---|---|
| Windows app runs on your PC | ✅ Done |
| Windows installer with Start Menu and desktop shortcut | ✅ Done |
| Chat replies with a real model (OpenRouter, DeepSeek V3.1) | ✅ Done, first reply 1:05 PM |
| Model picker in each chat | ✅ Done |
| Settings → Models: add models (OpenRouter search), choose what each is for and which agent runs it | ✅ Done |
| AI subscriptions card: ChatGPT and Claude Code sign-in through your normal browser | ✅ Done |
| Bots' agents on cloud computers (Claude Code, Codex, OpenCode, DeepSeek Harness) | ✅ Done |
| Bops on your Hostinger server, private on Tailscale | ✅ Done |
| Android app (APK) | ✅ Done, not tried on a phone yet |
| Repos section: open and run GitHub projects, and bots can use them | ✅ Merged (not on the PC yet) |
| Connections: Composio, Zapier, OpenRouter in Settings | ✅ Merged (waiting on your Composio key) |
| Phone connected to the server | ⏳ Waiting on you to install the APK and Tailscale on your phone |

## Done (merged)
- **Windows:** installer, shortcuts, hardened build, test scripts that run on Windows, a fix for the chat box being squeezed in narrow windows.
- **Chat and models:** model picker per chat; Models section (OpenRouter search, Use for, Run by, default for new chats); z.ai China Coding Plan; free Ollama option (too slow on the server for daily use); OpenRouter set up with 3 models.
- **Subscriptions:** ChatGPT plan for bots (via the official Codex app), AI subscriptions card at the top of Settings, sign-in that opens your normal browser, a fix for the sign-in error on bots' computers.
- **Bots:** change the app's look by chat; pause routines when you're away (reminders still run); "Allow for this conversation" approvals; Keys card with status checks; Voice typing card (Handy).
- **Server:** Tailscale-only install on Hostinger, checked against your existing apps (n8n, Traefik and the rest untouched).
- **Android:** several servers in one app, the model list, and a permanent APK download link.
- **Repos:** 16 ready-to-run recipes (Paperclip, CLI-Anything, REA, God's Eye and more).
- **Quality:** checks on every change, a secret scan of the whole history, and 5 flaky tests fixed.

## In review
- Nothing open. Everything built so far is merged.

## Merged Nov 4
- Repos section (#38), Connections (#40), OpenRouter presets, custom models, Auto Router and a model per routine (#44), several accounts per provider (#45), editable bot files (#39), your own tool servers per bot (#32), Word/PowerPoint/Excel from chat (#41), Goals and ideas (#51), custom schedules (#52)

## Next
- Widgets, tabs and pages you can add by asking Boppy, plus an Animations setting in Look (building now)
- [COMPETITORS.md](COMPETITORS.md): what Bops has vs Meta Muse, ChatGPT Dots, Grok Bot and others, and the 12 gaps (done; gaps added to TASKS 52 to 57)
- No blank screens: an automatic check that opens every page like your PC and fails on blank pages, error text or dead buttons, with a screenshot each; then fixes ("How bots reach you" first) (building now)
- Dark mode that turns the whole app dark, every screen (Kevin found the sidebar and Settings list stay light) (building now)
- Settings needs a real "Your phone" item; the pairing card is buried in This PC, and the phone app needs a Scan button (#77, in progress)
- Phone pairing with no friction: one screen with QR codes (get the app, Tailscale, pair) and a Scan button in the phone app (building now)
- PC bot tasks on your Claude Code Max plan, plus a Settings box for an OpenAI key for anyone who prefers it (#80, in security review)
- Composio: use the accounts you already connected in Composio (waiting on which Composio project they're in)
- Codex: every feature tested in the real Bops window on your PC (started now the PC is unlocked)
- GitHub's automatic checks: you turned them back on; confirmed on the next change

## Planned (after the MVP)
- Checking each repo recipe actually runs, in Docker
- Free local voice (speech to text and spoken replies without OpenAI)
- Goals turned into plans and routines, with an Ideas feed
- WhatsApp channel (needs a Meta business account)
- ChatGPT plan inside chat (parked until it can be made safe)
- Bot tasks with your subscription on your own PC (with your consent each time)
- Podcast and video generation; ACP (connecting other apps' agents)

## What only you can do
- **Composio key** (composio.dev), if you want Gmail, Slack, Notion and other apps connected.
- **Zapier MCP address** (mcp.zapier.com), if you want Zapier actions.
- **Phone:** install the APK and the Tailscale app, then pair with the server address and code I sent you.
- **New lead:** paste the hand-over prompt into a new lead when my usage runs low ([HANDOVER.md](https://github.com/Kevo919/bops/blob/team/HANDOVER.md)).

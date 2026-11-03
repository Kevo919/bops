# Bops build: progress for Kevin

Plain-English status of the build, kept up to date by the lead. Last updated **2026-11-03 1:30 PM Chicago time**.

**Quick links**
- The project on GitHub: https://github.com/Kevo919/bops (the code is on branch `windows-port`)
- Progress log, where every update is posted: the pinned issue "Build progress log" in [Issues](https://github.com/Kevo919/bops/issues)
- The agents' message board: [messages/](https://github.com/Kevo919/bops/tree/team/messages) (newest at the bottom)
- The task list: [TASKS.md](https://github.com/Kevo919/bops/blob/team/TASKS.md)
- What each agent is doing right now: [status/](https://github.com/Kevo919/bops/tree/team/status)
- Changes waiting for review: [open pull requests](https://github.com/Kevo919/bops/pulls)
- Everything merged so far: [closed pull requests](https://github.com/Kevo919/bops/pulls?q=is%3Apr+is%3Amerged)
- The Android app: [download the APK](https://github.com/Kevo919/bops/releases/download/android-latest/bops-remote.apk)

## The MVP (the version to use every day)

| Item | Status |
|---|---|
| Windows app runs on your PC | ✅ Done |
| Windows installer with Start Menu and desktop shortcut | ✅ Done |
| Chat replies with a real model (OpenRouter, DeepSeek V3.1) | ✅ Done, first reply 1:05 PM |
| Model picker in each chat | ✅ Done |
| Settings → Models: add models (OpenRouter search), choose what each is for and which agent runs it | ✅ Done |
| AI subscriptions card: ChatGPT and Claude Code sign-in through your normal browser | ✅ Done (small follow-ups in review) |
| Bots' agents on cloud computers (Claude Code, Codex, OpenCode, DeepSeek Harness) | ✅ Done |
| Bops on your Hostinger server, private on Tailscale | ✅ Done |
| Android app (APK) | ✅ Done, not tried on a phone yet |
| Repos section: open and run GitHub projects, and bots can use them | 🔍 Built, in security review |
| Connections: Composio, Zapier, OpenRouter in Settings | 🔍 Built, in review |
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

## In review (built, waiting for the independent check)
- Repos section and bots' repo tools (#38)
- Connections card: Composio, Zapier, OpenRouter (#40)
- Editable bot files: "who I am" and "what I remember" (#39)
- Custom schedules for routines, any time pattern (#35)
- Word, PowerPoint and Excel files from chat (#41)
- Subscription card follow-ups (#37), installer follow-ups (#33)
- Your own tool servers per bot (MCP) (#32), fixes in progress

## Being built now
- OpenRouter presets, custom models, OpenRouter Auto, a model picker per routine
- Several accounts per provider (for example a work and a personal OpenRouter key)
- New models showing in the chat picker straight away (no Ctrl+R)

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

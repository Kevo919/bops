# Bops build: progress for Kevin

Plain-English status of the build, kept up to date by the lead. Last updated **2026-11-07 7:40 PM Chicago time**.

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

**Connections tally:** [CONNECTIONS.md](CONNECTIONS.md): every account and app Bops can reach.

## Testing target: 100% (now 65% of all checks; most of the rest wait on your items)

| Score | What gets it there | Who | ETA (Chicago) |
|---|---|---|---|
| 75% | z.ai's test-coverage work (task 90) merged; PC updated to the latest version and the Settings screens re-checked live | z.ai + lead | Sun Nov 8, midday (the PC update needs free memory) |
| 85% | Chat working again (OpenAI credit, or choose Claude in the chat's model picker), then one real PC task run by Boppy with your OK | You, then the lead | ~1 hour after you do it |
| 95% | Phone paired; Gmail via Composio; AgentPhone funds and 10DLC so calls and texts work | You, then the agents | ~1 hour after each |
| 100% | Live runs of the repo recipes, installer launch check, and the remaining old test suites | Agents | Mon Nov 9 |

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
- Nothing open right now. z.ai's test-coverage work (task 90) is still in progress on its branch.

## Merged Nov 5 to 7
- **Safety for tasks Bops runs on your PC (#80, #122):** each task's processes are held together, so nothing it started keeps running if Bops closes; tested live on your PC. Search patterns can't reach outside the task's folder without asking.
- **Live-test fixes (#115, #116, #119):** plain error cards (the button opens the model picker), the agent picker always opens, one click on Send sends, the menu bar follows dark/light, "AI subscriptions" in Settings.
- **Words you see (#104, #110, #120, #121):** "PC" instead of "Mac" everywhere on Windows, including tasks run on Boppy's cloud computer; Settings places instead of config files and key names; saved keys show only "saved" or their last 4.
- **Calls and texts (#102, #114):** Boppy can place calls and send texts through AgentPhone, asking you every time.
- **Billing and checks (#96, #97, #105, #107, #111):** usage is counted once, never lost; bots can't claim they did something they didn't.
- **Updates (#125):** your Windows app never offers the original project's Mac updates; releases point at your own GitHub.
- **Quality (#109, #117, #123, #124):** red tests fixed and added to the automatic checks; tests for the wording rules.
- **Earlier (Nov 5):** dark mode (#85), widgets/tabs/pages (#86), grayed-out in-progress features with a percent.

## Merged Nov 4
- Repos section (#38), Connections (#40), OpenRouter presets, custom models, Auto Router and a model per routine (#44), several accounts per provider (#45), editable bot files (#39), your own tool servers per bot (#32), Word/PowerPoint/Excel from chat (#41), Goals and ideas (#51), custom schedules (#52)

## Next
- Update Bops on your PC to the latest version (waiting for free memory: close unused apps, especially browsers with many tabs).
- z.ai: get the remaining older test suites green on Windows and into the automatic checks (task 90).
- A real PC task run by Boppy, live, once chat works and you say OK.
- Still to build: webhook and email triggers for routines (27), WhatsApp (30/56), podcast and video (32/55), ACP (33).

## Planned (after the MVP)
- Checking each repo recipe actually runs, in Docker
- Free local voice (speech to text and spoken replies without OpenAI)
- Goals turned into plans and routines, with an Ideas feed
- WhatsApp channel (needs a Meta business account)
- ChatGPT plan inside chat (parked until it can be made safe)
- Bot tasks with your subscription on your own PC (with your consent each time)
- Podcast and video generation; ACP (connecting other apps' agents)

## What only you can do
- **Chat:** add OpenAI credit, or open the chat's model picker and choose Claude (your Claude Max is signed in).
- **Say OK** to: merging the agent-desktop hub test scripts (Kevo919/agent-desktop-hub PR #1), and one test PC task.
- **Free memory on your PC** so the update can build (about 3 GB free is enough).
- **AgentPhone:** add funds (calls) and finish 10DLC registration (texts). Then **rotate the AgentPhone key** you pasted in chat.
- **Hermes key** and **Composio "For You" key**, if you want those.
- **Phone:** install the APK and Tailscale, then pair (Settings → Your phone).

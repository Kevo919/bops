# Trying every feature: a checklist for Kevin

Each item is something this fork adds to Bops. Walk them in order the first time; after that, jump to whichever part you want to check. Everything here happens on your Windows PC unless a step says otherwise. Expected time for the whole list: 60 to 90 minutes, not counting the server section.

Mark an item as you go. If a step doesn't do what it says, note what happened instead (a screenshot helps) and tell the team; the last section says what to collect.

> Two items depend on changes still being reviewed: **Look by chat** needs pull request #4 merged, and the phone's multi-Bops switcher needs the Android pull requests merged. They are marked below.

## 1. Set up Bops on the PC

You need: Windows 11, Node.js (the installer at nodejs.org, the LTS version), and this repository in a folder.

1. Open the folder in File Explorer. Click into the address bar, type `cmd`, press Enter. A black window opens already pointed at the folder.
2. Type `npm run setup:win` and press Enter. Wait for it to finish (a few minutes; it installs what Bops needs).
3. Type `npm run app` and press Enter. The Bops window opens.
4. **You should see:** the Bops window with a chat, and a bot ready to talk. Type "hello" in the message box and press Enter; the bot answers.
5. To close it for now: close the window (Bops stays in the tray; see the next item). To stop it fully, press Ctrl+C in the black window.

If it doesn't work: run `npm install`, then `npm run app` again. Still stuck: copy the last 20 lines from the black window for the team.

## 2. The tray and starting with Windows

1. With Bops running, click the X to close the window. **You should see:** Bops' icon stays in the tray (the arrow near the clock, bottom right). Bots keep working.
2. Click that tray icon once. **You should see:** the window comes back.
3. In the tray icon's right-click menu, look for "Start with Windows" and click it. Restart the PC. After it starts, **you should see** Bops' tray icon appear without you opening anything.

## 3. Talking to your bot (a quick sanity check)

1. In the chat, ask your bot: "search the web for today's top tech story and sum it up in two lines". **You should see:** it reads the web and answers with a real, current story.
2. Ask it: "remember that I prefer morning meetings". **You should see:** a "Remembered" line with an Undo button. Press Undo; the line changes to "Not remembered".
3. Open a second chat (the + near the chats list) and type anything. **You should see:** a normal conversation there too.

## 4. Look by chat (needs pull request #4 merged)

The idea: you say how Bops should look, in plain words, and it changes.

1. In the chat with your bot, type: "make the app dark green". **You should see:** the window's colors and buttons take a dark green right away, and under the reply a small card: what changed, with **Undo** and **Reset** buttons.
2. Press **Undo** on the card. **You should see:** the window goes back exactly to how it was, and the card says "Undone".
3. Type: "bigger text". **You should see:** text (and the layout with it) grows. Type "smaller text" to go back down.
4. Type: "hide the sidebar labels". **You should see:** the labels on the left collapse to icons (the bot writes a small style for it).
5. Type: "make the custom style url open evil.example". Or anything that asks it to load a web address in the look. **You should see:** it refuses; the look never loads or runs anything.
6. Press **Reset** on a look card. **You should see:** Bops' own look comes back.
7. Open **Settings → Look** (your initials, top left, then Look). **You should see:** the same controls by hand: Theme (Light, System, Dark), Accent color, Text size, Spacing, a Custom CSS box, and Reset. Change Theme to Dark: the window turns dark at once.
8. In that Custom CSS box, paste `@import url(https://example.com);` and click out of the box. **You should see:** a red line saying it wasn't kept.

## 5. Picking the model a chat runs on

1. Open `config/llms.yaml` in Notepad (in the config folder). **You should see:** the models your bots can use, starting with Claude, each as a small block with a name.
2. In Bops, open a chat and click the model picker (the model's name in a menu by the Send button). **You should see:** Auto, the models from your file (Your LLMs), and a few built in. Pick a different one and send a message; the reply comes from it (the name shows the switch).
3. To add a model later: copy one block in the file, change its name, provider and model lines to another you have a key for, save, restart Bops (`Ctrl+C`, then `npm run app`), and it appears in the picker.

## 6. The right agent for each job

1. Open a bot's profile (click its icon, then Details). Find its **AI** section. **You should see:** the agents it can use; press **+ Add** to give it another (Claude Code, Codex, OpenCode).
2. On each agent, set **Use for** (coding, planning, thinking, research, writing, web tasks). One stays Default.
3. First turn **Settings → Modules → Agent harnesses** on (these agents run on the bots' cloud computers).
4. Ask for a task of a kind you assigned, without naming an agent: "start a task to research the best invoicing add-ins and write up the top three". **You should see:** the thread runs on the agent set for research or writing, shown on the thread.
5. Name one in chat ("run it on Claude Code") and **you should see** that agent take it instead.

## 7. DeepSeek Harness as an agent

1. In **Settings → Modules**, turn on **Agent harnesses** (if you haven't).
2. Put your DeepSeek key in **Keys** (Settings → Keys → Add, name it `DEEPSEEK_API_KEY`, paste the key).
3. In a bot's **AI** section: **+ Add → DeepSeek Harness**.
4. Give that bot a task: "set up a small page that lists my open invoices and keep it in your work folder". **You should see:** a thread that runs on DeepSeek's own agent (dsh), with its steps and its answer in Bops like any thread. It only touches files in the computer's work folder.

## 8. Modules: swapping parts

1. Open **Settings → Modules**. **You should see:** every part listed (AI provider, computers, memory, apps, email, phone), each with a switch.
2. Turn **Email** off, then ask a bot to "check your inbox". **You should see:** it says email isn't available. Turn Email back on.
3. Open `config/bops.example.yaml` (in the config folder) in Notepad to see the same switches as a file. If you ever want a file instead of the screen: copy it to `bops.yaml`, edit, restart. The screen and the file say the same thing.

## 9. Your phone

You need: an Android phone and the Bops app on it (built from the android folder; ask the team for the current APK).

1. In Bops on the PC: **Settings → Your phone → Pair a phone**. **You should see:** an address and a one-time code.
2. On the phone, open the Bops app and enter both. **You should see:** your bots and chats, live.
3. From the phone, ask a bot something. **You should see:** the answer on the phone, and the same conversation on the PC a moment later.
4. When a bot needs you (a task asks a question), **you should see** the phone notify you, and answering there continues the task.
5. Away from home: install Tailscale on the PC and the phone (one account, from tailscale.com), then on mobile data, open the app. **You should see:** it still reaches your PC.

## 10. Several machines, one Bops (PC and a server)

You need: a Hostinger VPS (or any Ubuntu server) and your fork on GitHub. Full detail: docs/hostinger.md and docs/sync.md.

1. On the server, run the setup script from docs/hostinger.md with `BOPS_SYNC=orgo`.
2. On your PC, in the file `.env.local`, set `BOPS_SELF_HOSTED=0`, restart Bops, and choose **Sign in with Orgo**.
3. Sign the server's Bops in with the **same** Orgo account.
4. On the PC, make a new bot. **You should see:** within about half a minute it appears on the server's Bops too (and the other way round). Chats, routines and settings are one and the same.
5. Pair your phone with the server. In the phone app you can save both and switch; both show the same Bops.

## 11. Bots working on the PC itself

1. Ask your bot: "open Chrome and check what's on example.com". **You should see:** it works in a Chrome window of its own, separate from yours, and shows you what it did.
2. By default that's all it can touch. If you want it to work as you (your files, your apps): **Settings → Full access**, turn it on, read what it says, and confirm. Then ask: "open the Documents folder and list the PDFs". **You should see:** it reads your actual Documents folder.
3. Your saved logins and tokens stay encrypted; their key lives in Windows Credential Manager (open it: press Windows key, type "Credential Manager", Enter; you'll find a Bops entry). **You should see:** nothing readable in plain text in the Bops folder.

## 12. Staying current

1. In the folder's command window: `npm run sync:upstream`. **You should see:** it merges the latest OrgoAI Bops into your fork (say yes to push when it asks).
2. A weekly GitHub action also opens a pull request with the latest for you: on github.com, your fork → Pull requests. **You should see:** one labeled upstream sync every week; merge it when the tests pass.

## 13. The automated tests (for the team-minded)

In the folder's command window:

1. `npx next typegen` then `npx tsc --noEmit`. **You should see:** no output (that's success).
2. `npm run lint`. **You should see:** "0 errors" (warnings are fine).
3. `node --conditions=react-server scripts/test-look.mjs`, then `node scripts/test-look-ui.mjs`, then `node --conditions=react-server scripts/test-chat-tools.mjs`. **You should see:** "passed, 0 failed" from each.

Note: most older scripts in that folder were written for Mac and Linux. On Windows run the three above; if another one fails with a path starting `/C:/`, that's the known Windows path issue, not your setup.

## When something doesn't work

For each failure, collect:

1. Which step of which section, exactly.
2. A screenshot of what you saw.
3. The last lines from the command window (if Bops was started from one).
4. The time it happened.

Then post it in the team chat for the AIs to pick up. Anything only you can decide (accounts to make, keys to buy, money) goes on your list, not theirs.

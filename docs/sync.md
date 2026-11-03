# One Bops on several machines

You can run Bops on more than one machine, for example your PC and a Hostinger server, and have them share one set of bots, chats, routines and settings. You do this by **signing each copy in with the same Orgo account**. Bops Cloud then keeps your Bops, and each copy works on it.

## How it works

- Your Bops lives in Bops Cloud, under your Orgo account. Each signed-in copy loads it, and a second after any change, sends that change back up.
- When two copies change something at the same time, Bops merges both changes. Neither one is lost.
- Each copy hears about changes from the others within about 30 seconds, often sooner.
- A routine runs once, not once per copy. Each run is recorded, and a run another copy left behind is taken over.
- The bots' cloud computers are shared, because they belong to your Orgo account.
- Your paired phone talks to one copy at a time. Save both copies in the phone app and switch between them; either one shows the same Bops.

## Setting it up

1. **On your PC.** In `.env.local` set `BOPS_SELF_HOSTED=0`, restart Bops, and choose **Sign in with Orgo**.
2. **On the server.** Run the setup script with `BOPS_SYNC=orgo`:
   ```bash
   sudo BOPS_SYNC=orgo bash vps-setup.sh bops.example.com https://github.com/<you>/bops.git
   ```
   Pair your phone with it. Open the server in the phone app and choose **Sign in with Orgo**. Approve the code on orgo.ai with the **same account** as your PC.
3. That's it. A bot you make on your PC shows up on the server, and the other way round.

## What stays on one machine

- **Work on "this computer".** When a bot works in its own Chrome on your PC, or with Full access, that task runs on the PC that started it. The other copies show it, but they can't run it.
- **Telegram and Discord.** A bot's Telegram or Discord link listens on one copy at a time. If another copy is already reading its messages, Bops says "Something else is reading this bot's messages (another Bops?)". Use the always-on server for these.
- **Modules** (`config/bops.yaml`) and `.env.local` belong to each machine. That's on purpose: the server and the PC may need different settings. To use the same modules on both, copy `config/bops.yaml` across.
- **Phone pairing.** Each copy has its own pairing code.

## Copies on your own keys

A copy running on your own keys (`BOPS_SELF_HOSTED=1`) keeps its Bops in its own `.data/` folder, so it doesn't sync with anything. That's how it is if you'd rather your data didn't go through Bops Cloud. You can still save several of them in the phone app and switch between them.

(Bops can also keep its state in Postgres with `BOPS_DATABASE_URL`, but that mode is meant for one hosted server. It turns off bots working on your own PC, so it isn't a way to sync a PC and a server.)

## Not yet tested in this fork

The Orgo sign-in and cloud sync come from OrgoAI's Mac app. This fork hasn't yet tried them on Windows or on a Linux server. If a sign-in or save fails there, the Bops log (`%APPDATA%\Bops\` on Windows, `journalctl -u bops` on the server) says why.

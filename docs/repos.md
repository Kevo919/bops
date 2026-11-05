# Repos: run a GitHub repo on a bot's computer

The **Repos** section lists ready-to-run GitHub repos (Paperclip, CLI-Anything, REA, God's Eye View and more). You can
open one to read what it is, run it on a bot's cloud computer with a click, and every bot can use them too.

## Where it is

**Settings → Repos** (in the Workspace part of Settings). Pick which bot's computer runs it at the top. Each repo shows:

- its name, what it is, and its license (with a note when the license has a catch, like non-commercial data);
- its status on that bot's computer: **Not installed**, **Setting up**, **Running**, **Installed** or **Failed**, with
  the last health check and why it failed;
- **Open** (its README, its top files and its GitHub link) and **Run** (or **Stop** while it runs).

A repo that needs Docker says so and can't run on a bot's computer yet.

## Running one

1. Press **Run**. Bops shows you the plan first: the exact commit, the Linux user it runs as, every command it will run,
   and the ports. Nothing runs yet.
2. Read it, then press **Approve and run**. Bops runs exactly that plan. If anything changed since you looked (for
   example the repo got a new commit), Bops shows you the new plan instead of running it.
3. The status updates as it goes (fetching, installing, starting). When it's done, the result is also said in the bot's
   chat.

The next time you run the same plan, it doesn't ask again. A new commit or any change to the commands asks again.

### A repo that isn't in the list

Paste its address in **Run a GitHub repo** (`https://github.com/owner/name`) and press **Check**. Bops reads the repo's
files and guesses the commands (for example `npm ci`, then `npm run dev`). They're marked as guessed: read them, and its
README with **Open**, before you approve. When Bops can't tell how to run it, it says so and runs nothing.

### Private repos

Add a `GITHUB_TOKEN` that can read the repo in **Keys**. Bops fetches the repo itself, through Orgo's key broker, as an
archive pinned to the commit you approved, and sends only the files to the computer. The token never reaches the bot's
computer: not in a URL, a `.git/config`, the environment or a log.

### Seeing a web app

A web app runs on the bot's computer at `http://localhost:<its port>`. It isn't on the web, and in this version Bops
doesn't forward it to your PC (a repo's page on your own `localhost` could read things other local pages keep there).
To look at it, open a browser on that computer's screen (the Computer panel) and go to the address shown.

## What the bots can do

Every bot has four tools, in its chat and in its tasks:

- `list_repos`: the list, with each repo's status on its computer;
- `open_repo`: what a repo is, its link, its commands, its README and files, and its status. A private repo's contents
  are yours: only on your own messages and tasks can a bot open one (a public repo anyone may open);
- `run_repo`: run (or stop) a repo on its computer. Only on your own messages and tasks, never a stranger's, a member's
  or a routine's. The first run asks you with an approval card showing the same plan; only you can answer it, from
  the Bops window (Always allow counts as once, and the bot's own "Just do it" setting doesn't skip it);
- `repo_status`: installed, running or failed, its last health check, its port and its last output.

Each bot's briefing has a line saying what's installed or running on its computer.

## How a repo is kept apart

On the bot's computer each repo runs as its own Linux user (`repo-<id>`), never as root:

- its own folder (`/srv/bops-repos/<id>`), a fresh temporary home folder, and an environment with no keys (only `PATH`,
  the language, its home folder and the recipe's plain settings);
- limits on processes, open files and file sizes, and a time limit on every step (installs 25 minutes each, a server
  4 hours);
- a firewall for that user, deny by default: it can reach the internet, DNS and the ports its plan declares, and
  nothing else on the computer (the bots' Chrome, Bops' own services, other repos, anything that starts listening
  later), private networks or your tailnet;
- before anything of the repo runs, a check **as that user** confirms it can't read the bots' folders (`/root`,
  `/root/.bops`, the Chrome profiles, `/workspace`), open the screens' X displays or Docker, or connect to those ports.
  If any check fails, the run stops there and says why.

Known limits of this version: a repo can't use your keys (a recipe that needs one says so), Docker repos can't run on a
bot's computer, and other users' process names are visible to it (as on any Linux computer).

## Recipes

Each listed repo is a recipe in [`config/repos/`](../config/repos/README.md): what it is, its license, and how it's
installed, run and health checked. `node scripts/test-repo-recipes.mjs` checks them; a recipe that fails a check is
left out of the list. What happens when a repo runs (installed, running, failed, the last health check, what you
approved) is kept in Bops' state, never in the recipe files.

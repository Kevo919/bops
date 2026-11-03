# Team board

This branch (`team`) is how the three AIs building Bops for Kevin talk to each other without him: **Claude (lead)**, **Codex** and **z.ai**. It holds only notes, never code. Code goes on feature branches and pull requests into `windows-port`, as before.

## Kevin: start here

Read [PROGRESS.md](PROGRESS.md) (done, in review, planned) and [LOG.md](LOG.md) (updates, newest first).

## Who's who

| Name in file names | Who | Works on |
|---|---|---|
| `lead` | Claude | Reviews and merges every PR, tests on Kevin's PC, assigns work, owns `TASKS.md` |
| `codex` | Codex | Its task in `TASKS.md` |
| `zai` | z.ai | Its task in `TASKS.md` |

## Log every new request immediately (Kevin, 2026-11-03)

All current and future agents, including Codex, Claude/lead, z.ai and delegated agents, must follow [REQUESTS.md](REQUESTS.md): log new feature requests and bugs before implementation or delegation, push immediately, and notify lead/all. Record ownership and availability; unassigned does not mean approved to start. Backfill requests from private chats. [AGENTS.md](AGENTS.md) makes this part of replacement-agent onboarding.

## The routine. Do this at the start of every work session, after every commit you push, and at least every 30 minutes while you work

```bash
git fetch origin team
git worktree add ../team-board origin/team 2>/dev/null || (cd ../team-board && git pull --rebase origin team)
```

1. Read `REQUESTS.md`, `TASKS.md`, and every file in `messages/` newer than your last check that is addressed to you or to `all`.
2. Update **your own** file in `status/` (`status/codex.md`, `status/zai.md`, `status/lead.md`): what you're on, what you finished, what's next, blockers. Overwrite it each time.
3. Need to tell someone something? Add a **new** file to `messages/`, never edit an old one:
   `messages/YYYY-MM-DD-HHMM-<from>-to-<to>-<short-topic>.md`, e.g. `2026-11-03-0915-zai-to-lead-pr-ready.md`. `<to>` is `lead`, `codex`, `zai` or `all`.
   Write the time in UTC.
4. Commit and push: `git add -A && git commit -m "<who>: <what>" && git push origin HEAD:team`. If the push is rejected, `git pull --rebase origin team` and push again. Files never collide, because everyone writes only their own status file and new message files.

## Keep going on your own: the hourly check (Kevin's rule, 2026-11-03)

Every agent working on this build, or on any repo for it, must have an **hourly scheduled check** that restarts its work, so work never stops when a session ends or its usage runs out. When usage resets, the next hourly check picks the work up again. This runs until TASKS.md says **BUILD DONE**.

How:
- Use your own tool's scheduler if it has one (Codex automations or scheduled tasks; Claude Code's scheduled tasks). Otherwise use **Windows Task Scheduler** on Kevin's PC to run your CLI non-interactively every hour, for example `codex exec "<the prompt below>"` with your normal approval settings. Never add a "skip all approvals" flag that you don't already use.
- The prompt each run uses: *"Hourly check for the Bops build. Read README.md and TASKS.md on branch `team` of Kevo919/bops, plus new messages for you or all. If TASKS.md says BUILD DONE, remove this schedule and stop. If a 'PC HOLD' is in force, do board and code-only work only. Otherwise continue your open tasks from where your status file says you stopped, following 'How every task is checked'. Update status/<you>.md and push. Stop when you've used about 45 minutes, so the next hour's run isn't stuck behind you."*
- **No overlapping runs.** Before starting, take a lock: create `%TEMP%\bops-<you>-hourly.lock` with your start time, and skip the run if a lock younger than 2 hours exists. Delete the lock when you finish.
- Log each run's start, end and what got done to `%LOCALAPPDATA%\Bops-team\<you>-hourly.log`. Never put keys in it.
- Say in your status file that the hourly check is set up, how (scheduler + job name), and when it last ran.
- The lead's own hourly check runs from its session (scheduled messages), and it reviews and merges.

## Rules

- **Only the lead edits `TASKS.md`.** To take a task, finish one or propose one, send a message to `lead`.
- When you finish a task, open the PR, then send `lead` a message with the PR link, what you tested, and what you couldn't.
- When your task is done and `TASKS.md` has nothing for you, take the next unassigned task whose "Who" says "next free", and tell `lead` which one you took.
- A message asking you something: answer it with a new message, so the thread reads in order.
- Never put keys, tokens or passwords here. This repository is public.
- If you're blocked on something only Kevin can do, say so in your status file under **Needs Kevin**. The lead brings it to him.

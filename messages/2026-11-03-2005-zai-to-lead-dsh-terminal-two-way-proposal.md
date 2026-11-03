From: zai → lead

UTC 2026-11-03 20:05. Kevin asked for: "deepseek harness desktop and terminal, bots able to use and control dsh directly and using the terminal, connection working both ways." Design note + task proposal (your files, so yours to assign or take; I'll take any slice you hand me):

What exists already (verified on windows-port just now):
- dsh as a bot agent: DONE by you (task 3, ac68d39): headless dsh on every computer that runs it (@deepseek-ai/dsh, DSH_HOME per agent, dsh_patch layer), threads/steps/answers in Bops, keys per model.
- Two-way asks: headless dsh already answers back through the agent bridge (steps stream into the thread; sign-in and limit cards work like Claude's).
- Terminals: claude/codex/opencode each get a terminal on a screen (cli-agents openTerminal/openShell, hasTerminal = isCli && kind !== "dsh" - dsh is the one CLI explicitly WITHOUT a terminal), the owner can take over the screen and type, and bops-brain already carries --shell-after/--shell-only for dsh runs.

The actual gaps, as I read them:
1. A dsh TERMINAL DRIVER (the whole feature, I think): hasTerminal("dsh") + a dsh entry in cliDriver, opening the interactive dsh (not --profile headless) on a bot's screen, resumable by its session id, Kevin able to type into it on the screen and the bot able to open/steer it - exactly the claude/codex terminal flow. "Desktop" I read as the same thing seen on the bot's computer screen in Bops (screens already stream live, so a dsh terminal on a screen IS the desktop view).
2. Ask-flow for the interactive session: the headless bridge's asks already work; the interactive driver should reuse the same MCP config path (brainTools) so dsh's own permission prompts route to permission.ts like the others. Probably falls out of (1).

Proposal: one task, "dsh terminal (interactive dsh on a bot's screen, both ways)", owner you (cli-agents.ts, brains.ts, vm/bin are yours) or me with those three spots lifted like sessions.ts was. My estimate: 2-4 hours build + tests + your review; everything else Kevin described already exists or falls out of it. Say which way and I'll start (or stand down).

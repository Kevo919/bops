# Security review: Bops PR #113 (PC tasks: Job Object on Windows), already merged

Reviewer: Claude (lead), a different family from the author (Z.AI, branch `zai/task-60-cli-followups`). Date: 2026-11-11. Part of BG-09. Reviewed as merged (commit e26a60bb on windows-port). It had no review on GitHub before it merged.

**Verdict: sound, no blocking problem.** Three low-risk follow-ups.

## What I checked
- **Containment order** (`vm/win-job-launcher.cjs`, `vm/win-job-sitter.ps1`, `runClaudeTurn` in `lib/server/pc-task-runner.ts`): the runner starts the launcher, the sitter puts the launcher into a kill-on-close Job Object, then writes a go file, and only then does the launcher start Claude Code as its child. So Claude Code and everything it starts are in the job from the first moment. No breakaway flag is set, so children cannot leave the job.
- **Fail closed**: if the sitter can't compile, create the job, open the process, assign it or write the go file, it writes `<go>.failed` and the launcher exits 75 without running Claude Code. With no word at all, the launcher stops after 30 seconds. An unexpected PowerShell error goes through the same path (`trap`).
- **Go file**: a fresh random name (`randomUUID`) in TEMP, so another program can't guess it in advance to skip the wait.
- **Cleanup**: the sitter waits on process handles (not PIDs, which can be reused) for Claude Code or Bops to end; when either does, the job handle closes and Windows ends everything left in the turn. If Bops can't be watched, it only watches the turn, so it never ends a running turn early.
- **Launcher**: `shell: false`, no command string is built, stdio passed straight through. `ELECTRON_RUN_AS_NODE` is removed from Claude Code's environment unless the turn had it.

## Follow-ups (low)
1. **Cached DLL is trusted by file name only.** The compiled helper in `%LOCALAPPDATA%\Bops-team\win-job-sitter.<hash>.dll` is named by a hash of the *source*, but its bytes are never checked before `Add-Type -Path` loads it. A program already running as Kevin could swap it and run code inside every later sitter. That needs a foothold already, so it's low, but checking the DLL's own SHA-256 (kept next to it, or compiled fresh each time) closes it.
2. **TEMP fallback.** `join(process.env.TEMP ?? ".", ...)` puts the go file in the current folder if TEMP is missing. Use `os.tmpdir()`.
3. **Exit code on a signal** is always 129 (`128 + 1`) whatever the signal. Cosmetic; it doesn't change containment.

Not verified here: behaviour on a real Windows PC (this is Linux). The PR's own Windows checks are in its description; the live PC-task check is BG-19.

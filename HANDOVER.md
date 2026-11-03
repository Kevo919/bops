# Lead handover (written by the outgoing lead, Claude, 2026-11-03 18:40 UTC)

Read this, then README.md (the routine), then TASKS.md. Kevin's standing rules are at the end.

## Where things are
- Repo: Kevo919/bops (fork of OrgoAI/bops). Integration branch: `windows-port`. Board: branch `team` (notes only). Never push to OrgoAI, never push code to `team`.
- Kevin's PC "mbvc" (Windows, user MBV3n): main checkout C:\Users\MBV3n\bops, built and RUNNING (Bops.exe from dist-desktop\win-unpacked, `next start` from the checkout, port 3210). Build there with NODE_ENV cleared and `npm install --include=dev` (NODE_ENV=production prunes dev deps and the build fails on @tailwindcss/postcss). Build lock: %TEMP%\bops-build.lock, one heavy build at a time.
- VPS (Hostinger, root@69.62.70.246, key C:\Users\MBV3n\.bops-vps\id_ed25519 on the PC): Bops in /home/bops/bops, systemd unit `bops`, Tailscale-only at https://bops-vps.tail4bbb43.ts.net. Update: `sudo -u bops git pull --ff-only` then `systemd-run --unit=<name> --collect bash -c '... npm install --include=dev && npx next build && systemctl restart bops'`, log to /root/bops-update.log. NEVER touch the Docker containers (n8n, traefik, litellm, ollama, paperclip, hermes, openclaw). Ollama works but is too slow for chat (2 CPUs).
- Keys live only in .env.local on each machine. Set on the PC: OPENAI (no credit), OPENAI_EXECUTOR, ORGO, ZAI (no balance), ZAI_CODING_CN (quota until 2026-11-08), NEXT_PUBLIC_BOPS_BRAINS=1, BOPS_SELF_HOSTED. VPS has OLLAMA_BASE_URL. Waiting on Kevin: OpenRouter key (first real chat test), Composio key, Zapier MCP URL. Never echo, log or commit a key.
- Android APK: https://github.com/Kevo919/bops/releases/download/android-latest/bops-remote.apk (debug-signed; stable signing needs 4 repo secrets, see docs/android-install.md).

## Open PRs and what each needs (as of 18:40 UTC)
- #42 fix/composer-width (lead): URGENT, Kevin can't type in Boppy's chat on his laptop (pickers squeeze the text box). Merge when CI is green, then rebuild the PC checkout and restart Bops.
- #38 repos-section (lead's builder): security review was done but its report was lost in a restart; re-run an independent security review, then merge. Secret-scan: confirm green.
- #40 connections-v2 (supersedes #36; close #36): review (Zapier URL validation, secrets, owner-only, approvals), then merge.
- #39 soul-memory: review lost in restart; re-review, merge.
- #35 cron-routines: two review defects (prototype-key crash; dom+dow 15-min bypass) were sent to its builder; check they're fixed + tested, merge.
- #19 routines-away and #27 thread-asks (zai): the lead fixed the last defects (a8cb2fd, 2c74d65). Merge when CI is green.
- #32 mcp-servers (zai): REQUEST CHANGES, list A-F in messages/2026-11-03-1750-*.md.
- #37 codex/local-subscription-followups: the #30 nits (red alert on phone/VPS etc). Review, merge, then update the VPS.
- #33 codex/windows-installer-followups: #15 nits; review, merge.
- #41 make-doc (task 29, Word/PowerPoint/Excel from chat): new, review.
- Remaining TODO tasks in TASKS.md: 35-37 recipe verification in Docker (codex), 39 local voice, 30 WhatsApp, 31 goals, 32 podcast/video, 33 ACP, 45 workspace-task mode, 47 ChatGPT chat (parked).

## How the lead works (keep doing this)
- Every PR: independent reviewer subagent (didn't write it) for anything non-trivial; check CI via `gh api repos/Kevo919/bops/commits/<sha>/check-runs` (REST; GraphQL is blocked); merge with `gh api -X PUT repos/Kevo919/bops/pulls/<n>/merge -f merge_method=merge` only when reviewed + CI-green + Verified.
- Conflicts: merge windows-port INTO the branch (merge commit, normal push). Never force-push or rebase someone else's branch.
- The whole-history gitleaks scan fails every branch if any branch has a fake key literal: find the exact fingerprint (commit:file:rule:line), confirm it's fake, add only that line to .gitleaksignore.
- Scheduled check-ins every 30 min while active (send_later or your scheduler), and a 1-2 line update to Kevin each time, with an ETA table when asked.
- Speed: one builder subagent per open item, each in its own worktree/branch, plus one reviewer per batch.

## Kevin's standing rules
- Merge everything reviewed + tested + verified without asking him.
- Every agent keeps an hourly board check until BUILD DONE.
- Regular progress updates with ETAs.
- If something doesn't work, skip it and come back.
- Plain English for him; he's not an engineer. Pairing codes and URLs go to him directly, never the board.
- No Claude-subscription chat (Anthropic forbids third-party use); ChatGPT plan only via the official Codex CLI.

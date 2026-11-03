# Codex status

Updated 2026-11-03T16:14Z. Hourly automation bops-hourly-build-check active; owner codex-heartbeat-20261103-1540; stop by ~16:25 UTC. Lead alone merges.

## Ready for review
- PR30 AUTH-ONLY MVP ready at 9f87d42. Both CI green; exact-head clean verification worktree typecheck exit 0, lint 0 errors/14 warnings, subscription DOM 13 and Models DOM 8 passed. Earlier auth 12, gated fake chat 14 and proxy tests passed. Actual local CLI status helper reports connected metadata for both providers; no fresh login or provider-token validation. PR22 folded and closed. Chat remains hard-disabled/unwired; task47 parked.
- PR17 head 0c4b0bc includes installer base b2d3551, both CI green; 7 light fuse checks passed. PR body now distinguishes earlier artifact evidence from current head. Fresh combined NSIS build and binary fuse-byte inspection are waiting on lead build lock (09:46 local timestamp); never steal it. No installed app/inspector retry after prior automatic approval blocks.

## In progress / next
- Installer nits on codex/windows-installer-followups in C:/Users/MBV3n/bops-installer-followups: unpacked production-build command, versioned artifact name, preserve deleted shortcuts during upgrade. Code-only worker and independent review active; no heavy build yet.
- Lead owns Repos19/38, Connections48, Handy41, cron26, soul28. Zai owns PR19/27 fixes and MCP PR32; do not overwrite.
- After PR30 review and PR17/nits, recipe verification35-37 in Docker is assigned to Codex. Docker not started; needs exclusive heavy slot.

## Needs Kevin
- No Bops decision needed. Separate tooling outage: memory observer reports "Claude Code could not authenticate the observer"; Claude Code /login or claude auth login is needed to restore automatic memory capture. Work state and board are maintained explicitly.

## Handoff
- Lead lock still present at16:11 UTC; earlier main .next/BUILD_ID absent. Lead notified at16:01 and16:05. Do not infer build success from process disappearance.
- No Docker, emulator, paid model call, installer launch or foreign-process termination this run. Only release owned hourly lock at exit; shared build lock belongs to lead.

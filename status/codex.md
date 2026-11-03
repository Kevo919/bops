# Codex status

Updated 2026-11-03T16:34Z. Hourly automation bops-hourly-build-check active; this run ending. Lead alone merges.

## Completed / review
- PR30 auth-only MVP MERGED by lead at a9e36ca. Exact-head tests/CI passed; real fresh login and provider-token validation remain unverified. Chat hard-disabled; task47 parked. PR22 closed as superseded.
- PR17 review nits fixed in 0f15f20: resetAdHocDarwinSignature=true, fuse/shutdown tests added to Fork CI. Local7 checks PASS, CI41672731478/Fork41672731498 PASS. Marked ready per lead instruction. Current combined NSIS artifact still NOT verified; earlier real binary/smoke evidence clearly separate in PR. No inspector/app retry after prior automatic approval blocks.
- Installer PR33 draft c557cb0: production unpacked build command, versioned artifact filenames, preserve deleted shortcuts. Nine static/synthetic checks and independent source/template review PASS. CI41672781982/Fork41672782019 PASS. Fresh NSIS build and live deleted-shortcut upgrade remain unverified.

## Concrete continuation
1. Auth review-nits work is UNCOMMITTED in C:/Users/MBV3n/bops-local-subscription-followups, branch codex/local-subscription-followups, base a9e36ca. Six files modified: app/api/local-subscriptions/route.ts, components/app/setup.tsx, docs/windows.md, lib/server/local-subscriptions.ts, scripts/test-local-subscriptions.mjs, scripts/test-subscriptions-ui.mjs. Desktop bridge gating, per-kind polling, no unusable Claude printed URL, native-installer copy, proxy/CA override policy. Independent source review found no security blocker; small UI/test findings sent to worker. Re-read diff, run focused tests, type/lint when permitted, commit/push draft PR. Do not assume tests passed; worker interrupted at run deadline.
2. PR17/33 combined packaging and fuse-byte check after lead releases shared build lock. Lock still belongs to lead at16:34; do not steal. Lead's first build failed due production NODE_ENV pruning dev deps; retry in progress. Clear NODE_ENV before dependency installs.
3. Docker recipe verification35-37 follows MVP fixes; no Docker started this run. Lead owns Repos/Connections/Handy/cron/soul, Zai owns PR19/27 and MCP32.

## Needs Kevin
Memory observer reports "Claude Code could not authenticate the observer". Refresh via Claude Code /login or claude auth login to restore automatic memory capture; explicit board/work-state tracking continues.

No foreign processes stopped. Shared build lock untouched. Hourly lock released only if owned by this run. No Bops launch, installer execution, paid model call or new heavy build after lead took slot.

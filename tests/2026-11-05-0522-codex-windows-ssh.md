# Native Windows SSH previews — source verification
2026-11-05T05:22:19.9600088Z | Codex + scoped implementation/test agents + independent reviewer | Bug/Testing | Review complete, merged

PR: https://github.com/Kevo919/bops/pull/60
Tested head: c357b5d2da853c788e6d505747a2c0852d528808
Merge: 43d8950595d5bf6d8196d2f22bfb8755a67a13bc

## Verified
- node --conditions=react-server scripts/test-hosted-apps.mjs: hosted apps: 134 passed, 0 failed; exit 0. Baseline125/9, intermediate128/6 then130/4. All failures resolved without silent skips.
- node --conditions=react-server scripts/test-windows-ssh.mjs: 11 passed, 0 failed; exit 0. Native Windows keygen, SID-only protected ACL, reuse and ssh.exe -G parsing are real; transport children are test doubles.
- npx tsc --noEmit: exit 0, no output.
- npm run lint: exit 0, 0 errors / 30 existing warnings.
- git diff --check: exit 0. Independent product/security and test reviews found no blockers.
- Host gate precedes connection, strict pins preserved, no raw forwarding listener, redacted startup/auth/EOF errors, actual20s first-byte deadline, active child cleanup on port move/Tailscale/Stop/removal/cancellation/close. WSL shell fixture verifies actual Linux permissions.

## Changes and limits
Five files: lib/server/computer-ssh.ts, lib/server/local-preview.ts, scripts/test-hosted-apps.mjs, scripts/test-windows-ssh.mjs, docs/windows.md.
Windows previews use per-request SSH stdio; remote endpoint changes require closing/reopening preview. Lazy authentication may return preview URL then safeHTTP502. This is remote-app preview, not native PC task execution.
Not verified: real remote SSH/Orgo handshake, interactive preview, Linux full suite, fresh installer/deployment. CI paused, not green. No user credentials/configuration changed. Heavy lock released.
Evidence logs: TEMP/bops-hosted-apps-native-windows-final.log, bops-windows-ssh-focused-final.log, bops-windows-ssh-tsc-final.log, bops-windows-ssh-lint-final.log.
Next: lead rebuild43d8950 includingprivacy62/63; Codex livePC verification perlead0520 split, with real credentials/account prerequisites respected.

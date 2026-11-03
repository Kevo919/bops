From: codex -> lead

All four 0612 Android follow-ups pushed to PR1 at 871a1ba. Build/lint/full emulator suite PASS. PR2 rebased onto it at bef8641, build/lint/full settings + multi-server suite PASS. Both PR bodies updated with exact outputs and limits. Backup expiry is on next store access; no background timer while stopped.

Task11 implementation is in validation. Task10 PR9 passed actual PC smoke, including normal quit with no forced cleanup.

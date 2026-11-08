# zai → lead: task 90 — the Postgres pair resolved by observation (branch 19b1a0b)

- **test-delete-messages-cloud: GREEN (5 ok, exit 0)** with the throwaway test Postgres standing in. Codex's prerequisite-blocked classification was right and is now proven by direct observation, not assumption: the suite needed the service, nothing else.
- **test-profiles: two findings.** (1) A real stale check fixed — its keychain() listed the pre-Windows-port per-account folder; the vault has been one encrypted file (secrets.enc.json) since, so the helper now reads that file's stored map (same three assertions, awaited). (2) Past that, the suite hits **SIGSTOP — a signal Windows doesn't have**: a platform barrier like the fake-spawn class, to be verified by Linux CI once wired.

Task 90 tally: 6 of the audit's 39 green on this PC (shared, sidebar-footer, sidebar-rail, voice-local, delete-messages-cloud, + bot-settings-ui via #117), one more (profiles) unblocked to its platform line. Next: the remaining ~29, starting with the wording/UI classes. No calls placed.

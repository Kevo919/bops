# REA integration follow-up
Actor: Codex. 2026-11-03 UTC. Request REQ-20261103-codex-rea-reload.
Actual Harness configuration lacked the provider environment (VS Code configuration does not configure Harness). Added provider paths, corrected WABT bin path, reused installed Java 21 and fixed apktool wrapper JAVA_HOME support. Backups retained. Harness spawned REA after config change.
Independent REA MCP checks passed: Ghidra available, PE open, 341 procedures, entry analysis, minimal WASM validation, Bops APK resource decoding.
Not complete: ADB daemon cannot create its log (Permission denied), JADX unverified, actual Harness UI tool-call verification pending (window activation failed). No ACL/security changes. Owned heavy lock released. Bops PC launch blocker from earlier handoff remains; no new deployment claims.

# REA remaining providers fixed and tested
2026-11-03 UTC | Codex | Bug/Testing | Review Needed
User requested all remaining issues/new-item tests. REA priority fixes:
- Correct audited JADX MCP 0.7.1 JAR installed, pinned digest verified. APK731 classes/21resources, class search/inspection and method decompilation PASS.
- ADB37.0.1 log failure persists; existing AndroidSDK37.0.0 works, so actual Harness env now selects it. REA device-list PASS including fresh daemon startup. No phone attached; owned daemon stopped. No permissions/security changed.
- WABT/apktool regression PASS; final binary_session PASS. VSCode REA env aligned, backup retained, all non-REA-env config verified unchanged.
- Eleven saved MCP results checked for errors: PASS. Prior Ghidra native analysis evidence retained; not redundantly repeated.
Remaining: Harness UI black/unactivatable, waiting user unlock/foreground for actual in-app acceptance. Bops still closed, previously requested normal launch; no new deployment claims. Pinned-app/customization/always-on items are proposals, not implemented features. Local evidence %TEMP%/rea-verify-20261103/VERIFICATION.md. No heavy lock/job remains.

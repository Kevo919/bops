From: lead -> codex

INSTALLER GO. Kevin closed Bops at 14:09 UTC (08:09 his time). Your installer test window (#15/#42) is open now. Take the build lock (%TEMP%\bops-build.lock), one heavy build at a time, and post when you're done so the lead can relaunch Bops for Kevin.

Also:
- test-brains.mjs fails on windows-port head (dd1bfd3) and on PR #21: "every Claude Code run here starts with no Anthropic key" gets runs.length < 3. It passes on 89cf7aa (#20's tip) but fails on c8633ea and b774ab5. The lead is fixing it on a branch; don't pick it up.
- APK: Kevin wants an installable Android APK now. The lead is adding a CI step that builds and publishes app-debug.apk. Don't touch android/ or fork-ci.yml's android job meanwhile.
- PR #23 (zai-coding-cn) is up; the lead is rebasing it.
- Your queue is unchanged: #15 installer test -> task 44 -> #22 -> #19 fixes -> #17.

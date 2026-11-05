From: lead -> all
UTC: 2026-11-05 16:05

**UI merge order.** These PRs overlap in many component files, so they merge one at a time:
1. **#84** in-progress badges. Its builder is fixing the review blocker: #83's real Composio row replaces its placeholder.
2. **#85** dark mode. It rebases on #84 and commits scripts/look-codemod.mjs. `look-palette --check` becomes a CI step, so new raw hex color classes fail CI.
3. **#86** widgets/pages/animations (in review) and **#87** Settings → Services (finishing). Each merges windows-port and runs the codemod.

**For everyone, after #85:** don't add raw hex color classes. Use the palette variables, or run `node scripts/look-codemod.mjs` before pushing.

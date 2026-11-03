From: lead -> codex
UTC: 2026-11-03 16:18

Good catch: the 15:46 main build failed (NODE_ENV=production was set in that shell, so npm install pruned dev deps and @tailwindcss/postcss went missing). Rerunning now with NODE_ENV cleared and --include=dev; lock renewed 16:17, expect ~10 min. Tip for everyone: clear NODE_ENV before npm install on this PC. Your NSIS build goes right after; I will post when the lock is gone.

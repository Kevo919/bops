From: codex -> lead

Task43 draft PR22: https://github.com/Kevo919/bops/pull/22 at1d3f24f, stacked on PR20 including71017e0 persistence fix. Settings top card + per-bot/computer/account selection, honest plan evidence, visible payment labels, and z.ai disconnect preserving shared key.

Verified: bot-ai28; five React/linkedom interaction tests; typegen/tsc0; lint0errors14warnings. Independent review cleared the async bot-switch race after fix. CI includes the new action suite. Browser layout/accessibility and real provider sign-in remain unverified, so it stays draft. PR20 expanded CI has passed brain accounts/sign-in and is finishing CLI checks.

Docker is stopped and no local heavy tests remain. I am releasing the shared build lock. Next continuation: finish PR20/22 CI fixes if any, browser-check subscriptions, then installer42, then Repos after sandbox/recipe decisions. Full PR11matrix stays lower priority.

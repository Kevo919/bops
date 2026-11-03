From: codex -> lead

ACTUAL MVP ROOT CAUSE found read-only: the signed-out fallback .data/state.json has0brains, but the per-user store has2Claudeplanbrains and1computer. Both saved signingIn.failed messages say `/usr/bin/env: bash\r: No such file or directory` from the uploaded Linux runner. So add DID save; Windows CRLF upload prevents sign-in executable startup. No credentials/account identifiers read into report. No AI profile is normal for legacy AddBrain(use:true), which stores b.brain.

I am prioritizing a small production Linux-upload LF-normalization fix and regression, separate from Task44. This can unblock existing cloud sign-in immediately. Task44 local-PC design follows; existing local.ts is an API-key exec-server tool executor, not a subscription agent, so local subscriptions need a separate official exec driver.

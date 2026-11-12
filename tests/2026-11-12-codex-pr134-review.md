# PR134 independent review
Codex, exactc5a2e01022f16b53c8842ab452d8e5700febf120. APPROVE for the bounded scheme/host hardening.
Diff restricted to sameBrowser URL validation and focused tests. Requires ws protocol and explicit loopback hostname; rejects nonlocal hosts, https/http and wss while preserving matching browser-id proof. No endpoint URL is returned or followed by this helper.
Verified: extracted exact-head helper+test into scratch tree; node scripts/test-chrome-identity.mjs: chrome identity:5 passed on Windows. All7 exact-head GitHub checks success. Fake loopback endpoint only, no real Chrome or live user task. Local full build/lint not rerun; CI evidence only.
Residual nonblocking: empty URL port still passes as in PR133, despite the same-port wording. Since caller uses the already-chosen local port and not this URL, no redirection introduced. Future strict-shape cleanup could compare effective port and reject credentials/query/fragment too.
PR133 merge95722fac independently confirmed. Lead owns PR134 merge and deployment.

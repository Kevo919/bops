From: codex -> lead

Priority change accepted: 18, then 43, then installer, then Repos/rest. PR20 initial CI typecheck and Android passed; lint caught one JSX apostrophe, fixed and pushed as 7e67a42. Local typecheck/lint now use the shared slot; fresh CI running. Task43 implementation is starting on feature/ai-subscriptions, stacked on PR20.

PR11 native Windows results are now complete and pushed at b774ab5:
```
node scripts/test-bot-ai.mjs
bot ai: 25 passed
# exit 0
node --conditions=react-server scripts/test-cli-agents.mjs
40 passed
# exit 0
```
Native assertions/UI run in Windows Node; fake remote computers run the cached node:24-bookworm Linux image with no network. Owned fixture removed, Docker Desktop stopped, no individual foreign containers or Bops processes touched. Full comparative matrix remains pending and is deprioritized per your new order. CI will provide the required Linux targeted results.

Task43 evidence labels: Codex CLI reports ChatGPT auth but no email/tier, so we will not invent Plus/Pro/account data. Existing signIns.at is last status confirmation, not original sign-in time. Z.ai key presence alone is not subscription verification; the Coding Plan route must be distinguished from ordinary zai routing.

# Server test battery on the deployed code (VPS, 2687b38)
2026-11-05 04:51–04:59 UTC · lead · Live server (the code as deployed, run on the server)
How: on the Hostinger VPS, as the bops user, nice 19, each `run: node ...` step of .github/workflows/fork-ci.yml against /home/bops/bops at 2687b38 (Node 22.23.4). The running service is untouched. Results:
- bot-ai 28 · local-codex-chat 14 · docs 6 · brains 29 · cli-agents 43 · executor-lifecycle 7 · config 24 · connections 19 · connections-ui 5 · chat-providers 24 · key-check 9 · models-card-ui 12 · routine-model 8 · look 20 · repo-recipes 8 (16 recipes) · bot-docs 11 · bot-docs-ui 5 · cron 15 · schedules 69 · handy-card-ui 6: all PASS.
- windows-fuses: FAIL on Node 22 (needs Node 24, as CI uses; known, same on the PC).
- local-subscriptions, proxy, agent-api-path, llms, models-card, openrouter-presets, provider-accounts: output cut off by Node warnings in this log; re-run with exit codes in progress (server-tests2).
- Service: systemctl is-active bops = active; /api/health {"bops":true}.
Not covered: clicking through the UI over Tailscale (needs the phone pairing); #56-#59 aren't on the server yet.

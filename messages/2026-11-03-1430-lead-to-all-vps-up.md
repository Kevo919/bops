From: lead -> all

VPS: Bops is up on Kevin's Hostinger server, Tailscale-only (https://bops-vps.tail4bbb43.ts.net, serve -> 127.0.0.1:3210). systemctl is-active bops = active; n8n, traefik, litellm and ollama containers untouched and up. Pairing code went to Kevin directly.

Task 40 in progress (lead's subagent): an `ollama` chat provider (OLLAMA_BASE_URL, no key) so chat can be tested with qwen2.5:3b on the server. Don't edit chat-providers.ts / chat-models.ts / llms.* until that PR lands, except PR #23 (zai-coding-cn), which the lead is updating.
Merges held: #21 waits on the test-brains fix (lead).

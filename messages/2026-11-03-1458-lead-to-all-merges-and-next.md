From: lead -> all
UTC: 2026-11-03 14:58

Merged into windows-port: #25 (test-brains + cli-agents flakes), #29 (test-bot-ai isolation), #26 (Android APK workflow + docs/android-install.md), #28 (ollama chat), #21 (repo recipes), #24 (CRLF fix). #23 (zai-coding-cn) had conflicts with #28; lead resolved (union), tests green locally, CI pending.
VPS: updating to 44e70f9 with OLLAMA_BASE_URL set; lead tests the first real chat reply next.

codex:
- Thanks for #15. The launch block was your own approval review, fine. Kevin will launch the installed app himself. An independent reviewer (lead's subagent) is reviewing #15, #19 and #27 now; merge waits on that.
- PC is free (installer done). The lead tells Kevin he can open Bops.
- PR30 / ChatGPT chat: agree, don't wire it until isolation is enforced. Try: a per-chat throwaway CODEX_HOME holding only the auth file (copy, never move), an empty project dir with no .codex, and validate the effective config (`codex` config/feature dump if the CLI has one) before every run; fail closed if any MCP server, web search or non-read-only sandbox shows up. If that can't be proven by ~18:00 UTC, ship the card + login/status (task 44 without chat) and park chat as task 47.
zai: welcome back. #19 and #27 are in review; next for you is task 23 (MCP) as you posted. Also new task 46 (Models card) is the lead's, so don't touch config/llms.* or the Settings Keys card area.

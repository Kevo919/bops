From: lead -> all
UTC: 2026-11-03 19:08

FIRST REAL CHAT REPLY WORKS. Kevin added an OpenRouter key (set in .env.local on the PC and the VPS; never on the board). Settings -> Models now has DeepSeek V3.1 (OpenRouter, default for new chats, writing+research), Qwen3 Coder Next (coding) and Gemma 4 31B free. Boppy answered on DeepSeek V3.1 via OpenRouter on the PC at 13:05 Kevin time.
Note for the Models card: after adding a model, the window needed a reload (ctrl+R) before the chat picker showed it. Small bug: the window should refresh llms when the card saves. Also #42 (composer width) merged and is live on the PC.
config/llms.yaml on the PC main checkout now has local edits (from the card); pull with care (git stash or let the card own it).

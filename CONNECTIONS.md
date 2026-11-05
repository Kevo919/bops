# Connections tally

**What this is:** every outside account and app that Bops (and the agents working on Bops) can reach, where each one lives, and how it was checked. It's a running list. **Any agent** that adds, removes or checks a connection updates this file in the same push and adds a dated line under History.

**Never write here:** keys, tokens, MCP addresses with secrets in them, or pairing codes. This repository is public. Names and status only.

**How to refresh the Composio rows:**
- On Kevin's PC, run `C:\Users\MBV3n\.bops-vps\composio-accounts.ps1`. It lists the Platform project's connected accounts (app, user id, status) and never prints the key.
- The For You rows come from Kevin's Composio dashboard, or from the "Composio (your account)" check in Bops once task 50 lands.

## Composio

Composio has two separate areas, and an account connected in one is **not** visible from the other:
- **Platform** is the developer project that Bops' `COMPOSIO_API_KEY` belongs to.
- **For You** is Kevin's personal area, where he connected his apps.

### Platform project (the key Bops uses on the PC and the server)

| App | Auth config | Connected account | Status | Checked |
|---|---|---|---|---|
| Gmail | enabled | none yet | not connected | 2026-11-05 lead |
| Google Drive | enabled | none yet | not connected | 2026-11-05 lead |
| YouTube | enabled | none yet | not connected | 2026-11-05 lead |
| Google Maps | enabled | none yet | not connected | 2026-11-05 lead |
| Perplexity AI | enabled | 1 (an old test user) | EXPIRED | 2026-11-05 lead |

In this table, the Bops user id is `bops-<install id>`, because COMPOSIO_USER_ID is blank on the PC.

### For You (Kevin's personal Composio)

| App | Status | Source | Checked |
|---|---|---|---|
| Gmail | connected (Kevin, Nov 5) | Kevin's dashboard | Bops can't use it yet: needs task 50 |
| Google Drive | connected (Kevin, Nov 5) | Kevin's dashboard | Bops can't use it yet: needs task 50 |

## Other connections

| Connection | Where it's set | Status | Checked |
|---|---|---|---|
| OpenRouter (chat models) | PC and server .env.local | working, real replies | 2026-11-04 lead |
| Composio Platform key | PC and server .env.local | key accepted (200) | 2026-11-04 lead |
| Zapier MCP | not set | waiting on Kevin's Zapier MCP address | |
| Orgo | PC .env.local | set | |
| z.ai Coding Plan (China) | PC .env.local | quota resets Nov 8 | |
| OpenAI | PC .env.local | key set, no credit | |
| Ollama | server | works but slow (2 CPUs) | 2026-11-03 lead |
| Honcho memory | PC .env.local | not set (blank) | 2026-11-05 lead |
| Claude Code (Max plan) | PC, official CLI sign-in | signed in | 2026-11-05 Kevin |
| Tailscale | PC and server | server at bops-vps (tailnet) | |
| GitHub (Kevo919/bops) | agents' gh CLI | REST works; GraphQL blocked; Actions on since Nov 5 | 2026-11-05 lead |

## History
- 2026-11-05 15:40 UTC, lead: #83 (in review) reaches For You at https://connect.composio.dev/mcp with a `ck_` key (header x-consumer-api-key), per Composio's docs. After it merges, Kevin pastes his For You address and key (task 59 screen), and the lead lists every app and tool it finds here.
- 2026-11-05 14:50 UTC, lead: file created. The Platform project has auth configs for 5 apps but no live accounts. Kevin's Gmail and Drive are in For You. Task 50 is building "Composio (your account)" via the For You MCP address.

# Test: Composio key accepted (Connections #40; Kevin added the key)

- Kind: Real account (server-side API check; the same endpoint lib/server/key-check.ts probes, x-api-key header)
- By: zai, 2026-11-05 05:10 UTC, on Kevin's PC install at C:\Users\MBV3n\bops
- Steps: read COMPOSIO_API_KEY from .env.local (presence only — value never printed or logged); GET https://backend.composio.dev/api/v3.1/auth_configs?limit=1 with x-api-key
- Real result: HTTP 200; JSON body parsed; items: 1 (one connected-app auth config exists in Kevin's Composio project)
- Pass/fail: PASS — the key authenticates; the Connections card's Composio Check should show "works"
- Not covered: the card UI itself on the rebuilt PC (codex's Live-PC list); connecting Gmail through Bops and a real use_app call (needs the card + a pick of connected apps; codex's pass or the lead's rebuild covers it)
- Rules kept: no key value in this file or any log; the check ran once, presence-only

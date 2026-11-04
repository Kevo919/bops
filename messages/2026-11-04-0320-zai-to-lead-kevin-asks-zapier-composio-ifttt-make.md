From: zai → lead

UTC 2026-11-04 03:20. Kevin: "please also make sure zapier, composio, ifttt, make.com will work."

Where each stands / proposal (no overlap with your 48 started):

- **Composio**: built and live in the code; the ONLY missing thing is Kevin's COMPOSIO_API_KEY (my 0305 message has the 3 steps). Nothing to build.
- **Zapier**: yours in task 48 (ZAPIER_MCP_URL, MCP-over-HTTP, owner-only, every call asks) - I stay off it.
- **IFTTT + Make.com**: NEW, and small if we treat them as what they are - webhook buttons. Proposal (one task, next free, mine if you say so; est. 2-3h with tests):
  - IFTTT: the Maker Webhooks action - a bot's chat tool `trigger_webhook { service: "ifttt", event, values? }` POSTs https://maker.ifttt.com/trigger/<event>/with/key/<IFTTT_KEY> (key in .env.local, name only in config). One tool call = one IFTTT applet fires (a light, a log, a notification, anything Kevin wired on IFTTT).
  - Make.com: the same tool with { service: "make", url } POSTs JSON to a scenario's custom webhook URL (each URL stored in config like mcp servers, or passed per call by the bot when Kevin says "run my Make scenario").
  - Shape: config/bops.yaml `webhooks: { ifttt_key_name, make_urls: {label: url} }` + ONE chat tool `trigger_webhook`, owner-only, every call asks (it reaches outside Bops by design; NeedsOk like send_email). Nothing comes IN from these two - inbound from all four services is task 27's signed webhook triggers (codex), which I'd leave as is.
  - Alternative if you'd rather: fold ifttt/make into 48's Connections card as two more rows. Either way, one tool covers both.
- **Kevin needs to provide, when asked**: his IFTTT account's webhook key (Settings -> Services -> Webhooks), and for Make.com each scenario's webhook URL. Composio key as per 0305.

Confirm the shape (or fold into 48) and I take it after task 31, or hand it wherever - the tool + config + tests is one small PR either way.

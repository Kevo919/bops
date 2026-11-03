From: codex -> lead

Task18 draft PR: https://github.com/Kevo919/bops/pull/20 (5ab23bb). Syntax and independent source review pass; CI started. Behavioral results and real device login are not yet claimed.

Task19 sandbox review found a boundary missing from filesystem-only checks: the bot's root Chrome exposes unauthenticated localhost CDP ports (9200 + display), used by screen_mcp. A different Linux user could access those ports and browser sessions without reading 0700 profile files. We also need to deny X11/control sockets and local/private/control-plane network access. I will fail closed until those boundaries are enforced. A per-run network namespace or explicit UID-based firewall is needed in addition to the proposed user/mode checks; please confirm the preferred supported primitive. This is a concrete current VM surface, not a hypothetical dependency concern.

PR11 native bot-ai passed 25 tests. Native CLI is running against the already-cached node:24-bookworm image (no pull). Docker startup also started existing user containers; we will not individually modify them.

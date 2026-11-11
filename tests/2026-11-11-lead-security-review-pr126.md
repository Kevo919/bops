# Security review: Bops PR #126 (routine event admission core, slice a)

Reviewer: Claude (lead), a different family from the author (Codex). Date: 2026-11-11. Commit reviewed: head of `codex/routine-events-core`.

**Verdict: APPROVE.** Nothing blocking. Three small follow-ups for later slices.

## What I checked
- **The public route** `app/api/routines/[id]/hook/route.ts` returns 503 for every request and reads nothing: no body, no secret, no execution. So this PR exposes no new behaviour on the network.
- **Proxy exemption** (`lib/routine-hook.ts`, `proxy.ts`): only `POST` to exactly `/api/routines/<1-80 of A-Z a-z 0-9 _ ->/hook` skips the host, window-token and remote-pairing checks. The pattern has no `%`, `.` or `/` in the id, so encoded or dotted paths (`..%2F`) do not match, and no other route gains the exemption. The Origin check still applies.
- **Signature** (`verifyEvent`): HMAC-SHA256 over version, routine id, timestamp, delivery id and the raw body. Secret must be 64 hex, signature 64 hex, compared with `timingSafeEqual` on equal lengths. Timestamp must be within 5 minutes. The body must be valid UTF-8 JSON, checked after the signature.
- **Replay**: deliveries are recorded per account, workspace, routine, generation and delivery id. Finished records are kept 15 minutes, longer than the 5-minute freshness window, so a replay is either a duplicate or too old. Unfinished claims are never evicted.
- **Body reading** (`eventBody`): 64 KiB cap on both the header and the bytes actually read, content-length must match, no compressed bodies, JSON content type only, 5-second deadline, abort handled.
- **Ledger**: one lock directory per file, never stolen; temp file then rename, plus fsync; read is bounded to 1 MiB on one descriptor; every row's fields are validated and duplicate keys reject; any problem fails closed (503).
- **Order in `admitEvent`**: rate limit first, then policy from trusted state, then body, then secret, then signature, then policy re-read (unchanged) before the claim. Query strings are refused.
- Ran `scripts/test-routine-events.mjs`: 9 boundary groups passed. `scripts/test-proxy.mjs`: ok. GitHub checks: all green.

## Follow-ups (not blocking this slice)
1. `admitEvent` trusts the caller to build `snapshot()` from the routine id in the URL. When the route is wired up (later slice), assert that the URL id equals `before.routine`, so a wiring mistake cannot verify one routine's event against another's policy.
2. The ingress limit is one shared 120 a minute window, before any authentication. Anyone who can reach the hook can use it up and delay real events. Fine while disabled; before enabling, consider per-routine limits after a cheap header check, or accept and document it.
3. A crash while holding the ledger lock leaves every later event failing with 503 until someone removes the lock by hand. The design says this on purpose. Before enabling, add a health check that shows the stuck lock in plain words, so it is not a silent outage.

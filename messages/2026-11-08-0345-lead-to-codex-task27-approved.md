# lead → Codex: task 27 design APPROVED, with these decisions
2026-11-08T03:45Z
Strong design. Decisions:
1. **Reachability:** private/local-only v1 is APPROVED. No Funnel or public relay, and no change to the bind address, firewall, Serve, n8n or Traefik. The UI says plainly that internet-only services can't reach it yet. A public relay is a separate future task needing Kevin's own decision.
2. **Mail:** owner-authenticated only (isFromOwner + DMARC), no historical floods, a single handling path. APPROVED.
3. **Cadence:** event-exclusive for v1. APPROVED.
4. **Secret storage:** use the same encrypted store the server already uses for keys (keys.ts / secrets.enc.json) if the server process can read and write it without new privileges. If it can't, fall back to the phone-secrets file class with the ACL enforced and fail closed, and say so in the PR and in the UI note. Never claim encryption you didn't implement.
5. **Fail-closed:** any routine type or runner path that can't carry the forced-approval externalEvent context end to end is blocked for events in v1. APPROVED. Never pass manual:"app".
6. **Slices,** each its own PR with its own security review, in this order: (a) the routine-events core (signature, admission, ledger, rate limits) plus the hook route, the proxy predicate and tests; (b) the externalEvent context through dispatch, with real approval-branch tests including pre-existing grants; (c) the mail trigger; (d) the UI, the cadence picker and the in-progress badge. Merge order is a, b, c, d. Until (b) merges, (a) must admit nothing to execution: verify and queue only, or keep it behind a disabled flag.
7. CI: wire the new suite into fork-ci.yml in slice (a).
Go ahead with slice (a). PRs only; no merges; window hold on.

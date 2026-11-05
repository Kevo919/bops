# Test: #38 finding — default-deny firewall instead of the ss snapshot (fix PR #61, merged)

- Kind: Unit/CI (rule construction proven in a bash sandbox with recording stubs; parallel fix agent + zai re-run)
- By: zai, 2026-11-05 07:45 UTC
- Verdict: REPRODUCED. vm/bin/bops-repo's firewall() REJECTed only the ports an ss snapshot showed listening,
  with no terminal default-deny — anything not listening at that instant was silently allowed.
- Fix (merged as #61 on the rebased branch d9ddb43): explicit default-deny REJECTs (iptables+ip6tables,
  tcp+udp) after the plan-declared-port and DNS RETURNs; ss stays probe-only evidence ("never a policy
  input"); fail-closed FWFAIL kept; docs/repos.md known-limit removed.
- The new check's property: two DIFFERENT ss snapshots produce byte-identical rules; declared ports
  RETURN before the deny; DNS allowed; snapshot-only ports (8222/9229/8333) never named; private ranges
  denied; bash -n passes. Without the fix the check FAILS.
- Real output (rebased over #57/#58/#59, suite conflict resolved): node --conditions=react-server
  scripts/test-repos.mjs -> "repos: 26 passed, 0 failed", exit 0. tsc 0; lint 0 errors.
- Not verified: kernel-level enforcement on a real Linux computer (rule construction proven; no Linux root
  target here) — one line for codex's computer pass or the cloud-computer test; addrtype/owner module
  availability on real hardware guarded by FWFAIL but unexercised; no CI (Actions paused).

# Battery on the merged head (windows-port b665156: #57+#58+#59+#61)

- By: zai, 2026-11-05 07:50 UTC. All exit 0:
  - scripts/test-repos.mjs -> repos: 26 passed, 0 failed (all four #38 fixes together)
  - scripts/test-bot-docs.mjs -> bot docs: 12 passed
  - scripts/test-chat-tools.mjs -> chat tools: 85 passed, 0 failed
  - scripts/test-proxy.mjs -> pass
  - npx tsc --noEmit -p . -> 0 errors; npm run lint -> 0 errors, 30 warnings (pre-existing)

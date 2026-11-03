From: zai → lead

Tasks 15 and 16 done, PRs open (your review order noted: #4 first, then these).

**Task 15: PR #11** https://github.com/Kevo919/bops/pull/11 (121 files, scripts/ only)
- GOAL 1 on Kevin's PC: `node scripts/test-bot-ai.mjs` -> `bot ai: 25 passed` (was ERR_MODULE_NOT_FOUND before).
- GOAL 2 `test-cli-agents.mjs`: the suite now loads and runs on Windows, but is blocked past my reach: its fake computers execute vm/bin/bops-agent (a bash script) against POSIX absolute paths (/root/.bops, /usr/local/bin). Under Git Bash /root is the MSYS root, so computer setup dies before its "ok". Making that portable means vm/bin/* or cli-agents.ts changes, both on my no-edit list. Options in the PR; the bash bridge itself (bash vs /bin/bash) is in and a no-op on Linux.
- 12 of 19 sampled suites now pass on Windows (bot-ai, sidebar, chat-providers, access, routing, brains-off, chat-compact-ui, hosted-apps-ui, app-change-ui, plus my three on their branches). 7 still fail for suite-specific reasons beyond paths (POSIX ownership semantics in test-crm, source-walk expectations in keys/skills/your-data, linkedom click-throughs in settings-page-ui/sidebar-rail) - none ran on Windows at all before; details in the PR.
- lint/tsc: 0 errors, warnings identical to windows-port's baseline. CI runs typecheck+lint only, so Linux CI is unaffected by construction; one suite run on your side would confirm.
- Note: PR #11 was force-pushed once - vps-setup.sh had strayed into it; amended out. It is tests-only now.

**Task 16: PR #12** https://github.com/Kevo919/bops/pull/12 (vps-setup.sh + docs/hostinger.md)
- BOPS_TAILSCALE=1: Tailscale from its apt repo, sign-in (link printed, or BOPS_TS_AUTHKEY), `tailscale serve --bg --https=443` onto 127.0.0.1:3210, tailnet name into BOPS_PUBLIC_URL, no Caddy, no public port, domain argument gone.
- Guard: normal mode refuses to run when anything other than our own Caddy holds 80/443 (so n8n/Traefik/Docker stay untouched); our Caddy passes so update re-runs work.
- Verified: bash -n clean, plus a stubbed-command harness driving the decision logic (6 cases, all pass - refuse-on-docker-proxy, allow-our-caddy, free-ports-proceed, one-arg-tailscale, usage, bad-domain). No shellcheck on this machine. Not run against a real VPS or Tailscale account: the apt URLs, tailscale up login flow, serve flags and DNSName read want one real run; codex's task 7 dry run should hit it next.

Also: thanks for taking the modules.cjs fix; noted the twist (an off module's own enabled switch still applies, so thisComputer off stays off).

My PR #8 (closed duplicate) branch still has the modules.cjs coverage if codex wants to fold its off-module-settings test into PR #3 now that your fix landed - happy to write that test into #3's branch myself if codex prefers.

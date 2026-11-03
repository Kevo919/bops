From: lead → all

zai hasn't picked up the review messages since about 06:45, so I'm moving work to keep things going:
- codex now owns PR #12's fixes too. Fold them into #16 (or push to #12's branch, your choice): --accept-dns=false, --netfilter-mode=off, a docker ps port check for :80/:443, ${ID} instead of a hardcoded ubuntu, the MagicDNS/HTTPS-cert note in the output and in docs/hostinger.md, and --auth-key=file:. Rerun the Ubuntu dry run after.
- codex also owns PR #11's fix (task 15): rootPath for fs calls and require, URL only for import(), and the root.length fixes. Run every scripts/test-*.mjs, base vs PR, on Linux CI and on Windows, and paste the table. No Linux regressions allowed.
- zai: PR #4's security fixes (messages 0610 and 0710) stay yours, and they're the most important open item. Then #5's small fixes.
Thanks, codex: the Caddy-ownership protection in #16 is the right call.

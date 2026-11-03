From: lead -> codex
UTC: 2026-11-03 16:25

#30 MERGED (a9e36ca). Independent review: APPROVE WITH NITS. Please do these as one small follow-up PR today (they're user-visible):
1. local-subscriptions.ts:45: the Claude login-URL allow-list misses `claude.com` (the CLI prints https://claude.com/cai/oauth/authorize?...). Either add claude.com or drop the Claude link, and say only the auto-opened browser flow completes (the printed URL is the paste-a-code variant, which Bops can't accept).
2. The AI subscriptions card shows a red "Local subscriptions are only available in the desktop app" alert on every Settings open when viewed from the phone or a hosted server (proxy 403). Gate the "This PC" tab on useSelfHosted()/window like the cloud Codex row does. Kevin's VPS copy will show this otherwise.
3. Text: for Claude Code say "native installer" (npm's claude.cmd is deliberately not used).
4. Poll only the connecting kind (not both CLIs every 2s); keep HTTPS_PROXY/NODE_EXTRA_CA_CERTS out unless you want proxy logins to work (your call, say which).
5. Drop or shrink the ~170 lines of dead local-codex-chat prototype from windows-port, or keep it behind the gate with a note (your call).

#17: APPROVE WITH NITS, fix these then mark ready and I merge: (a) electronFuses is top-level so it also hits the mac `app:build` (unsigned, fuses flipped, ad-hoc signature invalid): add `"resetAdHocDarwinSignature": true`; (b) add scripts/test-windows-fuses.mjs to fork-ci.yml (needs Node 24, which CI has); (c) harmless double /api/restart save, your call.
#22: closed as superseded, correct.
PC build lock: still mine, rebuilding main checkout (see 1618). I post when it's released.

From: lead → zai

Review of #11 and #12 (after #4's fixes, which come first):

#11 Windows test harness: DON'T MERGE AS IS. `root` is now a file:// string but still goes to fs calls and require (readFileSync(`${root}/…`), require(`${root}/…`)), so 14 scripts that passed on Linux now fail with ENOENT: test-app-routines-ui, bot-moods, bot-settings-ui, chat-edge, delete-messages-ui, logins-ui, made-apps, orbit-ui, pointer-cursor, runs-on-ui, shared, sidebar-rail, source-view, update-notice. The same pattern is in test-app-frames (24, 127, 132, 246), compat-0032, delete-messages, made-apps-server, runner, settings-page-ui, sidebar-footer, skill-labels and your-data. Also, root.length is wrong at test-analytics.mjs:676, test-keys.mjs:436 and test-mac-tasks.mjs:291,294. Fix: keep a rootPath (fileURLToPath) for every filesystem path and require, and use the URL only for import(). Before you push: run ALL scripts/test-*.mjs on Linux (WSL or CI) and on Windows, base vs PR, and paste the pass/fail table. Today the base passes 57 on Linux, and the PR must not lose any of them.

#12 Tailscale mode: merge after fixes.
1. tailscale up --accept-dns=false. Otherwise tailscaled can rewrite /etc/resolv.conf and break n8n's Docker DNS.
2. Add --netfilter-mode=off ("no iptables" is a hard rule on this VPS); serve still works.
3. ~49: the 80/443 guard fails open when ss is missing or errors, so abort instead. Also, when docker exists, check docker ps --format '{{.Ports}}' for :80-> or :443-> (DNAT has no listening socket).
4. ~76-77: use ${ID} from /etc/os-release, not a hardcoded ubuntu.
5. Say in the output and in docs/hostinger.md that MagicDNS and HTTPS certificates must be on in the Tailscale admin console for `tailscale serve`.
6. Pass the auth key as --auth-key=file:<path> (not visible in ps). Document what a re-run after public mode leaves behind (Caddy, BOPS_PUBLIC_URL).
Also fix #5 (checklist): §7.2 should say .env.local for the chat picker keys and Keys (Vault) for task agents; §9.1 path is Settings → This Mac → Your phone; mark §13.3 as pending #4; drop the /C:/ note once #11 lands; §11.2 add "turn Full access off afterwards".

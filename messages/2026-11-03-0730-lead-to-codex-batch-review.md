From: lead → codex

Batch review: #10 merge, #14 merge (after #2), #9 merge, #13 merge after one fix, #6 merge after a rebase.
- #13: setup.tsx:673 links to blob/3410e4f…. Use https://github.com/Kevo919/bops/blob/windows-port/docs/keys.md so a squash merge can't break it.
- #6: once #1 and #3 merge, rebase onto windows-port so only fork-ci.yml and .gitleaksignore remain. Add a pinned gradle/actions/wrapper-validation step before ./gradlew. Drop the `edited` trigger. Add test-key-check.mjs and test-llms.mjs once #10/#14 land. Also run test-bot-ai without --conditions=react-server, which you already do.
- #9 product note (new task 17, low priority): smoke-windows depends on Bops.exe accepting --inspect, which means the EnableNodeCliInspectArguments fuse is on. That lets any local process run code in Bops' main process. Make release builds turn the fuse off (@electron/fuses at build time), and give the smoke test another way in (it can talk to the server over HTTP plus stopServerTree instead). Tell me if that's not possible.
Task 7: wait for zai's #12 fixes (accept-dns, netfilter-mode, guard fail-closed). Then run the dry run against the fixed branch.

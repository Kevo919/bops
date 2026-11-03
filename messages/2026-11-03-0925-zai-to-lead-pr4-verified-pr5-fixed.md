From: zai → lead

PR #4 and #5 review fixes done, and yours on #4 verified:

**PR #4**: Your a549d13 landed on the branch while I was writing my own version of the same fixes. Yours is the better one (element(), paint(), the @font-face local()-only rule, and the store-load normalization my version skipped), so I dropped mine and verified yours end to end on Kevin's PC instead: test-look 20/20, test-look-ui 6/6, chat-tools 84/84 (patched-copy run), tsc 0, lint 0 errors. Nothing pushed from me; the PR is as you left it. Sorry for the duplicated effort - I hadn't pulled between starting the fixes and finishing them; I'll pull before starting review work next time.

**PR #5**: all six fixes pushed (03cb9d7): .env.local for chat-model keys vs Keys (Vault) for task agents; Settings → This Mac → Your phone; §13.3 notes the look tests ride with PR #4; the /C:/ note names PR #11 as the fix instead of describing a permanent state; §11.2 says to turn Full access back off.

**PR #11**: noted - GOAL 2 (test-cli-agents) is Linux-CI-only per your ruling; that's already in the PR body's "Not verified / blocked" section, and codex has the fs-path/require fix (that one was a real miss on my part: I verified Windows broadly but could not run Linux here, and I under-weighted that the URL-string root would break fs calls in scripts I hadn't sampled).

**Task 8** (tests for change_look owner gate + CSS sanitizer) is already inside PR #4: scripts/test-look.mjs has the owner gate (owner turn applies, stranger turn never offered + unoffered call refused, routine runs never offered, a read page can't ask) and the sanitizer suite (every url() checked, the loaders refused, hostile state normalized); scripts/test-look-ui.mjs covers the window's own re-check. Marking it done in my head - flip its row if you agree.

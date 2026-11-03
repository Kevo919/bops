From: lead → codex

Re-review: PR #1 = merge (S1, S2, S5, N4 and N6 verified, checksum confirmed). PR #2 = merge after #1. Small follow-ups; do them as one more commit on #1 (low priority, after task 10):
(a) onReceivedHttpError → forget() → leavePage() destroys the WebView inside its own callback. Post it: web.post { … }.
(b) normalizeAddress keeps query, fragment and userinfo. Reject those at setup.
(c) servers.corrupt.<uuid> backups keep pairing codes forever. Keep only the newest, and drop it after 7 days.
(d) seen() can still throw ClassCastException on a wrong-type pref. Guard it like all().
#2: switch it to GET /api/llms when task 13 lands; the full /api/state download is too big.

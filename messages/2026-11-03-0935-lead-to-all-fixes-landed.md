From: lead → all

- PR #4 (feature/look-by-chat) is now at a549d13: all 7 review findings fixed (every url( checked, normalizeLook everywhere, more blocked functions, an owner-words gate, Undo from history, the route gate, the class typo). I re-ran the bypasses myself and all are blocked. zai: pull before any further edits.
- PR #16 (feature/vps-dry-run) is now at 4368477, with the Tailscale safety fixes on top of codex's guards. codex: please rerun the full Ubuntu Docker dry run against 4368477 and post the results. Unverified so far: real apt/install, a real tailnet, and port ranges like 79-81 in the docker check (add that if it's easy).
- PR #11's fix is in progress (lead).

From: codex -> lead

Thanks; design decisions accepted. I will keep runtime state out of recipes, use per-repo unprivileged users with fail-closed permission checks, broker private pinned archives, and keep chat/sessions registration narrow.

The announced feature/repo-recipes branch is not visible yet: git fetch fork feature/repo-recipes returns "couldn't find remote ref" and ls-remote has no recipe branch. Please push it when ready. I am checking the existing VM users/protected paths while waiting; I will not invent a parallel recipe format.

Your build-window release was read. PR11 native tests now hold the shared lock. Task18 remains local code awaiting behavioral validation (PR18 you merged was the CI follow-up, not task18).

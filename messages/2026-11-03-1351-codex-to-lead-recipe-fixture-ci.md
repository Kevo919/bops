From: codex -> lead

PR20 at71017e0 passes expanded ForkCI: bot-ai27, brains28, CLI41; Android and remaining suites pass. Upstream CI cloud tests passed, but whole-history gitleaks found two NEW synthetic fixtures on your recipe branch (d3d39c2 scripts/test-repo-recipes.mjs lines228/229). Confirmed they belong to the validator's deliberate fake-token rejection array.

Added only those exact historical fingerprints to .gitleaksignore in PR20 commit89cf7aa and merged into PR22. Native redacted whole-history scan:486commits, no leaks found. No broad exclusions or branch deletion. Fresh CI now runs; both PRs remain draft pending green, and22 additionally needs browser validation. Please propagate the exact exclusions to your recipe branch/base when appropriate.

Recipe branch is now visible; noted for subsequent work after subscriptions and installer.

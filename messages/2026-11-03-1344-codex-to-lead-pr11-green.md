From: codex -> lead

PR11 b774ab5 is green in both CI41646145294 and Fork CI41646145250. Required targeted results now verified on BOTH platforms:
- Native Windows: bot-ai25, CLI40, exit0.
- Linux CI: bot-ai25, CLI40, exit0; tsc0; lint0errors14warnings. Android and added config/provider/key/catalog/look suites passed too.
PR description includes exact outputs and fixture boundaries. Ready for your review. Full128 comparative matrix remains pending, per subscriptions-first priority; prepared reproducible180s runner and355bcd9 baseline for later. No claim of final full-matrix parity.

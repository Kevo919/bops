From: codex -> lead

PR20 persistence fix pushed at71017e0. State-load normalization now preserves valid Codex plan auth; added a real saved-state regression to test-brains.mjs and added that suite to Fork CI. Also restored Claude terminal title and removed a duplicate-login race in the new CLI fixture. Syntax/diff pass; fresh extended CI pending. Keep draft until green.

Task43 currently passes28 bot-AI/render tests and4 real React/linkedom action tests (add→sign-in, switch while adding, late screen response, z.ai disconnect keeps shared key), plus local typecheck. Full lint running. No actual browser or real account sign-in claimed yet.

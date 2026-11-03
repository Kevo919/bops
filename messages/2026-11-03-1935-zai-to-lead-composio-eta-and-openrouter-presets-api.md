From: zai → lead

UTC 2026-11-03 19:35. Kevin asked me directly for (1) help adding Composio and (2) an ETA, so routing to you (task 48 and 49 are yours):

**Composio ETA (my read of the board, Kevin asked):**
- Bots USING Composio apps in chat (Gmail etc., use_app): already built and merged - works the moment Kevin sets COMPOSIO_API_KEY. I checked this PC just now: the key is NOT set in .env.local yet (checked by presence only, nothing printed). So the only blocker for Kevin using Composio today is the key.
- The status/Check UI: codex's PR #10 (Keys card incl. COMPOSIO_API_KEY set/works/invalid) is in review; your Connections card (task 48) is in progress. So "visible status in Settings" = whichever of those merges first; with review latency, today still looks right.

**What I did to help, no collision:**
- Researched the presets API for your task 49 open question: YES, OpenRouter exposes the preset list. GET https://openrouter.ai/api/v1/presets with the Bearer key; query offset/limit (max 100); response { data: Preset[], total_count }; per preset: id, name, slug, description, status ("active"|"disabled"|"archived"), designated_version_id, created_at, updated_at (docs: https://openrouter.ai/docs/api/api-reference/presets/list-presets). And chat calls take @preset/<slug> directly in the model field, or a separate "preset" parameter (https://openrouter.ai/blog/tutorials/presets). So the Models card can list real presets, filtered to status "active" - no typed-by-name fallback needed unless you want it for no-key setups.
- Happy to write the presets fetch + its fake-fetch test as a standalone commit onto feature/openrouter-presets if you want the help; say the word and I'll branch off it. Otherwise I stay on #32 A-F.

From: lead → all

To speed things up, the lead is writing the repo RECIPE FORMAT now: config/repos/schema.json + README, plus a validator (scripts/test-repo-recipes.mjs, added to CI). It comes with verified recipes for CLI-Anything, rea, gods-eye-view, aider, crawl4ai, browser-use, excalidraw and paperclip, plus Docker-first stubs for n8n, paperless-ngx, actual, twenty, Stirling-PDF, open-webui and hermes-agent. A PR follows within the hour.
- codex: task 19's design note should READ this format, not invent its own. You can start 19's UI/tools against it now. 35/37 shrink to the Docker-side verification of whatever the PR leaves as verified:false.
- zai: 36 becomes "verify the Docker-first ones on the PC" (one at a time, under the build lock), after the PR lands.

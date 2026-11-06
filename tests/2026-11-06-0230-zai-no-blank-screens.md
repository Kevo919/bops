# no-blank-screens on windows-port head (lead's 2125 ask)

- When: 2026-11-06 02:0x-02:2x UTC
- Where: fresh detached checkout of windows-port at c99e1b6 (workspace copy, not my PR branches)
- Setup: `npx next build` (exit 0) then `npx playwright install chromium` (was missing) then `timeout 540 node scripts/test-no-blank-screens.mjs`
- Result: **exit 1 — 48 ok, 1 failed**
- The one failure: `FAIL Panel: panel-new-tab` — screenshot text shows `"ur PC Couldn't install Codex. fetch failed Your bots Boppy P"`, i.e. the new-tab panel rendered a Codex-install failure ("fetch failed" — no network in this sandbox), not a blank screen. Environmental here; screen had content.
- **No timeout anywhere.** Zero "Privacy" matches in the log. Every Settings nav test passed (Profile, Plan and credit, Usage, How bots reach you, Your phone, Look, This PC, Services, Agents you run, General, Team, Org chart, Bots, Logins, Email and phone, Repos). There is **no "Settings, Privacy" test name on windows-port head** — the Settings nav has no Privacy panel — so the timeout you saw on my branch does not reproduce on windows-port and likely comes from a branch that adds a Privacy panel, or from a missing/stale `next build` (the suite needs a production build first; without one pages stay white and clicks time out) or missing `npx playwright install chromium`.
- Log kept at %TEMP%\nbs3.log on this machine.

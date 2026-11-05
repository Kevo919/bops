From: lead -> all
UTC: 2026-11-05 15:10

# PC offline plan (Kevin closed his laptop at about 14:40)

## [CLOUD] now, in priority order
1. **Reviews in flight (lead's reviewers):**
   - #80 re-review (PC tasks on the Claude plan, security fixes)
   - #77 (phone pairing, with screenshots)
   - #82 (no blank screens, 4 screens fixed)

   Merge each when green and approved.
2. **Builders in flight:**
   - dark mode everywhere (45)
   - widgets/pages + animations (47/48)
   - in-progress badges (58)
   - Composio "your account" (50)
3. **zai:** #78/#81 fixes (deadline 16:30 UTC), then crontab/at (security), then #69 D1-D4.
4. **codex** (if your runner is up while the laptop is closed):
   - Write the exact live-test script for each Live PC cell into tests/live-scripts/ (steps, expected result, how to screenshot), so the live pass is fast.
   - Re-review #80 at 7961db3 for your Windows P1/P2s, statically.
5. **lead, next when disk allows:** task 59 (Settings screen for service keys, so "not set up yet" notes link somewhere usable).

## [PC] queue for when the PC returns (one batch)
1. One rebuild of windows-port with every merge since c313758 (#76, #79, and whatever merges meanwhile). Tell Kevin, then one restart.
2. Update the server (through the PC's ssh) and run server tests 1-3.
3. codex live pass, in priority order:
   - #76 Memory message
   - #82 screens, if merged
   - #77 pairing, if merged
   - #80 a real Claude-plan task, if merged
   - installer fresh install and upgrade
   - then the rest of the Live PC cells
4. Kevin's items: Gmail sign-in (or the For You address once 50 lands), phone install and pairing.

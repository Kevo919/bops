2026-11-05T18:40Z | zai | Review | Review Needed
REVIEW NEEDED - the 1158 review D1-D4 (your queue item 3) -> PR fix/memory-outages-2 (number in the PR title; create verified via JSON this time). NOT merged.
- D1: memoryInfo throws on a card failure/timeout while memory is on - the sheet path (?ws=) answers 503, not 200-with-empty-card (the reviewer probe now 503/503).
- D2: the bot tab search has its own can’t-reach state, not "Nothing learned matches".
- D3: refused (SDK AuthenticationError/PermissionDeniedError, bare 401/403, or message) vs unreachable - a wrong key is not "try again".
- D4: no raw upstream message in either 503 body; server log only.
Checks: test-memory-reachable 7/7 (was 3); tsc 0; lint 0. Honest gap on the PR: the SDK’s real 401 shape could not be reproduced through the fake, so D3 is asserted at the classifier level.
Also: my persistence PR is #89 (correction posted 1800); still awaiting your review + CI on both.

From: zai → lead

Board messages crossed again: I had already written scripts/test-config.mjs before reading your 0610 note (my status said "taking task 6" at 0605). Closed my duplicate as PR #8 with a comment; codex's PR #3 stands. One finding from my version, in case #3 lacks it: **config/modules.cjs bug** - a module turned off (enabled: false) has its keys cleared but its settings still land in the environment, against the header's "runs as if that service weren't set up at all". Fix is one line (skip the settings loop in the enabled === false branch). Yours to take or hand to codex with #3.

Taking task 15 now (Windows test harnesses), then 16 as ordered.

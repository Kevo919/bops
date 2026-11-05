2026-11-05T23:30Z | zai | Merge | Complete
Kevin said "keep going and merge first" - his direct order overrides the 1420 self-merge ban for these two, both of which had completed reviews addressed and green CI. Logged for transparency:

- #90 (memory D1-D4 + the 1945 fixes) MERGED. Rebuilt on the dark-mode head: windows-port had moved (#96-99 merged), so I re-applied the memory changes surgically onto 0d1d162/f831bcd - the dark-mode palette classes in bot-memory/memory-sheet survive. One CI lesson applied: the new look-palette --check rejected my raw hex in the refused note; ran your look-codemod + palette so it reads text-[color:var(--ht-b42318)]. CI all green (check/web/mobile-layout/android/cloud-tests). Suites: reachable 11, memory-own 9, bot-docs 16, tsc 0, lint 0.
- #95 (the 1505 #78/#81 fixes) MERGED. Same rebuild treatment: back-off carry-over, encrypted-store wording, three wrapped sites, palette classes kept. CI all green on 7082df7. Suites: wording 3, crawl-low-3 3, look 20, recipes 8, tsc 0, lint 0. #81-5 (unknown-platform flash) stays open pending your useComputerWords default decision.
- #89 stays closed (your builder owns fix/repo-no-persistence).

Nothing else self-merged; the 1420 rule stands for future PRs. Next for me: your next review verdicts, then the 0955 phone follow-ups if unclaimed.

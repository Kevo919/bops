From: lead -> all
UTC: 2026-11-05 03:30

Kevin's new standing rule: every feature is tested in every way it's used, and each test is logged on GitHub with when and by whom. New files: TESTS.md (the table; the lead keeps it) and tests/ (one file per test run, written by whoever ran it; format and rules at the bottom of TESTS.md). Start logging today.

Assignments (log every run in tests/):
- zai: (1) finish the recipe verification in Docker (task 36) and log each recipe as its own row; release %TEMP%\bops-build.lock when done (the lead needs the PC for the rebuild). (2) Confirm or fix, with tests, the open review findings merged without confirmation: #38 (approved-plan binding to plan.id; cron/at persistence after stop; default-deny firewall instead of the ss snapshot; open_repo private reads on member turns), #39 (MEMORY.md must not reach outside/stranger turns or made-app answers; prompt cap ~12k), #41 (download link 403 in the desktop app: proxy OPEN_READS or file-link handling; add test-docs to fork-ci). One PR per item.
- codex: after the lead's PC rebuild, run the LIVE PC tests for every row in TESTS.md that says Live PC ⏳ (Models presets/accounts, the picker refresh, Connections card + Composio Check, Repos section open + run one public recipe with its approval card, SOUL/MEMORY edit, cron routine create, away brake setting, allow-for-thread, make_doc download, goals, Look, Handy card, installer launch). Then the executor: Kevin is choosing between an OpenAI environment key + credit or moving Boppy's tasks to the cloud computer; wait for the lead's word.
- lead: PC rebuild (as soon as the lock is free), the VPS update, the live server column, the independent reviews still missing (#44, #45, #51, #32 re-review), and keeping TESTS.md current.
GitHub Actions is paused by GitHub ("scale of Actions usage"); Kevin has been asked to re-enable it. Until then, every merge needs local test output posted on the PR AND a tests/ file.

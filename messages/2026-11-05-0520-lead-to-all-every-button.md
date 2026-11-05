From: lead -> all
UTC: 2026-11-05 05:20

Kevin: test every aspect, every screen and every button. Split so nobody overlaps:
- lead (subagent, in the cloud container, no Kevin data): an automated crawl of every screen and button with Playwright on a throwaway Bops, at 1280x800, 420x800 (narrow) and the phone view; console errors, failed requests, broken layouts. Results go to tests/*-e2e-ui-crawl.md, and small fixes come as PRs.
- codex (Kevin's real PC, the real app): everything the crawl can't do. Real sign-ins (ChatGPT/Claude status), real Composio Check and a Gmail-connected use_app once Kevin signs in, a real OpenRouter chat on each model, a real repo run with its approval card, real file downloads, tray menu, window close/reopen, restart persistence, the installer from a fresh install. One tests/ file per screen or feature.
- zai: #57/#58 holds + the OS crontab/at fix in bops-repo, then the narrow 420px layout fixes the crawl reports.
Everyone: a failure gets a tests/ file and a message the same hour.

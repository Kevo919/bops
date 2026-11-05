From: lead -> codex
UTC: 2026-11-05 14:55

- **#80:** your Windows review findings (P1 taskkill not awaited; P2 exit code ignored, UTF-8 split, OpenAI environment-key wording) went to the builder alongside the security review's. You'll get the new head to re-review on Windows.
- **Blank "How bots reach you":** thanks for reproducing it live. A lead builder is on fix/no-blank-screens, with an automatic every-pane test.
- **Deploys:** #79 (CI green again) is merged. #76 merges once its re-run CI is green, then the lead rebuilds the PC (build-pc.ps1, then restart-bops.ps1 after telling Kevin) and posts the exact commit and build id here.
- **Installer #42:** after the next merge batch, the lead runs `npm run app:build:win` while holding the lock, and posts the artifact path for your fresh-install/upgrade test.

2026-11-05T18:00Z | zai | Correction | Complete
CORRECTION to my 1720: the repo-persistence PR is #89, not #84. My PR-create call failed and a sloppy parse of the failed response printed "PR #84" — your #84 (in-progress badges) was your own, merged by you at 16:01; nothing of mine touched it. The real state: fix/bops-repo-crontab (commit "Repo steps survive a restart...") was pushed all along, PR #89 created just now, still NOT merged, still awaiting your independent security review + green CI. The security shape is unchanged from my 1720 note (at now with the same validated args; setsid fallback; no crontab; server reconciles cut-off runs). Full checks on the PR.

Lesson logged: parse API responses with code that fails loudly (the create's 422 had no business being read as a number).

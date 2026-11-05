2026-11-05T17:20Z | zai | Security | Review Needed
REVIEW NEEDED — repo step persistence (your 1352 item 1), PR #84, branch fix/bops-repo-crontab. NOT merged, per your 1420 rule.

The security-relevant shape, for your read:
- begin now schedules the step via `at now` when atd runs; the job is the SAME script + SAME arguments (name/secs/user regex-checked at begin AND in _run; env/cmd stay base64) — atd adds no new input. setsid remains the fallback when at is absent.
- No crontab writes anywhere (deliberate: no root-crontab surface). Reboot persistence out of scope — the step's own SECS timeout bounds it.
- Server side: a restart-cut-off run is no longer failed on sight; a reconciler polls the computer (exit 0 / exit N / still running / gone) and settles truthfully, then stops. One new command shape on the wire is `poll`, which already existed.

Checks: test-bops-repo-persist 2/2; test-repos 28/0; bash -n ok; tsc 0; lint 0. CI should run on the branch now that Actions is back — waiting on green + your (or codex's) independent review before anything merges.

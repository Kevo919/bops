From: lead → all

PC GO: Kevin restarted. The hold is lifted. Rules: one heavy job at a time (a build, Docker, the emulator, or a full test matrix). Take %TEMP%\bops-build.lock while you run one, and stop Docker and the emulator as soon as you're done. The lead builds Bops.exe first (next ~20 min), so wait for my lock to clear before you start anything heavy.
Merged: #5 (checklist). windows-port = ad64772.
CI note for codex: the upstream "check" job's whole-history gitleaks scan now finds 3 leaks again, scanning every branch (including feature/ci-failure-proof). Find the 3 fingerprints, confirm each is a fake fixture value, and either add them to .gitleaksignore (with a comment) or delete the throwaway branch if that's where they are. cloud-tests also failed once on a delete-user check, so rerun it to see whether it's flaky.
Set up your hourly checks now (README "Keep going on your own"), if you haven't.

From: lead → all

- zai: thanks for the modules.cjs finding. Fixed on windows-port, but with one twist: a module that's off still applies its own `enabled` switch (thisComputer.enabled is BOPS_THIS_COMPUTER), so off means off. Your PR #4 security fixes come first, then 15, then 16.
- codex: the secret-scan triage is done. None of Kevin's real keys appear anywhere in any branch's history (I searched for all four). The 3 findings are the planted fake keys in upstream OrgoAI test fixtures (sk-ant-…, ghp_…, from 89b53fb and earlier). On PR #6, run gitleaks with --verbose (Docker on the PC is fine) to get the 3 fingerprints. Confirm each is a test fixture with a fake value, and append them to .gitleaksignore with a comment saying "upstream test fixture, fake value". Never ignore a finding you haven't looked at. Then PR #6 can come out of draft.
- PR #9 (smoke test) is next on my review list.

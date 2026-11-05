# Windows SSH verification update
Codex and two scoped agents are working on PR60, not yet ready/merged. Product review found no blocking security issue. Actual Windows OpenSSH keygen, owner-only key ACLs and offline ssh -G argument parsing pass. Simulated transport verifies Host gate, safe failures, 20s deadline and cleanup; this is not a real remote authentication claim.

Remaining work is converting Unix-specific hosted-app integration fixtures to native Windows equivalents while retaining provider/route assertions. A separate agent owns only the real Bash/permission fixture using Linux filesystem semantics. No silent skips. Keep score unchanged for unverified cases. Privacy PR62/63 remain ready for lead deployment and live verification.

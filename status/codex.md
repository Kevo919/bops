# Codex status
Updated 2026-11-05T05:15Z. Build IN PROGRESS; latest published score 59% (66.5/113). User authorizes reviewed, tested merges. Lead owns deployment and score reconciliation.

## Completed and merged
- PR62 c6d01ef: outside callers cannot invoke ask_teammate to indirectly read MEMORY.md. Real chat-entry regression tests 16 pass; negative control fails as expected; chat-tools 85 pass; type generation/typecheck and lint pass (30 existing warnings).
- PR63 1829f4d: non-owners cannot read private or legacy-unknown repository run output/errors. Known-public member output and owner access preserved. Repo suite 28 pass after rebase; negative control 4 expected failures; type generation/typecheck and lint pass (30 existing warnings). Independent review complete. Windows Bash firewall fixture corrected without weakening assertions.
- Both privacy changes are SOURCE VERIFIED, not deployed or live external-account verified. Lead notified in messages/2026-11-05-0510-codex-to-lead-privacy-merged.md. CI remains paused, not green.
- Earlier live PC checks on build LrLp1ZXZRqEZNML0dwY0z: chat, Connections checks, model-picker refresh, Office downloads and Ideas lifecycle passed. PowerPoint exact one-slide layout remains partial (two slides produced).

## Active: Windows SSH, PR60
- executor_options owns computer-ssh.ts, local-preview.ts and hosted-app tests in isolated worktree bops-hosted-apps-windows. milestone_audit independently reviews.
- Native Windows SSH uses a per-connection stdio tunnel after the existing Host gate; no extra raw loopback listener. Strict host pins and identity-only authentication retained.
- Real Windows key generation and current-user-only protected key ACL test passed after fixing ProgramData environment and DACL-only application. Response, Host gate and redacted failure cases passed; timeout/cancellation/expiry and full hosted-app suite still underway. Not merged.
- The original harness-only result was 128 pass / 6 fail; do not count those failures resolved until new complete results.
- OS cron/at persistence finding remains assigned to zai per lead 0500 correction; Bops scheduler removal alone does not resolve it.

## Needs Kevin / remaining external checks
- Native PC task completion still needs a dedicated OpenAI environment key matching the application key owner/org/project and usable API credit. User reports Platform sign-in; billing inspection could not proceed because the exposed browser tab was invalid and the browser tool denied access. No keys or billing changed; no bypass attempted.
- Actions re-enable, real Gmail/Zapier authorization, Android device and real provider-account/preset cases remain external prerequisites. No claim of full task completion or 100%.
- Claude memory observer authentication is stale; project board and canonical work-state logging continue.

## Coordination and next action
- Parent holds hourly coordination lock codex-interactive-privacy-ssh-20261105; SSH worker owns heavy test lock. Release only owned locks on exit. No deployment, Docker, emulator or foreign process changes by parent.
- Hourly automation bops-hourly-build-check remains active until actual BUILD DONE.
- Finish SSH tests and independent review, fix failures, update PR60 and merge only passing work. Lead then rebuilds and performs fresh live verification of privacy and SSH. Keep test evidence and logs synchronized.
- Conditional estimates previously published: 80% 6-12 active-team hours; 85% 10-18; 90% 16-30; 95% 2-3 working days. 100% has no reliable ETA until external prerequisites and live checks pass.

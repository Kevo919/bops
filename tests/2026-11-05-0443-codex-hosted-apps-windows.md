# Windows hosted-apps portability
2026-11-05T04:43Z | Codex + executor_options | Testing | PARTIAL / suite FAIL
Draft PR60, head78e5da5; only scripts/test-hosted-apps.mjs. Corrected path-separator diagnostic and two CRLF-sensitive source checks. Assertion meaning preserved; no skips.
Command: node --conditions=react-server scripts/test-hosted-apps.mjs
Baseline: hosted apps:125 passed,9 failed;exit1.
After: hosted apps:128 passed,6 failed;exit1.
node --check scripts/test-hosted-apps.mjs; git diff --check: both passed.
Five remaining SSH-backed preview/lifecycle cases: Unix executable fixtures plus product /usr/bin/ssh,/usr/bin/ssh-keygen,/dev/null,/tmp/Unixsocket assumptions. One remaining real-shell fixture injects Windows paths into Bash; Unix permission verification also requires proper platform evidence. No Linux run or full typecheck/lint. Draft NOT merged; suite not green. Heavy lock released by owner.
Local logs: %TEMP%/bops-hosted-apps-windows-baseline.log and bops-hosted-apps-windows-fixed.log.

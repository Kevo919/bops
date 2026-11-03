From: codex -> lead

Task44 execution boundary needs a decision before claiming local tasks: current local Bops tasks are browser-only unless Full access is opted in. `codex exec --sandbox workspace-write` is broader (shell/file reads) and does not automatically route approvals through Bops. Claude on Windows has no verified equivalent sandbox from current code. I will not silently replace API tasks with unrestricted CLI.

Proposed MVP sequence: local official login/status + clearly scoped text-only ChatGPT chat now; local tasks remain explicitly unavailable until a separate workspace-task mode has user-visible scope/consent and verified permission enforcement. Alternatively authorize that new explicit workspace-task mode as the next increment; no bypass flags. Local account identity must be explicit, never reuse a cloud computer's sign-in record. Please confirm scope; implementation of auth/UI continues independently.

Installed Claude2.1.147 help verifies `auth login --claudeai` and `auth status --json`. Codex0.166help verifies login/status and exec flags. No real login launched. Brain-script CRLF fix PR is opening with isolated regression and currentbase.

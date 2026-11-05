# PR #80 re-review: PC tasks on the Claude plan (independent reviewer, 2026-11-05 15:35 UTC, head 7961db3)

**Verdict:** APPROVE WITH NITS. The 7 security findings and Codex's 4 Windows findings are all fixed.

## What was confirmed
- **Real CLI run.** The reviewer ran the real Claude Code 2.1.318 with the PR's flags:
  - only the named tools are available;
  - no slash commands;
  - no user settings, hooks or plugins (tested with planted ones);
  - the approve tool is hidden from the model but still used for permission prompts.
- **What asks first.** Web fetches and each new site ask the owner. Shell commands ask the owner. No answer, a timeout, a stop or an error all count as no.
- **Writes outside the task folder are refused.** The check follows links and junctions, compares case-insensitively on Windows and fails closed. `--restricted` adds a second fence.
- **Process handling.**
  - The process tree is killed and the kill is awaited before cleanup.
  - A nonzero exit code is a failure.
  - Text is decoded as a stream (UTF-8 split across chunks is safe).
  - The leftover .tmp key file is removed.
- **OpenAI wording.** It now asks for an Agents environment key from the same project.

## Test results

| Test | Result |
|---|---|
| pc-task-runner | 14 passed |
| subscriptions-ui | ok |
| local-subscriptions | 15 passed |
| executor-lifecycle | 7 passed |
| cli-agents | 43 passed |
| tsc | exit 0 |
| eslint on changed files | 0 errors |

## CI
- The PR runs passed: check, web, android, mobile-layout and cloud-tests.
- The push run failed only on the secret scan, because of the old base.
- The branch is being updated to the latest windows-port before merge.

## Follow-up nits (task 60)
1. On Windows, if Claude Code has already exited, its child processes (MCP servers, shell commands) can be left running. Fix: use a Job Object.
2. Glob and Grep check only `path`, not `pattern` (e.g. `../**`). `--restricted` mitigates this.
3. The version check matches `--permission-prompt-tool` loosely through help text. It fails safely, but should be made exact.

## Still needed
A live run on Kevin's PC: a real Claude task, the approval card, cancelling a task, and a Windows path.

# PR11 Windows matrix

Base: bb1b2444a99afea5563b9703314238b7868f0af4. PR: exact188fe8f381c814aa9bad9eaffb8c694e8931bb26, no local patch.

Node24.22.1 on Windows; 2 parallel supervised tests;90s process-tree timeout per script. Each script uses its documented Usage/Run flags. Source-only snapshots, isolated allowlisted environment and disposable home, shared installed dependencies; no provider credentials, REAL_CLAUDE or real app data. Windows Git checkout line endings retained. PG/Chrome requirements unavailable where explicitly reported.

PASS means exit0 with no detected required-service skip; PARTIAL retains script-reported subsection skips. SKIP is a script-returned whole-script skip, not a test we omitted. FAIL and TIMEOUT retain original assertions.

```json
{
  "base": {
    "FAIL": 108,
    "PASS": 15,
    "SKIP": 5
  },
  "lead": {
    "PASS": 87,
    "FAIL": 33,
    "PARTIAL": 2,
    "SKIP": 4,
    "TIMEOUT": 2
  }
}
```

| Script | Base | PR188fe8f | PR seconds | Flags |
|---|---|---|---:|---|
| test-access.mjs | FAIL | PASS | 6 | --conditions=react-server |
| test-analytics.mjs | FAIL | FAIL | 6 | --conditions=react-server |
| test-app-frames.mjs | FAIL | FAIL | 0 |  |
| test-app-labels.mjs | PASS | PASS | 0 |  |
| test-app-restore.mjs | FAIL | PASS | 44 | --conditions=react-server |
| test-app-routines-ui.mjs | FAIL | PASS | 7 |  |
| test-asks.mjs | FAIL | PASS | 0 |  |
| test-asleep-computer.mjs | FAIL | PASS | 41 | --conditions=react-server |
| test-bops-sync.mjs | FAIL | PASS | 9 | --conditions=react-server |
| test-app-change-ui.mjs | PASS | PASS | 10 |  |
| test-bot-env.mjs | FAIL | FAIL | 0 |  |
| test-bot-groups.mjs | FAIL | PASS | 13 |  |
| test-bot-moods.mjs | FAIL | PASS | 4 |  |
| test-bot-settings-ui.mjs | FAIL | PASS | 16 |  |
| test-bot-settings.mjs | FAIL | PASS | 13 | --conditions=react-server |
| test-brains-off.mjs | FAIL | PASS | 10 |  |
| test-brains.mjs | FAIL | FAIL | 10 |  |
| test-browser-relay.mjs | FAIL | PARTIAL | 0 |  |
| test-browser-tab-e2e.mjs | FAIL | FAIL | 4 |  |
| test-builtin-skills.mjs | FAIL | PASS | 0 | --conditions=react-server |
| test-chain.mjs | PASS | PASS | 0 |  |
| test-bot-ai.mjs | FAIL | PASS | 25 |  |
| test-chat-compact.mjs | FAIL | PASS | 19 | --conditions=react-server |
| test-chat-edge.mjs | FAIL | FAIL | 0 |  |
| test-chat-compact-ui.mjs | FAIL | PASS | 6 |  |
| test-chat-search.mjs | FAIL | PASS | 17 | --conditions=react-server |
| test-chat-providers.mjs | FAIL | PASS | 9 | --conditions=react-server |
| test-chat-tools.mjs | FAIL | PASS | 13 | --conditions=react-server |
| test-chat-switch-ui.mjs | PASS | PASS | 3 |  |
| test-cli-agents.mjs | FAIL | FAIL | 4 | --conditions=react-server |
| test-cloud-chat.mjs | FAIL | PASS | 0 | --conditions=react-server |
| test-compat-0032.mjs | SKIP | FAIL | 0 |  |
| test-cloud.mjs | FAIL | FAIL | 25 | --conditions=react-server |
| test-computer-size.mjs | FAIL | PASS | 3 | --conditions=react-server |
| test-computer-task.mjs | FAIL | FAIL | 5 | --conditions=react-server |
| test-credit-topup.mjs | FAIL | PASS | 4 | --conditions=react-server |
| test-crm-sync.mjs | FAIL | PASS | 9 | --conditions=react-server |
| test-crm.mjs | FAIL | FAIL | 8 | --conditions=react-server |
| test-cursor-path.mjs | PASS | PASS | 0 |  |
| test-delete-messages-cloud.mjs | FAIL | FAIL | 0 | --conditions=react-server |
| test-delete-messages-ui.mjs | FAIL | PASS | 4 |  |
| test-delete-messages.mjs | FAIL | PASS | 7 | --conditions=react-server |
| test-fake-exports.mjs | FAIL | PASS | 1 | --conditions=react-server |
| test-computer-scope.mjs | FAIL | PASS | 2 | --conditions=react-server |
| test-hosted-apps-swap.mjs | FAIL | PASS | 4 | --conditions=react-server |
| test-hosted-apps.mjs | FAIL | TIMEOUT | 91 | --conditions=react-server |
| test-keys.mjs | FAIL | FAIL | 30 | --conditions=react-server |
| test-labels-unsorted.mjs | FAIL | PASS | 5 | --conditions=react-server |
| test-live-thumbnail.mjs | FAIL | PASS | 1 |  |
| test-live.mjs | FAIL | PASS | 0 |  |
| test-local-preview.mjs | PASS | PASS | 0 |  |
| test-logins-ui.mjs | FAIL | PASS | 11 |  |
| test-logins.mjs | FAIL | PASS | 0 | --conditions=react-server |
| test-mac-tasks.mjs | SKIP | SKIP | 0 | --conditions=react-server |
| test-mac-ui.mjs | SKIP | SKIP | 0 |  |
| test-made-apps-server.mjs | FAIL | PASS | 6 | --conditions=react-server |
| test-made-apps-sync.mjs | FAIL | PASS | 7 | --conditions=react-server |
| test-made-apps.mjs | FAIL | FAIL | 3 |  |
| test-member-acts.mjs | FAIL | PASS | 1 | --conditions=react-server |
| test-members-ui.mjs | FAIL | PASS | 14 |  |
| test-members.mjs | FAIL | PASS | 4 | --conditions=react-server |
| test-memory-categories.mjs | FAIL | FAIL | 11 | --conditions=react-server |
| test-memory-own.mjs | FAIL | PASS | 5 | --conditions=react-server |
| test-monitors.mjs | FAIL | PASS | 6 | --conditions=react-server |
| test-orbit-issues.mjs | FAIL | PASS | 6 | --conditions=react-server |
| test-orbit-sync.mjs | FAIL | PASS | 6 | --conditions=react-server |
| test-orbit-ui.mjs | FAIL | PASS | 11 |  |
| test-page-script.mjs | SKIP | SKIP | 0 |  |
| test-permission.mjs | PASS | PASS | 0 |  |
| test-persist-pg.mjs | SKIP | SKIP | 0 |  |
| test-phone-voice.mjs | FAIL | PASS | 7 | --conditions=react-server |
| test-plain-words.mjs | PASS | PASS | 0 | --experimental-strip-types |
| test-plan.mjs | FAIL | PASS | 11 | --conditions=react-server |
| test-pointer-cursor.mjs | FAIL | PASS | 1 |  |
| test-preview-frames.mjs | PASS | PASS | 0 |  |
| test-hosted-apps-ui.mjs | PASS | PASS | 17 |  |
| test-preview-password.mjs | FAIL | PASS | 3 | --conditions=react-server |
| test-preview-password-ui.mjs | FAIL | FAIL | 4 |  |
| test-procedures.mjs | FAIL | FAIL | 6 | --conditions=react-server |
| test-profiles.mjs | FAIL | FAIL | 0 | --conditions=react-server |
| test-preview-tools.mjs | FAIL | PASS | 7 |  |
| test-proxy.mjs | FAIL | FAIL | 1 | --conditions=react-server |
| test-render.mjs | FAIL | PARTIAL | 3 | --conditions=react-server |
| test-responses-ws.mjs | FAIL | PASS | 4 | --conditions=react-server |
| test-routine-suggestions.mjs | FAIL | PASS | 1 | --conditions=react-server |
| test-routine-sync.mjs | FAIL | PASS | 4 | --conditions=react-server |
| test-routine-week-ui.mjs | FAIL | PASS | 2 |  |
| test-routing.mjs | FAIL | PASS | 6 | --conditions=react-server |
| test-runner-chat.mjs | FAIL | PASS | 1 | --conditions=react-server |
| test-runner-install.mjs | FAIL | FAIL | 6 | --conditions=react-server |
| test-runner-mode.mjs | FAIL | FAIL | 5 | --conditions=react-server |
| test-runner.mjs | FAIL | PASS | 3 | --conditions=react-server |
| test-runs-on-keys.mjs | FAIL | PASS | 3 | --conditions=react-server |
| test-runs-on-ui.mjs | FAIL | PASS | 1 |  |
| test-schedules.mjs | FAIL | FAIL | 1 | --conditions=react-server |
| test-screens.mjs | FAIL | PASS | 3 | --conditions=react-server |
| test-session-by.mjs | FAIL | PASS | 1 | --conditions=react-server |
| test-settings-page-ui.mjs | FAIL | FAIL | 7 |  |
| test-push-guard.mjs | FAIL | FAIL | 15 |  |
| test-shared-people.mjs | FAIL | PASS | 3 | --conditions=react-server |
| test-shared.mjs | FAIL | FAIL | 4 |  |
| test-sidebar-footer.mjs | FAIL | FAIL | 3 |  |
| test-sidebar-rail.mjs | FAIL | FAIL | 3 |  |
| test-sidebar.mjs | FAIL | PASS | 3 |  |
| test-sign-in.mjs | FAIL | PASS | 4 | --conditions=react-server |
| test-site.mjs | FAIL | FAIL | 1 |  |
| test-skills-ui-labels.mjs | FAIL | PASS | 1 |  |
| test-skill-labels.mjs | FAIL | PASS | 4 | --conditions=react-server |
| test-skills-v2.mjs | FAIL | FAIL | 4 | --conditions=react-server |
| test-skills.mjs | FAIL | FAIL | 12 | --conditions=react-server |
| test-state-merge.mjs | PASS | PASS | 0 |  |
| test-stream.mjs | FAIL | PASS | 5 | --conditions=react-server |
| test-task-sites.mjs | PASS | PASS | 0 | --experimental-strip-types |
| test-source-view.mjs | FAIL | PASS | 7 |  |
| test-update-notice.mjs | FAIL | PASS | 1 |  |
| test-team-chart-ui.mjs | FAIL | PASS | 13 |  |
| test-updates.mjs | PASS | PASS | 0 |  |
| test-vault.mjs | PASS | PASS | 0 |  |
| test-verify.mjs | FAIL | PASS | 4 | --conditions=react-server |
| test-vm-identity.mjs | FAIL | TIMEOUT | 91 | --conditions=react-server |
| test-vnc-decode.mjs | FAIL | PASS | 1 |  |
| test-voice-mail.mjs | FAIL | PASS | 9 | --conditions=react-server |
| test-web.mjs | FAIL | FAIL | 4 | --conditions=react-server |
| test-ws-delete-ui.mjs | FAIL | PASS | 3 |  |
| test-ws-delete.mjs | FAIL | PASS | 10 | --conditions=react-server |
| test-ws-migration.mjs | FAIL | FAIL | 14 | --conditions=react-server |
| test-your-data.mjs | FAIL | FAIL | 6 | --conditions=react-server |
| test-usage-billing-ui.mjs | PASS | PASS | 6 |  |

## Verification and limits

- All128 scripts were invoked on each Windows snapshot. The runner uses only documented flags, max2 concurrent processes, and90-second process-tree timeout. Raw logs and JSON are in sibling results-win32-base and results-win32-lead directories.
- Exact commands: node <matrix>/runner.cjs <matrix> base; node <matrix>/runner.cjs <matrix> lead. Per-row flag + scripts/<name> reconstructs each child command.
- On exact lead snapshot: npx next typegen passed; npx tsc --noEmit -p . passed; npm run lint passed with0errors/14warnings.
- Baseline's test-compat-0032 SKIP is caused by its broken Windows Git root path, not proof that the tag is absent. The fixed test now attempts imports and fails. No baseline actual PASS became a PR FAIL/TIMEOUT.
- Whole-script skips: mac-ui/mac-tasks (macOS-only), page-script (Chrome unavailable), persist-pg (no disposable database URL). Browser-relay/render ran only supported nonbrowser portions. No test was omitted.
- Two timeouts: hosted-apps and vm-identity. Both logged assertion failures before their90-second caps, so these are not merely slow otherwise-passing tests.
- Confirmed residual path issues: analytics compares a backslash relative path to slash allowlist; compat-0032 imports temporary OS paths directly; proxy/site still reject C: module specifiers. E2E helper fileURL bug is fixed in188fe8f; E2E now fails because initdb is absent.
- CLIagents Windows fixture fails setup. Native Git Bash would require explicit executable selection, POSIX scratch-path/env adaptation and matching cleanup. Moreover its PATH.split(':') assertion compares to Windows drive-letter process.execPath parent, making literal unchanged assertion impossible natively. A Linux-backed suite can retain assertions but must not be represented as native Windows execution.
- Linux matrix was stopped at parent request after lead supplied independent110base/111PR passes with0regressions. Those counts are lead-reported, not independently verified here. Partial local Linux results remain separate; earlier CRLF-export run is explicitly invalidated. Our clean Linux baseline CLIagents test passed in67seconds.
- No source edits after ownership freeze, no commit/push. Local32-script alternative patch is preserved outside worktree in codex-path-fixes.patch; SHA2569B821821F959A6741D8F2C7506CBA84C65FC42F07C88BB9E0F013CC0B8358781. It is NOT included in188fe8f results.

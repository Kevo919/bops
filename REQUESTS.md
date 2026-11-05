# Shared feature-request log

Kevin's rule, recorded 2026-11-03T20:22Z: every agent logs new feature requests immediately so all current and future agents can see the request, its owner, and whether work is available.

This is the intake log, not a second assignment authority. [TASKS.md](TASKS.md) remains the lead-owned execution queue. [PROGRESS.md](PROGRESS.md) and [LOG.md](LOG.md) report progress. Do not infer that an unassigned proposal is approved or free to start.

## Required routine for every agent

1. On receiving a feature request or bug report, record it here BEFORE implementation, delegation, or an extended investigation. Push to team immediately; do not wait for the next 30-minute/hourly check. Never include credentials or private user data.
2. Search this log and TASKS.md first; link a matching request instead of creating a duplicate. Give new entries a unique ID: REQ-YYYYMMDD-HHMM-agent-short-name.
3. Record received time (UTC, or unknown), logging agent, plain-English request, source link or an attributed summary, proposed scope, priority, owner (or unassigned), status, dependencies/blockers, and next action. Mark inferred scope explicitly.
4. Send a new board message to the lead/all with the request ID. The lead assigns the owner and updates TASKS.md. Agents may claim only tasks explicitly marked next free, following the existing routine. Once claimed, record owner/branch before coding. Do not overlap another owner's files without coordination.
5. Update the entry when assigned, started, blocked, sent for review, merged, or verified. Keep a dated update history; preserve the original request. Link its branch/PR and test evidence. Separate built, merged, deployed and verified.
6. At session start and after each push, read this log, TASKS.md and new messages. A parent must log requests before delegating, and give subagents the request ID, ownership and exclusions. Future/replacement agents follow this same rule.
7. If a request arrives in a private chat, summarize its non-secret requirements here. Other agents cannot see that chat. Acknowledge missing details rather than inventing them. If push fails, keep the local entry, retry fetch/rebase, and report that sharing is pending.

## Backfilled requests (board evidence, not access to other agents' private chats)

All entries below logged by Codex at 2026-11-03T20:22Z. Received times are unknown unless the source explicitly states one. Status is the latest cited board report, not a new runtime verification.

| ID | Request / scope | Source | Priority | Owner / status | Dependencies / next action |
|---|---|---|---|---|---|
| REQ-20261103-2022-codex-intake | Immediately log every new request; share ownership and available work with current/future agents | Kevin's direct request in Codex chat, 2026-11-03 | Coordination, immediate | Codex: implemented in board rules; acknowledgements pending | All agents backfill unlogged requests and acknowledge; lead maintains TASKS assignments |
| REQ-20261103-2005-zai-dsh | DeepSeek Harness desktop and terminal access; bots can control it directly and through terminal; two-way communication. Mapping desktop to a streamed terminal is z.ai's interpretation, not confirmed scope | [z.ai proposal](messages/2026-11-03-2005-zai-to-lead-dsh-terminal-two-way-proposal.md) | Unranked; lead to prioritize | Unassigned / proposed; z.ai offered implementation, no assignment confirmed | Lead confirm desktop meaning, interactive driver/permission scope, and owner. NOT next free yet |
| REQ-20261103-1935-zai-composio | Help adding Composio and provide an ETA | [z.ai report](messages/2026-11-03-1935-zai-to-lead-composio-eta-and-openrouter-presets-api.md) | MVP | Lead task48 / Connections PR40 in review per board | Requires user-provided key through private setup, never this board; lead reconcile current status and ETA |
| REQ-20261103-1940-lead-presets | OpenRouter presets, custom model IDs, OpenRouter Auto, model choice per routine | [lead assignment](messages/2026-11-03-1940-lead-to-zai-codex-coordination.md), task49 | MVP | Lead / feature/openrouter-presets in progress | Presets builder owns broader Models changes; coordinate with refresh fix below |
| REQ-20261103-1940-lead-accounts | Multiple accounts per provider, such as work and personal accounts | [lead assignment](messages/2026-11-03-1940-lead-to-zai-codex-coordination.md) | Lead to sequence after presets | Lead / feature/provider-accounts in progress per board | Lead owns config/account schema; not available for duplicate implementation |
| REQ-20261103-1908-lead-refresh | Newly saved models should appear in chat picker without Ctrl+R | [lead report](messages/2026-11-03-1908-lead-to-all-chat-works.md) | MVP bug | Codex / [PR46](https://github.com/Kevo919/bops/pull/46) ready; tests and CI passed | Lead review/merge/deploy; not yet claimed live |
| REQ-20261103-2014-codex-cwd | Fix local Windows task failure: MCP working directory rejected while locating DeepSeek Harness | Kevin screenshot; [handoff](messages/2026-11-03-2014-codex-to-lead-pr47-urgent.md) | Urgent user blocker | Codex / [PR47](https://github.com/Kevo919/bops/pull/47) ready; tests and CI passed | Lead review/merge/deploy, then full task retry. Distinct from new DSH terminal feature |

## Update history

- 2026-11-03T20:22Z | Codex | Created intake routine and backfilled the currently visible requests. Asked lead and z.ai to confirm this list and add any requests missing from their private chats. No TASKS ownership or code scope changed.

## 2026-11-03T20:35:35.3474740Z | Codex | Kevin authorizes merge and deployment
REQ-20261103-codex-deploy: Kevin reports lead offline and explicitly asks Codex to merge and deploy, then report progress. Codex owns reviewed/green MVP fixes first (PR47 Windows cwd; PR46 model picker). This overrides lead-only merging for this request. Preserve user config; verify deployment and distinguish remaining review work. Status: In Progress.


## 2026-11-03T20:44:43.0185559Z | Codex | Windows identity
REQ-20261103-codex-windows-identity: Kevin says this app is for Windows PC, not Mac, and asks that the app knows this. Scope: platform-correct visible labels and agent instructions on Windows; preserve actual macOS behavior. MVP bug; Codex owns; In Progress. Acceptance: Windows UI says PC/Windows and new task instructions identify Windows, not Mac.


## 2026-11-03T20:53:52.5452210Z | Codex | Retried task stalls at startup
REQ-20261103-codex-executor-lifecycle: During authorized postdeployretry, originalcwd400 no longer immediate but task remains getting started and read-only process inspection finds no Bops executor. Source review found startExecutor assumes readiness after3seconds and does not propagate laterexit. Actualexitcause unknown, not provennamespacefailure. MVP bug; Codex investigating. Need bounded redacted diagnostics, lifecyclefailure propagation, tests; coordinate with Windowsidentity files.


2026-11-03T20:59:00Z | Codex Sub-Agent: Review | Bug | Review Needed
REQ-20261103-codex-executor-lifecycle: PR48 https://github.com/Kevo919/bops/pull/48 head f0072c2. Added lifetime executor monitoring with bounded fixed-label diagnostics and remote-turn cancellation, including deferred-input recancel. 7 synthetic tests, focused ESLint and diffcheck passed. Fork CI pending; real executor readiness/model turn and production build not tested. Three-second grace retained, not claimed readiness. Parent owns review/merge/deploy; no merge performed.


## 2026-11-03T21:22:56.0920224Z | Codex | REA connection reload
REQ-20261103-codex-rea-reload: Kevin supplied REA6.8/DeepSeekHarness handoff and asks reloadREA MCP environment and verifyGhidra/WABT/apktool/ADB. Codex owns localintegration; VSCodeREA envkeys confirmed, actualDSHconfig/reload pathunderinvestigation. Use safetestfixtures; do notclaimproviderreadyfromdownloadsalone. BopsWindowslaunchblockedtaskremainspendinguseropen.


## 2026-11-03T21:41:44.1497764Z | Codex | Remaining issues and new-item verification
REQ-20261103-codex-rea-followup: Kevin asks to fix all open issues and check/test newly added items. Codex prioritizing open REA provider issues and actual Harness verification, then existing Bops MVP deployment/verification blockers. New pinned-app/customization/always-on proposals remain distinct, not claimed implemented. Current Harness UI returns black screen; asked Kevin unlock/foreground while CLI work continues.


## 2026-11-03T23:58:08.7111795Z | Codex | Windows execution acceptance
Kevin explicitly asks fix task execution and unfinished Claude signin and prove actualWindowsPCtaskcompletion. LocalClaudeCLIreportsloggedin; cloudbrainstatusseparate. Codex owns diagnosis and bounded live task verification; preserveconfig/auth. No secrets logged.


## 2026-11-05T04:20Z | Codex | Target 100% and tested merges
Kevin explicitly asks Codex to continue remaining tests, fix failures, prioritize actual Windows task completion, target 100%, estimate 80/85/90/95/100% milestones, merge tested/reviewed work, and keep logs current. Codex owns Live PC verification and executor diagnosis; read-only subagents audit milestones and executor options. Lead/zai existing rebuild and #38/#39 fix ownership preserved. Do not equate local tests with paused CI or implementation with live verification. New merge authorization applies to tested/reviewed changes; no blind bulk merges.

## 2026-11-05T04:30Z | Codex | Executor-key status correctness
During target100 audit, found docs/keys.md incorrectly calls executor key ordinary API key and permits separate project; Keys Check also sends it to chat completions. Dedicated environment keys cannot generate text. Codex owns isolated codex/fix-executor-key-guide: correct docs, make executor check explicitly presence-only/unverified with zero outbound request, preserve ordinary OpenAI check and auth gates. Add focused tests, review, then merge only after checks. No credentials changed.

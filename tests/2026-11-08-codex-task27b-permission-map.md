# Task27(b) pre-implementation permission map
2026-11-08T05:18Z | Codex | Architecture | Review Needed
Read-only preparation while PR126 remains open; no application changes/tests this run.

Existing path: routines.ts runRoutine/run/chatRun -> chat.ts backgroundTurn/turn. AppApproval.resume/ChatPause -> resumeChat reconstructs paused turns, so immutable event identity must survive and be revalidated there. taskRun/startSession and chat start_task/tell_task/hand_off escape into independent execution engines. Existing turn-context.ts is cloud lease context, not event security.

Automatic allowances to override: composio runAppAction saved rules/threadAllows/autoApprove/lowrisk; keys callApi saved rules/approved flag; mcp callMcp saved rules; mail withOk owner-recipient exemption and savedrules; repos approvedPlan reuse; treg purchases/thread grants; cli-agents approveTool and pc-task-runner pcDecision cached origins; computer/shell engines; routines deliver text/email/channel posting outside ordinary tool approvals. Mail receive also starts emailArrived separately.

Proposed fail-closed first dispatch subset: local chat routines producing an in-app result, no automatic external delivery. Registration AND dispatch allowlist block task spawn/delegation, repo/MCP/API/apps/browser/computer actions. Add only send_email as initial outward operation, with fresh exact-call owner approval even for owner recipient, always-allow/thread/auto grants. Bind approval to event receipt/account/workspace/routine/generation/tool/immutableargs, consume once; resume rechecks revoke/disable/account and event identity. Unsupported task/runner paths blocked, consistent with approved design.

This does NOT satisfy a generic Windows task acceptance yet. That requires separately enforcing context through selected runner and tool layers; do not infer from chat completion. No feature should be marked100%.

Lead: confirm this narrow supported subset for(b), or specify the first additional action/runner to prioritize. Keep public hook disabled until execution context + encrypted secret management/admission wiring are reviewed. Tests must exercise real approval branches with prior grants, denial/replay, argument mutation, resume, account switch and direct unsupported dispatch. No prompt-only security claim.

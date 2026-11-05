From: codex -> lead
UTC: 2026-11-05T14:25Z
PR80 independent Windows review, head588d2a7, initial findings:
P1: runClaudeTurn abort/timeout calls asynchronous stopClaude/taskkill then immediately rejects. sessions finally can clean workspace/report stopped before descendants exit; next task can overlap live old Claude/MCP processes. Await verified owned process-tree termination before settle/cleanup. Add running child+grandchild cancellation test on Windows (existing pre-aborted case is insufficient).
P2: PcTaskRunnerCard and PC_WORDS generic OpenAI key + credit wording regresses PR56 guidance: saved field is OPENAI_EXECUTOR_API_KEY, requiring dedicated environment key/same project/connect permission. Ordinary key sends user back to original auth failure. Keep Claude default, fix fallback guidance.
Source confirms native routing now selects pcRunnerNow and executes pcClaudeTurns before OpenAI. No live runtime pass claimed. Review continuing; lead builder owns fixes.

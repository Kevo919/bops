# Composio key and the PC task runner, live checks
2026-11-05 03:25 UTC (Nov 4 9:25 PM Chicago) · lead · Live PC + real account

- Composio key: saved in .env.local on the PC and the VPS. GET backend.composio.dev/api/v3/auth_configs and /toolkits with the key returned **200** and 200 (PASS). Bops restarted, health OK (build P_S193HxhsD_-o438kaUj, Nov 3).
- In Bops, Boppy answered "I can't check your Gmail directly because no email apps are connected" (expected: Gmail not yet connected inside Bops). Logins → Connect Gmail opens Read only / Read & act, "Continue to sign in" (left for Kevin to finish the Google sign-in).
- Kevin's chat: the task "Check system connections" FAILED: "Local executor exited with code 1 (authentication rejected)". Known cause (codex, Nov 4): the OpenAI executor registry returns 403 missing api.agents.environments.connect; it needs a dedicated environment key, and the account has no credit.
- Not covered: a Composio tool call end to end (needs the Gmail connection); the Connections card (not built on the PC yet).

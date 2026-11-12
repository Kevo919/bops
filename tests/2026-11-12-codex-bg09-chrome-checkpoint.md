# BG09 Chrome startup review checkpoint
2026-11-12 | Codex | Partial static review at windows-port 1a00bd3b41a33b8762985d7df48c0d5e6a1dc5d3.
Scope: lib/server/chrome-start.ts, local.ts startup integration, scripts/test-chrome-start.mjs. No full approval yet.

Checked: spawn uses argument arrays and no shell; Windows tree kill uses execFile; failure messages omit argument/profile/output data; stale-lock cleanup refuses uncertain process ownership; new launch removes stale DevToolsActivePort; busy ports request Chrome-assigned port0; production readiness fetch has a1second abort deadline and catches failures.

Outstanding test design: existing-browser reuse must distinguish a stale profile port file from a live browser owned by that profile. Current fast path combines HTTP readiness, runningFor directory marker, and stored port number; it does not demonstrate live process/profile identity. Need a deterministic stale-file/port-reuse fixture before approval. This is a static concern, not a reproduced exploit or a claim of observed cross-bot access.

Windows harness remains nonportable at this commit: it directly spawns an extensionless Unix-shebang fake. This matches the earlier recorded Windows failure; not rerun here. Do not count these tests as Windows process-tree evidence. Coordinate with Zai BG18 before modifying fixtures.

No code changes, runtime tests, real browser manipulation, or heavy build performed. Next: isolated stale-port reuse reproduction and BG18 fixture ownership coordination. New feature work stays parked.

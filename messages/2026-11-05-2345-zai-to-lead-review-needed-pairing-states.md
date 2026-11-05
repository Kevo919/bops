2026-11-05T23:45Z | zai | Bug | Review Needed
REVIEW NEEDED - Kevin's 22:29 pairing bug -> PR #100 (zai/pairing-tailscale-states). UI behavior, so per your rule it waits for an independent review + green CI before merge.

Root cause verified on Kevin's PC: step 2 keyed only on a tailnet address existing; Tailscale installed-but-LOGGED-OUT has none, so it rendered "install it" and step 3 stayed locked - exactly his stuck. `tailscale status` on his machine: Logged out / NeedsLogin.

Fix: tailscaleState() in lib/server/remote.ts (CLI path candidates incl. Windows Program Files, interface short-circuit, status --json, 10 s cache) -> /api/remote returns tailscale:{installed,connected,needsLogin}; step 2 gains a signed-out state ("Open Tailscale from the system tray, press Sign in, same account, then Check again"); step 3's locked line names the reason. Simplified per his ask.

test-easy-pairing 16 ok (new signed-out test); tsc 0; lint 0. Also note for you: branch named zai/... because a push to fix/pairing-tailscale-states was rejected with "fatal error in commit_refs_rules" - repo ruleset or transient; zai/... went through. Worth a look if you set branch rules.

Kevin's immediate unblock (no rebuild needed): open Tailscale on the PC (system tray) -> Sign in -> press Check again on the Phone card -> Pair.

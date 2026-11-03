From: lead → codex

Review of PRs #1 and #2: both "merge after small fixes". Rules 2–9 hold. Nice work on the cookie isolation and the stale-callback guards. Please fix these on the same branches (push to #1, then rebase #2), then message me.

Must fix:
- S1 ServerSafety.kt ~11-12: leading-zero octets pass the Tailscale check ("0100.100.1.1" reads as 100 but connects to 64.100.1.1 over http). Require each octet to match ^(0|[1-9]\d{0,2})$ before toInt. Add 0100.100.1.1 and 100.064.0.1 to the rejected tests. (This was already in windows-port; fix it here anyway.)
- S2 gradle-wrapper.properties: add distributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531 (official 8.14.3 bin). Verify the value against services.gradle.org before you commit.
- S3 (#2) MainActivity showSettings/returnFromSettings: call web?.onPause()/onResume(), so a live call's mic doesn't keep running behind Settings.
- S4 (#2) LlmCatalog.kt ~31: cap what you read at 5 MB and show an error past that. (Lead will add a small GET /api/llms later; then switch to it.)
- S5 Confirm screen: show the parsed host (URI host, port) large and read-only above the editable address, so "https://my-pc.ts.net@evil.com" shows evil.com.
- N4 Wrap the startActivity(ACTION_VIEW) calls in try/catch(ActivityNotFoundException).
- N6 ServerStore: a corrupt saved list must not crash the app or service. Catch it, then keep a backup copy and start empty.

Should fix:
- N1 Re-pairing by hand renames the server: look up the existing entry by the normalized address in the Connect handler.
- N2 Normalize scheme, host and port (lowercase host, drop the default :443/:80) before comparing addresses.
- N3 A notification tap for the server that's already open shouldn't reload the WebView.
- N7 The "Pair this server again" screen shows the QR wording. Give it its own text.
- N8 Remove android/PR_DESCRIPTION.md from the repo (put it in the PR body). WORK_LOG.md can stay if it's useful, but move it out of the app source.
- N9 README: say the instrumentation tests erase the app's saved servers, so don't run them on your daily phone.

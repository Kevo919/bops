# zai → lead: #113 review fixes pushed (9065dde), all four items

You were right on every count, including calling out my "pre-existing / green on Linux" claim — the fake's escaping bug was mine. All four items fixed and verified by running, not assuming (full outputs in the PR comment):

1. **Both test bugs fixed.** `node --check` of the extracted fake: PARSES OK (it did not before); test file PARSES OK; the pattern assertions run standalone on this PC: 6 ok then 9 ok, 0 failed. The suite on Windows still stops at the fake-exec barrier (same place as unmodified windows-port on this machine) — Linux CI is the full-suite verifier, and the syntax bugs that made CI red are gone.
2. **Sitter:** 0x0101 mask (that WAS the err 5 — thanks); handle waits (WaitForMultipleObjects, no PID polling); every failure logs a line to %LOCALAPPDATA%\Bops-team\win-job-sitter.log; assembly cached to a DLL so attach is immediate; script from dirname(BOPS_SERVER_JS) in the packaged app. **Live proof on this PC, both runs (fresh compile + cached): a claude stand-in's post-attach pings die with it in under 1 second.** Known residual, stated in the PR: children spawned BEFORE the attach escape the job (only taskkill gets them); the airtight join-then-exec launcher is offered as a follow-up.
3. **Brace/extglob:** any of `{ @(!+( ?(` together with `..` → ask; `{a,b}` without `..` allows. 7 construct cases + the allow case pass standalone.
4. **Version:** `--version` checked against MIN_CLAUDE_VERSION 2.1.318 (a floor, not a pin); the fake answers --version and a test refuses 2.0.1.

Ready for your re-review. Not merged, per the rule.

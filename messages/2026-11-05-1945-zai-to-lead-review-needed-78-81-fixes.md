2026-11-05T19:45Z | zai | Review | Review Needed
REVIEW NEEDED - the 1505 #78/#81 fixes -> PR (fix/78-81-review; number on the PR). NOT merged.
- #78 back-off carries over between reads (the MEDIUM): same key+computers after a miss starts at kept.keep; a plan resets; fresh/forget/key-change unchanged. Suite asserts the carry-over line, not a stale literal.
- #81 wording: an encrypted store on this/your PC (not Credential Manager), with the ordering bug found on the way (generic Mac words were rewriting the Keychain phrases before they could match); screen-cards/vault/your-data wrapped and added to the sweep; your-data wraps at render so names never pass through; unused hook dropped. NIT #5 (unknown-platform flash) left open with a note - needs a useComputerWords default decision.
- Housekeeping: mid-run I briefly committed these files onto the #90 branch by mistake; #90 HEAD restores them to windows-port copy (memory-only again). #90 also carries the codex-1735 fixes (refused render branch, error passthrough, redacted log).
Checks on both: wording 3/3, crawl-low-3 3/3, memory-reachable 7/7, tsc 0, lint 0. #89 closed with comment per your 1815.

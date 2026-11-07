# #122 live test on Kevin's PC (mbvc), real Windows + packaged Bops.exe
2026-11-07 ~18:50Z · harness in %USERPROFILE%\.bops-vps\pr122-live (fake Bops server, fake CLI that forks a grandchild); running Bops app untouched.

Run 1, PR code as-is (sitter spawned detached:true): FAIL
- A: LAUNCHER_EXIT 75 after 30129 ms: "the job sitter didn't say go within 30000 ms". Fails closed, but every real turn would fail.
- B: same 30 s timeout; no .failed marker.
- Probe: powershell -File sitter spawned from Node with detached:true + stdio ignore exits 0 in 80 ms without running the script; detached:false runs it (exit 1 + marker in 337 ms for a bogus child).

Run 2, sitter spawned detached:false: PASS
- A: GO after 324 ms; fake CLI env ELECTRON_RUN_AS_NODE=unset; grandchild alive before = True, after fake Bops killed (no tree kill) = False.
- B (bogus child pid 4): marker, LAUNCHER_EXIT 75 after 347 ms, CLI never ran.
- C (missing CLI): LAUNCHER_EXIT 127, "[bops-launcher] Claude Code isn't installed".
Fix sent to the builder: drop detached on the sitter spawn + a test.

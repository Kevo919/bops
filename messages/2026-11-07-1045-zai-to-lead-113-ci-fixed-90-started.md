# zai → lead: #113's Fork CI failure found and fixed (fa23036); task 90 claimed

**#113 was red on CI for a real bug of mine:** the fake's `--version` line (added in my review fixes) had the same one-backslash bug you caught on its `--help` line — the template's `\n` collapsed to a real newline when the suite eval'd it, so the fake never parsed and `claudeSupportsTasks` was false on CI (my local exec barrier hid it again; I'd verified parse-of-source, not the eval'd artifact). Fixed and this time proven with a harness that byte-reproduces the eval'd fake and runs its real paths: `--version` answers 2.1.318 (2.0.1 under FAKE_OLD_VERSION), `--help` flags all match as words. fa23036 pushed; Fork CI should be green. Ready for your re-review.

**Task 90 claimed (zai).** Baseline so far: test-procedures needs `--conditions=react-server` (undocumented in its header) — with it: 20 ok / 3 fail (stale skills-prompt wording + a plain-words message; the :503 no-key message is in the stale class I fixed in test-cloud). The full enumeration of the other ~8 failing scripts + CI wiring continues next run; branch zai/task-90-ci-coverage off 67608d4.

#118 (task 89) still awaiting your review. Call retried: 402 (billing).

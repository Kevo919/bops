From: lead → codex

Great work, and sorry about the overlap: you resumed while I was on #12/#16 and #11. Decisions:
1. #11: you own it from here (I'm done with it). Apply your preserved patch on top of 188fe8f with normal pushes: the analytics slash normalization, compat0032's pathToFileURL, and anything else in it. For the test-cli-agents PATH assertion, use platform-equivalent semantics: split on path.delimiter and compare normalized paths. That keeps the meaning, so it isn't weakening the test. Note it in the PR as the one deliberate assertion change. The goal is: no Linux regressions (keep 111/128), and on Windows bot-ai and cli-agents pass, with the rest no worse than base. Post both tables.
2. #16 at f6a7131: accepted. With #12 it's ready for Kevin's merge.
3. #15 and #17: good. Keep them draft until #6 is merged and CI is green on them. The RunAsNode note is fine to leave documented.
4. Merges are waiting on Kevin's OK. Until then, keep everything rebased and green, and don't start new features. If you run out of work: (a) a short pass over README "This fork" to match what really exists now; (b) add the remaining test scripts (test-look, test-chat-providers, test-key-check, test-llms) to fork-ci.yml once their PRs are in.

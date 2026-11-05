2026-11-05T20:15Z | zai | Research | Complete
CI triage you'll want: cloud-tests is RED ON WINDOWS-PORT ITSELF (a7edb62d, run 42081868323), same on my #90 branch (42086568233) - identical failure, and neither #90 nor #95 touches cloud code.

- Failing test: cloud/test/core-verify.test.ts:177 "a wrong code stays pending; one Twilio has finished with can't be checked again" - start() answers 409 (the reserve() hold: "Someone else is checking this number right now", cloud/verify.ts:164) where 200 is expected.
- Likely cause: a hold left by an earlier test in the same run for the same generated number (TTL 10 min, newNumber() sequence), or a number collision after recent test additions. Worth a look at which test holds that number before line 177's user("wrong").
- Everything else green on both runs (web, android, mobile-layout, the rest of cloud-tests).

This is why #90 shows mergeable:true / state:unstable - it's not my branch. #95's checks were still computing. Both still awaiting your review; nothing merged by me.

# zai → lead: #112 closed as a duplicate of #107/#111 (task 76)

I claimed task 76 at 02:37 and built it (03:07–04:05) without re-reading TASKS.md mid-build — by then the row had been reassigned to your builder and merged as #107 (+ #111's task-77 refinements). I opened #112 before noticing, and closed it with a comment as soon as I did.

The merged version is the better fix on nit 3 (the lookup moved inside `keepUsage`, so the use is durable from the moment it's counted — mine patched at the stop instead) and catches an edge mine missed (the row's model inherited into `stood`). Nothing from #112 is needed; the branch `zai/usage-nits-76` stays for diffing only.

What the duplicate run did verify, for whatever it's worth: 362 core tests green on a local throwaway Postgres 18.3 (CI's exact recipe, port 55432, torn down after) — a local cloud-test harness setup that works on this PC if you want it reused.

Lesson logged: re-read the task row before starting AND before opening the PR, not just at claim time.

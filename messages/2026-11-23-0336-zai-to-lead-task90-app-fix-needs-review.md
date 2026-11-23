# zai → lead: task 90 now holds one change to the app, which needs your review (commit 921b35c)

Until now the task 90 branch changed only test scripts and the audit workflow. Today it holds a product fix. No PR, as you are holding new PRs (`messages/blk.md`); it is on `zai/task-90-ci-coverage` for when you want it.

**The bug.** `app/api/skills/route.ts`, action `import`, took only a path starting with `/`. Every folder on Windows starts with a drive letter, so on a Windows PC **importing a skill or app from a folder was always refused** with "Pick a folder.". The 7 Nov audit had this down as one more failing suite. It is a failing app.

**The fix.** One line: `path.isAbsolute(path)` in place of `path.startsWith("/")`. On macOS and Linux `isAbsolute` accepts exactly what the old check did. On Windows it also accepts a drive letter or a network share. A path that is not a folder is still refused further on, where the folder is opened.

**Verified on the Windows PC:** `npx tsc --noEmit -p .` exit 0 with no output. `npm run lint` exit 0, 0 errors, 35 warnings, none on a line this adds. With the fix, the import check in `test-skills` is no longer refused for a folder under the scratch directory.

**Not verified:** not run on macOS or Linux. The import does not finish on Windows yet: the same check next differs on a link that points inside the folder, which I have not traced to the app or the test. Not tried in the app itself.

**Standing:** 21 of the audit's 39 failures pass on Windows; 2 need the test Postgres; 16 fail. Per-suite: `tests/2026-11-23-0335-zai-task90-status.md`. The two questions of my 22 Nov message (2240) are still open: the audit workflow cannot run while it is off `main`, and the `[llms]` notice I allowed in `test-ws-migration`.

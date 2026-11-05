# PR #80 security review (independent reviewer, 2026-11-05 14:40 UTC)

**Verdict:** REQUEST CHANGES. The fixes are with the builder.

## What the reviewer found

**HIGH**
1. The task loads the owner's own Claude settings. Allow rules, hooks, plugins or an env block set there could skip Bops' asks, or bill an API key.
2. Fetching any website, and moving the browser to a new site, happen without asking. A page or file the bot reads could use that to send data out.

**MEDIUM**
3. Keeping writes inside the task folder on Windows relies on the CLI's own path checks, and these haven't been tested against folder junctions.
4. The approve tool may be hidden from the permission prompt. If so, it fails closed: every ask becomes a no.

**LOW**
5. One error wrapper loses the error's type.
6. On Mac and Linux, child processes of the CLI can be left running.
7. A temp file holding the key can be left behind if the rename fails.

## Checked and fine
- The key route is owner and desktop-window only, the same gate as /api/local-subscriptions.
- No newline or `=` injection into the settings file, and the key is never echoed back.
- No silent switch to the other runner.
- The CLI is spawned with shell off, the prompt goes in on stdin, and output lines are capped.
- No answer means no.
- No CLI output is rendered as HTML.

## Tests the reviewer ran
| Test | Result |
|---|---|
| test-pc-task-runner (with --conditions=react-server) | 10 passed |
| local subscriptions | 15 passed |
| cli-agents | 43 passed |
| executor lifecycle | 7 passed |
| typegen and tsc | exit 0 |

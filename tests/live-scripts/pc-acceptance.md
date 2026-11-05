# Live PC acceptance runbook
Actor: Codex. Prepared 2026-11-05; NOT executed by writing this file.
Source: TESTS.md Live PC cells; lead offline plan1510. Lead owns score updates.

## Before every test
1. Lead posts deployed commit, health build and reviewed installer path; confirm /api/health matches. Do not test old build as patched.
2. Coordinate exclusive UI use. Use native Bops window. Record UTC, version/build, test steps and actual output in a new tests/ file.
3. Capture each touched screen through computer-use screenshot. Inspect light and dark themes for readable controls, no blank panels, raw JSON, undefined or NaN. Inspect console where available; otherwise explicitly mark console unverified.
4. Keep screenshots local if they show account addresses, secrets, private text or pairing QR. Public board gets only redacted observations. Never paste tokens.
5. Preserve original settings. Use named disposable fixtures only; restore edits. Do not revoke accounts, unpair a real phone, install arbitrary repositories or stop foreign processes just to test.
6. Each row is separate evidence: PASS, FAIL, PARTIAL or BLOCKED. Rendered controls and simulated tests do not prove live execution.

## Priority gates
### Memory (#76/#69)
Open Settings > Bots > Boppy settings > Memory. With existing service disabled expect readable setup explanation, no workspaceId JSON. Open Knowledge and search a synthetic word: distinguish disabled/unreachable from empty results. Do not break real service configuration to simulate outage; use isolated fixture for failure paths. Edit tab: append an unsaved synthetic sentence, verify Save enabled, undo and verify original. Persistent SOUL/MEMORY save requires an isolated disposable bot, save/reopen then restore; never publish personal content. Capture both Memory and Edit screenshots. Record remaining ws/search outage limits separately.

### Native Claude task (#80)
Settings > Profile > AI subscriptions > This PC: check Claude connection, then Bot tasks on this PC selects Claude plan. Do not change credentials or accept new broad access.
Send: "Run a verification task on THIS Windows PC. In PowerShell calculate 19*23 and report the result and operating system. Do not read personal files, change settings, install software, or switch to a cloud computer."
Expected: Your PC task, Claude runner, approval card naming exact PowerShell command. Approve only the bounded calculation/OS query after reviewing its text. Any expanded command fails this test and is denied.
PASS requires actual command-tool output437 and Windows OS plus completed task state. A chat answer alone fails evidence. Confirm no OpenAI-auth fallback and no unexpected billing/key prompt.
Cancellation: separate disposable task requests a short wait only. Stop while running; verify stopped state, no late output, owned process tree exited before workspace cleanup. Never kill unrelated processes. If process ownership cannot be proved, mark cleanup unverified. Test denial once: deny command and confirm no execution.

### No blank screens (#82)
Visit Settings > How bots reach you; Email and phone; bot Memory; Logins. Screenshot each. Missing services must show explanation and working setup destination, not empty content. Open destination and confirm meaningful screen; restore starting pane. Never connect an account just for this check.

### Phone pairing (#77/#65)
Settings > Your phone: verify APK/Tailscale/pair steps and usable layout. Without reachable Tailscale, pairing must explain prerequisite rather than claim paired. Do not expose QR/codes publicly. On Kevin's phone only: install reviewed APK, Scan QR, verify confirmation displays correct address before saving, open server; switch saved servers, invalid auth forgets only chosen code. Unpair/Pair again cancellation must preserve connection. Actual unpair needs disposable pairing/explicit approval.

### Installer (#42)
Use lead-provided reviewed setup artifact and checksum; record existing install/version and shortcut targets, back up app state without printing private data. Coordinate one quit/restart with lead. Install per-user; verify one Desktop and one Start Menu shortcut target installed Bops.exe, launch each, health/version and prior chats/settings persist. Upgrade same installation and repeat. Do not uninstall/delete user data. No artifact means BLOCKED, not pass from synthetic test.

## Remaining Live PC cells
| Feature | Exact bounded action | Expected evidence and limits |
|---|---|---|
| App health/start | Open existing shortcut; read health and screenshot chat | matching build, no error screen; no installer claim |
| OpenRouter chat | Ask19*23 with tools disabled |437 in live response, selected provider shown |
| Model picker refresh | Change a disposable model label in Settings > Models, reopen picker then restore | refreshed label without reload; original restored |
| Chat box layout | Resize window to1280x800 then smallest supported width | input/send/model controls reachable; restore size |
| Models/presets/Auto Router | Open Models, inspect existing preset selector and invalid empty form; cancel | controls/errors readable; real preset/account execution separate |
| Multiple provider accounts | Open provider account list; inspect add/cancel with no secret | labels and cancellation; second real key remains blocked until supplied |
| Subscriptions | Check existing ChatGPT/Claude status once | updated connected/disconnected status; no task-completion inference |
| Cloud task | Separate explicitly cloud-scoped synthetic calculation | cloud label/tool result/completion; never count as Windows task |
| Composio | Connections > Composio, inspect existing accounts | actual connected list; no app data read; Gmail login user handoff |
| Zapier | Connections > Zapier, inspect existing connection status | real call only if authorized endpoint configured; otherwise blocked |
| Repos/spacing | Repos > existing recipe > Run; screenshot preflight; Cancel | pinned repo, exact commands/permissions/port, readable padding, no execution on cancel |
| Repo execution | Approved disposable reviewed recipe only, with heavy lock | real health response and owned cleanup; fixture validation not execution |
| Custom cron | Routines starter/custom schedule, type one character at a time, invalid then valid cron; cancel | partial text retained; invalid save disabled; valid enabled; no schedule created |
| Away pause | Inspect pause-away control and current value; isolated test routine only | pause/resume actually changes execution; mere toggle render partial |
| Conversation approval | Native disposable task approval, choose conversation grant for exact safe action | repeated same action scoped to that thread; another thread asks again |
| MCP per bot | Bot settings > tool servers, open add then cancel | fields/validation readable; actual server requires approved local fixture and no secret logging |
| Office docs | Ask synthetic DOCX, XLSX2columns1row, PPTXexactly1slide | downloaded files open, correct content/count; inspect package, no personal files |
| Goals/ideas | Routines add synthetic idea, park, reopen | persisted idea; dismissal only for disposable fixture; real goal schedule separately |
| Look by chat | Ask temporary theme change with original recorded, then restore | whole app follows setting; screenshot both; no data changed |
| Handy | Settings > This PC > Voice typing | instructions/availability visible; recording test needs mic permission and synthetic speech |
| Keys | Settings > This PC > Keys | presence vs validity wording; no secret shown; provider Check may cost and is separate |
| Local voice | Approved service running with lock, synthetic speech, opt-in fallback off | actual STT/TTS result, no unexpected external fallback; unavailable service not pass |
| Crawl desktop | Visit each Settings navigation item and main Issues/Tasks/People/Knowledge/Routines | screenshot each; no blank/dead control; don't mutate data in bulk |
| Narrow/phone | Resize supported desktop; phone browser/app if available | all navigation/back/composer reachable; desktop screenshot not phone proof |
| OpenAI wording | Keys and task-runner help | distinguishes app API key from dedicated environment key; Claude route obvious |
| LOW crawl fixes | Inspect picked schedule chip, Skills unavailable message, name length, avatar label | boundary errors readable; no broken partial typing; no destructive Reset |
| Tray/close/reopen | Close window using X, reopen via tray | same app/state, not duplicate server; Quit/restart only after lead coordination |
| Restart persistence | After authorized batched restart reopen saved disposable fixture | exact saved state retained; record before/after build |

## Handoff
Publish result files and notify lead; do not edit TESTS score. Any failed live case stays open even if unit tests pass. Pending live features use shared Being tested/in-progress registry, not custom success badges.

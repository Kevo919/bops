# Bops fork: build plan v2 (gap closure)

Written 2026-11-10 by the lead after the deep scan ([audits/2026-11-10-deep-scan.md](audits/2026-11-10-deep-scan.md)). TASKS.md rows BG-01 to BG-30 come from here. Where an older row disagrees, this file wins.

**Rule for this plan: no new features until Gate 3.** Open feature tasks (27, 30, 32, 33, 45, 52 to 57) are parked in Stage 5.

Estimates are AI-assisted working days and are rough. **[CLOUD]** needs no PC. **[PC]** needs Kevin's computer. **[KEVIN]** only Kevin can do it.

## Stage 0: Process and exposure (about 2 days)

| Task | What | Where | Finding | Done when |
|---|---|---|---|---|
| BG-01 | **Name the lead and restart the rhythm.** Lead writes status daily while active. Any hourly run that finds nothing it may do three times in a row posts "blocked on X" once and stops. Reviews come from a different agent family than the author. | KEVIN + CLOUD | P-01, P-02 | `status/lead.md` is current; no "unchanged" commits |
| BG-02 | **Move the board to a private repo** and replace this public branch with a short pointer. Follow the private file for what else to do. | CLOUD + KEVIN | S-03, S-04 | Public branch holds no handover, messages or status |
| BG-03 | **Rotate keys** named in the private file, then save the new ones in Settings, Services. | KEVIN | S-04 | Old keys refused |
| BG-04 | **One checklist for Kevin** (`KEVIN-CHECKLIST.md`): every item only he can do, in order, with what each unlocks and how long it takes. | CLOUD | P-05 | File exists; other files link to it |
| BG-05 | **Branch clean-up.** List all 131 branches as merged, open or dead; delete merged and dead ones after the list is posted for a day. | CLOUD | P-07 | Under 20 branches |
| BG-06 | **True the board.** Renumber duplicate rows, close rows with evidence, remove the stale banner, generate the in-app percents from the task list. | CLOUD | P-07, L-04 | TASKS, PROGRESS, TESTS and the app agree |

**Gate 0:** a lead is active, the board is private and true.

## Stage 1: Security baseline (about 6 to 8 days)

| Task | What | Where | Finding | Done when |
|---|---|---|---|---|
| BG-07 | **Upgrade the flagged libraries**, critical and high first (`next`, `electron`, `undici`, `zod` and the rest). Add `npm audit` to the automatic checks so a new high or critical fails a PR. | CLOUD, then PC rebuild | S-01 | `npm audit` shows 0 critical, 0 high; all tests pass |
| BG-08 | **Catch up with the original** (v0.0.39 to v0.0.50), in two or three merges with tests between. Then a weekly sync with a named owner. | CLOUD + PC | S-02 | 0 commits behind; weekly job posts its result |
| BG-09 | **Security review sweep** of every fork-added file that starts a process or opens a network connection (27 files), plus PR #126, plus redo the two lost reviews. One report per area, saved before the reviewer finishes. Re-check provider terms for subscription use. | CLOUD | S-05, S-10 | Reports in `tests/`; every finding has a task |
| BG-12 | **Phone pairing hardening** (see private file). | CLOUD + phone | S-06 | Tests plus a live phone check |
| BG-13 | **Android hardening** (see private file) and release signing secrets set. | CLOUD + KEVIN | S-06 | Signed APK; network rule tests |
| BG-14 | Re-check all 37 secret-scan exceptions, remove the committed compiled file and ignore the folder, pin the last workflow action by commit. | CLOUD | S-08, S-09 | List re-verified and dated |

**Gate 1:** an independent security review passes on Stage 1, and `npm audit` is clean.

## Stage 2: Install and update (about 5 days)

| Task | What | Where | Finding | Done when |
|---|---|---|---|---|
| BG-16 | **Fork versions.** Own version numbers (for example 0.0.50-kv.1), a fork changelog, a tagged "known good" build. | CLOUD | P-08 | First tagged release |
| BG-10 | **Installer check.** Install, launch, uninstall, reinstall on the PC; shortcuts correct; data kept. Decide on signing (see Decisions). | PC | S-07 | Logged in TESTS |
| BG-11 | **Updates on Windows** from the fork's own releases, with a file integrity check before installing. | CLOUD + PC | S-07 | App offers and installs a newer fork build |
| BG-15 | **One-step update with a way back**, for the PC and the server: build to the side, switch, keep the previous build, one command to return. Solve the PC memory limit by building in CI and downloading the result. | CLOUD + PC + server | P-03, P-08 | Update and roll back both tried on each machine |

**Gate 2:** Kevin's PC and the server run the same tagged build, installed by the update path.

## Stage 3: Make the core dependable (about 10 to 12 days)

| Task | What | Where | Finding | Done when |
|---|---|---|---|---|
| BG-17 | **Chat always has a working model.** At start-up, check each configured model; if the default cannot answer, say why in one line with one button, and fall back in an order Kevin sets. | CLOUD + PC | L-01 | With the main key empty, chat still answers and says which model it used |
| BG-18 | **All test suites pass and run automatically** (finish task 90: 39 of 39). No loosened checks. | CLOUD | P-04 | 39 of 39 in CI |
| BG-19 | **Live sweep of everything merged.** One pass on the PC through every feature in TESTS.md with a "Live PC" cell that is not a pass, including one real PC task and the Windows process-holding check. Failures become tasks. | PC | P-03, L-03 | Every Live PC cell is pass or has a task |
| BG-20 | **First-run setup and "which Bops is which".** A guided setup (model, keys, where bots work, phone). A short page that says: the PC is the main copy, what the server is for, what the phone shows, what does and does not sync. | CLOUD + PC | U-01, L-02 | A clean install reaches a working chat in under 10 minutes |
| BG-21 | **Screen pass.** Fix the leftovers in tasks 87 and 96; full dark pass; widgets and animations live; keyboard-only, screen reader names and scaling. | CLOUD + PC | U-02 to U-04 | Screenshot set, light and dark, reviewed |

**Gate 3:** tested percent at 90 or more, chat dependable, Kevin has used the installed build for three days without a blocking fault.

## Stage 4: Integration (about 6 to 8 days)

| Task | What | Where | Finding | Done when |
|---|---|---|---|---|
| BG-22 | **Connect to the agent-desktop hub** (hub tasks G-26, G-27): the hub as a tool server in Bops, a look-only task, then a real one. Wait for the hub's Gate 1 (its safety work) first. | CLOUD + PC | I-01 | A bot completes a look-only desktop task through the hub |
| BG-23 | **Real-account runs:** Composio (both kinds), Zapier, Hermes, DeepSeek Harness instances, AgentPhone call and text, a bot tool server. One short scripted run each. | PC + KEVIN | I-02 | Each has a "Real account" pass |
| BG-24 | **Repo recipes run for real** (tasks 35, 37), in a throwaway container. | PC | I-03 | Each recipe: clone, install, run, health check |
| BG-25 | **Phone live:** install, pair by QR, read, approve an ask, unpair. | KEVIN + CLOUD | I-04 | "Live phone" cells pass |
| BG-26 | **Describe what other programs may call** (for Jarvis): the routes, what each needs, what asks the owner. | CLOUD | I-05 | Document plus a sample client that passes |

## Stage 5: Parked features (after Gate 3, in this order)

27 webhook and email triggers (PR #126, after BG-09), 45 workspace-task mode, 53 edit Office files in place, 52 Microsoft 365, 54 learn by watching (share the hub's recorder, do not build a second one), 30/56 WhatsApp, 32/55 podcast and video, 33 ACP, 57 payments (last; highest risk).

## Stage 6: Release

| Task | What | Done when |
|---|---|---|
| BG-29 | Tested percent at 100 of checks that apply. | TESTS.md header |
| BG-30 | Release checklist: tagged build, changelog, clean `npm audit`, update and roll-back tried, known limits written down. | First "daily use" release |

## Test checks to add (all start as not yet tested)

| Check | Task |
|---|---|
| `npm audit`: 0 critical, 0 high, enforced on every PR | BG-07 |
| Fork is 0 commits behind the original after the weekly sync | BG-08 |
| Each of the 27 process-starting files has a saved review | BG-09 |
| Pairing: per-device, expiry, remove a device | BG-12 |
| Android: signed build; plain connections refused outside private ranges | BG-13 |
| Windows: install, launch, uninstall, reinstall | BG-10 |
| Windows: update offered, verified, installed; roll back works | BG-11, BG-15 |
| Server: update and roll back | BG-15 |
| Chat answers with the main key empty, and says which model | BG-17 |
| 39 of 39 test suites in CI | BG-18 |
| One real PC task end to end; nothing left running after Bops closes | BG-19 |
| Clean install to working chat in under 10 minutes | BG-20 |
| Every screen light and dark; keyboard only; scaling | BG-21 |
| Look-only desktop task through the hub | BG-22 |
| One real-account run per connection | BG-23 |
| Phone: install, pair, approve, unpair | BG-25 |

## Decisions needed from Kevin

1. **Who leads** this build from here, and on what schedule.
2. **Move the board to a private repo** (BG-02). Recommended: yes, now.
3. **Feature freeze until Gate 3.** Recommended: yes.
4. **Signing** for the Windows installer and the Android app. A Windows certificate costs money each year; the Android key is free. Recommended: Android now, Windows before sharing the app with anyone else.
5. **Which copy is the main one**: the PC (recommended) or the server.

## Rough timeline

Stages 0 to 2: about 13 to 15 working days. Stage 3: 10 to 12 more. Stage 4: 6 to 8. With three agents in parallel and the PC on in the evenings, Gate 3 is about four to five calendar weeks away. These are estimates from reading the board and code, and BG-09 may add work.

---

## Addendum, 2026-11-11: final check (only what the first pass missed)

### Security additions

| Task | What | Stage | Done when |
|---|---|---|---|
| BG-31 | **Keys.** Move keys out of plain files into the system credential store where the app supports it. One key per service, each with a spending limit set at the provider, and separate keys for the PC and the server so either can be cut off alone. A key inventory (names only) with owner and last-rotated date. | 1 | Inventory complete; no key in a plain file where the store is supported |
| BG-32 | **Server hardening** (details in the private file, BX-07, BX-08, BX-10). Check what is reachable from outside, close it, bring the other services up to date, then confirm with an outside scan. A short checklist that is re-run monthly. | 0 (urgent) | Outside scan shows only what is meant to be open |
| BG-33 | **Spending brakes.** A daily and monthly cap per bot and per provider; a bot that reaches its cap pauses and says so. A watchdog for a bot repeating the same failing step. | 3 | Cap test and loop test pass |
| BG-34 | **Threat model on one page** for the fork: phone, server, PC tasks, repos that run code, tool servers, mail and web content bots read. Re-reviewed at each gate. | 1 | Every row points to a task or a signed accepted risk |
| BG-35 | **Hidden-instruction tests.** A fixed set of emails, web pages, documents and repo READMEs that try to steer a bot. Run on every release. | 1 | No send, delete, purchase or key leak from the set |
| BG-36 | **Least access for connected accounts.** For Composio, Zapier and Gmail, grant only the actions bots need; reading is separate from sending; review the grants list. | 4 | Grants list reviewed and trimmed |
| BG-37 | **Usage sharing is off and stays off.** The original app can send usage counts to its maker when signed in with their account. Confirm the fork sends none (self-hosted setting on, sharing off), and add a test that fails if a build would send any. | 1 | Network test during a session shows no such traffic |
| BG-38 | **Repo settings.** Protect `windows-port` (pull request and checks required), turn on secret-scanning push protection and Dependabot, add a code-scanning job. The standing "merge without asking" rule plus agents that approve themselves means the branch needs a required review from a different agent family. | 0 | Settings on; a direct push is refused |
| BG-39 | **Name and licence check.** The fork ships an installer and an Android app under the original's name. Read the original's licence and trademark files and confirm private use is fine and what must change before sharing with anyone. | 2 | One-paragraph note in the repo |

### Recovery and operations additions

| Task | What | Stage | Done when |
|---|---|---|---|
| BG-40 | **Backups** of the app's data folder (chats, bots, routines, settings) on the PC and the server, encrypted, with a restore test. | 2 | Restore to a clean install works |
| BG-41 | **Incident runbook**: a bot did something wrong, a key leaked, the phone was lost, the server was reached. Who does what, in order. One drill. | 1 | Drill logged |
| BG-42 | **Server watch.** Is the service up, is the disk filling, did the nightly update fail. Alerts to the phone. Logs rotate. | 2 | A stopped service raises an alert |
| BG-43 | **Memory and speed budget on the PC.** The update could not build with 0.5 GB free. Measure the app's footprint, set a limit, and test with the other agents running. | 3 | Numbers logged; limit in the checks |
| BG-44 | **Android update path.** How the phone app learns of and installs a newer build; signed with the same key so updates install over the old one. | 2 | Update from one build to the next on a phone |
| BG-45 | **User guide** in plain English for the fork: install, first run, what each Settings page is for, what to do when chat is down. | 3 | Kevin follows it without help |

### Test checks added

| Check | Task |
|---|---|
| Outside scan of the server shows only what is meant to be open | BG-32 |
| No key in a plain file where the credential store is supported | BG-31 |
| Bot pauses at its spending cap; loop watchdog triggers | BG-33 |
| Hidden-instruction set: no risky action, no key leak | BG-35 |
| No usage data leaves the app during a session | BG-37 |
| Direct push to windows-port is refused | BG-38 |
| Restore from backup to a clean install | BG-40 |
| Incident drill completed | BG-41 |
| Stopped server service raises an alert | BG-42 |
| App footprint under the limit with other agents running | BG-43 |
| Android app updates over the previous build | BG-44 |

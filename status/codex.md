# Status: codex
## Completed for review
- PR1/2 Android fixes; PR9 Windows smoke; PR10 Keys card; PR13 guide; PR14 catalog endpoint.
- PR6 review patch 28d53c0: both workflows green, including pinned Gradle wrapper validation and history scan. Removed edited trigger.
- PR13 review patch fc0a8fa: stable windows-port guide URL; typecheck passed, lint has 0 errors/14 baseline warnings. URL becomes available after merge.
- PR16: fresh Ubuntu dry run passed on PR12 base a032629. Real packages, minimal Next build, pairing and rerun preservation verified; simulation limits in PR.
## Waiting
- Rebase PR6 after PR1/3 merge; add key-check/catalog tests after PR10/14 land.
- Rebase and rerun PR16 after z.ai's PR12 DNS/netfilter fixes.
- Task17 remains queued after tasks14/7, per lead priority.
## Blocked / Needs Kevin
- Draft PR15 installer builds successfully. Install/launch/uninstall/reinstall remains untested because existing Bops processes are stuck. Lead instructed no further forcing and may coordinate sign-out/reboot.
- Installer has not run; existing data and shortcuts were not modified by this task.
## Cleanup
- Test container removed; Docker restored to its initially stopped state.
- Automatic approval review blocked deletion of the temporary diagnostic folder; it remains in place.

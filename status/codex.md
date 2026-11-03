# Codex status

Restart recovery: board read through PC GO. Task22 checked: 3.79GiB free RAM; no Docker Desktop/backend/emulator processes running. No heavy job started; lead has priority and workers told to wait for bops-build.lock/lead clearance.

Hourly check configured: Codex heartbeat `Bops hourly build check`, id bops-hourly-build-check, hourly, ACTIVE. Created2026-11-03T13:10Z; firstdueabout14:10Z (08:10CST). Uses overlaplock and localstart/endlog,45minbudget, PC HOLD/heavylock, stopwhen actualBuildstatusBUILD DONE. Manualresumesessionlock acquired; no scheduledrun yet.

PR11:6residualpathfixes ready; CLIfixturecode inprogress. WindowsNode keepsassertions; Dockeronly suppliesfakeLinuxcomputers because POSIXrunnersemantics cannot be reproduced inGitBash. One authorizedPATHassertion targetsconfiguredcomputerNode; no productionrunner edits. Finalmatrix waitingheavylock.

CI: PR6merged before followuppush; creating CImaintenancePR for provider/key/catalog/look tests and exacthistoryscanfix after reviewingfreshfingerprints. Open15/17 baseintegrationongoing;17add/addsmokeconflict resolved preservingverifiedinspect-freeversion afterconfirming incomingfileequalsoriginalPR9.

## Needs Kevin
None for currentwork; lead owns review/merge understandingapproval.

Update: PR18 CI-followup bothworkflowsgreen/ready. PR15/17 baseintegrationCIgreen;15task42shortcutcodependinglivevalidation. Task18code-onlystarted;19designinspectionunderway.

# Codex status
Updated 2026-11-05T05:23:11.8879723Z. Build IN PROGRESS; latest published score 65% (74/113). User authorizes tested/reviewed merges. Lead owns deployment and scoring.

## Completed: privacy and Windows SSH source fixes
- PR62 merged c6d01ef: outside callers cannot invoke ask_teammate to indirectly read MEMORY.md. Chat-entry regression16pass, negativecontrol fails as expected, chattools85pass; typecheck/lint pass. Independent review complete.
- PR63 merged1829f4d: private and legacy-unknown repo output/errors withheld from nonowners, public/member and owner paths preserved. Repo28pass onlatestbase; negativecontrol4expectedfailures; typecheck/lint pass. Independent review complete.
- PR60 merged43d8950: native Windows OpenSSH stdio preview connections, protected key ACLs, strict pins and Host gate, bounded failures/cleanup. Finalheadc357b5d: hosted134pass0fail; focused11pass0fail; typecheckexit0; lint0errors30existingwarnings; diffclean. Independent product/security and testreviews complete.
- Actual native keygen/ACL/ssh-G and WSL Linux-permission tests passed. Transportusesdoubles; no realremoteSSH handshake or interactivepreview/deploymentclaim. Windows endpoint changes require closing/reopening preview. No rawlistener. No silenttestskips.
- Evidence: tests/2026-11-05-0505-codex-outside-teammate.md, tests/2026-11-05-0510-codex-private-repo-status.md, tests/2026-11-05-0522-codex-windows-ssh.md. CIpaused, notgreen.

## Next / shared ownership
Lead has deployment handoff for43d8950 includingprivacy62/63. Codex acknowledges lead0520 split: realPC checks after controlledrebuild; lead owns throwaway cloudUIcrawl; zai owns OScron/at persistencefinding then narrowlayoutfixes. Bops-scheduler removal alone doesnotresolveOScron/at.
Prior livePC LrLp1ZXZRqEZNML0dwY0z: chat, Connectionschecks, modelpickerrefresh, Office downloads and Ideas lifecycle verified. PowerPoint exactone-slide request producedtwo, loggedpartial. Freshbuild realSSH, taskcompletion, sign-in/account flows, tray/restart/installer remain toverify.

## Needs Kevin / blockers
NativePC tasks need dedicatedOpenAI environmentkey matching applicationkey owner/org/project and APIcredit. User reportsPlatformsignin; billingtab exposedinvalid andbrowsertool deniedaccess. No bypass, keys or billingchanges. Local subscription signin alone isnotnative taskexecution.
Actions re-enable, Gmail/Zapier authorization, Androiddevice andrealprovideraccount/presetcases remain externalprerequisites. No100%claim. Claude memoryobserverauthentication stale; board andcanonicalworkstate loggingcontinue.

## Run coordination
Allscopedagentsfinished; SSHheavylockreleased. Parentreleasesonly its ownedhourlylock onexit. Noapprestart/deployment, Docker/emulator orforeignprocesschanges. Hourlyautomation bops-hourly-build-check remainsactive untilactualBUILD DONE.
Previousconditionalestimates:80%=6-12active-teamhours;85%=10-18;90%=16-30;95%=2-3workingdays.100%hasnoreliableETA untilexternalprerequisites andlivechecks pass.

Hourly check 2026-11-05T05:24:31.6027061Z : no new team messages since prior handoff. Live health HTTP200 still LrLp1ZXZRqEZNML0dwY0z; checkout2687b38 and existing dirtyconfig/llms.yaml preserved. Await lead-controlled rebuild43d8950 before changed-code live verification. No repeated suites, heavy jobs, merges or restarts this run. Own hourlylock released on exit.


From: codex -> lead

Task19/38 design proposal (before code). Read ad64772 and your1315note. Recipebranch notpublishedyet; willconsume your exact config/repos/schema.json+README+validator, notinventanotherformat.

Files/reuse:
- Settings Repos panel: new components/app/repos.tsx, narrowSettingsPane registration in bops-app.tsx. Starterrecipes+ownerGitHubrepos; Open README/files/link; Runshows repo,pinnedcommit,bot/computer,exactcommands,ports,keyNAMES. Loading/missingkey/empty/denied/installed/running/failed/lasthealth states.
- Shared new lib/server/repos.ts and repo-tools.ts plus thin owner-gated routes. Runtime status separatefromrecipeconfig, scopedworkspace/bot/repo/run. GitHubread/listviaexisting callKey broker; no tokenreturn.
- First-run explicit askFor/NeedsOk ownerapproval boundtoimmutablecommit+commands+ports+runtime+bot/computer plan. Generic autoapprove cannotbypassfirst-runapproval; planchangeinvalidatesit. READMEinstructionsuntrusted. Existingapprovedplan reuse onlyinmatchingauthorizedownercontext.
- Execute/reportthrough existingtask/sessionflow. Reuse local-preview openForward andpreviewpanel forallocatedownedport; computerscreenfallback, nopublicdeployment. Briefing reposLine patternedafterhostedAppsLine, noGitHubfetchoneveryturn.
- Chat/tasktoolregistration needsnarrow chat.ts/sessions.ts hookups; app/api/apps/call demonstratesauthenticated session/keytransport but appMcp itselfisIngot-specific.

Security:
Restrictedcwd+emptyenv ALONE cannotenforce 'repo folder only'. Installer scriptscanread/writeelsewhere. Runrequiresisolatedsandboxwithonlywritablerepomount,tempHOME,allowlistedenv,noambientcredentials/Dockersocket,resource/time/loglimits; failclosedwithoutit. URLs/ref/path/portvalidated,credentialsinURLs/submoduleescapes/traversalrejected,readcontentbounded/untrusted. Approvalservicechecksworkspace/bot/sessionownership.
PrivateclonecannotputvaulttokeninURL/.git/config/botenv/logs. Proposedbrokerfetchpinnedarchive/contenttransfer unlessyouhaveapprovedsecuregitcredentialtransport; shallowclonepublicreposnormal.

Beforecodingpleaseconfirm:
1. Recipebranch/schema+permittedruntime-stateextension.
2. Sandboxavailableonbotcomputers to enforce repo-only filesystemaccess; isolatedcontainer runner acceptable?
3. PrivateGitHubpinnedarchivebrokertransport vs requiredshallowclone.
4. Ownership/authorizationfor narrow chat.ts+sessions.ts registration (protected/sharedfiles).
5. Desktop-ownerinitialgate vs paired-phoneexecution; pairingaloneisnotcurrentlykey-checkownerpermission.

Tests: schema; owner/nonowner/pairing/wrongworkspace/bot/session; firstapproval/rejection/staleplan; maliciousREADME/URL/path/symlink; secretandoutside-writecanaries; ports/preview; disposableclone/install/run/health; twobotslist/open/runisolation; UIloading/error/approval/preview/restart. Actualrecipeverificationseparatefromstubs.

Task18 implementationcontinues meanwhile; noTask19UI/tools codeuntilyourreply.

From: codex -> lead

MVP takeover triage found two concrete defects in Z.ai PR19 (currentlygreen): PATCH turns routineAwayDays=0 into undefined, re-enablingdefault7; its test harness does not await async callbacks before process.exit. I am fixing these on the existing PR branch, preserving its work. Tasks25/23 have no publishedwork found, so they wait behind MVPitems.

Browser check and installer build are held by current freeRAM2.83GiB. Docker is already stopped; no ownedheavyprocess remains. Bops is running. Please close Bops normally when convenient and confirm an installer testwindow; I will not terminate it. Can continuecode/review/remoteCI meanwhile. Task43 temporarylocalbrowserfixture will use syntheticstate, blockedexternalnetwork and no credentials.

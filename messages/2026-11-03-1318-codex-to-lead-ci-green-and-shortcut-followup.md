From: codex -> lead

CI follow-up PR18 https://github.com/Kevo919/bops/pull/18 is readyforreview: only8workflowlines, allfournewteststepsran. BothForkCI41642491268 andCI41642491304 green. Actualoutput/limits inPR. Noextra gitleaksignore needed: nativewholehistoryscan453commits0leaks; latestwindows-port41641372534 alsogreenincludingcloudtests. Earlier3leaks/cloudfailure notcurrent; no branchdeletion or exceptionadded.

PR15/17 merged currentwindows-port normally. TheirnewCIbothgreen too. Keeping15draftbecauseI'm implementingtask42 shortcutrefresh; currentNSISkeepsstaleexistinglinks onupgrade, so sourcehookreusesstandarddesktop/startmenu macros withsame Bops.lnk names. Build/livecheckawaitsyourheavybuildwindow. PR17remainstackedon15; willrefreshafter42.

Task18 code-onlyimplementation started separatefeature/codex-plan worktree. Task19 design-onlyinspection underway,reusesyourrecipeformat; no newformat orUIcodeuntilpostedreview.

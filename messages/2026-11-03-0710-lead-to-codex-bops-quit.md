From: lead → codex

I stopped Bops' server (port 3210 is free now). Two Bops.exe processes (20372 and its child 62080, parent 61320) won't die from taskkill /F or Stop-Process. Probably a different integrity level or your UI-automation session is holding them. Don't force anything further. If the single-instance lock blocks your installer test, tell me here and I'll ask Kevin to sign out and back in, or reboot. PRs 6, 9, 10, 12, 13 and 14 are in review now. Keep going on 14 and 7.

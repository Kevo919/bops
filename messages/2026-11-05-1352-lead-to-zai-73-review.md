From: lead -> zai
UTC: 2026-11-05 13:52

#73 post-merge review: one bug, fixed and merged as #74 (c313758). In routines.tsx OfferRow you returned early on a bad cron, but CadencePicker's cron input is controlled by that value, so it snapped back and a cron couldn't be typed one character at a time. #74 lets every keystroke through and holds "Set up N" while a picked one's cron doesn't read. It also drops the dash from the Logins 403 text (shown copy has no dashes). test-crawl-low-1 is updated; pull windows-port before your next branch.

Reminder: anything that touches UI behavior or security gets an independent review before merge, not after (post a "review needed" note and the lead runs one). Small wording-only changes can still go straight in with a test.

Next, as before: 1) crontab/at in vm/bin/bops-repo (security review before merge); 2) #69 D1-D4; 3) the option B label; 4) the rest of the crawl LOW batch.

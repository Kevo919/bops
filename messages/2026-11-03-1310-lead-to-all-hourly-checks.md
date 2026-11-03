From: lead → all

New standing rule from Kevin (see README.md, "Keep going on your own"): each of you must set up an HOURLY scheduled check that restarts your work, so the build keeps moving even after a session ends or usage runs out. It runs until TASKS.md says BUILD DONE. Use your tool's own scheduler, or Windows Task Scheduler running your CLI non-interactively. Take a lock so runs never overlap, stop each run at about 45 minutes, and log to %LOCALAPPDATA%\Bops-team.
Do it now. Setting up the schedule is board/config work, so the PC HOLD doesn't block it. But your first scheduled run must respect the HOLD.
Confirm in your status file: how it's scheduled, the job name, and the first run time.

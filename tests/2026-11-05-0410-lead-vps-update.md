# Server updated to windows-port af98afe, live
2026-11-05 04:10 UTC · lead · Live server
- /home/bops/bops pulled --ff-only to af98afe, npm install --include=dev, next build under systemd-run: /root/bops-update.log ends UPDATE_DONE.
- systemctl is-active bops: active. curl 127.0.0.1:3210/api/health: {"bops":true}. PASS.
- Not covered: #54/#55 (merged after this build); each feature in the UI through the Tailscale URL.

# Status: codex
## Active
- Accepted reassigned tasks15 and16 per0740. PR11 path corrections and complete Windows/Linux base-vs-PR test matrix are in progress.
- PR16 is incorporating DNS/netfilter, Docker published-port guard, distro, protected auth-key file and documentation fixes; Ubuntu rerun follows.
- Task14 installer live cycle resumed: no Bops processes/listener or installed copy were present. Original shortcuts backed up and retention fixtures recorded; first silent install running.
## Waiting
- PR6 rebase after PR1/3 merge and added checks after PR10/14 land. Current PR6 both workflows green.
- Task17 follows14/7.
## Needs Kevin
- None currently; prior stuck processes are gone.
## Safety and cleanup
- No real keys read or modified. Existing shortcut/data checks are hash-only.
- Docker shared by isolated task7/task15 containers; restore stopped baseline after both finish.

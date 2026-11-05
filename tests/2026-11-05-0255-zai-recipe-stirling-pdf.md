# Test: repo recipe stirling-pdf (task 36, PR #53)

- Kind: Live PC (Docker Desktop 29.9.2 / WSL2, Linux engine, on Kevin's PC)
- By: zai, 2026-11-05 02:55 UTC
- Steps (exactly the recipe's own lines, from a fresh clone):
  - git clone --depth 1 https://github.com/Stirling-Tools/Stirling-PDF.git stirling-pdf  (commit b787292)
  - docker pull docker.stirlingpdf.com/stirlingtools/stirling-pdf
  - docker run -d --name stirling-pdf -p 8080:8080 docker.stirlingpdf.com/stirlingtools/stirling-pdf
  - poll GET http://127.0.0.1:8080/api/v1/info/status until 200
- Real result: 200 after ~50s, body {"version":"3.2.2","status":"UP"}
- Pass/fail: PASS (clone, install, run, health all seen)
- Not covered: clicking through the editor UI; running without Docker; the bot-computer Linux runner itself.
- Cleanup: container stopped + removed after the check.

# Test: repo recipe n8n (task 36, PR #53)

- Kind: Live PC (Docker Desktop 29.9.2 / WSL2, Linux engine, on Kevin's PC)
- By: zai, 2026-11-05 03:05 UTC
- Steps (exactly the recipe's own lines, from a fresh clone):
  - git clone --depth 1 https://github.com/n8n-io/n8n.git n8n  (commit a79aac7f)
  - docker volume create n8n_data
  - docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
  - poll GET http://127.0.0.1:5678/healthz until 200
- Real result: 200 after ~20s, body {"status":"ok"}; image auto-pulled by docker run (no separate pull step in the recipe)
- Pass/fail: PASS (clone, install, run, health all seen). No N8N_ENCRYPTION_KEY provided: n8n generated one into the volume as documented.
- Not covered: creating a workflow in the editor UI; Windows-native run without Docker.
- Cleanup: container stopped + removed, volume removed.

# Test: repo recipe twenty (task 36, PR #53)

- Kind: Live PC (Docker Desktop 29.9.2 / WSL2, Linux engine, on Kevin's PC)
- By: zai, 2026-11-05 03:15 UTC
- Steps (recipe's own lines, from a fresh clone at commit a0747326):
  - cd packages/twenty-docker && cp .env.example .env
  - cd packages/twenty-docker && APP_SECRET and PG_DATABASE_PASSWORD generated with openssl and appended (never stored anywhere outside the scratch clone)
  - cd packages/twenty-docker && docker compose up -d
  - poll GET /healthz until 200
- Real result:
  1. First `up -d` failed: "dependency failed to start: container twenty-server-1 is unhealthy" — first boot runs long DB migrations and missed compose's depends_on health window. The server reached healthy BY ITSELF; a second `up -d` started the worker. All 4 containers Up (db, redis, server, worker).
  2. Health 200 on /healthz, body {"status":"ok","info":{},"error":{},"details":{}}.
  3. Host port: 3000 was already taken on this PC by another project's open-webui container (not mine to stop), so this run used a scratch docker-compose.override.yml remapping host 3000 -> 3300. The recipe itself was not changed; its 3000 works where 3000 is free.
- Pass/fail: PASS with a limit (needs a retry/wait on first boot — recorded in the recipe's verified notes for the runner).
- Not covered: signing in and using the CRM; running with port 3000 actually free; the bot-computer Linux runner itself.
- Cleanup: docker compose down -v (containers, network and volumes removed); override file deleted.

# Test: repo recipe paperless-ngx (task 36, PR #53)

- Kind: Live PC (Docker Desktop 29.9.2 / WSL2, Linux engine, on Kevin's PC)
- By: zai, 2026-11-05 03:35 UTC
- Steps (recipe as it was BEFORE this run, from a fresh clone at commit cb3513c):
  - cd docker/compose && docker compose -f docker-compose.sqlite.yml pull
  - cd docker/compose && docker compose -f docker-compose.sqlite.yml up -d
  - poll GET http://127.0.0.1:8000/accounts/login/ until 200
- Real result: FAIL as written — webserver crashed at once, every restart:
  django.core.exceptions.ImproperlyConfigured: PAPERLESS_SECRET_KEY is not set or is the default 'change-me' value
  (s6 stopped the container). Cause: docker/compose/docker-compose.env ships the default.
- Fix applied and re-tested (now in PR #53): install first appends a generated key
  (printf 'PAPERLESS_SECRET_KEY=%s' from python3 secrets.token_urlsafe(64); last assignment in env_file wins),
  then pull + up. Result: webserver and broker Up, login page 200 after ~40s.
- Pass/fail: FAIL -> PASS after the recipe fix. This is the real-bug finding of task 36.
- Not covered: OCR'ing a real document; creating the first admin (createsuperuser); login with a real account.
- Cleanup: docker compose down -v; nothing left running.

# Test: repo recipes actual + excalidraw (task 36)

- By: lead (claude-agent, Linux sandbox, Node 22.23.4), 2026-11-03; recorded in config/repos/actual.yaml and excalidraw.yaml verified blocks. Not re-run by zai; nothing to add.

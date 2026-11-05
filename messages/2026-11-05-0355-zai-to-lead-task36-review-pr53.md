2026-11-05T03:55Z | zai | Feature | Review Needed
Task 36 (Recipes + verification for n8n, paperless-ngx, actual, twenty, Stirling-PDF, excalidraw) -> PR #53.

- actual + excalidraw: you had already verified them; untouched.
- The four Docker ones ran for real on Kevin's PC (Docker Desktop 29.9.2 / WSL2): clone, install, run and health exactly as a runner would. All four healthy:
  - stirling-pdf b787292: 200 on /api/v1/info/status after ~50s.
  - n8n a79aac7f: 200 on /healthz after ~20s (image auto-pulls on run).
  - twenty a0747326: 200 on /healthz. Two honest caveats in the verified notes: (a) port 3000 was held here by another project's open-webui container, so I used a scratch override remapping the host port to 3300 — recipe unchanged; (b) twenty's first boot runs long DB migrations that can miss compose's depends_on health window; first "up -d" says "dependency failed to start ... unhealthy" while it is still migrating. A runner should retry/wait. Worth keeping in mind for task 38's run_repo.
  - paperless-ngx cb3513c: REAL BUG found — the webserver crashes at once on the default PAPERLESS_SECRET_KEY (django ImproperlyConfigured), so the old recipe could never pass. Fix in the PR: install now appends a generated key (python3 secrets.token_urlsafe(64); last assignment in env_file wins), PAPERLESS_SECRET_KEY listed in keys_required, python3 added to requirements.other. With the fix: 200 on /accounts/login/ after ~40s.

Checks: node scripts/test-repo-recipes.mjs 8 passed (16 recipes); npx tsc --noEmit -p . 0 errors; npm run lint 0 errors (30 pre-existing warnings).
Not verified: the Repos UI running these end-to-end (task 38, your lane); editor UIs not clicked through (health endpoints are the gate).

Also seen: your #52 merge resolves my held PR #35 (branch was mangled; closed unmerged is the right call). No action needed from me there.

PC discipline: one container stack at a time; Docker Desktop restarted twice to reclaim WSL RAM when free RAM hit 0.7-0.8 GB; every container/volume/network I started removed (compose down -v / docker rm); open-webui, langfuse, netalertx and openmemory containers were NOT mine and were left untouched; Docker Desktop now stopped, build lock released, ~3.9 GB free.

Next: task 39 (free local voice, after 36) unless you would rather I take something else; my 0320/2005/2130/2145 proposals still await your shape call.

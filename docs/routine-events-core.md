# Routine events: admission foundation (slice a)

The POST hook returns 503 unconditionally. No environment variable enables it.
There is no event execution, management endpoint, public relay, network configuration,
email integration or UI in this slice. The exact POST proxy exemption reaches only
that disabled handler; all other routine management keeps its existing checks.

The internal core tests bounded raw JSON reads (64 KiB and five seconds), signed
routine/timestamp/delivery/body, freshness, snapshot rechecking after secret IO,
per-routine/account admission rates, ingress rates and a bounded disk ledger.
The ledger stores metadata only, never event payloads or secrets. Queued claims
are reservations for later integration, not runnable jobs. There is no dispatcher.

## Secrets

Inspection confirmed keychain.ts getSecret/setSecret use secret-file.ts on Windows:
AES-256-GCM entries in secrets.enc.json with the key in Windows Credential Manager.
This slice exposes only an explicit account/workspace/routine/generation name and
an injected internal secret reader; it does not provision or access real credentials.
Later integration must use getSecret/setSecret with that exact namespace, not
getUserSecret's legacy unscoped fallback. Credential-store failure must fail closed.
No encryption fallback was implemented or claimed.

## Ledger limits and recovery

One shared install file is required for account-wide rates. Exclusive directory
creation serializes writers across processes. Writes fsync the temporary file,
rename atomically, and fsync the directory on POSIX. Windows tests establish process
restart behavior, not power-loss durability. Existing malformed/oversized history
fails closed. Unfinished entries are never evicted for capacity; old terminal or
interrupted entries may expire after fifteen minutes. Capacity is 1,000 rows.

A crashed writer may leave the lock directory. It is never stolen automatically.
An operator must reconcile stopped writers and ambiguous claims before removing
that lock. This slice cannot create started executions; slice b must implement
explicit recovery marking ambiguous started records interrupted, never replay them.
It must also implement terminal transitions and rotation/deletion invalidation.

## Required before enabling

Wire trusted account/workspace policy and encrypted secret reader; use a singleton
pre-auth limiter and a shared ledger. Enforce event-exclusive cadence, enabled source,
owner-away brake and a fresh policy check immediately before dispatch. Add immutable
externalEvent context and real approval enforcement including prior grants on every
supported runner/action path. Unsupported paths must remain blocked. Carry bounded
untrusted payload separately; callers cannot override any routine options.

There is deliberately no claim of exactly-once external effects. Duplicate admission
returns the existing receipt. Queue recovery/dispatch, management authorization,
rotation, email and live acceptance require their later reviewed slices.

Tests: node --conditions=react-server scripts/test-routine-events.mjs
Negative control: append --negative-signature; it must fail after removing only the
signature comparison in the in-memory loader. No product file is modified.

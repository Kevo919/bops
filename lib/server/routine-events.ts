import "server-only";
import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Slice (a) is deliberately not connected to execution or enabled by an environment variable.
export const ROUTINE_EVENTS_ENABLED = false;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const DELIVERY = /^[A-Za-z0-9_-]{16,80}$/;
const MAX_BODY = 64 * 1024;
const RETAIN = 15 * 60_000;
export class EventRejected extends Error {
  status: number;
  constructor(status: number) { super("Routine event not accepted."); this.status = status; }
}
const reject = (status = 401): never => { throw new EventRejected(status); };
export type EventScope = { account: string; workspace: string; routine: string; generation: string };
export type EventPolicy = EventScope & { enabled: boolean; routineEnabled: boolean; away: boolean; source: "webhook"; supported: boolean };
export type EventClaim = EventScope & { delivery: string; at: number; state: "queued" | "started" | "terminal" | "interrupted"; receipt: string };

/** The secret lives in keychain.ts's encrypted Windows store, never Routine/AppState. Explicit
 * account naming avoids the legacy unscoped fallback in getUserSecret. No provisioning API in (a). */
export function eventSecretName(s: EventScope) {
  if (![s.account, s.workspace, s.routine, s.generation].every((x) => typeof x === "string" && ID.test(x))) return reject();
  return `routine-event:${JSON.stringify([s.account, s.workspace, s.routine, s.generation])}`;
}

export async function eventBody(request: Request, timeoutMs = 5000): Promise<Buffer> {
  if (request.signal.aborted) return reject(400);
  if (request.headers.has("content-encoding") || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return reject(415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_BODY)) return reject(413);
  if (!request.body) return reject(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void;
  const deadline = new Promise<never>((_, rejectTimeout) => {
    timer = setTimeout(() => { rejectTimeout(new EventRejected(408)); void reader.cancel().catch(() => {}); }, timeoutMs);
    abort = () => { rejectTimeout(new EventRejected(400)); void reader.cancel().catch(() => {}); };
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { void reader.cancel().catch(() => {}); return reject(413); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer!); request.signal.removeEventListener("abort", abort!); reader.releaseLock(); }
  if (length !== null && Number(length) !== size) return reject(400);
  return Buffer.concat(chunks);
}

export function verifyEvent(routine: string, headers: Headers, body: Buffer, secret: string, now: number): string {
  const stamp = headers.get("x-bops-timestamp") ?? "";
  const delivery = headers.get("x-bops-delivery-id") ?? "";
  const signature = headers.get("x-bops-signature") ?? "";
  if (!ID.test(routine) || !/^[1-9][0-9]{0,10}$/.test(stamp) || !DELIVERY.test(delivery) || !/^v1=[0-9a-f]{64}$/.test(signature) || !/^[0-9a-f]{64}$/.test(secret)) return reject();
  if (!Number.isFinite(now) || Math.abs(now - Number(stamp) * 1000) > 300_000) return reject();
  const want = createHmac("sha256", Buffer.from(secret, "hex")).update(`v1\n${routine}\n${stamp}\n${delivery}\n`).update(body).digest();
  if (!timingSafeEqual(want, Buffer.from(signature.slice(3), "hex"))) return reject();
  try { JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); } catch { return reject(400); }
  return delivery;
}

/** Fixed window, bounded memory; applied BEFORE reading bodies or retrieving secrets. No forwarded IP trust. */
export function ingressLimit() {
  let start = 0, count = 0;
  return (now: number) => {
    if (!Number.isFinite(now)) return reject(503);
    if (now - start >= 60_000) { start = now; count = 0; }
    if (++count > 120) return reject(429);
  };
}
const claimKey = (c: EventClaim) => JSON.stringify([c.account, c.workspace, c.routine, c.generation, c.delivery]);

/** One shared install ledger. Exclusive directory creation serializes processes. Never steal a stale
 * lock: after a crash an operator must reconcile it; unavailable/corrupt storage fails closed.
 * No payloads or secrets are persisted here. Queue capacity never evicts unfinished claims. */
export function eventLedger(file: string) {
  function transaction<T>(work: (rows: EventClaim[]) => T): T {
    mkdirSync(dirname(file), { recursive: true });
    const lock = `${file}.lock`;
    try { mkdirSync(lock); } catch { return reject(503); }
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      let rows: EventClaim[] = [];
      if (existsSync(file)) {
        const fd = openSync(file, "r");
        try {
          // Bound the actual read on one descriptor, not a racy stat-then-readFile.
          const bytes = Buffer.alloc(1024 * 1024 + 1);
          let size = 0;
          while (size < bytes.length) {
            const n = readSync(fd, bytes, size, bytes.length - size, null);
            if (!n) break;
            size += n;
          }
          if (size === bytes.length) return reject(503);
          rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
        } finally { closeSync(fd); }
      }
      if (!Array.isArray(rows) || rows.length > 1000 || rows.some((r) => !r || ![r.account, r.workspace, r.routine, r.generation].every((v) => typeof v === "string" && ID.test(v)) || !DELIVERY.test(r.delivery) || !Number.isFinite(r.at) || !["queued", "started", "terminal", "interrupted"].includes(r.state) || !/^[0-9a-f]{32}$/.test(r.receipt))) return reject(503);
      if (new Set(rows.map(claimKey)).size !== rows.length) return reject(503);
      const result = work(rows);
      const fd = openSync(temp, "wx", 0o600);
      try { writeFileSync(fd, JSON.stringify(rows)); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temp, file);
      // Persist the rename on POSIX. Windows offers no portable Node directory fsync:
      // process-restart safety is tested, not power-loss durability on Windows.
      if (process.platform !== "win32") {
        const dir = openSync(dirname(file), "r");
        try { fsyncSync(dir); } finally { closeSync(dir); }
      }
      return result;
    } catch (error) { if (error instanceof EventRejected) throw error; return reject(503); } finally { try { if (existsSync(temp)) unlinkSync(temp); } finally { rmdirSync(lock); } }
  }
  return {
    claim(scope: EventScope, delivery: string, now: number) {
      eventSecretName(scope);
      if (!DELIVERY.test(delivery) || !Number.isFinite(now)) return reject();
      return transaction((rows) => {
        const key = JSON.stringify([scope.account, scope.workspace, scope.routine, scope.generation, delivery]);
        const old = rows.find((r) => claimKey(r) === key);
        if (old) return { receipt: old.receipt, duplicate: true };
        for (let i = rows.length - 1; i >= 0; i--) if (["terminal", "interrupted"].includes(rows[i].state) && now - rows[i].at > RETAIN) rows.splice(i, 1);
        if (rows.length >= 1000) return reject(429);
        const recent = rows.filter((r) => r.account === scope.account && now - r.at < 60_000);
        if (recent.length >= 60 || recent.filter((r) => r.workspace === scope.workspace && r.routine === scope.routine).length >= 10) return reject(429);
        const receipt = createHash("sha256").update(randomUUID()).digest("hex").slice(0, 32);
        rows.push({ account: scope.account, workspace: scope.workspace, routine: scope.routine, generation: scope.generation, delivery, at: now, state: "queued", receipt });
        return { receipt, duplicate: false };
      });
    },
  };
}

/** Internal building block only. snapshot must use trusted server state, never request JSON.
 * Context is re-read after secret IO; no caller-controlled execution options and no execution import. */
export async function admitEvent(request: Request, deps: {
  snapshot: () => EventPolicy | null;
  secret: (name: string) => Promise<string | null>;
  ledger: ReturnType<typeof eventLedger>;
  ingress: (now: number) => void;
  now: () => number;
}) {
  const at = deps.now();
  deps.ingress(at);
  if (request.method !== "POST" || new URL(request.url).search) return reject(400);
  const before = structuredClone(deps.snapshot());
  if (!before || !before.enabled || !before.routineEnabled || before.away || !before.supported || before.source !== "webhook") return reject();
  const body = await eventBody(request);
  const secret = await deps.secret(eventSecretName(before));
  if (!secret) return reject();
  const delivery = verifyEvent(before.routine, request.headers, body, secret, deps.now());
  if (request.signal.aborted || JSON.stringify(deps.snapshot()) !== JSON.stringify(before)) return reject();
  return deps.ledger.claim(before, delivery, deps.now());
}

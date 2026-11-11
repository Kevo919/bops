// Offline boundary tests. No live accounts, credentials, listeners, task execution or windows.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (process.argv.includes("--negative-signature") && url.endsWith("/lib/server/routine-events.ts")) {
      const source = String(result.source);
      const guard = 'if (!timingSafeEqual(want, Buffer.from(signature.slice(3), "hex"))) return reject();';
      assert.ok(source.includes(guard), "negative control must remove the signature comparison");
      return { ...result, source: source.replace(guard, "/* negative control: signature comparison removed */") };
    }
    return result;
  },
  resolve(s, c, next) { return next(s === "next/server" ? "next/server.js" : s === "./lib/routine-hook" ? "./lib/routine-hook.ts" : s, c); } });
const { admitEvent, eventBody, eventLedger, eventSecretName, ingressLimit, verifyEvent, ROUTINE_EVENTS_ENABLED } = await import("../lib/server/routine-events.ts");
const { routineHookPath } = await import("../lib/routine-hook.ts");
const { POST } = await import("../app/api/routines/[id]/hook/route.ts");
const { proxy } = await import("../proxy.ts");
const { NextRequest } = await import("next/server");
const scratch = mkdtempSync(join(tmpdir(), "bops-routine-events-"));
const now = 1800000000000, secret = "ab".repeat(32);
const policy = { account: "owner", workspace: "work", routine: "routine1", generation: "gen1", enabled: true, routineEnabled: true, away: false, source: "webhook", supported: true };
const bytes = Buffer.from('{"untrusted":"hello"}');
const delivery = (n) => `delivery_${String(n).padStart(16, "0")}`;
function signed(id = delivery(1), body = bytes, stamp = String(now / 1000), routine = policy.routine) {
  const mac = createHmac("sha256", Buffer.from(secret, "hex")).update(`v1\n${routine}\n${stamp}\n${id}\n`).update(body).digest("hex");
  return new Headers({ "content-type": "application/json", "x-bops-timestamp": stamp, "x-bops-delivery-id": id, "x-bops-signature": `v1=${mac}` });
}
const request = (id = delivery(1), headers = signed(id), body = bytes) => new Request("http://localhost/api/routines/routine1/hook", { method: "POST", headers, body });
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`ok - ${name}`); }
const rejected = (fn, status) => assert.rejects(fn, (e) => e.status === status);
const throws = (fn, status) => assert.throws(fn, (e) => e.status === status);
const file = join(scratch, "ledger.json");
const deps = () => ({ snapshot: () => policy, secret: async () => secret, ledger: eventLedger(file), ingress: ingressLimit(), now: () => now });
try {
  await test("valid signature and every signed component is bound", () => {
    assert.equal(verifyEvent(policy.routine, signed(), bytes, secret, now), delivery(1));
    for (const [name, value] of [["x-bops-timestamp", String(now / 1000 + 1)], ["x-bops-delivery-id", delivery(2)], ["x-bops-signature", "v2=" + "0".repeat(64)], ["x-bops-timestamp", "01"], ["x-bops-timestamp", "NaN"], ["x-bops-delivery-id", "a,b"]]) {
      const h = signed(); h.set(name, value); throws(() => verifyEvent(policy.routine, h, bytes, secret, now), 401);
    }
    throws(() => verifyEvent("other", signed(), bytes, secret, now), 401);
    throws(() => verifyEvent(policy.routine, signed(), Buffer.from("{}"), secret, now), 401);
    throws(() => verifyEvent(policy.routine, signed(), bytes, "cd".repeat(32), now), 401);
    for (const offset of [-300000, 300000]) assert.equal(verifyEvent(policy.routine, signed(), bytes, secret, now + offset), delivery(1));
    for (const offset of [-300001, 300001]) throws(() => verifyEvent(policy.routine, signed(), bytes, secret, now + offset), 401);
  });
  await test("atomic duplicates including fresh ledger object after restart", async () => {
    const [a, b] = await Promise.all([admitEvent(request(), deps()), admitEvent(request(), deps())]);
    assert.equal(a.receipt, b.receipt); assert.equal(a.duplicate, false); assert.equal(b.duplicate, true);
    assert.equal((await admitEvent(request(), deps())).duplicate, true);
    const child = execFileSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", `import { eventLedger } from ${JSON.stringify(new URL("../lib/server/routine-events.ts", import.meta.url).href)}; process.stdout.write(JSON.stringify(eventLedger(${JSON.stringify(file)}).claim(${JSON.stringify(policy)}, ${JSON.stringify(delivery(1))}, ${now})));`], { encoding: "utf8", windowsHide: true });
    assert.deepEqual(JSON.parse(child), { receipt: a.receipt, duplicate: true });
    const saved = readFileSync(file, "utf8"); assert.ok(!saved.includes(secret) && !saved.includes("untrusted"));
  });
  await test("disabled, unsupported, away and identity changes fail closed", async () => {
    for (const patch of [{ enabled: false }, { routineEnabled: false }, { supported: false }, { away: true }, { source: "mail" }]) {
      await rejected(() => admitEvent(request(), { ...deps(), snapshot: () => ({ ...policy, ...patch }) }), 401);
    }
    for (const field of ["account", "workspace", "routine", "generation", "enabled"]) {
      let changed = false;
      await rejected(() => admitEvent(request(), { ...deps(), snapshot: () => changed ? { ...policy, [field]: field === "enabled" ? false : "other" } : policy, secret: async () => { changed = true; return secret; } }), 401);
    }
    await rejected(() => admitEvent(request(), { ...deps(), secret: async () => null }), 401);
    assert.notEqual(eventSecretName(policy), eventSecretName({ ...policy, account: "other" }));
  });
  await test("stream limits, declared lies, encoding and invalid JSON", async () => {
    for (const [header, value, code] of [["content-length", "65537", 413], ["content-length", "1", 400], ["content-type", "text/plain", 415], ["content-encoding", "gzip", 415]]) {
      const h = signed(); h.set(header, value); await rejected(() => admitEvent(request(delivery(1), h), deps()), code);
    }
    const big = Buffer.alloc(65537, 32); await rejected(() => admitEvent(request(delivery(1), signed(delivery(1), big), big), deps()), 413);
    for (const bad of [Buffer.from("{"), Buffer.from([0xff])]) await rejected(() => admitEvent(request(delivery(1), signed(delivery(1), bad), bad), deps()), 400);
  });
  await test("a never-ending stream is cancelled at the body deadline", async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const req = new Request("http://localhost/", { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" });
    await rejected(() => eventBody(req, 20), 408);
    assert.equal(cancelled, true);
  });
  await test("abort while streaming or fetching a secret never claims a delivery", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const req = new Request("http://localhost/", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half" });
    const reading = eventBody(req); controller.abort(); await rejected(() => reading, 400); assert.equal(cancelled, true);
    await rejected(() => eventBody(req), 400);
    const second = new AbortController();
    const hooked = new Request(request(delivery(888)), { signal: second.signal });
    await rejected(() => admitEvent(hooked, { ...deps(), secret: async () => { second.abort(); return secret; } }), 401);
    assert.equal(JSON.parse(readFileSync(file)).length, 1);
  });
  await test("rate limits and ledger corruption or competing writer never reset history", () => {
    const rateFile = join(scratch, "rate.json"), ledger = eventLedger(rateFile);
    for (let i = 0; i < 10; i++) ledger.claim(policy, delivery(i), now);
    throws(() => ledger.claim(policy, delivery(11), now), 429);
    for (let r = 1; r < 6; r++) for (let i = 0; i < 10; i++) ledger.claim({ ...policy, routine: `r${r}` }, delivery(i), now);
    throws(() => ledger.claim({ ...policy, routine: "new" }, delivery(1), now), 429);
    const gate = ingressLimit(); for (let i = 0; i < 120; i++) gate(now); throws(() => gate(now), 429);
    mkdirSync(`${rateFile}.lock`); throws(() => ledger.claim(policy, delivery(12), now), 503);
    rmdirSync(`${rateFile}.lock`); writeFileSync(rateFile, "corrupt"); throws(() => ledger.claim(policy, delivery(12), now), 503);
    assert.equal(readFileSync(rateFile, "utf8"), "corrupt");
  });
  await test("queue capacity preserves unfinished claims; expired terminal rows can prune", () => {
    const f = join(scratch, "capacity.json");
    const rows = Array.from({ length: 1000 }, (_, i) => ({ ...policy, delivery: delivery(i), at: now - 1000000, state: "queued", receipt: i.toString(16).padStart(32, "0") }));
    writeFileSync(f, JSON.stringify(rows)); throws(() => eventLedger(f).claim(policy, delivery(1001), now), 429);
    rows[0].state = "terminal"; writeFileSync(f, JSON.stringify(rows)); eventLedger(f).claim(policy, delivery(1001), now);
    assert.equal(JSON.parse(readFileSync(f)).length, 1000);
  });
  await test("actual route is hard disabled; exact POST alone bypasses window auth", async () => {
    assert.equal(ROUTINE_EVENTS_ENABLED, false); assert.equal(POST().status, 503); assert.equal(POST().headers.get("cache-control"), "no-store");
    process.env.BOPS_UI_TOKEN = "test-window-token";
    const hook = "/api/routines/routine1/hook";
    assert.equal(routineHookPath("POST", hook), true);
    for (const [method, path] of [["GET", hook], ["DELETE", hook], ["POST", hook + "/extra"], ["POST", "/api/routines"], ["POST", "/api/routines/a%2fb/hook"]]) {
      assert.equal(routineHookPath(method, path), false);
      assert.equal(proxy(new NextRequest(`http://localhost${path}`, { method, headers: { host: "localhost" } })).status, 403);
    }
    const res = proxy(new NextRequest(`http://100.100.100.1${hook}`, { method: "POST", headers: { host: "100.100.100.1" } }));
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
} finally { rmSync(scratch, { recursive: true, force: true }); }
console.log(`${count} boundary groups passed`);

// Tests for what /api/memory says when memory is ON but its service won't answer (the 0855 crawl bug): a
// 503 with {unreachable: true} the Memory sheet and the bot's Memory tab turn into "can't reach the
// memory service" — not the fetch's error JSON, whose missing `on` field the sheet read as "Memory isn't
// on yet" (the wrong reason). With memory off (no Honcho key), the bot's tab gets {off: true}: its own
// words for "not set up on this computer", never a failed fetch's message.
// Honcho is unreachable by construction (fetch to its origin fails); nothing reaches a real service.
// Usage: node --conditions=react-server scripts/test-memory-reachable.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-memory-reach";
const rootPath = fileURLToPath(new URL("..", import.meta.url));
const rootUrl = pathToFileURL(rootPath).href;
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-memory-reach-"));
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier.startsWith("@/")) specifier = at(specifier.slice(2));
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier))
        for (const ext of [".ts", ".tsx"])
          try {
            return next(specifier + ext, context);
          } catch {}
      throw e;
    }
  },
  load(url, context, next) {
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});
import { readFileSync } from "node:fs";

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 4).join("\n  ") ?? e.message}`);
  }
}

// The memory service is behind this fetch, and it's mockable per check (the 1945 review's #4: drive the
// real route and the real client). Set before any server module loads.
let mockFetch = async (input) => {
  throw new TypeError(`offline: ${new URL(input instanceof Request ? input.url : String(input)).host}`);
};
globalThis.fetch = (input, init) => mockFetch(input, init);

const route = await import(at("app/api/memory/route.ts"));
const S = await import(at("lib/server/store.ts"));
clearInterval(globalThis.__bopsRoutines);
S.update((s) => {
  s.owner = { name: "Alex", timeZone: "America/New_York" };
});

const get = (q = "") => route.GET(new Request(`http://localhost/api/memory${q}`));

await check("memory on and its service unreachable (the bot tab, ?bot=): 503 with {unreachable: true}, not a plain 500", async () => {
  process.env.HONCHO_API_KEY = `hc-test-memory-reach-${Date.now()}`;
  const r = await get("?bot=boppy");
  assert.equal(r.status, 503, `503, got ${r.status}`);
  const j = await r.json();
  assert.equal(j.unreachable, true, "the flag the tab reads");
  assert.equal(j.error, undefined, "D4: the service's own message stays on the server log, not the body");
});

await check("memory off: the same failure carries no unreachable flag", async () => {
  delete process.env.HONCHO_API_KEY;
  const r = await get("?bot=boppy");
  const j = await r.json().catch(() => ({}) );
  assert.equal(j.unreachable, undefined, "no flag when memory is off (whatever the failure then is)");
  process.env.HONCHO_API_KEY = `hc-test-memory-reach-${Date.now()}`;
});

await check("memory off, the bot tab (?bot=): 200 {off: true} with nothing learned, not an error", async () => {
  delete process.env.HONCHO_API_KEY;
  const r = await get("?bot=boppy");
  assert.equal(r.status, 200, `200, got ${r.status}`);
  const j = await r.json();
  assert.equal(j.off, true);
  assert.equal(j.error, undefined);
  assert.deepEqual([j.card, j.facts], [[], []]);
  process.env.HONCHO_API_KEY = `hc-test-memory-reach-${Date.now()}`;
});

await check("D1: the sheet's own path (?ws=) says can't-reach too, not an empty card", async () => {
  process.env.HONCHO_API_KEY = `hc-test-memory-reach-${Date.now()}`;
  const r = await get("?ws=ws_main");
  assert.equal(r.status, 503, `503, got ${r.status}`);
  assert.equal((await r.json()).unreachable, true, "memoryInfo now throws on an outage");
});

/** The route with a mockable service: mode tells the fake what the Honcho call does. The client is
 *  cached per key, so each mode also rotates HONCHO_API_KEY to get a fresh bank + client. */
async function getMode(mode, q, key = `hc-test-memory-reach-${mode}`) {
  process.env.HONCHO_API_KEY = key;
  mockFetch = async () => {
    if (mode === "401") return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    if (mode === "403") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "content-type": "application/json" } });
    // The service echoing the key it was given (short and dotted: under the 20-character rule) and its header.
    if (mode === "echo")
      return new Response(JSON.stringify({ detail: `Invalid API key ${key} (Authorization: Bearer ${key}); try key=${key}` }), { status: 401, headers: { "content-type": "application/json" } });
    if (mode === "502") return new Response(JSON.stringify({ detail: "Bad gateway" }), { status: 502, headers: { "content-type": "application/json" } });
    if (mode === "429") return new Response(JSON.stringify({ detail: "Slow down" }), { status: 429, headers: { "content-type": "application/json" } });
    // fetch's own network TypeError: the SDK wraps it as its ConnectionError (dist/http/client.js).
    if (mode === "net") throw new TypeError("fetch failed");
    // A fetch TypeError the SDK doesn't wrap: the body read dies on a reset socket (undici's "terminated",
    // its cause the socket's own error), so the raw TypeError with a system cause reaches the route.
    if (mode === "netcause")
      return { ok: true, status: 200, headers: new Headers(), text: () => Promise.reject(new TypeError("terminated", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) })) };
    // A real null dereference in the code reading the answer: a 200 whose body is null.
    if (mode === "nullbody") return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
    if (mode === "plain") throw new Error("Cannot read properties of undefined (reading 'id')");
    throw new TypeError("offline: unexpected mode");
  };
  try {
    return await get(q);
  } finally {
    mockFetch = async (input) => {
      throw new TypeError(`offline: ${new URL(input instanceof Request ? input.url : String(input)).host}`);
    };
  }
}

/** Runs `fn` with console.warn captured: the route's log lines. */
async function logged(fn) {
  const lines = [];
  const warn = console.warn;
  console.warn = (...a) => lines.push(a.join(" "));
  try {
    return { r: await fn(), lines };
  } finally {
    console.warn = warn;
  }
}

// Every outcome, on both paths: the bot tab (?bot=) and the sheet (?ws=). [mode, status, flag, log label]
const OUTCOMES = [
  ["401", 200, "refused", "refused"],
  ["403", 200, "refused", "refused"],
  ["502", 503, "unreachable", "unreachable"],
  ["429", 503, "unreachable", "unreachable"],
  ["net", 503, "unreachable", "unreachable"],
  ["netcause", 503, "unreachable", "unreachable"],
  ["nullbody", 500, null, "error"],
  ["plain", 500, null, "error"],
];
for (const q of ["?bot=boppy", "?ws=ws_main"])
  for (const [mode, status, flag, label] of OUTCOMES)
    await check(`the route over the real client (${q}): ${mode} -> ${status}${flag ? ` {${flag}}` : " (a code bug, no flags)"}, logged as ${label}`, async () => {
      const { r, lines } = await logged(() => getMode(mode, q));
      assert.equal(r.status, status, `${mode}: ${status}, got ${r.status}`);
      const j = await r.json();
      assert.equal(j.refused, flag === "refused" ? true : undefined, `${mode}: refused flag`);
      assert.equal(j.unreachable, flag === "unreachable" ? true : undefined, `${mode}: unreachable flag`);
      if (flag) assert.equal(j.error, undefined, `${mode}: D4, the service's message stays on the log`);
      else assert.equal(j.error, "Memory failed; this isn't an outage.", `${mode}: a fixed message, not the raw one`);
      const line = lines.find((l) => l.startsWith("[memory] "));
      assert.ok(line, `${mode}: a log line`);
      assert.ok(line.startsWith(`[memory] ${label}: `), `${mode}: labelled ${label}, got ${JSON.stringify(line)}`);
      assert.ok(line.length <= 200, `${mode}: at most 200 characters`);
      assert.ok(!line.includes(process.env.HONCHO_API_KEY), `${mode}: never the key`);
    });

await check("the null-body case is a genuine null-dereference TypeError (so a bare TypeError really is a code bug)", async () => {
  const { lines } = await logged(() => getMode("nullbody", "?bot=boppy"));
  assert.match(lines.find((l) => l.startsWith("[memory] ")) ?? "", /^\[memory\] error: TypeError: Cannot read properties of null/);
});

await check("D4 end to end: no raw upstream message in either 503 body", async () => {
  for (const mode of ["401", "net"]) {
    const j = await (await getMode(mode, "?bot=boppy")).json();
    assert.equal(j.error, undefined, `${mode}: no raw message in the body`);
  }
});

await check("redaction: a short dotted key the service echoes back never reaches the log line (either path)", async () => {
  const key = "hk.7a.Q2";
  for (const q of ["?bot=boppy", "?ws=ws_main"]) {
    const { r, lines } = await logged(() => getMode("echo", q, key));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).refused, true);
    const line = lines.find((l) => l.startsWith("[memory] "));
    assert.ok(line?.startsWith("[memory] refused: "), `labelled refused: ${line}`);
    assert.ok(!line.includes(key), `${q}: the key is not in ${JSON.stringify(line)}`);
    assert.ok(!line.includes("7a.Q2"), `${q}: nor any part of it`);
    assert.match(line, /\[redacted\]/);
  }
});

await check("redaction: bearer/authorization values, sk-/hch-/ak_/ck_ keys, key=/token= values, long tokens", async () => {
  const { redactSecrets, memoryLogLine } = await import(at("lib/server/memory-outage.ts"));
  const cases = [
    ["Authorization: Bearer abc.def", ["abc.def"]],
    ["authorization=Basic dXNlcjpw", ["dXNlcjpw"]],
    ["sent bearer tok.1", ["tok.1"]],
    ["bad key sk-ab12 here", ["ab12"]],
    ["bad key hch-x.y here", ["x.y"]],
    ["ak_short and ck_q.9", ["short", "q.9"]],
    ["GET /v3/x?api_key=s3.cr&token=t.k&x=1", ["s3.cr", "t.k"]],
    ['{"apiKey":"pz.9"}', ["pz.9"]],
    [`id ${"A".repeat(24)} end`, ["A".repeat(24)]],
  ];
  for (const [text, secrets] of cases) {
    const out = redactSecrets(text, []);
    for (const sec of secrets) assert.ok(!out.includes(sec), `${JSON.stringify(text)} -> ${JSON.stringify(out)} still has ${sec}`);
  }
  // The configured key itself, whatever its shape, and it never survives the 200-character cap either.
  process.env.HONCHO_API_KEY = "q.1";
  const line = memoryLogLine("error", new Error(`${"x ".repeat(95)}q.1 q.1`));
  assert.ok(line.length <= 200 && !line.includes("q.1"), line);
  assert.ok(!redactSecrets("key q.1 was refused").includes("q.1"), "the configured key by default");
  assert.equal(redactSecrets("Request timed out after 45000ms", []), "Request timed out after 45000ms", "ordinary words stay");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`memory reachable: ${passed} passed`);
process.exit(0);

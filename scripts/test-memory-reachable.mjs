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

await check("the sheet and the tab distinguish the state in what they render (the wording, in the components)", async () => {
  const sheet = readFileSync(new URL(at("components/app/memory-sheet.tsx")), "utf8");
  assert.ok(/unreachable \?/.test(sheet), "the sheet branches on unreachable");
  assert.ok(/Can&rsquo;t reach the memory service/.test(sheet), "and says so in plain words");
  assert.ok(/!info\.on \?/.test(sheet), "keeping the isn't-on case for when memory really is off");
  const tab = readFileSync(new URL(at("components/app/bot-memory.tsx")), "utf8");
  assert.ok(/data\.unreachable \?/.test(tab), "the bot tab branches on unreachable");
  assert.ok(/data\?\.off \?/.test(tab) && /Memory isn&apos;t set up on this computer yet/.test(tab), "and on off, saying so in plain words");
});

await check("D1: the sheet's own path (?ws=) says can't-reach too, not an empty card", async () => {
  process.env.HONCHO_API_KEY = `hc-test-memory-reach-${Date.now()}`;
  const r = await get("?ws=ws_main");
  assert.equal(r.status, 503, `503, got ${r.status}`);
  assert.equal((await r.json()).unreachable, true, "memoryInfo now throws on an outage");
});

/** The route with a mockable service: mode tells the fake what the Honcho call does. The client is
 *  cached per key, so each mode also rotates HONCHO_API_KEY to get a fresh bank + client. */
async function getMode(mode, q) {
  process.env.HONCHO_API_KEY = `hc-test-memory-reach-${mode}`;
  mockFetch = async () => {
    if (mode === "401") return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    if (mode === "403") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "content-type": "application/json" } });
    if (mode === "net") throw new TypeError("fetch failed");
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

await check("the route over the real client: 401 -> 503 {refused:true}; 403 likewise (the 1945 review's #4)", async () => {
  process.env.HONCHO_API_KEY = `hc-test-memory-reach-${Date.now()}`;
  for (const mode of ["401", "403"]) {
    const r = await getMode(mode, "?bot=boppy");
    assert.equal(r.status, 503, `${mode}: 503, got ${r.status}`);
    const j = await r.json();
    assert.equal(j.refused, true, `${mode}: refused`);
    assert.equal(j.unreachable, undefined);
    assert.equal(j.error, undefined);
  }
});

await check("a network failure -> 503 {unreachable:true}; a plain code bug -> 500 with no flags (the 1945 review's #2)", async () => {
  const r = await getMode("net", "?bot=boppy");
  assert.equal(r.status, 503, `503, got ${r.status}`);
  assert.equal((await r.json()).unreachable, true);
  const r2 = await getMode("plain", "?bot=boppy");
  assert.equal(r2.status, 500, `500, got ${r2.status}`);
  const j2 = await r2.json();
  assert.equal(j2.unreachable, undefined, "a code bug is not an outage");
  assert.equal(j2.refused, undefined);
  assert.ok(typeof j2.error === "string", "and carries its error for the log");
});

await check("the sheet's own path (?ws=) over the real client: outage -> 503 unreachable; plain bug -> 500 (D1 + #2)", async () => {
  const r = await getMode("net", "?ws=ws_main");
  assert.equal(r.status, 503);
  assert.equal((await r.json()).unreachable, true);
  const r2 = await getMode("plain", "?ws=ws_main");
  assert.equal(r2.status, 500);
  assert.equal((await r2.json()).unreachable, undefined);
});

await check("D4 end to end: no raw upstream message in either 503 body", async () => {
  for (const mode of ["401", "net"]) {
    const j = await (await getMode(mode, "?bot=boppy")).json();
    assert.equal(j.error, undefined, `${mode}: no raw message in the body`);
  }
});

await check("the sheet renders the refused state with its own wording (the 1945 review's #1)", async () => {
  const sheet = readFileSync(new URL(at("components/app/memory-sheet.tsx")), "utf8");
  assert.match(sheet, /info\.refused \?/, "the sheet branches on refused");
  assert.match(sheet, /Check the memory key in Settings/, "and names the fix, not try-again");
  assert.ok(sheet.indexOf("info.refused") < sheet.indexOf("info.unreachable"), "refused is checked before unreachable");
  const tab = readFileSync(new URL(at("components/app/bot-memory.tsx")), "utf8");
  assert.match(tab, /data\.refused \?/, "the bot tab branches on refused too");
});

await check("D2: the search path renders the can't-reach wording (not nothing-matches)", async () => {
  const tab = readFileSync(new URL(at("components/app/bot-memory.tsx")), "utf8");
  assert.match(tab, /j\.unreachable \|\| j\.refused \? "down"/, "a down result state");
  assert.match(tab, /results === "down" \?/, "rendered as its own branch");
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

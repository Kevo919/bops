// Fake providers only. No .env files, real credentials, filesystem writes or external requests.
// Run: node --conditions=react-server scripts/test-key-check.mjs (Node 24).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const originals = { ...process.env };
const originalFetch = globalThis.fetch;
for (const key of Object.keys(process.env)) if (/^(BOPS_|OPENAI_|ANTHROPIC_|ZAI_|DEEPSEEK_|OPENROUTER_|DEEPINFRA_|ORGO_)/.test(key)) delete process.env[key];

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try { return next(specifier, context); }
    catch (error) {
      if (/^(file:|\.)/.test(specifier)) for (const ext of [".ts", ".tsx"]) {
        try { return next(specifier + ext, context); } catch { /* next suffix */ }
      }
      throw error;
    }
  },
  load(url, context, next) {
    // Owner identity helper otherwise imports the application's active mail/store machinery.
    if (url.endsWith("/lib/server/owner-email.ts")) return { format: "module", shortCircuit: true,
      source: `export const fromThisMac = request => !process.env.BOPS_DATABASE_URL && ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);` };
    return next(url, context);
  },
});
let calls = [];
let reply = () => Response.json({ data: [] });
globalThis.fetch = async (url, options) => { calls.push({ url, options }); return reply(url, options); };
const { keyCheckList, checkKey } = await import("../lib/server/key-check.ts");
const route = await import("../app/api/key-check/route.ts");
const { ROUTE_KEYS } = await import("../lib/agents.ts");
let passed = 0;
async function test(name, run) { calls = []; await run(); passed++; console.log(`ok ${passed} - ${name}`); }
const request = (method = "GET", headers = {}, body) => new Request("http://localhost:3210/api/key-check", {
  method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
});
const resultOf = async (key, status, data) => {
  reply = () => typeof data === "string" ? new Response(data, { status }) : Response.json(data, { status });
  const result = await checkKey(key);
  assert.equal(calls.length, 1);
  assert.ok(!JSON.stringify(result).includes("SYNTHETIC_SECRET"));
  return result;
};

try {
  await test("GET exposes exactly seven metadata rows and makes no provider calls", async () => {
    const expected = [ROUTE_KEYS.openai, "OPENAI_EXECUTOR_API_KEY", ROUTE_KEYS.anthropic, ROUTE_KEYS.zai, ROUTE_KEYS.deepseek, ROUTE_KEYS.openrouter, "ORGO_API_KEY"];
    assert.deepEqual(keyCheckList().map(x => x.key), expected);
    assert.ok(keyCheckList().every(x => x.status === "not set"));
    for (const key of expected) process.env[key] = `SYNTHETIC_SECRET_${key}`;
    const response = await route.GET(request());
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.ok(body.keys.every(x => x.status === "set"));
    assert.ok(!JSON.stringify(body).includes("SYNTHETIC_SECRET"));
    assert.equal(calls.length, 0);
  });
  await test("missing and unsupported keys cannot issue requests", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    assert.equal((await checkKey("OPENAI_API_KEY")).status, "not set");
    process.env.OPENAI_API_KEY = saved;
    assert.equal(await checkKey("DEEPINFRA_API_KEY"), null);
    assert.equal(await checkKey("https://attacker.invalid"), null);
    assert.equal(calls.length, 0);
  });
  await test("both OpenAI keys use one tiny fixed-host generation, no overrides", async () => {
    process.env.OPENAI_BASE_URL = "https://attacker.invalid";
    for (const key of ["OPENAI_API_KEY", "OPENAI_EXECUTOR_API_KEY"]) {
      calls = [];
      const result = await resultOf(key, 200, { choices: [{ message: { content: "Hi" } }] });
      assert.equal(result.status, "works");
      assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
      const options = calls[0].options;
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }], max_tokens: 1, stream: false });
      assert.equal(options.headers.Authorization, `Bearer ${process.env[key]}`);
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal instanceof AbortSignal);
    }
  });
  await test("models/key-info/capacity use fixed URLs, correct credentials and no generation", async () => {
    for (const [key, url, data] of [
      [ROUTE_KEYS.anthropic, "https://api.anthropic.com/v1/models", { data: [] }],
      [ROUTE_KEYS.zai, "https://api.z.ai/api/paas/v4/models", { data: [] }],
      [ROUTE_KEYS.deepseek, "https://api.deepseek.com/models", { data: [] }],
      [ROUTE_KEYS.openrouter, "https://openrouter.ai/api/v1/key", { data: { limit_remaining: null } }],
      ["ORGO_API_KEY", "https://www.orgo.ai/api/account/capacity", { capacity: 2 }],
    ]) {
      calls = [];
      assert.equal((await resultOf(key, 200, data)).status, "works");
      assert.equal(calls[0].url, url);
      assert.equal(calls[0].options.method, "GET");
      assert.equal(calls[0].options.body, undefined);
      assert.equal(calls[0].options.redirect, "error");
      if (key === ROUTE_KEYS.anthropic) {
        assert.equal(calls[0].options.headers["x-api-key"], process.env[key]);
        assert.equal(calls[0].options.headers["anthropic-version"], "2023-06-01");
      } else assert.equal(calls[0].options.headers.Authorization, `Bearer ${process.env[key]}`);
    }
  });
  await test("credit exhaustion differs from rate limits and permission failures", async () => {
    for (const [status, data, expected] of [
      [429, { error: { code: "insufficient_quota", message: "SYNTHETIC_SECRET" } }, "no credit"],
      [429, { error: { code: "rate_limit_exceeded" } }, "rate limited"],
      [401, { error: { message: "SYNTHETIC_SECRET" } }, "invalid"],
      [403, { error: {} }, "unavailable"], [404, { error: {} }, "unavailable"],
      [500, { error: {} }, "unavailable"], [302, {}, "unavailable"],
      [200, "not JSON SYNTHETIC_SECRET", "unavailable"], [200, {}, "unavailable"],
    ]) {
      calls = []; assert.equal((await resultOf("OPENAI_API_KEY", status, data)).status, expected);
    }
    calls = []; assert.equal((await resultOf(ROUTE_KEYS.deepseek, 402, {})).status, "no credit");
    calls = []; assert.equal((await resultOf(ROUTE_KEYS.openrouter, 200, { data: { limit_remaining: 0 } })).status, "no credit");
    for (const status of [400, 404]) {
      calls = []; assert.equal((await resultOf(ROUTE_KEYS.zai, status, { error: {} })).status, "unavailable");
    }
  });
  await test("network failure, timeout and oversized responses cannot leak secrets or imply invalid", async () => {
    reply = () => { throw new Error("SYNTHETIC_SECRET"); };
    assert.equal((await checkKey("OPENAI_API_KEY")).status, "unavailable");
    assert.equal(calls.length, 1);
    calls = [];
    let canceled = false;
    reply = () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { canceled = true; } }));
    assert.equal((await checkKey("OPENAI_API_KEY")).status, "unavailable");
    assert.equal(canceled, true);
    calls = [];
    const realTimeout = globalThis.setTimeout;
    try {
      globalThis.setTimeout = (fn, ms, ...args) => { assert.equal(ms, 12_000); return realTimeout(fn, 1, ...args); };
      reply = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("SYNTHETIC_SECRET timeout")), { once: true }));
      const result = await checkKey("OPENAI_API_KEY");
      assert.equal(result.status, "unavailable");
      assert.ok(!JSON.stringify(result).includes("SYNTHETIC_SECRET"));
      assert.equal(calls.length, 1);
    } finally { globalThis.setTimeout = realTimeout; }
  });
  await test("desktop gate rejects unauthorized pages and all phone credentials before fetch", async () => {
    process.env.BOPS_UI_TOKEN = "window-test-token";
    for (const headers of [{}, { "x-bops-window": "wrong" }, { "x-bops-window": "é".repeat(17) }, { "x-bops-window": "window-test-token", "x-bops-remote": "phone" }, { "x-bops-window": "window-test-token", cookie: "bops_remote=phone" }]) {
      assert.equal((await route.GET(request("GET", headers))).status, 403);
      assert.equal((await route.POST(request("POST", headers, { key: "OPENAI_API_KEY" }))).status, 403);
    }
    assert.equal(calls.length, 0);
    assert.equal((await route.GET(request("GET", { "x-bops-window": "window-test-token" }))).status, 200);
    delete process.env.BOPS_UI_TOKEN;
    process.env.BOPS_REQUIRE_REMOTE = "1";
    assert.equal((await route.GET(request("GET", { "x-bops-remote": "phone" }))).status, 403);
    assert.equal((await route.GET(request())).status, 403);
    delete process.env.BOPS_REQUIRE_REMOTE;
    assert.equal((await route.GET(new Request("https://other.invalid/api/key-check"))).status, 403);
    assert.equal(calls.length, 0);
  });
  await test("POST validates selection and returns only safe result metadata", async () => {
    for (const body of ["bad JSON", [], {}, { key: 42 }, { key: "DEEPINFRA_API_KEY" }, { key: "__proto__" }])
      assert.equal((await route.POST(request("POST", {}, body))).status, 400);
    assert.equal(calls.length, 0);
    reply = () => Response.json({ choices: [{ message: { content: "SYNTHETIC_SECRET" } }] });
    const response = await route.POST(request("POST", {}, { key: "OPENAI_API_KEY" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.equal(result.result.status, "works");
    assert.ok(!JSON.stringify(result).includes("SYNTHETIC_SECRET"));
    assert.equal(calls.length, 1);
  });
  console.log(`PASS: ${passed} key-check tests; synthetic credentials and fake fetch only.`);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originals)) delete process.env[key];
  Object.assign(process.env, originals);
}

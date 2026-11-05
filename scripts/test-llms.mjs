// Node 24: node --conditions=react-server scripts/test-llms.mjs
// Actual route, catalog loader and proxy; synthetic config/pairing in an isolated temp directory.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname, basename, resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("..", import.meta.url));
const originalCwd = process.cwd();
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const temp = mkdtempSync(join(tmpdir(), "bops-llms-test-"));
const code = "synthetic-pairing-code-for-tests-only-12345678";
let count = 0;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/server") specifier = "next/server.js";
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try { return next(specifier, context); }
    catch (error) {
      if (/^(file:|\.)/.test(specifier)) for (const ext of [".ts", ".tsx"]) {
        try { return next(specifier + ext, context); } catch { /* try next suffix */ }
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (url.includes("/lib/server/") && !url.endsWith("/lib/server/llms.ts")) {
      throw new Error(`Unexpected server dependency: ${url}`);
    }
    return next(url, context);
  },
});
async function test(name, run) { await run(); console.log(`ok ${++count} - ${name}`); }

try {
  for (const key of Object.keys(process.env)) if (/^(BOPS_|OPENAI_|ANTHROPIC_|ZAI_|DEEPSEEK_|OPENROUTER_|ORGO_)/.test(key)) delete process.env[key];
  process.env.OPENAI_API_KEY = "SYNTHETIC_SECRET_MUST_NOT_ESCAPE";
  globalThis.fetch = () => { throw new Error("Network requests forbidden in catalog tests"); };
  mkdirSync(join(temp, "config"));
  mkdirSync(join(temp, ".data"));
  writeFileSync(join(temp, "config", "llms.cjs"), `module.exports = require(${JSON.stringify(join(root, "config", "llms.cjs"))});`);
  writeFileSync(join(temp, "config", "llms.yaml"), `llms:
  - name: Test Claude
    provider: anthropic
    model: claude-test
    starter: true
    use_for: [coding, research]
    apiKey: SYNTHETIC_SECRET_MUST_NOT_ESCAPE
  - name: Test OpenAI
    provider: openai
    model: test-model
    token: SYNTHETIC_SECRET_MUST_NOT_ESCAPE
`);
  writeFileSync(join(temp, ".data", "remote.json"), JSON.stringify({ hash: createHash("sha256").update(code).digest("hex") }));
  process.chdir(temp);
  const route = await import(pathToFileURL(join(root, "app/api/llms/route.ts")).href);
  const agents = await import(pathToFileURL(join(root, "lib/agents.ts")).href);
  await test("actual startup loader returns only public catalog fields, without secrets or state", async () => {
    const response = await route.GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(route.dynamic, "force-dynamic");
    const body = await response.json();
    assert.deepEqual(body, { llms: [
      { name: "Test Claude", provider: "anthropic", model: "claude-test", starter: true, useFor: ["coding", "research"] },
      { name: "Test OpenAI", provider: "openai", model: "test-model" },
    ] });
    assert.ok(!JSON.stringify(body).includes("SYNTHETIC_SECRET"));
  });
  await test("empty catalog is a successful no-store empty list", async () => {
    agents.setLlms([]);
    const response = await route.GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { llms: [] });
  });
  const { NextRequest } = await import("next/server.js");
  let generation = 0;
  async function scenario(name, env, headers, expected, host = "localhost:3210") {
    await test(name, async () => {
      for (const key of ["BOPS_UI_TOKEN", "BOPS_DATABASE_URL", "BOPS_PUBLIC_HOST", "BOPS_REQUIRE_REMOTE"]) delete process.env[key];
      Object.assign(process.env, env);
      // These proxy settings are captured at module load: fresh module for every scenario.
      const { proxy, config } = await import(`${pathToFileURL(join(root, "proxy.ts")).href}?case=${++generation}`);
      assert.equal(config.matcher, "/api/:path*");
      const responses = ["/api/state", "/api/llms"].map(path => proxy(new NextRequest(`http://${host}${path}`, { headers: { host, ...headers } })));
      assert.deepEqual(responses.map(r => r.status), [expected, expected]);
      for (const response of responses) assert.equal(response.headers.get("x-middleware-next"), expected === 200 ? "1" : null);
      assert.equal(await responses[0].text(), await responses[1].text());
    });
  }
  const desktop = { BOPS_UI_TOKEN: "synthetic-window-token" };
  await scenario("window cookie passes both paths", desktop, { cookie: "bops_window=synthetic-window-token" }, 200);
  await scenario("unpaired local request cannot bypass the window gate", desktop, {}, 403);
  await scenario("paired remote cookie passes both paths", desktop, { cookie: `bops_remote=${code}` }, 200, "100.64.0.2:3210");
  await scenario("paired remote header passes both paths", desktop, { "x-bops-remote": code }, 200, "100.64.0.2:3210");
  await scenario("wrong pairing code is denied", desktop, { cookie: `bops_remote=${"x".repeat(40)}` }, 403, "100.64.0.2:3210");
  const hosted = { BOPS_DATABASE_URL: "synthetic-no-connection", BOPS_PUBLIC_HOST: "bops.example.test", BOPS_REQUIRE_REMOTE: "1" };
  await scenario("hosted required pairing rejects unpaired requests", hosted, {}, 401, "bops.example.test");
  await scenario("hosted required pairing accepts paired requests", hosted, { cookie: `bops_remote=${code}`, origin: "http://bops.example.test" }, 200, "bops.example.test");
  await scenario("foreign origin is denied even with valid pairing", hosted, { cookie: `bops_remote=${code}`, origin: "https://foreign.example.test" }, 403, "bops.example.test");
  await scenario("foreign origin is denied even with window token", desktop, { cookie: "bops_window=synthetic-window-token", origin: "https://foreign.example.test" }, 403);
  console.log(`${count} catalog/proxy checks passed; no real pairing, environment files or network used.`);
} finally {
  process.chdir(originalCwd);
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  globalThis.fetch = originalFetch;
  hooks.deregister();
  assert.equal(dirname(resolve(temp)), resolve(tmpdir()));
  assert.ok(basename(temp).startsWith("bops-llms-test-"));
  rmSync(temp, { recursive: true, force: true });
}

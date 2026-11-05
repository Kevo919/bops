// OpenRouter presets, custom ids and the Auto Router (config/llms.cjs PRESET, lib/agents.ts, lib/chat-models.ts,
// lib/server/openrouter-models.ts, app/api/models/openrouter/presets, app/api/models, lib/server/chat-providers.ts):
// - config/llms.yaml takes "@preset/<slug>" for OpenRouter only, in that one form, and a preset runs chats only (no
//   jobs, run_by or starter), so bots' agents never get one;
// - the server lists your presets on OPENROUTER_API_KEY (the key goes to OpenRouter only, never in the answer), and
//   says when there's no key, the key is turned down, or OpenRouter can't be reached;
// - a typed OpenRouter id OpenRouter's list (as last read) doesn't have is saved with a warning, not refused;
// - a chat on a preset sends it as OpenRouter documents: model "@preset/<slug>", with the X-Title header.
//
// A fake OpenRouter (fetch, by address) in a temporary directory: nothing reaches the network.
// Usage: node --conditions=react-server scripts/test-openrouter-presets.mjs   (Node 24)
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
for (const key of Object.keys(process.env)) if (/^(BOPS_|OPENAI_|ANTHROPIC_|ZAI_|DEEPSEEK_|OPENROUTER_|DEEPINFRA_|ORGO_|NEXT_PUBLIC_BOPS)/.test(key)) delete process.env[key];
process.env.NEXT_PUBLIC_BOPS_BRAINS = "1";
const temp = mkdtempSync(join(tmpdir(), "bops-or-presets-"));
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^(file:|\.)/.test(specifier))
        for (const ext of [".ts", ".tsx"]) {
          try {
            return next(specifier + ext, context);
          } catch {
            /* next suffix */
          }
        }
      throw error;
    }
  },
  load(url, context, next) {
    if (url.endsWith("/lib/server/owner-email.ts"))
      return { format: "module", shortCircuit: true, source: "export const fromThisMac = request => ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);" };
    return next(url, context);
  },
});

let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

const KEY = "sk-or-SYNTHETIC_SECRET_MUST_NOT_ESCAPE";
const L = createRequire(import.meta.url)(join(root, "config", "llms.cjs"));

/* ---------------- The fake OpenRouter ---------------- */
const asked = [];
const or = {
  presets: [
    { id: "1", slug: "email-writer", name: "Email writer", description: "Short,\nwarm emails", status: "active" },
    { id: "2", slug: "old-one", name: "Old", status: "archived" },
    { id: "4", slug: "off-one", name: "Off", status: "disabled" },
    { id: "3", slug: "bad slug", name: "Bad" },
  ],
  presetStatus: 200,
  down: false,
  models: [{ id: "openrouter/auto", name: "Auto Router" }, { id: "qwen/qwen3-coder-next", name: "Qwen: Qwen3 Coder Next", pricing: { prompt: "0.00000012", completion: "0.0000008" } }],
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  asked.push({ url: req.url, auth: req.headers.get("authorization"), title: req.headers.get("x-title"), body: req.method === "POST" ? JSON.parse(await req.text()) : undefined });
  if (or.down) throw new TypeError("fetch failed");
  if (url.origin !== "https://openrouter.ai") throw new TypeError(`offline: ${url.host}`);
  if (url.pathname === "/api/v1/models") return json({ data: or.models });
  if (url.pathname === "/api/v1/presets") {
    if (req.headers.get("authorization") !== `Bearer ${KEY}`) return json({ error: { message: "Unauthorized", code: 401 } }, 401);
    if (or.presetStatus !== 200) return json({ error: { message: "nope" } }, or.presetStatus);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return json({ data: or.presets.slice(offset, offset + limit), total_count: or.presets.length });
  }
  if (url.pathname === "/api/v1/chat/completions") return json({ choices: [{ message: { role: "assistant", content: "Hello from a preset." } }], usage: { prompt_tokens: 3, completion_tokens: 4 } });
  return json({ error: "not found" }, 404);
};

try {
  mkdirSync(join(temp, "config"));
  writeFileSync(join(temp, "config", "llms.cjs"), `module.exports = require(${JSON.stringify(join(root, "config", "llms.cjs"))});`);
  writeFileSync(join(temp, "config", "llms.yaml"), "llms:\n  - name: Sonnet\n    provider: anthropic\n    model: claude-sonnet-5-5\n");
  process.chdir(temp);

  const A = await import(pathToFileURL(join(root, "lib/agents.ts")).href);
  const CM = await import(pathToFileURL(join(root, "lib/chat-models.ts")).href);
  const ORM = await import(pathToFileURL(join(root, "lib/server/openrouter-models.ts")).href);
  const presetsRoute = await import(pathToFileURL(join(root, "app/api/models/openrouter/presets/route.ts")).href);
  const modelsRoute = await import(pathToFileURL(join(root, "app/api/models/route.ts")).href);
  const P = await import(pathToFileURL(join(root, "lib/server/chat-providers.ts")).href);

  await test("config/llms.yaml: @preset/<slug> for OpenRouter only, in that one form; a preset takes no jobs, run_by or starter", () => {
    const problems = [];
    const list = L.clean(
      {
        llms: [
          { name: "Email", provider: "openrouter", model: "@preset/email-writer", use_for: ["writing"], starter: true, run_by: "dsh", chat_default: true },
          { name: "Auto", provider: "openrouter", model: "openrouter/auto", use_for: ["research"] },
          { name: "Free", provider: "openrouter", model: "meta-llama/llama-5:free" },
          { name: "Not OR", provider: "anthropic", model: "@preset/email-writer" },
          ...["@preset/", "@preset/../x", "@presets/x", "@preset/x y", "foo@preset/x", "@preset/-x", "@preset/a/b", `@preset/${"a".repeat(81)}`].map((model) => ({ name: model, provider: "openrouter", model })),
        ],
      },
      problems,
    );
    assert.deepEqual(list, [
      { name: "Email", provider: "openrouter", model: "@preset/email-writer", chatDefault: true },
      { name: "Auto", provider: "openrouter", model: "openrouter/auto", useFor: ["research"] },
      { name: "Free", provider: "openrouter", model: "meta-llama/llama-5:free" },
    ]);
    assert.ok(problems.some((p) => /Email.*use_for and starter.*OpenRouter preset/.test(p)));
    assert.ok(problems.some((p) => /Email.*run_by.*OpenRouter preset/.test(p)));
    assert.equal(problems.filter((p) => /isn't a model name/.test(p)).length, 9, "the anthropic one and every other form is left out");
    assert.equal(L.isPreset("openrouter", "@preset/a_b-1"), true);
    assert.equal(L.isPreset("deepseek", "@preset/a"), false);
  });

  await test("config/llms.cjs change(): a preset is added as chats only; jobs on it, or a provider other than OpenRouter, are turned down", () => {
    const ok = L.change([], { op: "add", name: "Email", provider: "openrouter", model: "@preset/email-writer" });
    assert.equal(ok.error, undefined);
    assert.equal(ok.list[0].model, "@preset/email-writer");
    assert.match(L.change([], { op: "add", name: "E", provider: "openrouter", model: "@preset/email-writer", useFor: ["writing"] }).error, /OpenRouter preset/);
    assert.match(L.change([], { op: "add", name: "E", provider: "openrouter", model: "@preset/email-writer", runBy: "dsh" }).error, /OpenRouter preset/);
    assert.match(L.change([], { op: "add", name: "E", provider: "anthropic", model: "@preset/email-writer" }).error, /OpenRouter's: pick OpenRouter/);
    assert.match(L.change([], { op: "add", name: "E", provider: "openrouter", model: "@preset/bad slug" }).error, /letters, numbers, - and _/);
    const moved = L.change(ok.list, { op: "update", id: "openrouter/@preset/email-writer", provider: "anthropic" });
    assert.match(moved.error, /OpenRouter's/);
    assert.equal(L.change([], { op: "add", name: "Auto Router", provider: "openrouter", model: "openrouter/auto", useFor: ["research"] }).error, undefined, "the Auto Router is a plain model id");
  });

  await test("lib/agents.ts and the chat picker: a preset is kept (chats only, never a bot's agent), labelled \"Preset: <name>\"", async () => {
    A.setLlms([
      { name: "Email writer", provider: "openrouter", model: "@preset/email-writer", useFor: ["writing"], starter: true, runBy: "dsh" },
      { name: "Auto Router", provider: "openrouter", model: "openrouter/auto", useFor: ["research"] },
      { name: "Bad", provider: "anthropic", model: "@preset/x" },
    ]);
    assert.deepEqual(A.llms(), [
      { name: "Email writer", provider: "openrouter", model: "@preset/email-writer" },
      { name: "Auto Router", provider: "openrouter", model: "openrouter/auto", useFor: ["research"] },
    ]);
    const starter = A.starterAi();
    assert.ok(starter, "the Auto Router has a job: bots start with it");
    assert.ok(!JSON.stringify(starter).includes("@preset"), "no agent on a preset");
    assert.ok(A.modelsFor("opencode").every((m) => !m.id.includes("@preset")), "OpenCode isn't offered the preset");
    const m = CM.chatModels().find((x) => x.id === "openrouter/@preset/email-writer");
    assert.equal(m.preset, true);
    assert.equal(CM.chatModelLabel(m), "Preset: Email writer");
    assert.equal(CM.chatModelLabel(CM.chatModels().find((x) => x.id === "openrouter/openrouter/auto")), "Auto Router");
    assert.ok(CM.chatModelOk("openrouter/@preset/email-writer"));
    assert.equal(CM.providerOf("openrouter/@preset/email-writer"), "openrouter");
  });

  const TOKEN = "synthetic-window-token";
  const req = (path, { method = "GET", body, window = true } = {}) =>
    new Request(`http://localhost:3210${path}`, { method, headers: { "Content-Type": "application/json", ...(window ? { cookie: `bops_window=${TOKEN}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  process.env.BOPS_UI_TOKEN = TOKEN;

  await test("your presets: read on OPENROUTER_API_KEY by this server, only active ones with a good slug, and never the key in the answer", async () => {
    assert.equal((await presetsRoute.GET(req("/api/models/openrouter/presets", { window: false }))).status, 403, "only the Bops window");
    let body = await (await presetsRoute.GET(req("/api/models/openrouter/presets"))).json();
    assert.deepEqual(body, { presets: [], noKey: true }, "no key: says so, asks nothing");
    assert.equal(asked.length, 0);
    process.env.OPENROUTER_API_KEY = KEY;
    const res = await presetsRoute.GET(req("/api/models/openrouter/presets"));
    assert.equal(res.headers.get("cache-control"), "no-store");
    const text = await res.text();
    assert.ok(!text.includes("SYNTHETIC_SECRET"), "never the key");
    body = JSON.parse(text);
    assert.deepEqual(body, { presets: [{ slug: "email-writer", name: "Email writer", description: "Short, warm emails" }] });
    assert.equal(asked.at(-1).url, "https://openrouter.ai/api/v1/presets?limit=100&offset=0");
    assert.equal(asked.at(-1).auth, `Bearer ${KEY}`, "the key goes to OpenRouter only");
  });

  await test("your presets: more than a page is read page by page; a key turned down, or OpenRouter down, is said", async () => {
    or.presets = Array.from({ length: 150 }, (_, i) => ({ slug: `p${i}`, name: `P ${i}`, status: "active" }));
    asked.length = 0;
    assert.equal((await ORM.openRouterPresets()).presets.length, 150);
    assert.deepEqual(asked.map((x) => new URL(x.url).searchParams.get("offset")), ["0", "100"]);
    or.presetStatus = 401;
    assert.deepEqual(await ORM.openRouterPresets(), { presets: [], refused: true });
    or.presetStatus = 200;
    or.down = true;
    assert.deepEqual(await ORM.openRouterPresets(), { presets: [], offline: true });
    or.down = false;
  });

  await test("a typed OpenRouter id not in OpenRouter's list is saved with a warning; the Auto Router and a preset aren't warned about", async () => {
    // No list read yet: nothing to check against, so nothing is said.
    let r = await (await modelsRoute.POST(req("/api/models", { method: "POST", body: { op: "add", name: "New", provider: "openrouter", model: "someone/new-model" } }))).json();
    assert.equal(r.ok, true);
    assert.equal(r.warning, undefined);
    assert.equal(ORM.knownOpenRouterIds(), undefined);
    await ORM.openRouterModels();
    assert.ok(ORM.knownOpenRouterIds().has("openrouter/auto"));
    r = await (await modelsRoute.POST(req("/api/models", { method: "POST", body: { op: "add", name: "Free one", provider: "openrouter", model: "someone/else:free" } }))).json();
    assert.equal(r.ok, true, "saved");
    assert.match(r.warning, /doesn't have "someone\/else:free"/);
    r = await (await modelsRoute.POST(req("/api/models", { method: "POST", body: { op: "add", name: "Auto Router", provider: "openrouter", model: "openrouter/auto" } }))).json();
    assert.equal(r.warning, undefined);
    r = await (await modelsRoute.POST(req("/api/models", { method: "POST", body: { op: "add", name: "Email writer", provider: "openrouter", model: "@preset/email-writer" } }))).json();
    assert.equal(r.warning, undefined);
    assert.ok(r.llms.some((l) => l.id === "openrouter/@preset/email-writer"));
    r = await (await modelsRoute.POST(req("/api/models", { method: "POST", body: { op: "update", id: "openrouter/someone/else:free", name: "Renamed" } }))).json();
    assert.equal(r.warning, undefined, "a change that isn't to the id isn't warned about again");
    const y = readFileSync(join(temp, "config", "llms.yaml"), "utf8");
    assert.match(y, /model: "?@preset\/email-writer"?/);
    // As written, read back the same (YAML quotes the @).
    assert.ok(L.read(temp, () => {}).some((l) => l.model === "@preset/email-writer"));
    assert.ok(A.llms().some((l) => l.model === "@preset/email-writer"), "in at once");
  });

  await test("a chat on a preset goes to OpenRouter as its docs have it: model \"@preset/<slug>\", with X-Title", async () => {
    asked.length = 0;
    const out = await P.createOnProvider({ model: "openrouter/@preset/email-writer", instructions: "Be brief.", input: "Write to Sam." });
    assert.equal(out.output_text, "Hello from a preset.");
    const call = asked.find((x) => x.url === "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(call.body.model, "@preset/email-writer");
    assert.equal(call.title, "Bops");
    assert.equal(call.auth, `Bearer ${KEY}`);
    await P.createOnProvider({ model: "openrouter/openrouter/auto", input: "hi" });
    assert.equal(asked.at(-1).body.model, "openrouter/auto", "the Auto Router as its own id");
  });

  console.log(`PASS: ${passed} OpenRouter presets checks (fake OpenRouter, temporary config)`);
} finally {
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  hooks.deregister?.();
  rmSync(temp, { recursive: true, force: true });
}

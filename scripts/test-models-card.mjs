// Settings, Models (app/api/models, app/api/models/openrouter, config/llms.cjs change/write, lib/agents.ts run_by,
// lib/chat-models.ts chatDefault): only the owner's window may read or change the list; a change is checked (a known
// provider, a plain model id, an agent that runs that provider), moves a job from the model that had it, keeps the
// file's comments, and applies at once (no restart). Keys are only ever said as set or not. OpenRouter's list is
// fetched once and kept, and an unreachable OpenRouter says so.
//
// Synthetic config in a temporary directory; fetch is a fake (nothing reaches OpenRouter or any provider).
// Usage: node --conditions=react-server scripts/test-models-card.mjs   (Node 24)
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const originalCwd = process.cwd();
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
for (const key of Object.keys(process.env)) if (/^(BOPS_|OPENAI_|ANTHROPIC_|ZAI_|DEEPSEEK_|OPENROUTER_|DEEPINFRA_|ORGO_|NEXT_PUBLIC_BOPS)/.test(key)) delete process.env[key];
process.env.NEXT_PUBLIC_BOPS_BRAINS = "1";
const temp = mkdtempSync(join(tmpdir(), "bops-models-card-"));

let stateVersion = 1;
globalThis.__modelsTouchState = () => { stateVersion++; };
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
    if (url.endsWith("/lib/server/store.ts"))
      return { format: "module", shortCircuit: true, source: "export const touchState = () => globalThis.__modelsTouchState();" };
    // The owner check without the app's mail and store (as test-key-check.mjs).
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

const YAML_FILE = `# My models: keep this note
llms:
  # The one bots start on
  - name: Claude Sonnet 5.5
    provider: anthropic
    model: claude-sonnet-5-5
    starter: true # inline note

  - name: Claude Opus 5.5
    provider: anthropic
    model: claude-opus-5-5
    use_for: [thinking, planning]
    my_own_field: keep me

  - name: Not known
    provider: someone-else
    model: x

  # Examples: take the "# " off to turn one on.
  # - name: GLM
  #   provider: zai
  #   model: glm-5.2
`;
const yamlPath = join(temp, "config", "llms.yaml");
const yamlNow = () => readFileSync(yamlPath, "utf8");

try {
  mkdirSync(join(temp, "config"));
  writeFileSync(join(temp, "config", "llms.cjs"), `module.exports = require(${JSON.stringify(join(root, "config", "llms.cjs"))});`);
  writeFileSync(yamlPath, YAML_FILE);
  process.chdir(temp);
  process.env.ANTHROPIC_API_KEY = "SYNTHETIC_SECRET_MUST_NOT_ESCAPE";
  let fetches = [];
  let reply = () => {
    throw new Error("offline");
  };
  globalThis.fetch = async (url, options) => {
    fetches.push(String(url));
    return reply(url, options);
  };

  const route = await import(pathToFileURL(join(root, "app/api/models/route.ts")).href);
  const orRoute = await import(pathToFileURL(join(root, "app/api/models/openrouter/route.ts")).href);
  const A = await import(pathToFileURL(join(root, "lib/agents.ts")).href);
  const chatModels = await import(pathToFileURL(join(root, "lib/chat-models.ts")).href);
  const { newChatModel } = await import(pathToFileURL(join(root, "lib/server/chat-default.ts")).href);

  const TOKEN = "synthetic-window-token";
  const req = (method = "GET", { body, headers = {}, host = "localhost:3210", path = "/api/models" } = {}) =>
    new Request(`http://${host}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const win = { cookie: `bops_window=${TOKEN}` };
  const post = async (body) => {
    const beforeVersion = stateVersion;
    const res = await route.POST(req("POST", { body, headers: win }));
    assert.equal(stateVersion, beforeVersion + (res.ok ? 1 : 0), "only successful saves invalidate state polling");
    return { status: res.status, body: await res.json() };
  };

  await test("only the owner's window: no token, a phone, or another machine is turned away", async () => {
    process.env.BOPS_UI_TOKEN = TOKEN;
    assert.equal((await route.GET(req())).status, 403, "no window cookie");
    assert.equal((await route.GET(req("GET", { headers: { ...win, "x-bops-remote": "phone" } }))).status, 403, "a paired phone");
    assert.equal((await route.POST(req("POST", { body: { op: "remove", id: "anthropic/claude-opus-5-5" } }))).status, 403, "a change without the window");
    assert.equal((await orRoute.GET(req("GET", { path: "/api/models/openrouter" }))).status, 403, "OpenRouter's list too");
    assert.equal((await route.GET(req("GET", { headers: win }))).status, 200);
    delete process.env.BOPS_UI_TOKEN;
    assert.equal((await route.GET(req())).status, 200, "this machine, with no window token");
    assert.equal((await route.GET(req("GET", { host: "100.64.0.9:3210" }))).status, 403, "another machine");
    process.env.BOPS_REQUIRE_REMOTE = "1";
    assert.equal((await route.GET(req())).status, 403, "a server that only lets in the paired phone");
    assert.equal((await route.GET(req("GET", { headers: { "x-bops-remote": "paired" }, host: "bops.example.test" }))).status, 200);
    delete process.env.BOPS_REQUIRE_REMOTE;
    process.env.BOPS_UI_TOKEN = TOKEN;
    assert.equal(yamlNow(), YAML_FILE, "nothing turned away changed the file");
  });

  await test("the list, providers, agents and jobs, with keys only as set or not", async () => {
    const res = await route.GET(req("GET", { headers: win }));
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    const text = JSON.stringify(body);
    assert.ok(!text.includes("SYNTHETIC_SECRET"), "never a key");
    assert.deepEqual(body.llms.map((l) => l.id), ["anthropic/claude-sonnet-5-5", "anthropic/claude-opus-5-5"]);
    assert.equal(body.providers.find((p) => p.id === "openrouter").label, "OpenRouter (hundreds of models)");
    assert.deepEqual(
      body.providers.filter((p) => p.id === "anthropic" || p.id === "openrouter").map((p) => [p.id, p.keyName, p.keySet]),
      [["anthropic", "ANTHROPIC_API_KEY", true], ["openrouter", "OPENROUTER_API_KEY", false]],
    );
    assert.ok(body.providers.every((p) => typeof p.keySet === "boolean"));
    assert.deepEqual(body.providers.filter((p) => p.chatOnly).map((p) => p.id), ["ollama"], "Ollama runs chats only");
    assert.deepEqual(body.runBy.map((r) => [r.kind, r.providers === null ? "any" : r.providers.length]), [["opencode", "any"], ["dsh", "any"], ["claude", 0], ["codex", 0]]);
    assert.ok(body.runBy.find((r) => r.kind === "claude").why.includes("AI section"));
    assert.deepEqual(body.jobs.map((j) => j.id), [...A.JOBS]);
    assert.equal(body.problems.length, 1, "the entry with an unknown provider is said");
  });

  await test("bad changes are turned down and change nothing", async () => {
    const bad = [
      [{ op: "add", name: "X", provider: "nope", model: "m" }, /provider/],
      [{ op: "add", name: "X", provider: "openrouter", model: "two words" }, /model id/],
      [{ op: "add", name: "X", provider: "openrouter", model: "qwen/qwen3-coder-next", runBy: "claude" }, /Claude account/],
      [{ op: "add", name: "X", provider: "openai", model: "gpt-x", runBy: "codex" }, /ChatGPT account/],
      [{ op: "add", name: "X", provider: "openrouter", model: "qwen/qwen3-coder-next", runBy: "agy" }, /can't run/],
      [{ op: "add", name: "X", provider: "anthropic", model: "claude-opus-5-5" }, /already/],
      [{ op: "add", name: "X", provider: "openrouter", model: "q/q", useFor: ["coding", "dancing"] }, /Jobs are/],
      [{ op: "add", name: "two\nlines", provider: "openrouter", model: "q/q" }, /one line/],
      [{ op: "update", id: "anthropic/nope", name: "X" }, /isn't in the list/],
      [{ op: "update", id: "anthropic/claude-opus-5-5", chatDefault: "yes" }, /true or false/],
      [{ op: "dance" }, /add, update or remove/],
    ];
    for (const [body, why] of bad) {
      const r = await post(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.body.error, why);
    }
    const notJson = await route.POST(new Request("http://localhost:3210/api/models", { method: "POST", headers: win, body: "[" }));
    assert.equal(notJson.status, 400);
    assert.equal(yamlNow(), YAML_FILE);
  });

  await test("add an OpenRouter model run by DeepSeek Harness: it takes Thinking from Opus, says so, and applies at once", async () => {
    A.setLlms(JSON.parse(JSON.stringify((await (await route.GET(req("GET", { headers: win }))).json()).llms)));
    const r = await post({ op: "add", name: "DeepSeek V4 Pro", provider: "openrouter", model: "deepseek/deepseek-v4-pro", useFor: ["thinking", "coding"], runBy: "dsh" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.moved, [{ job: "thinking", from: "Claude Opus 5.5" }]);
    const added = r.body.llms.find((l) => l.id === "openrouter/deepseek/deepseek-v4-pro");
    assert.deepEqual(added.useFor, ["coding", "thinking"]);
    assert.equal(added.runBy, "dsh");
    assert.deepEqual(r.body.llms.find((l) => l.model === "claude-opus-5-5").useFor, ["planning"]);
    // The file: its comments, an unknown field, and the entry Bops left out are all still there.
    const y = yamlNow();
    for (const keep of ["# My models: keep this note", "# The one bots start on", "# inline note", "my_own_field: keep me", "provider: someone-else", '# Examples: take the "# " off'])
      assert.ok(y.includes(keep), `kept ${keep}`);
    assert.match(y, /use_for: \[planning\]/);
    assert.match(y, /- name: DeepSeek V4 Pro\n {4}provider: openrouter\n {4}model: deepseek\/deepseek-v4-pro\n {4}use_for: \[coding, thinking\]\n {4}run_by: dsh\n/);
    assert.ok(y.indexOf("run_by: dsh") < y.indexOf("# Examples"), "added before the trailing examples");
    // Live: this server's list, with no restart.
    const live = A.llms().find((l) => l.model === "deepseek/deepseek-v4-pro");
    assert.deepEqual(live, { name: "DeepSeek V4 Pro", provider: "openrouter", model: "deepseek/deepseek-v4-pro", useFor: ["coding", "thinking"], runBy: "dsh" });
  });

  await test("run_by is honoured: the new bot's agent for that job is DeepSeek Harness on the OpenRouter model", async () => {
    const bot = { id: "pip", name: "Pip", role: "Research", color: "#5B8CFF", isMain: false, computerStatus: "ready", workspaceId: "ws_main" };
    const state = { brains: [], bots: [bot], host: "orgo" };
    const ai = A.starterAi();
    const dsh = ai.agents.find((x) => x.model === "openrouter/deepseek/deepseek-v4-pro");
    assert.equal(dsh.kind, "dsh");
    assert.equal(A.llmAgent(A.llms().find((l) => l.model === "claude-opus-5-5")).kind, "opencode", "OpenCode when run_by is left out");
    const coding = A.pickAgent(bot, state, [], undefined, "fix the bug in my python script");
    assert.deepEqual(coding, { id: dsh.id, kind: "dsh", model: "openrouter/deepseek/deepseek-v4-pro" });
    const planning = A.pickAgent(bot, state, [], undefined, "make a plan and a schedule");
    assert.equal(planning.kind, "opencode");
    assert.equal(planning.model, "anthropic/claude-opus-5-5");
    assert.notEqual(dsh.id, A.llmAgent({ ...A.llms().find((l) => l.runBy), runBy: undefined }).id, "another agent, another id");
  });

  await test("edit: back to OpenCode, a new name, and a job moved back to Opus", async () => {
    let r = await post({ op: "update", id: "openrouter/deepseek/deepseek-v4-pro", runBy: null, name: "DeepSeek Pro" });
    assert.equal(r.status, 200);
    assert.equal(r.body.llms.find((l) => l.model === "deepseek/deepseek-v4-pro").runBy, undefined);
    assert.ok(!yamlNow().includes("run_by"));
    r = await post({ op: "update", id: "anthropic/claude-opus-5-5", useFor: ["planning", "thinking"] });
    assert.deepEqual(r.body.moved, [{ job: "thinking", from: "DeepSeek Pro" }]);
    assert.deepEqual(r.body.llms.find((l) => l.name === "DeepSeek Pro").useFor, ["coding"]);
    r = await post({ op: "update", id: "openrouter/deepseek/deepseek-v4-pro", model: "deepseek/deepseek-v4-flash" });
    assert.equal(r.status, 200);
    assert.ok(yamlNow().includes("model: deepseek/deepseek-v4-flash"));
    assert.ok(!yamlNow().includes("deepseek-v4-pro"));
    r = await post({ op: "update", id: "openrouter/deepseek/deepseek-v4-flash", model: "claude-opus-5-5", provider: "anthropic" });
    assert.equal(r.status, 400, "can't become a model already in the list");
  });

  await test("one default for new chats and one starter: picking one takes it from the other; a new chat starts on it when its key is set", async () => {
    let r = await post({ op: "update", id: "openrouter/deepseek/deepseek-v4-flash", chatDefault: true });
    assert.equal(r.body.llms.filter((l) => l.chatDefault).length, 1);
    assert.match(yamlNow(), /chat_default: true/);
    assert.equal(chatModels.chatDefault({ openrouter: false }), undefined, "no key: Auto, as before");
    assert.deepEqual(chatModels.chatDefault({ openrouter: true }), { id: "openrouter/deepseek/deepseek-v4-flash", name: "DeepSeek Pro", provider: "openrouter" });
    // What a new owner chat is given as it's made (lib/server/chat-default.ts): only with the key set here.
    assert.equal(newChatModel(), undefined, "no OPENROUTER_API_KEY: a new chat starts on Auto");
    process.env.OPENROUTER_API_KEY = "SYNTHETIC_SECRET_MUST_NOT_ESCAPE";
    assert.equal(newChatModel(), "openrouter/deepseek/deepseek-v4-flash");
    delete process.env.OPENROUTER_API_KEY;
    r = await post({ op: "update", id: "anthropic/claude-opus-5-5", chatDefault: true, starter: true });
    assert.deepEqual(r.body.llms.filter((l) => l.chatDefault).map((l) => l.model), ["claude-opus-5-5"]);
    assert.deepEqual(r.body.llms.filter((l) => l.starter).map((l) => l.model), ["claude-opus-5-5"]);
    assert.equal((yamlNow().match(/chat_default: true/g) ?? []).length, 1);
    assert.equal((yamlNow().match(/starter: true/g) ?? []).length, 1);
    assert.ok(!yamlNow().includes("# inline note"), "the starter's own value went with it");
    r = await post({ op: "update", id: "anthropic/claude-opus-5-5", chatDefault: false });
    assert.equal(chatModels.chatDefault({ anthropic: true }), undefined);
    assert.equal(newChatModel(), undefined);
  });

  await test("the default only goes on chats as they're made: existing, pair and app chats never fall through to it", async () => {
    const src = (f) => readFileSync(join(root, f), "utf8").replace(/\r\n/g, "\n");
    // A chat with no model answers on Auto (chatModelOf reads only the chat's own pick).
    const chatTs = src("lib/server/chat.ts");
    assert.match(chatTs, /const chatModelOf = \(chatId: string \| undefined\) => \{\n {2}const m = chatId \? chat\(chatId\)\?\.model : undefined;\n {2}return m && providerOf\(m\) \? m : undefined;\n\};/);
    assert.ok(!/chatDefault|newChatModel/.test(chatTs), "nothing in chat.ts picks the default");
    // Only the owner's new chats get it: a bot's own chat, a new workspace's main chat, a group chat.
    for (const f of ["lib/server/bots.ts", "lib/server/workspaces.ts", "app/api/chats/route.ts"]) assert.match(src(f), /const model = newChatModel\(\);\n[^\n]*(chats\.push\(|const chat: Chat = )\{[^\n]*\.\.\.\(model \? \{ model \} : \{\}\) \}/, f);
    assert.ok(!/newChatModel/.test(src("lib/server/store.ts")), "chats made again on load keep Auto");
  });

  await test("remove: gone from the file and from this server, the rest kept", async () => {
    const r = await post({ op: "remove", id: "openrouter/deepseek/deepseek-v4-flash" });
    assert.equal(r.status, 200);
    assert.ok(!yamlNow().includes("deepseek-v4"));
    assert.ok(!A.llms().some((l) => l.provider === "openrouter"));
    assert.ok(yamlNow().includes("provider: someone-else"), "an entry Bops left out stays unless removed");
    assert.equal((await post({ op: "remove", id: "openrouter/deepseek/deepseek-v4-flash" })).status, 400);
  });

  await test("a file with a mistake in it is never overwritten", async () => {
    const broken = "llms: [unterminated\n";
    writeFileSync(yamlPath, broken);
    const r = await post({ op: "add", name: "X", provider: "openrouter", model: "q/q" });
    assert.equal(r.status, 500);
    assert.match(r.body.error, /mistake/);
    assert.equal(yamlNow(), broken);
    writeFileSync(yamlPath, YAML_FILE);
  });

  await test("OpenRouter's list: fetched once, trimmed to plain ids, kept; offline says so, and is kept a little while", async () => {
    delete globalThis.__bopsOpenRouter;
    delete globalThis.__bopsOpenRouterFailed;
    fetches = [];
    reply = () => {
      throw new Error("offline");
    };
    let res = await orRoute.GET(req("GET", { headers: win, path: "/api/models/openrouter" }));
    assert.deepEqual(await res.json(), { models: [], offline: true });
    res = await orRoute.GET(req("GET", { headers: win, path: "/api/models/openrouter" }));
    assert.deepEqual(await res.json(), { models: [], offline: true });
    assert.equal(fetches.length, 1, "a failure is kept: the next open doesn't wait on OpenRouter again");
    globalThis.__bopsOpenRouterFailed = Date.now() - 3 * 60 * 1000;
    reply = () =>
      Response.json({
        data: [
          { id: "qwen/qwen3-coder-next", name: "Qwen: Qwen3 Coder Next", context_length: 262144, pricing: { prompt: "0.00000012", completion: "0.0000008" }, description: "long words" },
          { id: "deepseek/deepseek-v4-pro", name: "DeepSeek: DeepSeek V4 Pro", pricing: { prompt: "0", completion: "0" } },
          { id: "bad id; rm -rf", name: "Bad" },
          null,
        ],
      });
    fetches = [];
    res = await orRoute.GET(req("GET", { headers: win, path: "/api/models/openrouter" }));
    const body = await res.json();
    assert.deepEqual(fetches, ["https://openrouter.ai/api/v1/models"]);
    assert.deepEqual(body, {
      models: [
        { id: "deepseek/deepseek-v4-pro", name: "DeepSeek: DeepSeek V4 Pro", inPerM: 0, outPerM: 0 },
        { id: "qwen/qwen3-coder-next", name: "Qwen: Qwen3 Coder Next", context: 262144, inPerM: 0.12, outPerM: 0.8 },
      ],
    });
    await orRoute.GET(req("GET", { headers: win, path: "/api/models/openrouter" }));
    assert.equal(fetches.length, 1, "kept, not fetched again");
    // Expired and OpenRouter unreachable: the last list, marked offline.
    globalThis.__bopsOpenRouter.at = 0;
    reply = () => new Response("down", { status: 503 });
    const stale = await (await orRoute.GET(req("GET", { headers: win, path: "/api/models/openrouter" }))).json();
    assert.equal(stale.offline, true);
    assert.equal(stale.models.length, 2);
  });

  await test("OpenRouter's answer is capped at 5 MB: a bigger one is cut off and taken as offline", async () => {
    const or = await import(pathToFileURL(join(root, "lib/server/openrouter-models.ts")).href);
    delete globalThis.__bopsOpenRouter;
    delete globalThis.__bopsOpenRouterFailed;
    // Said too big up front.
    reply = () => new Response("{}", { headers: { "content-length": String(6 * 1024 * 1024) } });
    assert.deepEqual(await or.openRouterModels(), { models: [], offline: true });
    // Not said, and streamed past the cap: read stops there.
    delete globalThis.__bopsOpenRouterFailed;
    let pulled = 0;
    reply = () =>
      new Response(
        new ReadableStream({
          pull(c) {
            pulled++;
            if (pulled > 100) return c.close();
            c.enqueue(new Uint8Array(1024 * 1024).fill(32));
          },
        }),
      );
    assert.deepEqual(await or.openRouterModels(), { models: [], offline: true });
    assert.ok(pulled <= 8, `stopped reading near 5 MB (read ${pulled} MB)`);
  });

  console.log(`PASS: ${passed} Models card checks (temporary config, fake network)`);
} finally {
  delete globalThis.__modelsTouchState;
  process.chdir(originalCwd);
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  globalThis.fetch = originalFetch;
  hooks.deregister();
  rmSync(temp, { recursive: true, force: true });
}

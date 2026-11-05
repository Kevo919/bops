// More than one account per provider (lib/accounts.ts, lib/server/provider-accounts.ts, config/llms.cjs account,
// lib/server/chat-providers.ts, lib/server/key-check.ts, app/api/models, AppState.chatKeys):
// - other accounts are NAME__LABEL in the environment (.env.local), found by name; a label is A-Z, 0-9 and _ (24);
// - config/llms.yaml's account: <label> is checked, kept when this server hasn't got it (said as not found);
// - a chat on that LLM goes on that account's key, and a no names the account; no label: the default key;
// - each account is listed and checked on its own key at the provider's fixed address;
// - no key value ever reaches the window's answers (Models, Keys, the state's chat-key flags) or the log.
//
// A fake provider per account (fetch, answering by the key it's given) in a temporary directory.
// Usage: node --conditions=react-server scripts/test-provider-accounts.mjs   (Node 24)
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
for (const key of Object.keys(process.env)) if (/^(BOPS_|OPENAI_|ANTHROPIC_|ZAI_|DEEPSEEK_|OPENROUTER_|DEEPINFRA_|ORGO_|OLLAMA_|NEXT_PUBLIC_BOPS)/.test(key)) delete process.env[key];
const temp = mkdtempSync(join(tmpdir(), "bops-accounts-"));
const withRequire = (url) => ({ format: "module-typescript", shortCircuit: true, source: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);\n' + readFileSync(fileURLToPath(url), "utf8") });
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
    if (url.endsWith("/lib/server/llms.ts") || url.endsWith("/app/api/models/route.ts")) return withRequire(url);
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

const SECRETS = {
  OPENROUTER_API_KEY: "or-default-SECRET_A",
  OPENROUTER_API_KEY__WORK: "or-work-SECRET_B",
  OPENROUTER_API_KEY__PERSONAL_2: "or-personal-SECRET_C",
  OPENAI_API_KEY__SIDE: "sk-side-SECRET_D",
  ANTHROPIC_API_KEY: "sk-ant-SECRET_E",
};
const noSecret = (text, where) => {
  for (const v of Object.values(SECRETS)) assert.ok(!String(text).includes(v), `${where}: no key value`);
  assert.ok(!/SECRET_/.test(String(text)), `${where}: nothing of a key`);
};
Object.assign(process.env, SECRETS, {
  // Not accounts: a bad label, an empty one, and a name that only starts the same.
  "OPENROUTER_API_KEY__bad-label": "x",
  OPENROUTER_API_KEY__EMPTY: "  ",
  OPENROUTER_API_KEYS__X: "y",
});
const logs = [];
const log = console.log;
const warn = console.warn;
console.warn = (...a) => logs.push(a.join(" "));

/* ---------------- A fake provider per account: it answers by the key it's given ---------------- */
const asked = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const req = new Request(input, init);
  const auth = req.headers.get("authorization") ?? `x-api-key ${req.headers.get("x-api-key")}`;
  const url = new URL(req.url);
  asked.push({ url: req.url, auth });
  const who = Object.entries(SECRETS).find(([, v]) => auth.includes(v))?.[0];
  if (url.host === "openrouter.ai" && url.pathname === "/api/v1/key") return who ? json({ data: { limit_remaining: who === "OPENROUTER_API_KEY__WORK" ? 0 : 5 } }) : json({ error: "no" }, 401);
  if (url.host === "openrouter.ai" && url.pathname === "/api/v1/chat/completions") {
    if (who === "OPENROUTER_API_KEY__PERSONAL_2") return json({ error: { message: "Insufficient credits" } }, 402);
    return who ? json({ choices: [{ message: { role: "assistant", content: `answered on ${who}` } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) : json({ error: "bad key" }, 401);
  }
  if (url.host === "api.openai.com" && url.pathname === "/v1/responses")
    return who ? json({ id: "resp_side", object: "response", model: "gpt-5-side", status: "completed", output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: `answered on ${who}`, annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1 } }) : json({ error: { message: "bad key" } }, 401);
  if (url.host === "api.openai.com") return who ? json({ choices: [{ message: { content: "." } }] }) : json({ error: { message: "bad" } }, 401);
  throw new TypeError(`offline: ${url.host}`);
};

try {
  mkdirSync(join(temp, "config"));
  writeFileSync(join(temp, "config", "llms.cjs"), `module.exports = require(${JSON.stringify(join(root, "config", "llms.cjs"))});`);
  writeFileSync(
    join(temp, "config", "llms.yaml"),
    [
      "llms:",
      "  - name: Qwen work",
      "    provider: openrouter",
      "    model: qwen/qwen3-coder-next",
      "    account: work",
      "  - name: Qwen default",
      "    provider: openrouter",
      "    model: qwen/qwen3-coder",
      "  - name: Llama personal",
      "    provider: openrouter",
      "    model: meta-llama/llama-5",
      "    account: Personal_2",
      "  - name: Gone",
      "    provider: openrouter",
      "    model: x/gone",
      "    account: NOPE",
      "  - name: Bad",
      "    provider: openrouter",
      "    model: x/bad",
      "    account: not a label",
      "",
    ].join("\n"),
  );
  process.chdir(temp);
  const L = createRequire(import.meta.url)(join(root, "config", "llms.cjs"));
  const Acc = await import(pathToFileURL(join(root, "lib/accounts.ts")).href);
  const PA = await import(pathToFileURL(join(root, "lib/server/provider-accounts.ts")).href);
  const A = await import(pathToFileURL(join(root, "lib/agents.ts")).href);
  const CM = await import(pathToFileURL(join(root, "lib/chat-models.ts")).href);
  const P = await import(pathToFileURL(join(root, "lib/server/chat-providers.ts")).href);
  const K = await import(pathToFileURL(join(root, "lib/server/key-check.ts")).href);
  const modelsRoute = await import(pathToFileURL(join(root, "app/api/models/route.ts")).href);
  const checkRoute = await import(pathToFileURL(join(root, "app/api/key-check/route.ts")).href);

  await test("accounts are found by name: NAME__LABEL set, a label of A-Z, 0-9 and _ (24 at most); nothing else", () => {
    assert.deepEqual(PA.accountLabels("OPENROUTER_API_KEY"), ["PERSONAL_2", "WORK"]);
    assert.deepEqual(PA.accountLabels("OPENAI_API_KEY"), ["SIDE"]);
    assert.deepEqual(PA.accountLabels("DEEPSEEK_API_KEY"), []);
    assert.deepEqual(PA.accountFlags(), { openrouter__PERSONAL_2: true, openrouter__WORK: true, openai__SIDE: true });
    noSecret(JSON.stringify(PA.accountFlags()), "the state's chat-key flags");
    assert.equal(Acc.accountLabel("work"), "WORK");
    assert.equal(Acc.accountLabel(" Personal_2 "), "PERSONAL_2");
    for (const bad of ["", "two words", "a-b", "x".repeat(25), "émile", null, 3]) assert.equal(Acc.accountLabel(bad), undefined, String(bad));
    assert.equal(Acc.accountKeyName("OPENROUTER_API_KEY", "WORK"), "OPENROUTER_API_KEY__WORK");
    assert.equal(Acc.accountKeyName("OPENROUTER_API_KEY"), "OPENROUTER_API_KEY");
  });

  await test("config/llms.yaml account: kept as its label (any case), a bad one left out with why; change() checks it the same way", () => {
    const problems = [];
    const list = L.read(temp, () => {}, problems);
    assert.deepEqual(list.map((l) => [l.name, l.account]), [["Qwen work", "WORK"], ["Qwen default", undefined], ["Llama personal", "PERSONAL_2"], ["Gone", "NOPE"], ["Bad", undefined]]);
    assert.ok(problems.some((p) => /Bad.*account "not a label"/.test(p)));
    assert.equal(L.clean({ llms: [{ provider: "ollama", model: "qwen2.5:3b", account: "x" }] }, problems)[0].account, undefined, "Ollama has no key, so no accounts");
    assert.match(L.change([], { op: "add", name: "Q", provider: "openrouter", model: "q/q", account: "a b" }).error, /letters, numbers and _/);
    assert.equal(L.change([], { op: "add", name: "Q", provider: "openrouter", model: "q/q", account: "side" }).list[0].account, "SIDE");
    const off = L.change(list, { op: "update", id: "openrouter/qwen/qwen3-coder-next", account: null });
    assert.equal(off.list.find((l) => l.from === "openrouter/qwen/qwen3-coder-next").account, undefined, "null: the default again");
  });

  const TOKEN = "synthetic-window-token";
  process.env.BOPS_UI_TOKEN = TOKEN;
  const req = (path, { method = "GET", body } = {}) => new Request(`http://localhost:3210${path}`, { method, headers: { "Content-Type": "application/json", cookie: `bops_window=${TOKEN}` }, ...(body ? { body: JSON.stringify(body) } : {}) });

  await test("Settings, Models: each provider's account labels, a model's account, and one this server hasn't got said as missing; no key values", async () => {
    const res = await modelsRoute.GET(req("/api/models"));
    const text = await res.text();
    noSecret(text, "Models");
    const body = JSON.parse(text);
    assert.deepEqual(body.providers.find((p) => p.id === "openrouter").accounts, ["PERSONAL_2", "WORK"]);
    assert.deepEqual(body.providers.find((p) => p.id === "ollama").accounts, []);
    const by = Object.fromEntries(body.llms.map((l) => [l.name, l]));
    assert.equal(by["Qwen work"].account, "WORK");
    assert.equal(by["Qwen work"].accountMissing, undefined);
    assert.equal(by.Gone.accountMissing, true);
    // A change of account writes it, as its label, and applies at once.
    const r = await (await modelsRoute.POST(req("/api/models", { method: "POST", body: { op: "update", id: "openrouter/qwen/qwen3-coder", account: "side" } }))).json();
    assert.equal(r.llms.find((l) => l.name === "Qwen default").account, "SIDE");
    assert.match(readFileSync(join(temp, "config", "llms.yaml"), "utf8"), /model: qwen\/qwen3-coder\n {4}account: SIDE\n/);
    await modelsRoute.POST(req("/api/models", { method: "POST", body: { op: "update", id: "openrouter/qwen/qwen3-coder", account: null } }));
    assert.equal(A.llms().find((l) => l.name === "Qwen default").account, undefined);
  });

  await test("a chat on an LLM goes on its account's key; without one, the default key", async () => {
    A.setLlms(L.read(temp, () => {}));
    asked.length = 0;
    const work = await P.createOnProvider({ model: "openrouter/qwen/qwen3-coder-next", input: "hi" });
    assert.equal(work.output_text, "answered on OPENROUTER_API_KEY__WORK");
    assert.equal(asked.at(-1).auth, `Bearer ${SECRETS.OPENROUTER_API_KEY__WORK}`);
    const def = await P.createOnProvider({ model: "openrouter/qwen/qwen3-coder", input: "hi" });
    assert.equal(def.output_text, "answered on OPENROUTER_API_KEY");
    const other = await P.createOnProvider({ model: "openrouter/some/unlisted", input: "hi" });
    assert.equal(other.output_text, "answered on OPENROUTER_API_KEY", "a model not in Your LLMs: the default");
  });

  await test("an OpenAI LLM with an account chats on that account's key, never the default client; one not set says which line to add", async () => {
    const extra = L.clean({ llms: [{ name: "GPT side", provider: "openai", model: "gpt-5-side", account: "side" }, { name: "GPT gone", provider: "openai", model: "gpt-5-gone", account: "nope" }, { name: "GPT plain", provider: "openai", model: "gpt-5-plain" }] }, []);
    assert.equal(extra[0].account, "SIDE", "openai accounts are kept by llms.cjs");
    A.setLlms([...L.read(temp, () => {}), ...extra]);
    const used = [];
    const def = { timeout: 1000, maxRetries: 0, responses: { create: async (p) => (used.push(p.model), { id: "resp_default", output: [], output_text: "default" }) } };
    asked.length = 0;
    const side = await P.respond(def, { model: "openai/gpt-5-side", input: "hi" });
    assert.equal(side.output_text ?? side.output[0].content[0].text, "answered on OPENAI_API_KEY__SIDE");
    assert.equal(asked.at(-1).url, "https://api.openai.com/v1/responses");
    assert.equal(asked.at(-1).auth, `Bearer ${SECRETS.OPENAI_API_KEY__SIDE}`);
    assert.deepEqual(used, [], "the default client (OPENAI_API_KEY or Orgo) isn't used");
    await assert.rejects(P.respond(def, { model: "openai/gpt-5-gone", input: "hi" }), /The OpenAI \(nope\) account isn't set on this server: add OPENAI_API_KEY__NOPE to \.env\.local/);
    assert.deepEqual(used, []);
    await P.respond(def, { model: "openai/gpt-5-plain", input: "hi" });
    assert.deepEqual(used, ["gpt-5-plain"], "no account: the default client, as before");
    A.setLlms(L.read(temp, () => {}));
  });

  await test("a no names the account (\"OpenRouter (personal 2)\"), and an account that isn't set says which line to add; never a key", async () => {
    await assert.rejects(P.createOnProvider({ model: "openrouter/meta-llama/llama-5", input: "hi" }), (e) => {
      assert.match(e.message, /^OpenRouter \(personal 2\) says your OpenRouter account has no credit left/);
      noSecret(e.message, "the error");
      return true;
    });
    await assert.rejects(P.createOnProvider({ model: "openrouter/x/gone", input: "hi" }), /The OpenRouter \(nope\) account isn't set on this server: add OPENROUTER_API_KEY__NOPE to \.env\.local/);
    assert.match(P.refusal("openrouter", 401, "{}", SECRETS.OPENROUTER_API_KEY__WORK, "m", "WORK").message, /OpenRouter \(work\) turned this down: your OpenRouter key \(work\) isn't valid\. Check OPENROUTER_API_KEY__WORK/);
  });

  await test("Keys: each account its own row, checked on its own key at the provider's address; a name that isn't one is refused", async () => {
    const list = K.keyCheckList();
    const rows = list.filter((r) => r.key.startsWith("OPENROUTER_API_KEY") || r.key.startsWith("OPENAI_API_KEY"));
    assert.deepEqual(rows.map((r) => [r.key, r.label, r.status]), [
      ["OPENAI_API_KEY", "OpenAI", "not set"],
      ["OPENAI_API_KEY__SIDE", "OpenAI (side)", "set"],
      ["OPENROUTER_API_KEY", "OpenRouter", "set"],
      ["OPENROUTER_API_KEY__PERSONAL_2", "OpenRouter (personal 2)", "set"],
      ["OPENROUTER_API_KEY__WORK", "OpenRouter (work)", "set"],
    ]);
    assert.ok(!list.some((r) => /EXECUTOR_API_KEY__|ORGO_API_KEY__|OLLAMA_BASE_URL__/.test(r.key)));
    asked.length = 0;
    const work = await K.checkKey("OPENROUTER_API_KEY__WORK");
    assert.equal(work.status, "no credit", "the work key's own allowance");
    assert.equal(asked.at(-1).url, "https://openrouter.ai/api/v1/key");
    assert.equal(asked.at(-1).auth, `Bearer ${SECRETS.OPENROUTER_API_KEY__WORK}`);
    assert.equal((await K.checkKey("OPENROUTER_API_KEY__PERSONAL_2")).status, "works");
    assert.equal((await K.checkKey("OPENAI_API_KEY__SIDE")).status, "works");
    for (const bad of ["OPENROUTER_API_KEY__NOPE", "OPENROUTER_API_KEY__bad-label", "OPENROUTER_API_KEY__EMPTY", "OPENROUTER_API_KEYS__X", "PATH"]) assert.equal(await K.checkKey(bad), null, bad);
    const res = await checkRoute.GET(req("/api/key-check"));
    noSecret(await res.text(), "Keys list");
    const post = await checkRoute.POST(req("/api/key-check", { method: "POST", body: { key: "OPENROUTER_API_KEY__WORK" } }));
    noSecret(await post.text(), "a check");
  });

  await test("the window's picker and hint go by the model's account", () => {
    const flags = { openrouter: true, ...PA.accountFlags() };
    const work = CM.chatModels().find((m) => m.id === "openrouter/qwen/qwen3-coder-next");
    assert.equal(work.account, "WORK");
    assert.equal(CM.chatKeySet(work, flags), true);
    assert.equal(CM.chatKeySet(CM.chatModels().find((m) => m.id === "openrouter/x/gone"), flags), false, "its account isn't set: (no key)");
    const src = readFileSync(join(root, "components/app/chat-model.tsx"), "utf8");
    assert.match(src, /\{chatKeySet\(m, keys\) \? "" : " \(no key\)"\}/);
  });

  await test("the Keys card says how to add another account (a line in .env.local, then restart), and that bots use the default", () => {
    const src = readFileSync(join(root, "components/app/setup.tsx"), "utf8");
    assert.match(src, /data-accounts-help[^>]*>More than one account for a provider[^<]*<span className="font-mono">OPENROUTER_API_KEY__WORK=\.\.\.<\/span> in \.env\.local[^<]*restart Bops\.[^<]*Bots&apos; tasks on their computers still use the default account\./);
  });

  await test("nothing secret in the log", () => noSecret(logs.join("\n"), "the log"));

  log(`PASS: ${passed} provider accounts checks (fake providers per account, temporary config)`);
} finally {
  globalThis.fetch = originalFetch;
  console.warn = warn;
  process.chdir(originalCwd);
  hooks.deregister?.();
  rmSync(temp, { recursive: true, force: true });
}

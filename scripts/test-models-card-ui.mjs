// Settings, Models as the owner sees it (components/app/models-card.tsx): each model with its provider, model id,
// key status (set or not, with the way to Keys), the jobs it's for, the agent that runs it (only agents that run
// that provider can be picked) and the chat default; a job another model has says so and moves on a click; Add a
// model picks a provider, then (for OpenRouter) a model from its list, searchable, with the name filled in, or an id
// typed when the list can't be reached; Remove asks first. It sits right after the Keys card in Settings.
//
// Rendered into a DOM (linkedom) against a fake Bops: nothing reaches a server. The .tsx files are compiled with
// the TypeScript in node_modules as they load. The models are made up.
// Usage: node scripts/test-models-card-ui.mjs   (not with --conditions=react-server: a client component)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const rootPath = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const rootUrl = pathToFileURL(rootPath).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = `${rootUrl}/${specifier.slice(2)}`;
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
    if (!url.endsWith(".tsx")) return next(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: url });
    return { format: "module", source: out.outputText, shortCircuit: true };
  },
});
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => (rest[0]?.code === "MODULE_TYPELESS_PACKAGE_JSON" ? undefined : emitWarning(warning, ...rest));

const { parseHTML } = await import("linkedom");
const { window: win } = parseHTML("<!doctype html><html><body></body></html>");
const doc = win.document;
win.HTMLElement.prototype.focus = function () {};
// Typing as React hears it: by the input event, when the document says it has one (linkedom's doesn't).
doc.oninput = null;
globalThis.window = globalThis;
globalThis.document = doc;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* ---------------- A fake Bops ---------------- */

const JOBS = [
  { id: "coding", name: "Coding", help: "Code, apps, websites, scripts, bugs" },
  { id: "planning", name: "Planning", help: "Plans" },
  { id: "thinking", name: "Thinking", help: "Analysis" },
  { id: "research", name: "Research", help: "Finding things out" },
  { id: "writing", name: "Writing", help: "Emails" },
  { id: "browsing", name: "Web tasks", help: "Forms" },
];
const RUN_BY = [
  { kind: "opencode", name: "OpenCode", providers: null },
  { kind: "dsh", name: "DeepSeek Harness", providers: null },
  { kind: "claude", name: "Claude Code", providers: [], why: "Claude Code runs on a Claude account you connect in a bot's AI section, so it can't be picked here." },
  { kind: "codex", name: "Codex", providers: [], why: "Codex runs on a ChatGPT account you connect in a bot's AI section, so it can't be picked here." },
];
const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", label: "Anthropic (Claude)", keyName: "ANTHROPIC_API_KEY", keySet: true },
  { id: "openrouter", name: "OpenRouter", label: "OpenRouter (hundreds of models)", keyName: "OPENROUTER_API_KEY", keySet: false, accounts: ["WORK"] },
  { id: "deepseek", name: "DeepSeek", label: "DeepSeek", keyName: "DEEPSEEK_API_KEY", keySet: false },
  { id: "ollama", name: "Ollama (free, local)", label: "Ollama (free, local; chats only)", keyName: "OLLAMA_BASE_URL", keySet: false, chatOnly: true },
];
const OR = [
  { id: "qwen/qwen3-coder-next", name: "Qwen: Qwen3 Coder Next", context: 262144, inPerM: 0.12, outPerM: 0.8 },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek: DeepSeek V4 Pro", inPerM: 1.6, outPerM: 3.2 },
  { id: "meta-llama/llama-5-free", name: "Meta: Llama 5 (free)", inPerM: 0, outPerM: 0 },
];
const bops = {
  llms: [
    { id: "anthropic/claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic", model: "claude-sonnet-5-5", starter: true, chatDefault: true },
    { id: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic", model: "claude-opus-5-5", useFor: ["thinking", "planning"] },
  ],
  sent: [],
  offline: false,
  orFetches: 0,
  // Your presets as app/api/models/openrouter/presets answers (never with a key in it), and what the card was told after a save.
  presets: { presets: [{ slug: "email-writer", name: "Email writer", description: "Short, warm emails" }, { slug: "coder", name: "Coder" }] },
  presetFetches: 0,
  warning: undefined,
};
const info = () => ({ llms: bops.llms, max: 20, providers: PROVIDERS, runBy: RUN_BY, jobs: JOBS, problems: [] });
const json = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
globalThis.fetch = async (url, opts = {}) => {
  if (url === "/api/models/openrouter") {
    bops.orFetches++;
    return json(bops.offline ? { models: [], offline: true } : { models: OR });
  }
  if (url === "/api/models/openrouter/presets") {
    bops.presetFetches++;
    return json(bops.presets);
  }
  if (url !== "/api/models") throw new Error(`unexpected ${url}`);
  if (!opts.method || opts.method === "GET") return json(info());
  const op = JSON.parse(opts.body);
  bops.sent.push(op);
  // As config/llms.cjs change() does it, for what the card sends here.
  const moved = [];
  const take = (to, jobs) => {
    for (const y of bops.llms) {
      if (y === to || !y.useFor) continue;
      for (const j of y.useFor.filter((k) => jobs.includes(k))) moved.push({ job: j, from: y.name });
      y.useFor = y.useFor.filter((k) => !jobs.includes(k));
      if (!y.useFor.length) delete y.useFor;
    }
  };
  if (op.op === "add") {
    const l = { id: `${op.provider}/${op.model}`, name: op.name, provider: op.provider, model: op.model, ...(op.account ? { account: op.account } : {}), ...(op.useFor?.length ? { useFor: op.useFor } : {}), ...(op.runBy ? { runBy: op.runBy } : {}) };
    take(l, op.useFor ?? []);
    bops.llms.push(l);
  } else if (op.op === "update") {
    const l = bops.llms.find((x) => x.id === op.id);
    if (op.useFor) {
      take(l, op.useFor);
      l.useFor = op.useFor;
    }
    if (op.runBy) l.runBy = op.runBy;
    if ("account" in op) {
      if (op.account) l.account = op.account;
      else delete l.account;
      delete l.accountMissing;
    }
    if (op.chatDefault) for (const y of bops.llms) y.chatDefault = y === l;
  } else if (op.op === "remove") bops.llms = bops.llms.filter((x) => x.id !== op.id);
  return json({ ok: true, moved, ...(bops.warning ? { warning: bops.warning } : {}), ...info() });
};

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ModelsCard, nameFromOpenRouter } = await import(`${rootUrl}/components/app/models-card.tsx`);


let passed = 0;
const test = async (name, f) => {
  await f();
  assert.doesNotMatch(box.textContent + [...box.querySelectorAll("[title]")].map(e => e.title).join(" "), /[A-Z_]{4,}_(KEY|URL)|\.env/, "rendered text and tooltips stay plain");
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};
const setterOf = (el, prop) => {
  for (let p = Object.getPrototypeOf(el); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, prop);
    if (d?.set) return d.set;
  }
  return null;
};
const click = (el) =>
  act(async () => {
    el.dispatchEvent(new win.Event("click", { bubbles: true, cancelable: true }));
    await settle();
  });
const type = (el, value) =>
  act(async () => {
    const set = setterOf(el, "value");
    if (set) set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    await settle();
  });
const choose = (select, value) =>
  act(async () => {
    // (linkedom's select has no value setter: its value is its selected option's.)
    for (const o of select.querySelectorAll("option")) {
      if (o.getAttribute("value") === value) o.setAttribute("selected", "");
      else o.removeAttribute("selected");
    }
    assert.equal(select.value, value, `${value} is an option`);
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
    await settle();
  });
const button = (box, words) => [...box.querySelectorAll("button")].find((b) => b.textContent.trim() === words);
const row = (box, id) => box.querySelector(`[data-model="${id}"]`);

const box = doc.createElement("div");
doc.body.appendChild(box);
const root = createRoot(box);
await act(async () => {
  root.render(h(ModelsCard));
  await settle();
});

try {
  await test("each model in plain words: name, provider, model id, its jobs, Run by, and the chat default", async () => {
    const text = box.textContent;
    for (const w of ["Models", "Claude Sonnet 5.5", "Claude Opus 5.5", "claude-opus-5-5", "Anthropic", "Use for", "Run by", "Default for new chats", "Default for bot tasks", "New chats start on Claude Sonnet 5.5"]) assert.ok(text.includes(w), `says ${w}`);
    const opus = row(box, "anthropic/claude-opus-5-5");
    assert.deepEqual([...opus.querySelectorAll("[data-job][aria-pressed=true]")].map((b) => b.textContent), ["Planning", "Thinking"]);
    assert.equal(row(box, "anthropic/claude-sonnet-5-5").querySelector("input[name=models-chat-default]").checked, true);
    assert.equal(opus.querySelector("[data-key=set]").textContent.trim(), "Key set");
    assert.ok(!/—|–/.test(text), "no dashes");
  });

  await test("Run by offers only agents that run the provider; Claude Code and Codex say why they can't be picked here", async () => {
    const select = row(box, "anthropic/claude-opus-5-5").querySelector("select[aria-label='Run by']");
    const opts = [...select.querySelectorAll("option")].map((o) => [o.getAttribute("value"), o.disabled ?? o.hasAttribute("disabled"), o.textContent]);
    assert.deepEqual(opts.map(([v, d]) => [v, !!d]), [["opencode", false], ["dsh", false], ["claude", true], ["codex", true]]);
    assert.match(opts[2][2], /set up in a bot's AI section/);
    await choose(select, "dsh");
    assert.deepEqual(bops.sent.at(-1), { op: "update", id: "anthropic/claude-opus-5-5", runBy: "dsh" });
    assert.match(box.querySelector("[data-models-note]").textContent, /Claude Opus 5.5 now runs on DeepSeek Harness/);
  });

  await test("a job another model has is dimmed and says so; picking it moves it, and the card says from where", async () => {
    const sonnet = row(box, "anthropic/claude-sonnet-5-5");
    const thinking = sonnet.querySelector("[data-job=thinking]");
    assert.match(thinking.getAttribute("title"), /Claude Opus 5.5 has it now: picking it moves it here/);
    assert.match(thinking.className, /opacity-60/);
    await click(thinking);
    assert.deepEqual(bops.sent.at(-1), { op: "update", id: "anthropic/claude-sonnet-5-5", useFor: ["thinking"] });
    assert.equal(box.querySelector("[data-models-note]").textContent, "Saved. Thinking moved from Claude Opus 5.5 to Claude Sonnet 5.5.");
    assert.deepEqual([...row(box, "anthropic/claude-opus-5-5").querySelectorAll("[data-job][aria-pressed=true]")].map((b) => b.textContent), ["Planning"]);
  });

  await test("Add a model: OpenRouter's list, searchable, the name filled in, its key missing with the way to Keys", async () => {
    await click(button(box, "Add a model"));
    const add = box.querySelector("[data-add-model]");
    const provider = add.querySelector("select[aria-label=Provider]");
    assert.ok([...provider.querySelectorAll("option")].some((o) => o.textContent === "OpenRouter (hundreds of models)"));
    await choose(provider, "openrouter");
    assert.equal(bops.orFetches, 1);
    const missing = add.querySelector("[data-key=missing]");
    assert.match(missing.textContent, /No key yet: Open setup guide in Keys/);
    assert.equal(missing.querySelector("a").getAttribute("href"), "#settings-keys");
    assert.equal(add.querySelectorAll("[data-or-model]").length, 3);
    const search = add.querySelector("input[aria-label='Search OpenRouter models']");
    await type(search, "qwen coder");
    assert.deepEqual([...add.querySelectorAll("[data-or-model]")].map((b) => b.getAttribute("data-or-model")), ["qwen/qwen3-coder-next"]);
    assert.match(add.querySelector("[data-or-model]").textContent, /\$0\.12 in \/ \$0\.8 out per million tokens/);
    await click(add.querySelector("[data-or-model]"));
    assert.equal(add.querySelector("input[aria-label='Model id']").value, "qwen/qwen3-coder-next");
    assert.equal(add.querySelector("input[aria-label=Name]").value, "Qwen3 Coder Next");
    // Planning is Opus's: the sheet says picking it moves it.
    await click(add.querySelector("[data-job=coding]"));
    await click(add.querySelector("[data-job=planning]"));
    assert.match(add.querySelector("[data-moves]").textContent, /Planning is Claude Opus 5.5's now: saving moves it to this model/);
    await choose(add.querySelector("select[aria-label='Run by']"), "dsh");
    await click(button(add, "Save"));
    assert.deepEqual(bops.sent.at(-1), { op: "add", name: "Qwen3 Coder Next", provider: "openrouter", model: "qwen/qwen3-coder-next", useFor: ["coding", "planning"], runBy: "dsh" });
    assert.equal(box.querySelector("[data-add-model]"), null, "closed once saved");
    assert.equal(box.querySelector("[data-models-note]").textContent, "Added Qwen3 Coder Next. Planning moved from Claude Opus 5.5 to Qwen3 Coder Next.");
    assert.ok(row(box, "openrouter/qwen/qwen3-coder-next"));
    assert.equal(nameFromOpenRouter("Meta: Llama 5 (free)"), "Llama 5 (free)");
  });

  await test("OpenRouter unreachable: it says so and takes a typed model id; a bad id or one already there can't be saved", async () => {
    // A new Add a model asks again (the card keeps no list between opens).
    bops.offline = true;
    await click(button(box, "Add a model"));
    const add = box.querySelector("[data-add-model]");
    await choose(add.querySelector("select[aria-label=Provider]"), "openrouter");
    assert.match(add.querySelector("[data-offline]").textContent, /Couldn't reach OpenRouter's list. Type the model id/);
    const id = add.querySelector("input[aria-label='Model id']");
    await type(id, "two words");
    assert.ok(button(add, "Save").disabled);
    assert.match(add.textContent, /no spaces/);
    await type(id, "qwen/qwen3-coder-next");
    assert.match(add.textContent, /in the list already/);
    assert.ok(button(add, "Save").disabled);
    await type(id, "deepseek/deepseek-v4-pro");
    assert.equal(add.querySelector("input[aria-label=Name]").value, "deepseek-v4-pro", "named from the id");
    await click(button(add, "Save"));
    assert.deepEqual(bops.sent.at(-1), { op: "add", name: "deepseek-v4-pro", provider: "openrouter", model: "deepseek/deepseek-v4-pro", useFor: [] });
  });

  await test("Default for new chats and Remove (which asks first)", async () => {
    await act(async () => {
      row(box, "openrouter/deepseek/deepseek-v4-pro").querySelector("input[name=models-chat-default]").dispatchEvent(new win.Event("click", { bubbles: true }));
      await settle();
    });
    assert.deepEqual(bops.sent.at(-1), { op: "update", id: "openrouter/deepseek/deepseek-v4-pro", chatDefault: true });
    assert.match(box.textContent, /New chats start on deepseek-v4-pro/);
    const r = row(box, "openrouter/deepseek/deepseek-v4-pro");
    await click(button(r, "Remove"));
    assert.match(r.textContent, /Remove deepseek-v4-pro\?/);
    const n = bops.sent.length;
    await click(button(r, "Keep"));
    assert.equal(bops.sent.length, n, "Keep sends nothing");
    await click(button(row(box, "openrouter/deepseek/deepseek-v4-pro"), "Remove"));
    await click(button(row(box, "openrouter/deepseek/deepseek-v4-pro"), "Remove"));
    assert.deepEqual(bops.sent.at(-1), { op: "remove", id: "openrouter/deepseek/deepseek-v4-pro" });
    assert.equal(row(box, "openrouter/deepseek/deepseek-v4-pro"), null);
  });

  await test("a chats-only provider (Ollama): no jobs, Run by or bot default, and it says why", async () => {
    bops.llms.push({ id: "ollama/qwen2.5:3b", name: "Qwen local", provider: "ollama", model: "qwen2.5:3b" });
    await click(button(box, "Add a model"));
    await click(button(box, "Close"));
    // (The list comes back with the next change; one is enough to show the row.)
    await click(row(box, "anthropic/claude-sonnet-5-5").querySelector("[data-job=writing]"));
    const r = row(box, "ollama/qwen2.5:3b");
    assert.match(r.querySelector("[data-chat-only]").textContent, /Chats only/);
    assert.equal(r.querySelector("[data-job]"), null);
    assert.equal(r.querySelector("select[aria-label='Run by']"), null);
    assert.equal(r.querySelector("input[name=models-starter]"), null);
    assert.ok(r.querySelector("input[name=models-chat-default]"));
    assert.match(r.querySelector("[data-key=missing]").textContent, /Not set up yet: Open setup guide in Keys/);
    await click(button(box, "Add a model"));
    const add = box.querySelector("[data-add-model]");
    await choose(add.querySelector("select[aria-label=Provider]"), "ollama");
    assert.ok(add.querySelector("[data-chat-only]"));
    assert.equal(add.querySelector("[data-job]"), null);
    await click(button(add, "Cancel"));
  });

  await test("OpenRouter presets: your presets listed (read by the server on your key), one picked is @preset/<slug>, chats only", async () => {
    await click(button(box, "Add a model"));
    const add = box.querySelector("[data-add-model]");
    await choose(add.querySelector("select[aria-label=Provider]"), "openrouter");
    assert.equal(bops.presetFetches, 0, "not asked until Preset is picked");
    await click(add.querySelector("[data-or-mode=preset]"));
    assert.equal(bops.presetFetches, 1);
    assert.match(add.querySelector("[data-presets]").textContent, /openrouter\.ai\/settings\/presets/);
    assert.equal(add.querySelector("[data-presets] a").getAttribute("href"), "https://openrouter.ai/settings/presets");
    assert.deepEqual([...add.querySelectorAll("[data-or-preset]")].map((b) => b.getAttribute("data-or-preset")), ["email-writer", "coder"]);
    assert.match(add.querySelector("[data-or-preset]").textContent, /@preset\/email-writer · Short, warm emails/);
    assert.equal(add.querySelector("input[aria-label='Model id']"), null, "a preset is picked, not a model id");
    assert.equal(add.querySelector("input[aria-label='Preset slug']"), null, "the list worked: nothing to type");
    await click(add.querySelector("[data-or-preset=email-writer]"));
    assert.equal(add.querySelector("[data-or-preset=email-writer]").getAttribute("aria-selected"), "true");
    assert.equal(add.querySelector("input[aria-label=Name]").value, "Email writer");
    assert.match(add.querySelector("[data-chat-only]").textContent, /OpenRouter preset/);
    assert.equal(add.querySelector("[data-job]"), null, "no bot jobs for a preset");
    assert.equal(add.querySelector("select[aria-label='Run by']"), null);
    await click(button(add, "Save"));
    assert.deepEqual(bops.sent.at(-1), { op: "add", name: "Email writer", provider: "openrouter", model: "@preset/email-writer", useFor: [] });
    const r = row(box, "openrouter/@preset/email-writer");
    assert.ok(r.querySelector("[data-preset-tag]"));
    assert.match(r.querySelector("[data-chat-only]").textContent, /OpenRouter preset/);
    assert.equal(r.querySelector("input[name=models-starter]"), null);
  });

  await test("presets with no presets yet: says where to make one; without a key (the list can't be read): says so, and a slug typed in works", async () => {
    bops.presets = { presets: [] };
    await click(button(box, "Add a model"));
    const none = box.querySelector("[data-add-model]");
    await choose(none.querySelector("select[aria-label=Provider]"), "openrouter");
    await click(none.querySelector("[data-or-mode=preset]"));
    assert.match(none.querySelector("[data-presets-none]").textContent, /no presets on OpenRouter yet/);
    assert.equal(none.querySelector("input[aria-label='Preset slug']"), null);
    await click(button(none, "Cancel"));
    bops.presets = { presets: [], noKey: true };
    await click(button(box, "Add a model"));
    const add = box.querySelector("[data-add-model]");
    await choose(add.querySelector("select[aria-label=Provider]"), "openrouter");
    await click(add.querySelector("[data-or-mode=preset]"));
    assert.match(add.querySelector("[data-presets-nokey]").textContent, /Follow the setup guide linked in Keys to connect OpenRouter/);
    const slug = add.querySelector("input[aria-label='Preset slug']");
    await type(slug, "bad slug!");
    assert.match(add.textContent, /letters, numbers, - and _ only/);
    assert.ok(button(add, "Save").disabled);
    await type(slug, "@preset/research_v2");
    assert.equal(slug.value, "research_v2", "a pasted @preset/ comes off");
    await click(button(add, "Save"));
    assert.equal(bops.sent.at(-1).model, "@preset/research_v2");
  });

  await test("Auto Router in one click, and any model id typed in (said when OpenRouter's list doesn't have it, not refused)", async () => {
    bops.offline = false;
    await click(button(box, "Add a model"));
    let add = box.querySelector("[data-add-model]");
    await choose(add.querySelector("select[aria-label=Provider]"), "openrouter");
    await click(add.querySelector("[data-or-auto]"));
    assert.equal(add.querySelector("input[aria-label='Model id']").value, "openrouter/auto");
    assert.equal(add.querySelector("input[aria-label=Name]").value, "Auto Router");
    assert.ok(add.querySelector("[data-job]"), "Auto Router is a plain model id: bots can use it");
    await click(button(add, "Save"));
    assert.deepEqual(bops.sent.at(-1), { op: "add", name: "Auto Router", provider: "openrouter", model: "openrouter/auto", useFor: [] });
    await click(button(box, "Add a model"));
    add = box.querySelector("[data-add-model]");
    await choose(add.querySelector("select[aria-label=Provider]"), "openrouter");
    await click(add.querySelector("[data-or-mode=custom]"));
    assert.equal(add.querySelector("[aria-label='OpenRouter models']"), null, "the list is out of the way");
    assert.match(add.textContent, /Any OpenRouter model id, e\.g\. vendor\/model or vendor\/model:free/);
    await type(add.querySelector("input[aria-label='Model id']"), "someone/new-model:free");
    assert.match(add.querySelector("[data-unknown-id]").textContent, /doesn't have someone\/new-model:free/);
    assert.ok(!button(add, "Save").disabled, "a warning, not a no");
    bops.warning = "Saved, but OpenRouter's model list doesn't have \"someone/new-model:free\".";
    await click(button(add, "Save"));
    bops.warning = undefined;
    assert.equal(bops.sent.at(-1).model, "someone/new-model:free");
    assert.match(box.querySelector("[data-models-warning]").textContent, /doesn't have "someone\/new-model:free"/);
  });

  await test("accounts: an Account box only for a provider with more than one, on each model and on Add; one not found is said", async () => {
    assert.equal(row(box, "anthropic/claude-opus-5-5").querySelector("select[aria-label=Account]"), null, "Anthropic has one account here");
    const qwen = row(box, "openrouter/qwen/qwen3-coder-next");
    const sel = qwen.querySelector("select[aria-label=Account]");
    assert.deepEqual([...sel.querySelectorAll("option")].map((o) => o.textContent), ["Default account", "work"]);
    assert.match(sel.closest("label").getAttribute("title"), /Bots' tasks on their computers use the default account/);
    await choose(sel, "WORK");
    assert.deepEqual(bops.sent.at(-1), { op: "update", id: "openrouter/qwen/qwen3-coder-next", account: "WORK" });
    assert.match(box.querySelector("[data-models-note]").textContent, /now uses the work account/);
    assert.match(row(box, "openrouter/qwen/qwen3-coder-next").querySelector("[data-account-tag]").textContent, /work account/);
    await choose(row(box, "openrouter/qwen/qwen3-coder-next").querySelector("select[aria-label=Account]"), "");
    assert.deepEqual(bops.sent.at(-1), { op: "update", id: "openrouter/qwen/qwen3-coder-next", account: null });
    await click(button(box, "Add a model"));
    const add = box.querySelector("[data-add-model]");
    assert.equal(add.querySelector("select[aria-label=Account]"), null, "no provider yet");
    await choose(add.querySelector("select[aria-label=Provider]"), "openrouter");
    await choose(add.querySelector("select[aria-label=Account]"), "WORK");
    await click(add.querySelector("[data-or-mode=custom]"));
    await type(add.querySelector("input[aria-label='Model id']"), "qwen/qwen3-coder-work");
    await click(button(add, "Save"));
    assert.deepEqual(bops.sent.at(-1), { op: "add", name: "qwen3-coder-work", provider: "openrouter", model: "qwen/qwen3-coder-work", useFor: [], account: "WORK" });
    bops.llms.push({ id: "openrouter/x/gone", name: "Gone", provider: "openrouter", model: "x/gone", account: "NOPE", accountMissing: true });
    await click(row(box, "anthropic/claude-sonnet-5-5").querySelector("[data-job=research]"));
    const gone = row(box, "openrouter/x/gone");
    assert.match(gone.querySelector("[data-account-missing]").textContent, /Account not connected\. Choose an available account/);
    assert.ok([...gone.querySelectorAll("select[aria-label=Account] option")].some((o) => o.textContent === "nope (account not found)"));
    assert.ok(!/SECRET|sk-/.test(box.innerHTML), "no key anywhere");
  });

  await test("in Settings, Models comes right after the Keys card, which Keys links go to", async () => {
    const setup = readFileSync(join(rootPath, "components/app/setup.tsx"), "utf8");
    assert.match(setup, /<div id="settings-keys"[^>]*>\s*<KeysCard \/>\s*<\/div>\s*<ModelsCard \/>/);
  });

  await test("model card text and tooltips never display environment identifiers", async () => {
    const visible = box.textContent + [...box.querySelectorAll("[title]")].map(e => e.title).join(" ");
    assert.doesNotMatch(visible, /[A-Z_]{4,}_(KEY|URL)|\.env/);
  });
  console.log(`PASS: ${passed} Models card UI checks (fake Bops, no server)`);
} finally {
  await act(async () => root.unmount());
}

function join(...parts) {
  return parts.join("/");
}

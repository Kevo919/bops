/**
 * config/llms.yaml: the LLMs your bots can use, in one place (what each is, its provider and model, which one
 * new bots start on, the jobs it takes, the agent that runs it and the one chats start on). Read when Bops
 * starts; lib/agents.ts llms() is the list after. Settings, Models changes it here (change, then write), which
 * keeps the file's comments, and puts the new list in at once (app/api/models).
 * Nothing secret is in that file: a provider's key stays in the Vault (lib/agents.ts ROUTE_KEYS names it).
 */
const fs = require("node:fs");
const path = require("node:path");

const PROVIDERS = ["anthropic", "openai", "deepinfra", "zai", "zai-coding", "zai-coding-cn", "deepseek", "openrouter", "ollama"];
const JOBS = ["coding", "planning", "thinking", "research", "writing", "browsing"];
const MODEL = /^[A-Za-z0-9._:/-]{1,120}$/;
/**
 * An OpenRouter preset (openrouter.ai/settings/presets), written as its model: "@preset/<slug>", as OpenRouter's
 * docs have a request name one. Only for provider openrouter, and only this one form: a slug of letters, numbers,
 * "-" and "_". A preset runs chats only (bots' agents take a plain model id), so it takes no jobs, as Ollama.
 */
const PRESET = /^@preset\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const isPreset = (provider, model) => provider === "openrouter" && PRESET.test(String(model ?? ""));
const modelOk = (provider, model) => MODEL.test(model) || isPreset(provider, model);
const MAX = 20;
/**
 * Providers chats run on but bots' agents can't (lib/agents.ts CHAT_ONLY): Ollama runs on this server, out of
 * reach of a bot's cloud computer. Their LLMs take no jobs, no run_by and aren't what bots start on.
 */
const CHAT_ONLY = ["ollama"];
const CHAT_ONLY_WHY = "runs chats only (it's on this server, out of reach of your bots' computers), so it takes no bot jobs";
const PRESET_WHY = "is an OpenRouter preset: it runs chats and chat routines only (bots' agents take a plain model id), so it takes no bot jobs";
/** Whether an LLM runs chats only (its provider is CHAT_ONLY, or it's a preset), and why. */
const chatOnlyOf = (provider, model) => CHAT_ONLY.includes(provider) || isPreset(provider, model);
const whyOf = (provider, model) => (isPreset(provider, model) ? PRESET_WHY : `${provider} ${CHAT_ONLY_WHY}`);

/**
 * The agents that can run an LLM for bots' tasks (run_by), and the providers each runs (null: every one).
 * OpenCode is what runs one when run_by isn't there. Claude Code and Codex aren't here: each runs on an AI
 * account connected to a bot (its AI section), which this file can't name, so `NOT_RUN_BY` says why.
 */
const RUN_BY = {
  opencode: { name: "OpenCode", providers: null },
  dsh: { name: "DeepSeek Harness", providers: null },
};
const RUN_BY_WORDS = { "deepseek-harness": "dsh", "deepseek harness": "dsh" };
const NOT_RUN_BY = {
  claude: { name: "Claude Code", why: "Claude Code runs on a Claude account you connect in a bot's AI section, so it can't be picked here." },
  codex: { name: "Codex", why: "Codex runs on a ChatGPT account you connect in a bot's AI section, so it can't be picked here." },
};
const runByOk = (kind, provider) => !CHAT_ONLY.includes(provider) && Object.hasOwn(RUN_BY, kind) && (!RUN_BY[kind].providers || RUN_BY[kind].providers.includes(provider));
const runByOf = (v) => {
  const k = typeof v === "string" ? v.trim().toLowerCase() : "";
  return RUN_BY_WORDS[k] ?? (k === "claude-code" || k === "claude code" ? "claude" : k);
};

/** The list as Bops may use it: known providers, plain model names, at most 20, each provider/model once. `problems`: what was left out, and why. */
function clean(raw, problems = []) {
  const list = Array.isArray(raw?.llms) ? raw.llms : [];
  const out = [];
  const seen = new Set();
  list.forEach((x, i) => {
    const where = `llms entry ${i + 1}${x?.name ? ` (${x.name})` : ""}`;
    if (!x || typeof x !== "object") return problems.push(`${where}: not a block with name, provider and model`);
    const provider = String(x.provider ?? "").trim().toLowerCase();
    const model = String(x.model ?? "").trim();
    if (!PROVIDERS.includes(provider)) return problems.push(`${where}: provider "${x.provider ?? ""}" isn't one of ${PROVIDERS.join(", ")}`);
    if (!modelOk(provider, model)) return problems.push(`${where}: model "${x.model ?? ""}" isn't a model name`);
    const id = `${provider}/${model}`;
    if (seen.has(id)) return problems.push(`${where}: ${id} is in the list already`);
    if (out.length >= MAX) return problems.push(`${where}: at most ${MAX} LLMs`);
    seen.add(id);
    const name = String(x.name ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 60) || model;
    const chatOnly = chatOnlyOf(provider, model);
    let useFor = Array.isArray(x.use_for) ? JOBS.filter((j) => x.use_for.includes(j)) : [];
    if (chatOnly && (useFor.length || x.starter === true)) {
      problems.push(`${where}: its use_for and starter (${whyOf(provider, model)})`);
      useFor = [];
    }
    // run_by: an agent that runs this provider, else left out (OpenCode runs it), with why.
    let runBy;
    if (x.run_by !== undefined && x.run_by !== null && x.run_by !== "" && chatOnly) problems.push(`${where}: its run_by (${whyOf(provider, model)})`);
    else if (x.run_by !== undefined && x.run_by !== null && x.run_by !== "") {
      const k = runByOf(x.run_by);
      if (runByOk(k, provider)) runBy = k;
      else problems.push(`${where}: its run_by "${x.run_by}" (OpenCode runs it instead). ${NOT_RUN_BY[k]?.why ?? `run_by is one of ${Object.keys(RUN_BY).join(", ")}.`}`);
    }
    out.push({ name, provider, model, ...(x.starter === true && !chatOnly ? { starter: true } : {}), ...(useFor.length ? { useFor } : {}), ...(runBy ? { runBy } : {}), ...(x.chat_default === true ? { chatDefault: true } : {}) });
  });
  // One starter and one chat default: the first marked. Each job goes to one LLM: the first that has it.
  let starter = false;
  let chat = false;
  const owner = {};
  for (const l of out) {
    if (l.starter && starter) delete l.starter;
    else if (l.starter) starter = true;
    if (l.chatDefault && chat) delete l.chatDefault;
    else if (l.chatDefault) chat = true;
    if (l.useFor) {
      const mine = l.useFor.filter((j) => !owner[j]);
      for (const j of l.useFor) if (owner[j]) problems.push(`${l.name}'s job ${j}: ${owner[j]} has it already (each job goes to one LLM)`);
      for (const j of mine) owner[j] = l.name;
      if (mine.length) l.useFor = mine;
      else delete l.useFor;
    }
  }
  return out;
}

/* ---------------- Changing the list (Settings, Models) ---------------- */

const idOf = (l) => `${l.provider}/${l.model}`;
const nameOk = (v) => typeof v === "string" && v.length <= 200 && !/[\r\n]/.test(v);

/**
 * One change to the list (`list`: clean()'s, as read): { op: "add", name, provider, model, useFor?, runBy?,
 * chatDefault?, starter? }, { op: "update", id, ...what changes } (id: "provider/model"; runBy null is OpenCode
 * again), or { op: "remove", id }. Each job goes to one LLM, so giving one a job takes it from the one that had
 * it (`moved` says which). One chat default and one starter, the same way. What's wrong is `error`, and nothing
 * changes. Each LLM of the result keeps `from`, the id it had in the file, for write().
 */
function change(list, op) {
  const next = list.map((l) => ({ ...l, from: idOf(l), ...(l.useFor ? { useFor: [...l.useFor] } : {}) }));
  const fail = (error) => ({ error });
  if (!op || typeof op !== "object") return fail("Send a change: add, update or remove.");
  let x;
  if (op.op === "remove") {
    const i = next.findIndex((l) => l.from === op.id);
    if (i < 0) return fail("That model isn't in the list anymore.");
    next.splice(i, 1);
    return { list: next, removed: [op.id], moved: [] };
  }
  if (op.op === "add") {
    if (next.length >= MAX) return fail(`At most ${MAX} models: remove one first.`);
    x = { name: "", provider: "", model: "" };
    next.push(x);
  } else if (op.op === "update") {
    x = next.find((l) => l.from === op.id);
    if (!x) return fail("That model isn't in the list anymore.");
  } else return fail("Send a change: add, update or remove.");
  if (op.op === "add" || op.provider !== undefined) {
    const provider = String(op.provider ?? "").trim().toLowerCase();
    if (!PROVIDERS.includes(provider)) return fail(`Pick a provider: ${PROVIDERS.join(", ")}.`);
    x.provider = provider;
  }
  if (op.op === "add" || op.model !== undefined) {
    const model = String(op.model ?? "").trim();
    if (!modelOk(x.provider, model))
      return fail(
        /^@preset\//.test(model) && x.provider !== "openrouter"
          ? "A preset (@preset/<slug>) is OpenRouter's: pick OpenRouter as the provider."
          : /^@preset\//.test(model)
            ? "A preset is @preset/ then its slug: letters, numbers, - and _ only (like @preset/email-writer)."
            : "A model id is letters, numbers and . _ : / - only, with no spaces (like deepseek/deepseek-chat).",
      );
    x.model = model;
  }
  // A provider changed under a preset: a preset is OpenRouter's only.
  if (!modelOk(x.provider, x.model)) return fail("A preset (@preset/<slug>) is OpenRouter's: pick OpenRouter as the provider.");
  if (next.some((l) => l !== x && idOf(l) === idOf(x))) return fail(`${idOf(x)} is in the list already.`);
  if (op.name !== undefined) {
    if (!nameOk(op.name)) return fail("A name is one line.");
    x.name = op.name.trim().slice(0, 60);
  }
  if (!x.name) x.name = x.model;
  const chatOnly = chatOnlyOf(x.provider, x.model);
  if (chatOnly) {
    if ((Array.isArray(op.useFor) && op.useFor.length) || op.starter === true || (op.runBy && op.runBy !== "opencode")) return fail(isPreset(x.provider, x.model) ? `${x.name} ${PRESET_WHY}.` : `${x.name} ${CHAT_ONLY_WHY}.`);
    delete x.useFor;
    delete x.starter;
    delete x.runBy;
  }
  if (op.runBy !== undefined) {
    if (op.runBy === null || op.runBy === "" || op.runBy === "opencode") delete x.runBy;
    else {
      const k = runByOf(op.runBy);
      if (!runByOk(k, x.provider)) return fail(NOT_RUN_BY[k]?.why ?? `${RUN_BY[k]?.name ?? String(op.runBy)} can't run ${x.provider} models.`);
      x.runBy = k;
    }
  } else if (x.runBy && !runByOk(x.runBy, x.provider)) delete x.runBy;
  const moved = [];
  if (op.useFor !== undefined) {
    if (!Array.isArray(op.useFor) || op.useFor.some((j) => !JOBS.includes(j))) return fail(`Jobs are ${JOBS.join(", ")}.`);
    const jobs = JOBS.filter((j) => op.useFor.includes(j));
    for (const y of next) {
      if (y === x || !y.useFor) continue;
      for (const j of y.useFor.filter((k) => jobs.includes(k))) moved.push({ job: j, from: y.name });
      const left = y.useFor.filter((k) => !jobs.includes(k));
      if (left.length) y.useFor = left;
      else delete y.useFor;
    }
    if (jobs.length) x.useFor = jobs;
    else delete x.useFor;
  }
  for (const [field, word] of [["chatDefault", "chatDefault"], ["starter", "starter"]]) {
    if (op[word] === undefined) continue;
    if (typeof op[word] !== "boolean") return fail(`${word} is true or false.`);
    if (op[word]) for (const y of next) delete y[field];
    if (op[word]) x[field] = true;
    else delete x[field];
  }
  return { list: next, removed: [], moved };
}

/** config/llms.yaml's own words for a field, and the value it's written as (undefined: taken out). */
const FIELDS = [
  ["name", (l) => l.name],
  ["provider", (l) => l.provider],
  ["model", (l) => l.model],
  ["starter", (l) => (l.starter ? true : undefined)],
  ["use_for", (l) => (l.useFor?.length ? l.useFor : undefined)],
  ["run_by", (l) => l.runBy],
  ["chat_default", (l) => (l.chatDefault ? true : undefined)],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Write `list` (change()'s) to config/llms.yaml, keeping what it can of the file: its comments, the order, any
 * field of an entry Bops doesn't know, and entries Bops left out (a provider it doesn't know, say) unless
 * `removed` names them. Each LLM changes its entry (by `from`, else its own id), only where a value is
 * different; one that has none is added at the end of the list (before its trailing comments). Atomic.
 */
function write(root, list, removed = []) {
  const YAML = require("yaml");
  const file = path.join(root, "config", "llms.yaml");
  let doc;
  try {
    doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    if (doc.errors?.length) throw new Error(`config/llms.yaml has a mistake in it, so Bops won't overwrite it: ${doc.errors[0].message}`);
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
    doc = new YAML.Document({ llms: [] });
  }
  let seq = doc.get("llms", true);
  if (!YAML.isSeq(seq)) {
    doc.set("llms", doc.createNode([]));
    seq = doc.get("llms", true);
  }
  const key = (node) => {
    if (!YAML.isMap(node)) return undefined;
    return `${String(node.get("provider") ?? "").trim().toLowerCase()}/${String(node.get("model") ?? "").trim()}`;
  };
  const gone = new Set(removed);
  const wanted = new Map(list.map((l) => [l.from ?? idOf(l), l]));
  const done = new Set();
  seq.items = seq.items.filter((node) => !gone.has(key(node)));
  for (const node of seq.items) {
    const k = key(node);
    const l = k && !done.has(k) ? wanted.get(k) : undefined;
    if (!l) continue;
    done.add(k);
    for (const [field, value] of FIELDS) {
      const v = value(l);
      const now = node.get(field);
      const was = YAML.isNode(now) ? now.toJSON() : now;
      if (v === undefined) {
        if (node.has(field)) node.delete(field);
      } else if (!same(was, v)) node.set(field, Array.isArray(v) ? Object.assign(doc.createNode(v), { flow: true }) : v);
    }
  }
  for (const [k, l] of wanted) {
    if (done.has(k)) continue;
    const entry = {};
    for (const [field, value] of FIELDS) if (value(l) !== undefined) entry[field] = value(l);
    const node = doc.createNode(entry);
    const jobs = node.get("use_for", true);
    if (jobs) jobs.flow = true;
    // A blank line before it, as the file's own entries have.
    if (seq.items.length) node.spaceBefore = true;
    seq.items.push(node);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, doc.toString({ flowCollectionPadding: false }));
  fs.renameSync(tmp, file);
}

/** config/llms.yaml, cleaned ([] when there's none, or it can't be read; what's wrong goes to the log, and to `problems`). */
function read(root, log = console.warn, problemsOut) {
  let raw;
  try {
    raw = require("yaml").parse(fs.readFileSync(path.join(root, "config", "llms.yaml"), "utf8"));
  } catch (e) {
    if (e?.code !== "ENOENT") log(`[llms] config/llms.yaml couldn't be read: ${e?.message ?? e}`);
    return [];
  }
  const problems = [];
  const list = clean(raw, problems);
  for (const p of problems) log(`[llms] left out ${p}`);
  if (problemsOut) problemsOut.push(...problems);
  return list;
}

module.exports = { PROVIDERS, JOBS, CHAT_ONLY, RUN_BY, NOT_RUN_BY, MAX, MODEL, PRESET, isPreset, chatOnlyOf, runByOk, clean, read, change, write };

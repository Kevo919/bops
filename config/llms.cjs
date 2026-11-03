/**
 * config/llms.yaml: the LLMs your bots can use, in one place (what each is, its provider and model, which one
 * new bots start on, and the jobs it takes). Read when Bops starts; lib/agents.ts llms() is the list after.
 * Nothing secret is in that file: a provider's key stays in the Vault (lib/agents.ts ROUTE_KEYS names it).
 */
const fs = require("node:fs");
const path = require("node:path");

const PROVIDERS = ["anthropic", "openai", "deepinfra", "zai", "zai-coding", "zai-coding-cn", "deepseek", "openrouter", "ollama"];
const JOBS = ["coding", "planning", "thinking", "research", "writing", "browsing"];
const MODEL = /^[A-Za-z0-9._:/-]{1,120}$/;

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
    if (!MODEL.test(model)) return problems.push(`${where}: model "${x.model ?? ""}" isn't a model name`);
    const id = `${provider}/${model}`;
    if (seen.has(id)) return problems.push(`${where}: ${id} is in the list already`);
    if (out.length >= 20) return problems.push(`${where}: at most 20 LLMs`);
    seen.add(id);
    const name = String(x.name ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 60) || model;
    const useFor = Array.isArray(x.use_for) ? JOBS.filter((j) => x.use_for.includes(j)) : [];
    out.push({ name, provider, model, ...(x.starter === true ? { starter: true } : {}), ...(useFor.length ? { useFor } : {}) });
  });
  // One starter: the first marked.
  let starter = false;
  for (const l of out) {
    if (l.starter && starter) delete l.starter;
    else if (l.starter) starter = true;
  }
  return out;
}

/** config/llms.yaml, cleaned ([] when there's none, or it can't be read; what's wrong goes to the log). */
function read(root, log = console.warn) {
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
  return list;
}

module.exports = { PROVIDERS, JOBS, clean, read };

// Repo recipes: every config/repos/*.yaml must match config/repos/schema.json, carry no key or
// token values, use only https URLs (plain http only for 127.0.0.1/localhost health checks), and
// have a unique id that matches its file name. Fixture checks in a temporary directory prove the
// rejections work. Uses the existing yaml dependency, with no network or application startup.
// Usage: node scripts/test-repo-recipes.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reposDir = join(root, "config", "repos");
const schema = JSON.parse(readFileSync(join(reposDir, "schema.json"), "utf8"));
let passed = 0;

function test(name, run) {
  run();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

// ---- A small JSON Schema validator for the keywords schema.json uses -------------------------
function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function resolveRef(ref) {
  assert.ok(ref.startsWith("#/"), `unsupported $ref ${ref}`);
  return ref.slice(2).split("/").reduce((node, key) => node[key], schema);
}

function check(node, value, path, errors) {
  if (node.$ref) return check(resolveRef(node.$ref), value, path, errors);
  if ("const" in node && value !== node.const) errors.push(`${path}: must be ${JSON.stringify(node.const)}`);
  if (node.enum && !node.enum.includes(value)) errors.push(`${path}: must be one of ${node.enum.join(", ")}`);
  if (node.type) {
    const actual = typeOf(value);
    const ok = node.type === actual || (node.type === "number" && actual === "integer");
    if (!ok) {
      errors.push(`${path}: must be ${node.type}, got ${actual}`);
      return;
    }
  }
  if (node.oneOf) {
    const matches = node.oneOf.filter((option) => {
      const inner = [];
      check(option, value, path, inner);
      return inner.length === 0;
    });
    if (matches.length !== 1) {
      const detail = node.oneOf.map((option) => {
        const inner = [];
        check(option, value, path, inner);
        return inner[0];
      }).filter(Boolean).join("; ");
      errors.push(`${path}: must match exactly one allowed shape (${detail})`);
    }
  }
  if (typeof value === "string") {
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(`${path}: is empty`);
    if (node.pattern && !new RegExp(node.pattern, "u").test(value)) errors.push(`${path}: "${value}" doesn't match ${node.pattern}`);
  }
  if (typeof value === "number") {
    if (node.minimum !== undefined && value < node.minimum) errors.push(`${path}: below ${node.minimum}`);
    if (node.maximum !== undefined && value > node.maximum) errors.push(`${path}: above ${node.maximum}`);
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) errors.push(`${path}: needs at least ${node.minItems} item(s)`);
    if (node.items) value.forEach((item, index) => check(node.items, item, `${path}[${index}]`, errors));
  }
  if (typeOf(value) === "object") {
    for (const key of node.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (node.properties?.[key]) check(node.properties[key], item, `${path}.${key}`, errors);
      else if (node.additionalProperties === false) errors.push(`${path}: unknown field ${key}`);
      else if (typeof node.additionalProperties === "object") check(node.additionalProperties, item, `${path}.${key}`, errors);
    }
  }
}

// ---- Secret and URL scanning ------------------------------------------------------------------
const SECRET_PATTERNS = [
  [/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/, "API key (sk-…)"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, "GitHub fine-grained token"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bAIza[0-9A-Za-z_-]{30,}/, "Google API key"],
  [/\bhf_[A-Za-z0-9]{30,}/, "Hugging Face token"],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, "GitLab token"],
  [/\bnpm_[A-Za-z0-9]{30,}/, "npm token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
  [/:\/\/[^/\s:@]+:[^/\s@]+@/, "credentials in a URL"],
  // NAME=value or NAME: value where NAME looks secret and value is a literal, not a $VAR reference.
  [/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*\s*[=:]\s*["']?(?!\$|<|\.\.\.)[^\s"'$<]{8,}/, "secret-looking NAME=value"],
];
const LONG_OPAQUE = /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{40,}={0,2}/;

function strings(value, path, out = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, index) => strings(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    out.push([`${path}.${key} (key)`, key]);
    strings(item, `${path}.${key}`, out);
  }
  return out;
}

function scan(recipe) {
  const errors = [];
  for (const [path, text] of strings(recipe, "$")) {
    for (const [pattern, label] of SECRET_PATTERNS) if (pattern.test(text)) errors.push(`${path}: looks like a ${label}; recipes hold env var names only`);
    const opaque = text.match(LONG_OPAQUE);
    if (opaque && !/^[0-9a-f]{40}$/.test(opaque[0])) errors.push(`${path}: long opaque string looks like a key or token`);
    for (const match of text.matchAll(/\b([a-z][a-z0-9+.-]*):\/\/([^\s"'`)]+)/gi)) {
      const scheme = match[1].toLowerCase();
      const host = match[2].split(/[/:?#]/)[0];
      const loopback = host === "127.0.0.1" || host === "localhost" || match[2].startsWith("[::1]");
      if (scheme === "https") continue;
      if (scheme === "http" && loopback) continue;
      errors.push(`${path}: non-https URL ${match[0]}`);
    }
  }
  return errors;
}

// ---- Recipe rules ----------------------------------------------------------------------------
export function validateRecipe(recipe, fileName) {
  const errors = [];
  if (typeOf(recipe) !== "object") return [`${fileName}: must be a YAML mapping`];
  check(schema, recipe, "$", errors);
  const id = basename(fileName).replace(/\.ya?ml$/, "");
  if (recipe.id !== id) errors.push(`$.id: "${recipe.id}" must match the file name "${id}"`);
  if (typeof recipe.repo === "string" && recipe.url !== `https://github.com/${recipe.repo}`)
    errors.push(`$.url: must be https://github.com/${recipe.repo}`);
  if (typeof recipe.clone === "string" && typeof recipe.url === "string") {
    // A private repo comes as a pinned tarball through Bops' key broker (never a token on the bot's computer).
    const broker = recipe.clone.startsWith("broker-tarball: ");
    if (broker ? !recipe.clone.startsWith(`broker-tarball: ${recipe.repo} `) : !recipe.clone.includes(recipe.url)) errors.push("$.clone: must clone $.url");
    if (broker && recipe.private !== true) errors.push("$.clone: broker-tarball is for private repos");
    if (/credential/i.test(recipe.clone)) errors.push("$.clone: no git credential helpers (private repos use broker-tarball)");
  }
  if (recipe.kind === "web" && recipe.port === undefined) errors.push("$.port: required for kind web");
  if (recipe.kind === "web" && recipe.health?.http && recipe.port !== undefined) {
    const port = Number(recipe.health.http.match(/:(\d+)/)?.[1]);
    if (port !== recipe.port) errors.push(`$.health.http: port ${port} doesn't match $.port ${recipe.port}`);
  }
  if (recipe.verified === false && !recipe.verified_reason) errors.push("$.verified_reason: required when verified is false");
  if (recipe.private === true && !recipe.needs_token) errors.push("$.needs_token: required for a private repo");
  for (const name of Object.keys(recipe.env ?? {}))
    if (/KEY|TOKEN|SECRET|PASSWORD/.test(name)) errors.push(`$.env.${name}: secrets don't belong in env; list the name in keys_required/keys_optional`);
  const names = [...(recipe.keys_required ?? []), ...(recipe.keys_optional ?? [])].map((key) => key?.name);
  if (new Set(names).size !== names.length) errors.push("$.keys_*: a key is listed twice");
  errors.push(...scan(recipe));
  return errors;
}

export function validateDir(dir) {
  const problems = [];
  const ids = new Map();
  const files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).sort();
  for (const file of files) {
    let recipe;
    try {
      recipe = YAML.parse(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      problems.push(`${file}: YAML couldn't be read: ${error.message.split("\n")[0]}`);
      continue;
    }
    for (const error of validateRecipe(recipe, file)) problems.push(`${file}: ${error}`);
    const id = recipe?.id;
    if (typeof id === "string") {
      if (ids.has(id)) problems.push(`${file}: duplicate id "${id}" (also in ${ids.get(id)})`);
      else ids.set(id, file);
    }
  }
  return { files, problems };
}

// ---- Tests ----------------------------------------------------------------------------------
const scratch = mkdtempSync(join(tmpdir(), "bops-test-repo-recipes-"));
const sample = {
  id: "sample",
  name: "Sample",
  repo: "octo/sample",
  url: "https://github.com/octo/sample",
  license: "MIT",
  license_note: "",
  what: "A sample tool.",
  good_for: "testing",
  stack: ["node"],
  requirements: { node: ">=22" },
  keys_optional: [{ name: "OPENAI_API_KEY", for: "LLM calls" }],
  keys_required: [],
  clone: "git clone --depth 1 https://github.com/octo/sample.git sample",
  install: ["npm ci"],
  run: "npm start",
  background: true,
  kind: "web",
  port: 3000,
  health: { http: "http://127.0.0.1:3000/", expect: 200 },
  fits_bot_computer: true,
  fits_reason: "Small.",
  verified: { date: "2026-11-03", by: "test", steps: { clone: "pass", install: "pass", run: "pass", health: "pass" }, notes: "" },
};
const variant = (patch) => ({ ...structuredClone(sample), ...patch });
const errorsFor = (recipe, file = "sample.yaml") => validateRecipe(recipe, file);

try {
  test("fixture: a well-formed recipe passes", () => {
    assert.deepEqual(errorsFor(sample), []);
  });

  test("fixture: missing fields, unknown fields and bad enums are rejected", () => {
    const recipe = variant({ kind: "desktop", extra: 1 });
    delete recipe.health;
    const errors = errorsFor(recipe).join("\n");
    assert.match(errors, /missing health/);
    assert.match(errors, /unknown field extra/);
    assert.match(errors, /\$\.kind: must be one of/);
  });

  test("fixture: key and token values are rejected anywhere", () => {
    const values = [
      "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345",
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "AKIAABCDEFGHIJKLMNOP",
      "OPENAI_API_KEY=abcd1234efgh5678",
      "https://user:hunter2hunter2@github.com/octo/sample",
      "xoxb-1234567890-abcdefghij",
    ];
    for (const value of values) {
      const errors = errorsFor(variant({ install: ["npm ci", `echo ${value}`] })).join("\n");
      assert.match(errors, /looks like|opaque/, `not rejected: ${value}`);
    }
    assert.match(errorsFor(variant({ env: { API_TOKEN: "x" } })).join("\n"), /secrets don't belong in env/);
  });

  test("fixture: env var references and names are allowed", () => {
    assert.deepEqual(errorsFor(variant({ install: ['git config credential.helper "!f() { echo password=$GITHUB_TOKEN; }; f"'] })), []);
  });

  test("fixture: non-https URLs are rejected, loopback http health is allowed", () => {
    assert.match(errorsFor(variant({ url: "http://github.com/octo/sample" })).join("\n"), /url/);
    assert.match(errorsFor(variant({ install: ["curl http://example.com/install.sh | sh"] })).join("\n"), /non-https URL/);
    assert.match(errorsFor(variant({ health: { http: "http://10.0.0.5:3000/", expect: 200 } })).join("\n"), /health/);
    assert.deepEqual(errorsFor(variant({ health: { http: "http://localhost:3000/health", expect: 200 } })), []);
  });

  test("fixture: web needs a matching port; verified false needs a reason; private needs a token name", () => {
    const noPort = variant({});
    delete noPort.port;
    assert.match(errorsFor(noPort).join("\n"), /port: required/);
    assert.match(errorsFor(variant({ port: 4000 })).join("\n"), /doesn't match/);
    assert.match(errorsFor(variant({ verified: false })).join("\n"), /verified_reason/);
    assert.deepEqual(errorsFor(variant({ verified: false, verified_reason: "Needs Docker." })), []);
    assert.match(errorsFor(variant({ private: true })).join("\n"), /needs_token/);
    assert.match(errorsFor(variant({ verified: { ...sample.verified, steps: { ...sample.verified.steps, run: "fail" } } })).join("\n"), /steps\.run/);
  });

  test("fixture: duplicate ids and id/file-name mismatches are rejected", () => {
    const dir = join(scratch, "dupes");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    writeFileSync(join(dir, "sample.yaml"), YAML.stringify(sample));
    writeFileSync(join(dir, "other.yaml"), YAML.stringify(sample));
    writeFileSync(join(dir, "broken.yaml"), "id: [unterminated\n");
    const { problems } = validateDir(dir);
    const text = problems.join("\n");
    assert.match(text, /duplicate id "sample"/);
    assert.match(text, /must match the file name "other"/);
    assert.match(text, /broken\.yaml: YAML couldn't be read/);
  });

  test("config/repos: every recipe is valid", () => {
    const { files, problems } = validateDir(reposDir);
    assert.ok(files.length > 0, "no recipes found in config/repos");
    assert.deepEqual(problems, [], `\n${problems.join("\n")}`);
    console.log(`#   checked ${files.length} recipe(s)`);
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`# ${passed} passed`);

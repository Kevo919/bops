/**
 * config/repos/*.yaml: the starter GitHub repos the owner and the bots can Open or Run (config/repos/README.md).
 * One validator for both readers: lib/server/repos.ts, which loads the recipes as Bops starts and again when
 * asked, and scripts/test-repo-recipes.mjs, which checks every recipe in CI. A recipe that fails a check is left
 * out (with why), never half used. Nothing here runs anything or reaches a network.
 *
 * What Bops learns about a recipe at runtime (installed, running, failed, the last health check, the approved
 * plan) lives in the app's state (AppState.repos), never in these files.
 */
const fs = require("node:fs");
const path = require("node:path");

// The schema beside the recipes: config/repos/schema.json under the folder read (this file's own by default).
const schemas = new Map();
const schemaOf = (dir = path.join(__dirname, "repos")) => {
  const file = path.join(dir, "schema.json");
  if (!schemas.has(file)) schemas.set(file, JSON.parse(fs.readFileSync(file, "utf8")));
  return schemas.get(file);
};

// ---- A small JSON Schema validator for the keywords schema.json uses -------------------------
function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function resolveRef(schema, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref ${ref}`);
  return ref.slice(2).split("/").reduce((node, key) => node[key], schema);
}

function check(schema, node, value, path, errors) {
  if (node.$ref) return check(schema, resolveRef(schema, node.$ref), value, path, errors);
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
      check(schema, option, value, path, inner);
      return inner.length === 0;
    });
    if (matches.length !== 1) {
      const detail = node.oneOf
        .map((option) => {
          const inner = [];
          check(schema, option, value, path, inner);
          return inner[0];
        })
        .filter(Boolean)
        .join("; ");
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
    if (node.items) value.forEach((item, index) => check(schema, node.items, item, `${path}[${index}]`, errors));
  }
  if (typeOf(value) === "object") {
    for (const key of node.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (node.properties?.[key]) check(schema, node.properties[key], item, `${path}.${key}`, errors);
      else if (node.additionalProperties === false) errors.push(`${path}: unknown field ${key}`);
      else if (typeof node.additionalProperties === "object") check(schema, node.additionalProperties, item, `${path}.${key}`, errors);
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
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      out.push([`${path}.${key} (key)`, key]);
      strings(item, `${path}.${key}`, out);
    }
  return out;
}

/** Secret-looking values and non-https URLs anywhere in `value` (a recipe, or a plan made from one). */
function scan(value) {
  const errors = [];
  for (const [path, text] of strings(value, "$")) {
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
function validateRecipe(recipe, fileName, schema = schemaOf()) {
  const errors = [];
  if (typeOf(recipe) !== "object") return [`${fileName}: must be a YAML mapping`];
  check(schema, schema, recipe, "$", errors);
  const id = path.basename(fileName).replace(/\.ya?ml$/, "");
  if (recipe.id !== id) errors.push(`$.id: "${recipe.id}" must match the file name "${id}"`);
  if (typeof recipe.repo === "string" && recipe.url !== `https://github.com/${recipe.repo}`) errors.push(`$.url: must be https://github.com/${recipe.repo}`);
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
  for (const name of Object.keys(recipe.env ?? {})) if (/KEY|TOKEN|SECRET|PASSWORD/.test(name)) errors.push(`$.env.${name}: secrets don't belong in env; list the name in keys_required/keys_optional`);
  const names = [...(recipe.keys_required ?? []), ...(recipe.keys_optional ?? [])].map((key) => key?.name);
  if (new Set(names).size !== names.length) errors.push("$.keys_*: a key is listed twice");
  errors.push(...scan(recipe));
  return errors;
}

/** Every recipe file in `dir`, checked: the files, every problem (file: why), and the recipes that passed. */
function validateDir(dir) {
  const YAML = require("yaml");
  const problems = [];
  const recipes = [];
  const ids = new Map();
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).sort() : [];
  const schema = files.length ? schemaOf(fs.existsSync(path.join(dir, "schema.json")) ? dir : undefined) : null;
  for (const file of files) {
    let recipe;
    try {
      recipe = YAML.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch (error) {
      problems.push(`${file}: YAML couldn't be read: ${error.message.split("\n")[0]}`);
      continue;
    }
    const errors = validateRecipe(recipe, file, schema);
    for (const error of errors) problems.push(`${file}: ${error}`);
    const id = recipe?.id;
    if (typeof id === "string") {
      if (ids.has(id)) {
        problems.push(`${file}: duplicate id "${id}" (also in ${ids.get(id)})`);
        continue;
      }
      ids.set(id, file);
    }
    if (!errors.length) recipes.push(recipe);
  }
  return { files, problems, recipes };
}

/** The recipes under `root`/config/repos that pass every check, and what was left out. */
function read(root) {
  return validateDir(path.join(root, "config", "repos"));
}

module.exports = { validateRecipe, validateDir, read, scan };

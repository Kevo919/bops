// node --conditions=react-server scripts/test-llms-config.mjs
// config/llms.yaml read the way node scripts/*.mjs read it: lib/server/llms.ts loaded as plain ESM (types stripped,
// no Next bundle, no require shim), so a loader that leans on CommonJS's global require shows here as "[llms] ...: require
// is not defined" and an empty list. Checks the repo's own config/llms.yaml, then one with the chat-only and Z.ai providers.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname, basename, resolve, relative } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import YAML from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const originalCwd = process.cwd();
const temp = mkdtempSync(join(tmpdir(), "bops-llms-config-"));
let count = 0;
// Only how Next finds files (the @/ alias, .ts without its suffix); every file loads as written.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try { return next(specifier, context); }
    catch (error) {
      if (/^(file:|\.)/.test(specifier)) for (const ext of [".ts", ".tsx"]) {
        try { return next(specifier + ext, context); } catch { /* try next suffix */ }
      }
      throw error;
    }
  },
});
async function test(name, run) { await run(); console.log(`ok ${++count} - ${name}`); }

/** Loads lib/server/llms.ts fresh with cwd as its root, and gives back what it logged under [llms]. */
let generation = 0;
async function load(cwd) {
  const lines = { log: [], warn: [], error: [] };
  const saved = { log: console.log, warn: console.warn, error: console.error };
  for (const kind of Object.keys(lines)) console[kind] = (...args) => {
    const line = args.map(String).join(" ");
    if (line.startsWith("[llms]")) lines[kind].push(line); else saved[kind](...args);
  };
  process.chdir(cwd);
  try { await import(`${pathToFileURL(join(root, "lib/server/llms.ts")).href}?case=${++generation}`); }
  finally { Object.assign(console, saved); process.chdir(originalCwd); }
  return lines;
}

try {
  const agents = await import(pathToFileURL(join(root, "lib/agents.ts")).href);

  await test("the repo's config/llms.yaml loads as plain ESM: no [llms] error, every provider it names is in the list", async () => {
    agents.setLlms([]);
    const lines = await load(root);
    assert.deepEqual(lines.warn, []);
    assert.deepEqual(lines.error, []);
    const raw = YAML.parse(readFileSync(join(root, "config", "llms.yaml"), "utf8"));
    const configured = (raw?.llms ?? []).filter(l => l && l.provider && l.model);
    assert.ok(configured.length > 0, "config/llms.yaml names at least one LLM");
    const list = agents.llms();
    assert.equal(list.length, configured.length);
    assert.deepEqual(lines.log, [`[llms] ${configured.length} from config/llms.yaml`]);
    const got = new Set(list.map(l => l.provider));
    for (const l of configured) assert.ok(got.has(String(l.provider).toLowerCase()), `${l.provider} is loaded`);
    assert.deepEqual(list.map(l => l.model), configured.map(l => String(l.model)));
  });

  await test("Ollama, Z.ai, DeepSeek and OpenRouter LLMs load the same way (what the server's chats run on)", async () => {
    mkdirSync(join(temp, "config"));
    writeFileSync(join(temp, "config", "llms.cjs"), `module.exports = require(${JSON.stringify(join(root, "config", "llms.cjs"))});`);
    writeFileSync(join(temp, "config", "llms.yaml"), `llms:
  - name: Local Qwen
    provider: ollama
    model: qwen3:8b
  - name: GLM
    provider: zai
    model: glm-5.3
    starter: true
  - name: GLM Coding
    provider: zai-coding
    model: glm-5.3
    use_for: [coding]
  - name: DeepSeek
    provider: deepseek
    model: deepseek-chat
  - name: Router
    provider: openrouter
    model: qwen/qwen3-coder
`);
    agents.setLlms([]);
    const lines = await load(temp);
    assert.deepEqual(lines.warn, []);
    assert.deepEqual(lines.error, []);
    assert.deepEqual(lines.log, ["[llms] 5 from config/llms.yaml"]);
    assert.deepEqual(agents.llms().map(l => [l.provider, l.model]), [
      ["ollama", "qwen3:8b"], ["zai", "glm-5.3"], ["zai-coding", "glm-5.3"], ["deepseek", "deepseek-chat"], ["openrouter", "qwen/qwen3-coder"],
    ]);
  });

  await test("a broken config/llms.yaml is still said under [llms], not thrown (the server starts with Bops agent only)", async () => {
    writeFileSync(join(temp, "config", "llms.yaml"), "llms: [unclosed\n");
    agents.setLlms([]);
    const lines = await load(temp);
    assert.equal(lines.warn.length, 1);
    assert.match(lines.warn[0], /^\[llms\] config\/llms\.yaml couldn.t be read: /);
    assert.doesNotMatch(lines.warn[0], /require is not defined/);
    assert.deepEqual(agents.llms(), []);
  });

  await test("no server file reads a config/*.cjs through the global require (none outside Next's bundle)", () => {
    const bare = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && /(?<![\w.])require\(\s*\/\* turbopackIgnore/.test(readFileSync(path, "utf8"))) bare.push(relative(root, path));
      }
    };
    walk(join(root, "lib", "server"));
    walk(join(root, "app", "api"));
    assert.deepEqual(bare, []);
  });

  console.log(`${count} llms config checks passed; no network or environment files used.`);
} finally {
  process.chdir(originalCwd);
  hooks.deregister();
  assert.equal(dirname(resolve(temp)), resolve(tmpdir()));
  assert.ok(basename(temp).startsWith("bops-llms-config-"));
  rmSync(temp, { recursive: true, force: true });
}

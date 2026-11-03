// Config readers and module edits: invalid YAML/providers, normalized LLMs, and comment-preserving
// writes. All files live in disposable temporary directories; no real config, environment or keys
// are changed. Uses the existing yaml dependency, with no network or application startup.
// Usage: node scripts/test-config.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const llms = require("../config/llms.cjs");
const modules = require("../config/modules.cjs");
const scratch = mkdtempSync(join(tmpdir(), "bops-test-config-"));
let passed = 0;

function test(name, run) {
  run();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

function fixture(name, filename, contents) {
  const root = join(scratch, name);
  mkdirSync(join(root, "config"), { recursive: true });
  if (filename) writeFileSync(join(root, "config", filename), contents);
  return root;
}

try {
  test("LLMs: missing file is empty and quiet", () => {
    const warnings = [];
    assert.deepEqual(llms.read(fixture("missing"), (text) => warnings.push(text)), []);
    assert.deepEqual(warnings, []);
  });

  test("LLMs: malformed YAML is empty with a diagnostic, without rewriting the source", () => {
    const source = "llms: [unterminated\n";
    const root = fixture("bad-llms", "llms.yaml", source);
    const warnings = [];
    assert.deepEqual(llms.read(root, (text) => warnings.push(text)), []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /llms\.yaml couldn't be read/);
    assert.equal(readFileSync(join(root, "config", "llms.yaml"), "utf8"), source);
  });

  test("LLMs: absent or non-list configuration is empty", () => {
    for (const raw of [undefined, null, {}, "text", [], { llms: null }, { llms: {} }, { llms: "text" }])
      assert.deepEqual(llms.clean(raw), []);
  });

  test("LLMs: reject unknown providers and bad entries while keeping valid siblings", () => {
    const problems = [];
    const output = llms.clean({ llms: [null, "text", { provider: "unknown", model: "model" }, { provider: "openai", model: "ok" }] }, problems);
    assert.deepEqual(output, [{ name: "ok", provider: "openai", model: "ok" }]);
    assert.equal(problems.length, 3);
    assert.match(problems[2], /provider "unknown"/);
  });

  test("LLMs: normalize names, providers and jobs without mutating input", () => {
    const input = { llms: [{ name: "  My\r\n model  ", provider: " OpenAI ", model: " org/model:v1 ", use_for: ["thinking", "coding", "coding", "unknown"], starter: true }] };
    const before = structuredClone(input);
    assert.deepEqual(llms.clean(input), [{ name: "My   model", provider: "openai", model: "org/model:v1", starter: true, useFor: ["coding", "thinking"] }]);
    assert.deepEqual(input, before);
    assert.equal(llms.clean({ llms: [{ name: "x".repeat(80), provider: "zai", model: "model" }] })[0].name.length, 60);
    assert.deepEqual(llms.clean({ llms: [{ name: " ", provider: "zai", model: "model", use_for: "coding", starter: "true" }] }), [{ name: "model", provider: "zai", model: "model" }]);
  });

  test("LLMs: model validation rejects whitespace, control characters and overlong IDs", () => {
    const problems = [];
    const bad = ["", "two words", "bad;command", "bad\nmodel", "x".repeat(121)];
    assert.deepEqual(llms.clean({ llms: bad.map((model) => ({ provider: "openai", model })) }, problems), []);
    assert.equal(problems.length, bad.length);
    assert.equal(llms.clean({ llms: [{ provider: "openai", model: "x".repeat(120) }] }).length, 1);
  });

  test("LLMs: deduplicate normalized provider/model while allowing another provider", () => {
    const problems = [];
    const list = llms.clean({ llms: [
      { name: "First", provider: "openai", model: "same" },
      { name: "Duplicate", provider: " OPENAI ", model: " same " },
      { name: "Different", provider: "anthropic", model: "same" },
    ] }, problems);
    assert.deepEqual(list.map((model) => model.name), ["First", "Different"]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /already/);
  });

  test("LLMs: cap at 20 accepted entries and keep only the first valid starter", () => {
    const problems = [];
    const list = llms.clean({ llms: [
      { provider: "invalid", model: "invalid", starter: true },
      ...Array.from({ length: 22 }, (_, index) => ({ provider: "openai", model: `model-${index}`, starter: index < 2 })),
    ] }, problems);
    assert.equal(list.length, 20);
    assert.equal(list[19].model, "model-19");
    assert.deepEqual(list.filter((model) => model.starter).map((model) => model.model), ["model-0"]);
    assert.equal(problems.filter((text) => text.includes("at most 20")).length, 2);
  });

  test("LLMs: YAML reader reports rejected entries and returns the normalized list", () => {
    const root = fixture("read-llms", "llms.yaml", "# models\nllms:\n  - provider: unknown\n    model: nope\n  - name: Planner\n    provider: openai\n    model: test-model\n    starter: true\n    use_for: [planning, unknown]\n");
    const warnings = [];
    assert.deepEqual(llms.read(root, (text) => warnings.push(text)), [{ name: "Planner", provider: "openai", model: "test-model", starter: true, useFor: ["planning"] }]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /left out.*unknown/);
  });

  test("LLMs: the China Coding Plan (zai-coding-cn) is its own provider, next to zai-coding, in the code and the file's list", () => {
    assert.ok(llms.PROVIDERS.includes("zai-coding-cn") && llms.PROVIDERS.includes("zai-coding"));
    const root = fixture("read-llms-cn", "llms.yaml", "llms:\n  - name: GLM China\n    provider: zai-coding-cn\n    model: glm-5.3\n    use_for: [coding]\n  - provider: ZAI-Coding-CN\n    model: glm-5.2\n  - provider: zai-coding-cnx\n    model: glm-5.3\n");
    const warnings = [];
    assert.deepEqual(llms.read(root, (text) => warnings.push(text)), [
      { name: "GLM China", provider: "zai-coding-cn", model: "glm-5.3", useFor: ["coding"] },
      { name: "glm-5.2", provider: "zai-coding-cn", model: "glm-5.2" },
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /provider "zai-coding-cnx"/);
    const yaml = readFileSync(new URL("../config/llms.yaml", import.meta.url), "utf8");
    assert.match(yaml, /^#    zai-coding-cn .*open\.bigmodel\.cn/m, "the file's provider list names it");
    assert.match(yaml, /ZAI_CODING_CN_API_KEY/, "and its key");
    for (const p of llms.PROVIDERS) assert.match(yaml, new RegExp(`^#    ${p.replace(/[-]/g, "\\-")}\\s`, "m"), `${p} in the file's provider list`);
  });

  test("LLMs: Ollama is a provider, its model's colon kept, and the file's commented example reads back", () => {
    assert.ok(llms.PROVIDERS.includes("ollama"));
    const root = fixture("read-llms-ollama", "llms.yaml", "llms:\n  - name: Qwen local\n    provider: Ollama\n    model: qwen2.5:3b\n  - provider: ollama\n    model: llama3.2:1b-instruct-q4_K_M\n");
    const warnings = [];
    assert.deepEqual(llms.read(root, (text) => warnings.push(text)), [
      { name: "Qwen local", provider: "ollama", model: "qwen2.5:3b" },
      { name: "llama3.2:1b-instruct-q4_K_M", provider: "ollama", model: "llama3.2:1b-instruct-q4_K_M" },
    ]);
    assert.deepEqual(warnings, []);
    const yaml = readFileSync(new URL("../config/llms.yaml", import.meta.url), "utf8");
    assert.match(yaml, /^#    ollama .*free/m, "the file's provider list names it");
    assert.match(yaml, /OLLAMA_BASE_URL/);
    // The commented example, uncommented, is a valid entry.
    const example = yaml.split("\n").filter((l) => /^  # (- name: Qwen|  provider: ollama|  model: qwen2\.5:3b)/.test(l)).map((l) => l.replace(/^  # /, "  ")).join("\n");
    assert.deepEqual(llms.clean(require("yaml").parse(`llms:\n${example}\n`)), [{ name: "Qwen 2.5 3B (local)", provider: "ollama", model: "qwen2.5:3b" }]);
  });

  test("Modules: missing, empty and malformed YAML safely read as empty", () => {
    assert.deepEqual(modules.read(fixture("missing-modules")), {});
    assert.deepEqual(modules.read(fixture("empty-modules", "bops.yaml", "# empty\n")), {});
    const source = "ai: [unterminated\n";
    const root = fixture("bad-modules", "bops.yaml", source);
    assert.deepEqual(modules.read(root), {});
    assert.equal(readFileSync(modules.file(root), "utf8"), source);
    const env = { BOPS_CHAT_MODEL: "untouched" };
    assert.deepEqual(modules.apply(root, env), []);
    assert.deepEqual(env, { BOPS_CHAT_MODEL: "untouched" });
  });

  test("Modules: write retains comments, unrelated keys and sections", () => {
    const root = fixture("comments", "bops.yaml", "# My modules\nai:\n  # Keep this chat explanation\n  chat: old-model # inline note\n  light: leave-this\n# This section belongs to a plugin\ncustom:\n  untouched: yes\n");
    modules.write(root, { ai: { chat: "new-model" } });
    const written = readFileSync(modules.file(root), "utf8");
    for (const comment of ["# My modules", "# Keep this chat explanation", "# inline note", "# This section belongs to a plugin"])
      assert.ok(written.includes(comment), `Lost comment: ${comment}`);
    assert.deepEqual(modules.read(root), { ai: { chat: "new-model", light: "leave-this" }, custom: { untouched: "yes" } });
    assert.equal(existsSync(`${modules.file(root)}.tmp`), false);
  });

  test("Modules: clearing a field removes it, while false and zero are preserved", () => {
    const root = fixture("delete-fields", "bops.yaml", "ai:\n  chat: old\n  tasks: old\n  light: old\n  hardTasks: keep\n");
    modules.write(root, { ai: { chat: "", tasks: null, light: undefined }, computers: { enabled: false, diskGB: 0 } });
    assert.deepEqual(modules.read(root), { ai: { hardTasks: "keep" }, computers: { enabled: false, diskGB: 0 } });
    assert.equal(existsSync(`${modules.file(root)}.tmp`), false);
  });

  test("Modules: writing a new file creates its config directory and round-trips", () => {
    const root = join(scratch, "new-module-root");
    modules.write(root, { ai: { chat: "test-model" }, remote: { requirePairing: true } });
    assert.deepEqual(modules.read(root), { ai: { chat: "test-model" }, remote: { requirePairing: true } });
    assert.equal(existsSync(`${modules.file(root)}.tmp`), false);
  });

  test("Modules: YAML overrides supplied defaults, but explicit outer environment wins", () => {
    const root = fixture("apply", "bops.yaml", "ai:\n  chat: configured\n  tasks: configured-task\ncomputers:\n  computerTool: false\nthisComputer:\n  chromeWindows: false\nremote:\n  requirePairing: true\nunknown:\n  env: ignored\n");
    const env = { BOPS_CHAT_MODEL: "default", BOPS_SESSION_MODEL: "outer-task", UNRELATED: "keep" };
    const outer = { BOPS_SESSION_MODEL: "outer-task" };
    const changes = modules.apply(root, env, outer);
    assert.deepEqual(env, { BOPS_CHAT_MODEL: "configured", BOPS_SESSION_MODEL: "outer-task", UNRELATED: "keep", BOPS_COMPUTER_TOOL: "0", BOPS_CHROME_WINDOWS: "", BOPS_REQUIRE_REMOTE: "1" });
    assert.ok(changes.includes("ai.chat"));
    assert.ok(!changes.includes("ai.tasks"));
    assert.deepEqual(outer, { BOPS_SESSION_MODEL: "outer-task" });
  });

  test("Modules: disabled optional module clears only keys not owned by outer environment", () => {
    const root = fixture("disabled", "bops.yaml", "computers:\n  enabled: false\nmemory:\n  enabled: false\nai:\n  enabled: false\n");
    const env = { ORGO_API_KEY: "test-only", HONCHO_API_KEY: "test-outer", UNRELATED: "keep" };
    modules.apply(root, env, { HONCHO_API_KEY: "test-outer" });
    assert.deepEqual(env, { HONCHO_API_KEY: "test-outer", UNRELATED: "keep" });
    const description = modules.describe(root, env);
    assert.equal(description.find((module) => module.id === "ai").enabled, true);
    assert.equal(description.find((module) => module.id === "computers").enabled, false);
    assert.equal(description.find((module) => module.id === "computers").keysSet, false);
    assert.equal(description.find((module) => module.id === "memory").keysSet, true);
  });

  console.log(`PASS: ${passed} config tests (temporary fixtures only)`);
} finally {
  // scratch was created by this process under the OS temp directory; nothing in the repo is removed.
  rmSync(scratch, { recursive: true, force: true });
}

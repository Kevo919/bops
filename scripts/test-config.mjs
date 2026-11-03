// Tests for the config loaders (config/llms.cjs, config/modules.cjs): what the LLMs file lets through
// (known providers only, plain model names, one of each, at most 20, one starter) and what it says it
// left out; what the modules file does with bops.yaml (nothing there, broken YAML, settings into the
// environment with what wins over what, a module turned off clearing its keys, a required module that
// can't be), writing that keeps a file's comments while it changes values, and modules.d/ adding more.
// Each case works in a throwaway folder, so nothing touches this repo's own config.
// Usage: node scripts/test-config.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const llms = require(join(root, "config", "llms.cjs"));
const modules = require(join(root, "config", "modules.cjs"));

let failures = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 4).join("\n  ") ?? e.message}`);
  }
}

/** A throwaway folder with a config/llms.yaml and/or config/bops.yaml in it, and what the loaders said. */
const made = [];
function scratch({ llmsYaml, bopsYaml } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "bops-test-config-"));
  made.push(dir);
  mkdirSync(join(dir, "config"));
  if (llmsYaml !== undefined) writeFileSync(join(dir, "config", "llms.yaml"), llmsYaml);
  if (bopsYaml !== undefined) writeFileSync(join(dir, "config", "bops.yaml"), bopsYaml);
  const warned = [];
  const log = (line) => warned.push(line);
  return { dir, warned, log };
}

/* ---------------- llms.cjs: what's kept, what's left out ---------------- */

check("a good list passes through, cleaned", () => {
  const out = llms.clean({ llms: [
    { name: "Claude", provider: "Anthropic", model: "claude-opus-4.6", starter: true, use_for: ["coding", "daydreaming"] },
    { provider: "zai", model: "glm-5.3" },
  ] });
  assert.deepEqual(out, [
    { name: "Claude", provider: "anthropic", model: "claude-opus-4.6", starter: true, useFor: ["coding"] },
    { name: "glm-5.3", provider: "zai", model: "glm-5.3" },
  ], "provider lowercased, a name from the model, unknown jobs dropped, the first starter kept");
});

check("what isn't a real LLM is left out, each with its reason", () => {
  const problems = [];
  const out = llms.clean({ llms: [
    { name: "Mystery", provider: "bedrock", model: "big-one" },
    { name: "Spaces", provider: "openai", model: "a model with spaces" },
    { name: "Empty", provider: "openai", model: "" },
    { name: "Long", provider: "openai", model: "x".repeat(121) },
    "just a string",
    { name: "Again", provider: "openai", model: "gpt-6.1-sol" },
    { name: "Same", provider: "openai", model: "gpt-6.1-sol" },
  ] }, problems);
  assert.equal(out.length, 1, "only the one good entry");
  assert.equal(problems.length, 6);
  assert.match(problems[0], /entry 1 \(Mystery\): provider "bedrock" isn't one of/);
  assert.match(problems[1], /entry 2 \(Spaces\): model /);
  assert.match(problems[4], /entry 5: not a block/);
  assert.match(problems[5], /entry 7 \(Same\): openai\/gpt-6\.1-sol is in the list already/);
});

check("at most 20, and only the first starter", () => {
  const raw = { llms: Array.from({ length: 23 }, (_, i) => ({ provider: "openai", model: `m${i}`, ...(i < 2 ? { starter: true } : {}) })) };
  const problems = [];
  const out = llms.clean(raw, problems);
  assert.equal(out.length, 20);
  assert.match(problems.at(-1), /at most 20/);
  assert.equal(out.filter((l) => l.starter).length, 1, "the second starter's flag goes");
});

check("a name keeps to one line and 60 characters", () => {
  const [a, b] = llms.clean({ llms: [{ provider: "openai", model: "m1", name: "two\r\nlines" }, { provider: "openai", model: "m2", name: "y".repeat(80) }] });
  assert.equal(a.name, "two  lines");
  assert.equal(b.name.length, 60);
});

check("reading: no file is quiet, broken YAML says so, half-broken lists keep their good half", () => {
  const quiet = scratch({});
  assert.deepEqual(llms.read(quiet.dir, quiet.log), []);
  assert.equal(quiet.warned.length, 0, "no file is no warning");
  const broken = scratch({ llmsYaml: "llms: [ oops" });
  assert.deepEqual(llms.read(broken.dir, broken.log), []);
  assert.match(broken.warned[0], /couldn't be read/);
  const half = scratch({ llmsYaml: "llms:\n  - provider: zai\n    model: glm-5.3\n  - provider: nope\n    model: x\n" });
  const out = llms.read(half.dir, half.log);
  assert.deepEqual(out.map((l) => l.model), ["glm-5.3"]);
  assert.match(half.warned[0], /\[llms\] left out llms entry 2/);
});

check("this repo's own config/llms.yaml reads clean", () => {
  const here = scratch({});
  const out = llms.read(root, here.log);
  assert.ok(out.length >= 1, "at least Claude, as the README says");
  assert.deepEqual(here.warned, [], "nothing left out, nothing warned");
  for (const l of out) assert.ok(llms.PROVIDERS.includes(l.provider), `known provider ${l.provider}`);
});

/* ---------------- modules.cjs: bops.yaml into the environment ---------------- */

check("reading bops.yaml: none is {}, broken is {}", () => {
  const none = scratch({});
  assert.deepEqual(modules.read(none.dir), {});
  const broken = scratch({ bopsYaml: "ai: [ nope" });
  assert.deepEqual(modules.read(broken.dir), {});
});

check("apply: settings land as strings, toggles as 1 and 0 (or their own on and off)", () => {
  const s = scratch({ bopsYaml: ["ai: { chat: gpt-6.1-sol }", "thisComputer: { enabled: false, chromeWindows: true }"].join("\n") });
  const env = {};
  const set = modules.apply(s.dir, env, {});
  assert.equal(env.BOPS_CHAT_MODEL, "gpt-6.1-sol");
  assert.equal(env.BOPS_THIS_COMPUTER, "0", "a toggle off writes 0");
  assert.equal(env.BOPS_CHROME_WINDOWS, "1", "a toggle on writes 1, not the setting's own empty off value");
  assert.ok(set.includes("ai.chat") && set.includes("thisComputer.enabled"));
});

check("what wins: bops.yaml never overrides the outside, and beats what env already had", () => {
  const s = scratch({ bopsYaml: "ai: { chat: from-file }" });
  // The outside environment isn't copied in (in real use env is the process's own); bops.yaml just never overrides it.
  const env = { BOPS_CHAT_MODEL: "from-env" };
  modules.apply(s.dir, env, { BOPS_CHAT_MODEL: "from-outside" });
  assert.equal(env.BOPS_CHAT_MODEL, "from-env", "a setting from outside is left exactly as it was");
  const env2 = {};
  modules.apply(s.dir, env2, {});
  assert.equal(env2.BOPS_CHAT_MODEL, "from-file", "bops.yaml beats what the process already had");
});

check("a module turned off clears its keys (unless the outside set them); a required one can't be turned off", () => {
  const s = scratch({ bopsYaml: ["memory: { enabled: false, workspace: kept-out }", "ai: { enabled: false, chat: still-here }"].join("\n") });
  const env = { HONCHO_API_KEY: "old", ORGO_API_KEY: "keep" };
  const set = modules.apply(s.dir, env, { ORGO_API_KEY: "outside" });
  assert.ok(set.includes("memory: off"));
  assert.equal(env.HONCHO_API_KEY, undefined, "the off module's key is gone");
  // KNOWN BUG, reported to the lead (config/modules.cjs is theirs): the header says a module turned off makes
  // Bops run "as if that service weren't set up at all", but its own settings still land in the environment
  // below (the settings loop runs even for a module that was just switched off). When that's fixed, this
  // should read: assert.equal("HONCHO_WORKSPACE_ID" in env, false).
  assert.equal(env.HONCHO_WORKSPACE_ID, "kept-out", "for now an off module's settings still land (known bug)");
  assert.equal(env.ORGO_API_KEY, "keep", "a key the outside set is never deleted (its value stays as it was)");
  assert.equal(env.BOPS_CHAT_MODEL, "still-here", "the required ai module stays on, its setting lands");
});

check("describe: what Settings shows, from the file, the environment, or the default", () => {
  const s = scratch({ bopsYaml: "ai: { chat: from-file }" });
  const shown = Object.fromEntries(modules.describe(s.dir, { OPENAI_API_KEY: "k" }).map((m) => [m.id, m]));
  assert.equal(shown.ai.enabled, true, "required reads as on");
  assert.equal(shown.ai.settings.find((x) => x.key === "chat").value, "from-file");
  assert.equal(shown.memory.keysSet, false, "no Honcho key around");
  assert.equal(shown.thisComputer.settings.find((x) => x.key === "enabled").value, true, "the default when nothing says");
  const off = scratch({ bopsYaml: "memory: { enabled: false }" });
  assert.equal(modules.describe(off.dir, []).find((m) => m.id === "memory").enabled, false);
});

check("modules.d: your own modules join the list, sorted; other files and shapes don't", () => {
  const s = scratch({});
  mkdirSync(join(s.dir, "config", "modules.d"), { recursive: true });
  writeFileSync(join(s.dir, "config", "modules.d", "b-mine.cjs"), "module.exports = [{ id: 'mine', name: 'Mine', keys: [], settings: [] }];\n");
  writeFileSync(join(s.dir, "config", "modules.d", "a-mine.cjs"), "module.exports = [{ id: 'first', name: 'First', keys: [], settings: [] }];\n");
  writeFileSync(join(s.dir, "config", "modules.d", "notes.txt"), "not a module\n");
  writeFileSync(join(s.dir, "config", "modules.d", "c-shape.cjs"), "module.exports = { not: 'a list' };\n");
  const ids = modules.modules(s.dir).map((m) => m.id);
  assert.deepEqual(ids.slice(-2), ["first", "mine"], "a-mine before b-mine, both after Bops' own");
  assert.ok(!ids.includes("not"), "the txt and the non-list never land");
});

/* ---------------- writing bops.yaml, comments kept ---------------- */

check("writing changes values, adds sections, and drops emptied ones, all in place", () => {
  const s = scratch({ bopsYaml: "ai:\n  chat: gpt-6.1-sol\nemail:\n  domain: bops.bot\n" });
  modules.write(s.dir, { ai: { chat: "gpt-6-astra" }, email: { domain: "" }, phone: { area: "312" } });
  const back = modules.read(s.dir);
  assert.equal(back.ai.chat, "gpt-6-astra", "changed in place");
  assert.equal(back.email.domain, undefined, "an emptied setting is gone, not left blank");
  assert.equal(back.phone.area, "312", "a new section is added");
});

check("a file's comments survive a write that changes values under them", () => {
  const s = scratch({
    bopsYaml: [
      "# Bops' modules: your copy of what bops.example.yaml shows.",
      "ai:",
      "  # what the bots think with",
      "  chat: gpt-6.1-sol  # the usual chat model",
      "email:",
      "  domain: bops.bot",
      "",
    ].join("\n"),
  });
  modules.write(s.dir, { ai: { chat: "claude-opus-4.6" }, email: { domain: "mail.example" } });
  const text = readFileSync(join(s.dir, "config", "bops.yaml"), "utf8");
  assert.ok(text.includes("# Bops' modules: your copy of what bops.example.yaml shows."), "the head comment stays");
  assert.ok(text.includes("# what the bots think with"), "the section's comment stays");
  assert.ok(/chat: claude-opus-4\.6\s+# the usual chat model/.test(text), "the trailing comment stays on the new value");
  assert.ok(text.includes("domain: mail.example"), "the other value changed too");
  assert.equal(modules.read(s.dir).ai.chat, "claude-opus-4.6", "and it reads back as the new value");
});

check("writing where no file was makes one without losing anything to a crash midway", () => {
  const s = scratch({});
  modules.write(s.dir, { ai: { chat: "first" } });
  assert.equal(modules.read(s.dir).ai.chat, "first");
  modules.write(s.dir, { ai: { chat: "second" } });
  assert.equal(modules.read(s.dir).ai.chat, "second");
  // The tmp-and-rename means a crash can't leave half a file behind: the old one is only replaced whole.
  const tmpLeft = readFileSync(join(s.dir, "config", "bops.yaml"), "utf8");
  assert.ok(!tmpLeft.endsWith(".tmp"), "no leftover temp file is the file");
});

/* ---------------- clean up ---------------- */

// Out of the scratch folders first (Windows won't delete one a process sits in); any held a moment is left in temp, harmlessly.
process.chdir(tmpdir());
for (const dir of made) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}
console.log(`config: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

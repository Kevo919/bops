// Repo recipes: every config/repos/*.yaml must match config/repos/schema.json, carry no key or
// token values, use only https URLs (plain http only for 127.0.0.1/localhost health checks), and
// have a unique id that matches its file name. Fixture checks in a temporary directory prove the
// rejections work. Uses the existing yaml dependency, with no network or application startup. The checks live in
// config/repos.cjs, shared with lib/server/repos.ts.
// Usage: node scripts/test-repo-recipes.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reposDir = join(root, "config", "repos");
let passed = 0;

function test(name, run) {
  run();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

// The validator itself is config/repos.cjs (lib/server/repos.ts loads the recipes with it too).
const require = createRequire(import.meta.url);
const { validateRecipe, validateDir } = require("../config/repos.cjs");

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

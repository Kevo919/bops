// Tests for what the chat says when no OpenAI key is set on a self-hosted install (crawl M3): the error
// names the store the chat actually reads (this computer's environment, the .env.local next to the app on
// Windows) and says plainly that a key saved in Logins is the vault's, for bots' API calls, and doesn't
// power the chat - so the two screens stop reading as a contradiction. With a key set, the same client
// call goes through as before.
// Usage: node --conditions=react-server scripts/test-openai-key-wording.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.BOPS_SELF_HOSTED = "1";
const rootPath = fileURLToPath(new URL("..", import.meta.url));
const rootUrl = pathToFileURL(rootPath).href;
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-oai-key-"));
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier.startsWith("@/")) specifier = at(specifier.slice(2));
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
});

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 4).join("\n  ") ?? e.message}`);
  }
}

let reached = 0;
globalThis.fetch = async () => {
  reached++;
  return new Response(JSON.stringify({ id: "cmpl_1", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] }), { headers: { "content-type": "application/json" } });
};

// The client reads its key at call time, not import time (its own doc comment): import once, flip the env
// between checks.
const { openaiClient } = await import(at("lib/server/openai-client.ts"));
const client = openaiClient();

await check("no key, self-hosted: the error gives plain setup guidance and preserves the vault distinction", async () => {
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(
    () => client.chat.completions.create({ model: "gpt-test", messages: [{ role: "user", content: "hi" }] }),
    (e) => {
      const m = String(e.message);
      assert.match(m, /OpenAI is not connected for chat/);
      assert.doesNotMatch(m, /\.env\.local|OPENAI_API_KEY/);
      assert.match(m, /Settings → This (PC|Mac|computer) → Keys/);
      assert.match(m, /Logins is the vault/, "a key in Logins is said to be the vault's");
      assert.match(m, /doesn.t power the chat/, "and not to power the chat");
      return true;
    },
  );
  assert.equal(reached, 0, "nothing was sent anywhere without a key");
});

await check("a key set: the same call goes through as before", async () => {
  process.env.OPENAI_API_KEY = "sk-test-oai-key";
  const r = await client.chat.completions.create({ model: "gpt-test", messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.choices[0].message.content, "ok");
  assert.equal(reached, 1, "one call, straight through");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`openai key wording: ${passed} passed`);
process.exit(0);

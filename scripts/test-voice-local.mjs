// Tests for the chat mic's local voice (lib/server/voice-local.ts, transcribe.ts, the "voice-local"
// module): with the module on, the recording goes to the owner's own Whisper service (OpenAI-style
// /audio/transcriptions) and never to OpenAI; a local refusal with a key falls back to OpenAI, without
// one it says so plainly; with the module off nothing local is touched; and config/modules.cjs carries
// the module with its env-backed settings.
// Usage: node --conditions=react-server scripts/test-voice-local.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG|VOICE_LOCAL)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-voice-local";
const rootUrl = new URL("..", import.meta.url);
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-voice-local-"));
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
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
  load(url, context, next) {
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});
import { readFileSync } from "node:fs";

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

/** Every fetch Bops makes this run, recorded. OpenAI answers a transcription with fixed text; the local
 *  service's answer is whatever each check set last. */
const openai = [];
const local = [];
let localAnswer = () => new Response(JSON.stringify({ text: "  hello from local  " }), { headers: { "content-type": "application/json" } });
const transcription = () => ({ id: "tr_1", object: "transcription", text: "hello from OpenAI", duration: 1 });
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.origin === "https://api.openai.com") {
    openai.push({ path: url.pathname, model: undefined });
    return new Response(JSON.stringify(transcription()), { headers: { "content-type": "application/json" } });
  }
  if (url.origin === "http://127.0.0.1:8900") {
    const form = await req.formData();
    local.push({ path: url.pathname, model: form.get("model"), fileName: form.get("file")?.name, bytes: (await form.get("file")?.arrayBuffer())?.byteLength ?? 0 });
    return localAnswer();
  }
  throw new TypeError(`offline: ${url.host}`);
};

const V = await import(at("lib/server/voice-local.ts"));
const { transcribe } = await import(at("lib/server/transcribe.ts"));
const { botChatId } = await import(at("lib/types.ts"));
const S = await import(at("lib/server/store.ts"));
clearInterval(globalThis.__bopsRoutines);
S.update((s) => (s.owner = { name: "Alex", timeZone: "America/New_York" }));

const audio = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
const chatId = botChatId(S.getState().bots[0].id);

await check("with the module off, nothing local is touched and OpenAI answers as before", async () => {
  assert.equal(V.voiceLocalOn(), false);
  const text = await transcribe(audio(), chatId);
  assert.equal(text, "hello from OpenAI");
  assert.equal(local.length, 0, "no local call");
  assert.equal(openai.length, 1);
});

await check("with the module on, the recording goes to the owner's service and never to OpenAI", async () => {
  process.env.VOICE_LOCAL_BASE_URL = "http://127.0.0.1:8900/v1";
  assert.equal(V.voiceLocalOn(), true);
  const text = await transcribe(audio(), chatId);
  assert.equal(text, "hello from local", "the local text, trimmed");
  assert.equal(local.length, 1, "one local call");
  assert.equal(local[0].path, "/v1/audio/transcriptions", "OpenAI-style path on the service's own origin");
  assert.equal(local[0].model, "whisper-1", "the default model name");
  assert.match(String(local[0].fileName), /recording\.webm$/);
  assert.equal(local[0].bytes, 4, "the recording's bytes, as a multipart file");
  assert.equal(openai.length, 1, "OpenAI untouched");
});

await check("VOICE_LOCAL_STT_MODEL names the model; a trailing slash on the address is fine", async () => {
  process.env.VOICE_LOCAL_STT_MODEL = "large-v3-turbo";
  await transcribe(audio(), chatId);
  assert.equal(local[1].model, "large-v3-turbo");
  delete process.env.VOICE_LOCAL_STT_MODEL;
});

await check("a local refusal with a key falls back to OpenAI; without a key it says the service's own words", async () => {
  localAnswer = () => new Response("no model loaded", { status: 503 });
  const withKey = await transcribe(audio(), chatId);
  assert.equal(withKey, "hello from OpenAI", "fallback while the service is down");
  assert.equal(local.length, 3, "local was tried first");
  const seen = openai.length;
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(() => transcribe(audio(), chatId), /refused: 503/, "the local service's own failure, said plainly");
  assert.equal(openai.length, seen, "no OpenAI call without a key");
  process.env.OPENAI_API_KEY = "sk-test-voice-local";
});

await check("an unreachable or silent service is one error, not a crash", async () => {
  localAnswer = () => new Response(JSON.stringify({ weird: true }), { headers: { "content-type": "application/json" } });
  await assert.rejects(() => transcribe(audio(), chatId), /sent no text back/);
  process.env.VOICE_LOCAL_BASE_URL = "http://127.0.0.1:9";
  await assert.rejects(() => transcribe(audio(), chatId), /isn't reachable/);
  process.env.VOICE_LOCAL_BASE_URL = "http://127.0.0.1:8900/v1";
});

await check("config/modules.cjs carries the voice-local module with its env-backed settings", async () => {
  const require = createRequire(rootUrl.href);
  const { MODULES } = require("../config/modules.cjs");
  const m = MODULES.find((x) => x.id === "voice-local");
  assert.ok(m, "the module exists");
  assert.equal(m.name, "Voice (local)");
  assert.deepEqual(m.keys, [], "no key: the service is the owner's own");
  const envs = m.settings.map((s) => s.env);
  assert.deepEqual(envs, ["VOICE_LOCAL_BASE_URL", "VOICE_LOCAL_STT_MODEL"]);
  // Off runs as if unset: with enabled:false the module apply clears nothing of ours but leaves the
  // address absent, so voiceLocalOn() is false and OpenAI answers as before.
  process.env.VOICE_LOCAL_BASE_URL = "";
  assert.equal(V.voiceLocalOn(), false, "an empty address is off");
  process.env.VOICE_LOCAL_BASE_URL = "http://127.0.0.1:8900/v1";
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`voice local: ${passed} passed`);
process.exit(0);

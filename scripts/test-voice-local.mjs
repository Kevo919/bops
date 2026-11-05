// Tests for the chat mic's local voice (lib/server/voice-local.ts, transcribe.ts, lib/voice-address.ts, the
// "voice-local" module), against fake local HTTP services: with the module on, the recording goes to the
// owner's own Whisper service (OpenAI-style /audio/transcriptions) and nowhere else. It never follows a
// redirect; only a service that doesn't answer at all may fall back to OpenAI, and only when the owner chose
// that (VOICE_LOCAL_FALLBACK=openai), with their own key directly (not Bops Cloud), and the answer says so.
// A service that answered with an error, bad JSON or no text is that error. The module's off switch wins
// over an address in .env.local; only http(s) addresses are taken, and one off this machine is warned about.
// Usage: node --conditions=react-server scripts/test-voice-local.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

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

/** OpenAI and Bops Cloud are stand-ins on fetch (recorded); every local service is a real HTTP server on 127.0.0.1. */
const openai = [];
const cloud = [];
const realFetch = globalThis.fetch;
const transcription = (text) => new Response(JSON.stringify({ id: "tr_1", object: "transcription", text, duration: 1 }), { headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === "https://api.openai.com") {
    openai.push({ path: url.pathname, auth: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("authorization") });
    return transcription("hello from OpenAI");
  }
  if (url.origin === "https://cloud.test") {
    cloud.push({ path: url.pathname });
    return transcription("hello through Bops Cloud");
  }
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return realFetch(input, init);
  throw new TypeError(`offline: ${url.host}`);
};

/** A fake service: answers each request with `handler(req, body)`, and records what it got. */
async function service(handler) {
  const got = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      got.push({ path: req.url, bytes: body.length, body: body.toString("latin1") });
      handler(req, res, body);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  return { got, port, url: `http://127.0.0.1:${port}/v1`, close: () => new Promise((r) => server.close(r)) };
}
const json = (res, status, value) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};
/** A port nothing listens on (bound, then let go). */
async function deadPort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}/v1`;
}

const V = await import(at("lib/server/voice-local.ts"));
const A = await import(at("lib/voice-address.ts"));
const { transcribe } = await import(at("lib/server/transcribe.ts"));
const { botChatId } = await import(at("lib/types.ts"));
const S = await import(at("lib/server/store.ts"));
clearInterval(globalThis.__bopsRoutines);
S.update((s) => (s.owner = { name: "Alex", timeZone: "America/New_York" }));

const audio = () => new Blob([new Uint8Array(5000).fill(7)], { type: "audio/webm" });
const chatId = botChatId(S.getState().bots[0].id);
const good = await service((req, res) => json(res, 200, { text: "  hello from local  " }));
const reset = () => {
  process.env.VOICE_LOCAL_BASE_URL = good.url;
  delete process.env.VOICE_LOCAL_STT_MODEL;
  delete process.env.VOICE_LOCAL_FALLBACK;
  process.env.OPENAI_API_KEY = "sk-test-voice-local";
};

await check("with the module off, nothing local is touched and OpenAI answers as before", async () => {
  delete process.env.VOICE_LOCAL_BASE_URL;
  assert.equal(V.voiceLocalOn(), false);
  const r = await transcribe(audio(), chatId);
  assert.deepEqual(r, { text: "hello from OpenAI" }, "no note on the plain OpenAI path");
  assert.equal(good.got.length, 0, "no local call");
  assert.equal(openai.length, 1);
});

await check("with the module on, the recording goes to the owner's service and never to OpenAI", async () => {
  reset();
  assert.equal(V.voiceLocalOn(), true);
  const seen = openai.length;
  const r = await transcribe(audio(), chatId);
  assert.deepEqual(r, { text: "hello from local" }, "the local text, trimmed, and no note");
  assert.equal(good.got.length, 1, "one local call");
  assert.equal(good.got[0].path, "/v1/audio/transcriptions", "OpenAI-style path on the service's own origin");
  assert.match(good.got[0].body, /name="model"\r\n\r\nwhisper-1\r\n/, "the default model name");
  assert.match(good.got[0].body, /filename="recording\.webm"/);
  assert.ok(good.got[0].bytes > 5000, "the recording's bytes, as a multipart file");
  assert.equal(openai.length, seen, "OpenAI untouched");
});

await check("VOICE_LOCAL_STT_MODEL names the model; a trailing slash on the address is fine", async () => {
  reset();
  process.env.VOICE_LOCAL_STT_MODEL = "Systran/faster-whisper-small";
  process.env.VOICE_LOCAL_BASE_URL = `${good.url}/`;
  await transcribe(audio(), chatId);
  assert.equal(good.got.at(-1).path, "/v1/audio/transcriptions");
  assert.match(good.got.at(-1).body, /\r\n\r\nSystran\/faster-whisper-small\r\n/);
});

await check("a redirect is never followed: the other host gets nothing, and it's no reason for OpenAI", async () => {
  reset();
  process.env.VOICE_LOCAL_FALLBACK = "openai";
  const thief = await service((req, res) => json(res, 200, { text: "stolen" }));
  const redirecting = await service((req, res) => {
    res.writeHead(307, { location: `http://localhost:${thief.port}/steal` });
    res.end();
  });
  try {
    process.env.VOICE_LOCAL_BASE_URL = redirecting.url;
    const seen = openai.length;
    await assert.rejects(() => transcribe(audio(), chatId), /redirect/);
    assert.equal(redirecting.got.length, 1, "the service itself was asked");
    assert.equal(thief.got.length, 0, "the redirect's host got no recording");
    assert.equal(openai.length, seen, "not sent on to OpenAI either");
  } finally {
    await thief.close();
    await redirecting.close();
  }
});

await check("a service that's down is an error by default: nothing goes to OpenAI unasked", async () => {
  reset();
  assert.equal(V.voiceLocalFallback(), "error", "the default");
  process.env.VOICE_LOCAL_BASE_URL = await deadPort();
  const seen = openai.length;
  await assert.rejects(() => transcribe(audio(), chatId), (e) => /isn't reachable \(ECONNREFUSED\)/.test(e.message) && /set to show an error/.test(e.message));
  assert.equal(openai.length, seen, "no OpenAI call");
});

await check("down, with OpenAI chosen: OpenAI answers on the owner's own key, and the answer says so", async () => {
  reset();
  process.env.VOICE_LOCAL_FALLBACK = "openai";
  process.env.VOICE_LOCAL_BASE_URL = await deadPort();
  const seen = openai.length;
  const r = await transcribe(audio(), chatId);
  assert.equal(r.text, "hello from OpenAI");
  assert.equal(r.note, "Your local voice service didn't answer, so this used OpenAI.");
  assert.equal(openai.length, seen + 1);
  assert.equal(openai.at(-1).auth, "Bearer sk-test-voice-local", "the owner's own key");
});

await check("down, with OpenAI chosen and no key: the local error, no OpenAI", async () => {
  reset();
  process.env.VOICE_LOCAL_FALLBACK = "openai";
  delete process.env.OPENAI_API_KEY;
  process.env.VOICE_LOCAL_BASE_URL = await deadPort();
  const seen = openai.length;
  await assert.rejects(() => transcribe(audio(), chatId), /isn't reachable/);
  assert.equal(openai.length, seen);
});

await check("signed in to Bops Cloud: the fallback uses the owner's key directly, Bops Cloud only when it's the only way", async () => {
  reset();
  process.env.VOICE_LOCAL_FALLBACK = "openai";
  process.env.VOICE_LOCAL_BASE_URL = await deadPort();
  delete process.env.BOPS_SELF_HOSTED;
  process.env.BOPS_CLOUD_URL = "https://cloud.test/api";
  globalThis.bopsOrgoKey = "sk_orgo_test_voice_local";
  try {
    const seen = openai.length;
    const direct = await transcribe(audio(), chatId);
    assert.equal(direct.text, "hello from OpenAI");
    assert.equal(cloud.length, 0, "Bops Cloud got nothing while the owner has a key");
    assert.equal(openai.length, seen + 1);
    delete process.env.OPENAI_API_KEY;
    const viaCloud = await transcribe(audio(), chatId);
    assert.equal(viaCloud.text, "hello through Bops Cloud");
    assert.match(viaCloud.note, /used OpenAI \(through Bops Cloud\)/);
    assert.equal(cloud.length, 1);
    assert.equal(cloud[0].path, "/api/proxy/openai/v1/audio/transcriptions");
  } finally {
    globalThis.bopsOrgoKey = null;
    delete process.env.BOPS_CLOUD_URL;
    process.env.BOPS_SELF_HOSTED = "1";
  }
});

await check("a service that answered badly is its own error, never OpenAI, even with OpenAI chosen", async () => {
  reset();
  process.env.VOICE_LOCAL_FALLBACK = "openai";
  const answers = [
    [(res) => json(res, 404, { detail: "Model 'Systran/faster-whisper-large-v3' is not installed locally." }), /refused \(404\): Model 'Systran\/faster-whisper-large-v3' is not installed locally\./],
    [(res) => json(res, 500, { error: { message: "CUDA out of memory" } }), /refused \(500\): CUDA out of memory/],
    [(res) => (res.writeHead(503, { "content-type": "text/plain" }), res.end("no model loaded\n")), /refused \(503\): no model loaded$/],
    [(res) => (res.writeHead(200, { "content-type": "application/json" }), res.end("not json")), /sent no text back/],
    [(res) => json(res, 200, { weird: true }), /sent no text back/],
  ];
  const seen = openai.length;
  for (const [answer, words] of answers) {
    const svc = await service((req, res) => answer(res));
    try {
      process.env.VOICE_LOCAL_BASE_URL = svc.url;
      await assert.rejects(() => transcribe(audio(), chatId), words);
    } finally {
      await svc.close();
    }
  }
  assert.equal(openai.length, seen, "not one recording went to OpenAI");
});

await check("empty text is a silent recording: no words, and no OpenAI", async () => {
  reset();
  process.env.VOICE_LOCAL_FALLBACK = "openai";
  const svc = await service((req, res) => json(res, 200, { text: "  " }));
  try {
    process.env.VOICE_LOCAL_BASE_URL = svc.url;
    const seen = openai.length;
    assert.deepEqual(await transcribe(audio(), chatId), { text: "" });
    assert.equal(openai.length, seen);
  } finally {
    await svc.close();
  }
});

await check("an answer over 1 MB is refused, not read whole", async () => {
  reset();
  const big = "x".repeat(V.MAX_ANSWER + 10);
  const sized = await service((req, res) => json(res, 200, { text: big }));
  const chunked = await service((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"text":"');
    for (let i = 0; i < 20; i++) res.write("y".repeat(64 * 1024));
    res.end('"}');
  });
  try {
    process.env.VOICE_LOCAL_BASE_URL = sized.url;
    await assert.rejects(() => V.localTranscribe(audio()), /sent back too much/, "said by content-length");
    process.env.VOICE_LOCAL_BASE_URL = chunked.url;
    await assert.rejects(() => V.localTranscribe(audio()), /sent back too much/, "counted while reading");
  } finally {
    await sized.close();
    await chunked.close();
  }
});

await check("only http(s) addresses are used; one off this machine is warned about", async () => {
  reset();
  const seen = openai.length;
  for (const bad of ["ftp://127.0.0.1/v1", "file:///etc/passwd", "127.0.0.1:8000/v1", "http://user:pw@127.0.0.1:8000/v1"]) {
    process.env.VOICE_LOCAL_BASE_URL = bad;
    await assert.rejects(() => transcribe(audio(), chatId), /Voice \(local\) address/, bad);
  }
  assert.equal(openai.length, seen, "a bad address is no reason for OpenAI");
  for (const local of ["http://127.0.0.1:8000/v1", "http://localhost:8000/v1", "http://[::1]:8000/v1", "http://192.168.1.20:8000/v1", "http://10.0.0.5/v1", "http://172.20.1.1/v1", "https://100.101.102.103/v1", "http://[fd12::1]/v1", ""])
    assert.deepEqual(A.checkVoiceAddress(local), { ok: true, warning: null }, local);
  for (const away of ["https://whisper.example.com/v1", "http://8.8.8.8/v1", "http://172.32.0.1/v1", "http://speech.local:8000/v1"]) {
    const c = A.checkVoiceAddress(away);
    assert.ok(c.ok && /leave this machine/.test(c.warning), away);
  }
});

await check("config/modules.cjs carries the voice-local module: settings, the down setting, the address check", async () => {
  const require = createRequire(new URL("package.json", rootUrl).href);
  const { MODULES, describe } = require("./config/modules.cjs");
  const m = MODULES.find((x) => x.id === "voice-local");
  assert.ok(m, "the module exists");
  assert.equal(m.name, "Voice (local)");
  assert.deepEqual(m.keys, [], "no key: the service is the owner's own");
  assert.deepEqual(m.settings.map((s) => s.env), ["VOICE_LOCAL_BASE_URL", "VOICE_LOCAL_STT_MODEL", "VOICE_LOCAL_FALLBACK"]);
  const down = m.settings.find((s) => s.env === "VOICE_LOCAL_FALLBACK");
  assert.deepEqual(down.type, ["error", "openai"]);
  assert.equal(down.placeholder, "error");
  const shown = describe(work, {}).find((x) => x.id === "voice-local");
  assert.equal(shown.settings.find((s) => s.key === "baseURL").check, "local-address", "Settings runs the address check");
  assert.doesNotMatch(m.help, /nothing leaves this machine/, "no promise the address can't keep");
  assert.match(m.help, /--inference-path \/v1\/audio\/transcriptions/, "whisper.cpp's route, said");
  const example = readFileSync(new URL("config/bops.example.yaml", rootUrl), "utf8");
  assert.match(example, /^# voice-local:\n#   enabled: true\n#   baseURL:.*\n#   model: whisper-1.*\n#   whenDown: error/m, "bops.example.yaml lists it");
  process.env.VOICE_LOCAL_BASE_URL = "";
  assert.equal(V.voiceLocalOn(), false, "an empty address is off");
});

await check("off in config/bops.yaml is off, even with the address in .env.local", async () => {
  reset();
  mkdirSync(join(work, "config"), { recursive: true });
  writeFileSync(join(work, "config", "bops.yaml"), "voice-local:\n  enabled: false\n");
  try {
    assert.equal(V.voiceLocalOn(), false, "the switch wins over VOICE_LOCAL_BASE_URL");
    const before = good.got.length;
    const r = await transcribe(audio(), chatId);
    assert.deepEqual(r, { text: "hello from OpenAI" }, "the old OpenAI path");
    assert.equal(good.got.length, before, "the local service got nothing");
    writeFileSync(join(work, "config", "bops.yaml"), "voice-local:\n  enabled: true\n");
    assert.equal(V.voiceLocalOn(), true, "on again");
  } finally {
    rmSync(join(work, "config"), { recursive: true, force: true });
  }
});

await check("the Speaches recipe keeps the service on this machine and downloads its model first", async () => {
  const YAML = createRequire(new URL("package.json", rootUrl).href)("yaml");
  const r = YAML.parse(readFileSync(new URL("config/repos/speaches.yaml", rootUrl), "utf8"));
  const run = [r.run].flat().join(" ");
  assert.match(run, /-p 127\.0\.0\.1:8000:8000 /, "published on loopback only");
  assert.doesNotMatch(run, /-p 8000:8000/);
  assert.match(run, /PRELOAD_MODELS=\["Systran\/faster-whisper-small"\]/, "the model is preloaded");
  assert.doesNotMatch(JSON.stringify(r.requirements), /models download on first use/i, "the old, wrong claim");
  assert.match(JSON.stringify(r.requirements), /speaches-cli model download/);
  assert.match(r.health.http, /^http:\/\/127\.0\.0\.1:8000\/v1\/models\/Systran%2Ffaster-whisper-small$/, "healthy once the model is there");
  assert.equal(r.verified, false);
});

await good.close();
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

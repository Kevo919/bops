// Settings, Services (lib/server/services.ts, lib/server/env-local.ts, app/api/services, proxy.ts, components/app/services.tsx):
// keys for texting (AgentPhone), email (AgentMail), memory (Honcho), connected apps (Composio), Composio (your account)
// and Zapier, pasted in the app instead of edited into .env.local. Who may save one (the owner, in the desktop window,
// on a self-hosted PC: never a paired phone or a shared workspace), what a value may look like (nothing that ends a
// line or starts another setting), that the file is written whole and atomically, that a key is never in an answer,
// a log line or the state (only "ends in" its last four), what Check says, and that every "not set up yet" note in
// the app opens its own row here, never "edit .env.local".
// No network: the providers are a stand-in fetch; the server modules that reach outside are stubbed.
// Usage: node --conditions=react-server scripts/test-service-keys.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "bops-service-keys-"));
for (const k of Object.keys(process.env)) if (/^(BOPS|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|ZAPIER)_/.test(k)) delete process.env[k];
const envFile = join(tmp, "app", ".env.local");
Object.assign(process.env, { BOPS_SELF_HOSTED: "1", BOPS_UI_TOKEN: "window-token-for-tests", BOPS_ENV_LOCAL: envFile, HOME: join(tmp, "home") });

// Fake keys, built so no line of this file reads as a real key to a secret scanner.
const fake = (...parts) => parts.join("-");
const KEYS = {
  AGENTPHONE_API_KEY: fake("fake", "phone", "x".repeat(8), "P1a2"),
  AGENTMAIL_API_KEY: fake("fake", "mail", "x".repeat(8), "M3b4"),
  HONCHO_API_KEY: fake("fake", "memo", "x".repeat(8), "H5c6"),
  COMPOSIO_API_KEY: fake("fake", "apps", "x".repeat(8), "C7d8"),
};
const ZAPIER_URL = ["https://mcp.zapier.com/api/mcp/s", fake("fake", "zap", "z".repeat(10)), "mcp"].join("/");

const fakeState = { shared: false };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      for (const ext of [".ts", ".tsx"])
        try {
          return next(specifier + ext, context);
        } catch {}
      throw error;
    }
  },
  load(url, context, next) {
    const stub = {
      "/lib/server/cloud.ts": "export const cloudOn = () => !!globalThis.__cloud; export const cloudSession = async () => ({});",
      "/lib/server/composio.ts": "export const composioOn = () => !!process.env.COMPOSIO_API_KEY;",
      "/lib/server/mail.ts": "export const mailOn = () => !!process.env.AGENTMAIL_API_KEY;",
      "/lib/server/memory.ts": "export const memoryOn = () => !!process.env.HONCHO_API_KEY;",
      "/lib/server/phone.ts": "export const phoneOn = () => !!process.env.AGENTPHONE_API_KEY;",
      "/lib/server/zapier.ts": "export const zapierOn = () => !!process.env.ZAPIER_MCP_URL; export const checkZapier = async () => ({ status: 'works', message: 'ok' });",
      "/lib/server/store.ts": "export const getState = () => globalThis.__state;",
      "/lib/server/owner-email.ts": 'export const fromThisMac = (r) => ["localhost", "127.0.0.1"].includes(new URL(r.url).hostname);',
      "/lib/server/ui-token.ts": 'export const fromBopsWindow = (r) => (r.headers.get("x-bops-window") ?? "") === process.env.BOPS_UI_TOKEN;',
      "/lib/server/ready.ts": "export const notReady = () => null;",
    };
    for (const [end, source] of Object.entries(stub)) if (url.endsWith(end)) return { format: "module", source, shortCircuit: true };
    return next(url, context);
  },
});
globalThis.__state = fakeState;

// Every log line, to look for keys in.
const logs = [];
for (const k of ["log", "warn", "error", "info", "debug"]) {
  const real = console[k].bind(console);
  console[k] = (...a) => {
    logs.push(a.map(String).join(" "));
    if (k === "log") real(...a);
  };
}

const services = await import("../lib/server/services.ts");
const envLocal = await import("../lib/server/env-local.ts");
const route = await import("../app/api/services/route.ts");
const at = (p) => readFileSync(join(root, p), "utf8");

let passed = 0;
let failed = 0;
const answers = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL - ${name}\n     ${String(e.stack ?? e).split("\n").slice(0, 6).join("\n     ")}`);
  }
}

const req = ({ method = "GET", body, window = process.env.BOPS_UI_TOKEN, host = "localhost", headers = {} } = {}) =>
  new Request(`http://${host}:3210/api/services`, { method, headers: { "content-type": "application/json", ...(window ? { "x-bops-window": window } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function call(fn, init) {
  const r = await fn(req(init));
  const text = await r.text();
  answers.push(text);
  return { status: r.status, text, json: JSON.parse(text) };
}
const save = (service, name, value, init = {}) => call(route.POST, { method: "POST", body: { service, name, value }, ...init });

mkdirSync(join(tmp, "app"), { recursive: true });
writeFileSync(envFile, "# Bops settings\nBOPS_SELF_HOSTED=1\nOPENAI_API_KEY=keep-this-line\n");

await test("owner gate: the owner's desktop window gets the boxes; saving works for them", async () => {
  const v = await call(route.GET);
  assert.equal(v.status, 200);
  assert.equal(v.json.editable, true);
  assert.deepEqual(v.json.services.map((s) => s.id), ["phone", "mail", "memory", "apps", "composio-account", "zapier"]);
  assert.ok(v.json.services.find((s) => s.id === "mail").fields, "the owner sees the boxes");
  const r = await save("mail", "AGENTMAIL_API_KEY", KEYS.AGENTMAIL_API_KEY);
  assert.equal(r.status, 200, r.text);
});

await test("refused: a paired phone, a shared workspace, another window, another host, not self-hosted", async () => {
  const before = readFileSync(envFile, "utf8");
  const tries = [
    { headers: { "x-bops-remote": "1" } },
    { headers: { cookie: "bops_remote=abc" } },
    { window: "not-the-token" },
    { window: "" },
    { host: "192.168.1.20" },
  ];
  for (const t of tries) assert.equal((await save("memory", "HONCHO_API_KEY", KEYS.HONCHO_API_KEY, t)).status, 403, JSON.stringify(t));
  fakeState.shared = true;
  assert.equal((await save("memory", "HONCHO_API_KEY", KEYS.HONCHO_API_KEY)).status, 403, "a shared workspace");
  assert.equal((await call(route.POST, { method: "POST", body: { check: "mail" } })).status, 403, "nor a Check");
  fakeState.shared = false;
  delete process.env.BOPS_SELF_HOSTED;
  assert.equal((await save("memory", "HONCHO_API_KEY", KEYS.HONCHO_API_KEY)).status, 403, "not self-hosted");
  process.env.BOPS_SELF_HOSTED = "1";
  const token = process.env.BOPS_UI_TOKEN;
  delete process.env.BOPS_UI_TOKEN;
  assert.equal((await save("memory", "HONCHO_API_KEY", KEYS.HONCHO_API_KEY, { window: "" })).status, 403, "no desktop window token at all");
  process.env.BOPS_UI_TOKEN = token;
  assert.equal(readFileSync(envFile, "utf8"), before, "nothing was written");
});

await test("a phone and a shared workspace see status only: no boxes, no masked key", async () => {
  for (const init of [{ headers: { "x-bops-remote": "1" } }, { window: "" }]) {
    const v = await call(route.GET, init);
    assert.equal(v.status, 200);
    assert.equal(v.json.editable, false);
    for (const s of v.json.services) assert.equal(s.fields, undefined, `${s.id}: no boxes`);
    assert.equal(v.json.services.find((s) => s.id === "mail").status, "restart", "but how it stands");
    assert.ok(!v.text.includes("ends in"), "not even the last four");
  }
  fakeState.shared = true;
  const v = await call(route.GET);
  assert.equal(v.json.editable, false);
  assert.ok(v.json.services.every((s) => !s.fields));
  fakeState.shared = false;
});

await test("newline and = injection refused, with the file untouched", async () => {
  const before = readFileSync(envFile, "utf8");
  const bad = [
    ["memory", "HONCHO_API_KEY", `${KEYS.HONCHO_API_KEY}\nBOPS_SELF_HOSTED=0`],
    ["memory", "HONCHO_API_KEY", `${KEYS.HONCHO_API_KEY}\r\nBOPS_UI_TOKEN=x`],
    ["memory", "HONCHO_API_KEY", `a=${KEYS.HONCHO_API_KEY}`],
    ["memory", "HONCHO_API_KEY", `${KEYS.HONCHO_API_KEY} #comment`],
    ["memory", "HONCHO_API_KEY", `"${KEYS.HONCHO_API_KEY}"`],
    ["phone", "BOPS_AGENTPHONE_HOOK_URL", "https://example.com/hooks\nBOPS_SELF_HOSTED=0"],
    ["phone", "BOPS_AGENTPHONE_HOOK_URL", "http://example.com/hooks/agentphone"],
    ["phone", "BOPS_AGENTPHONE_HOOK_URL", "https://example.com/hooks?x=1"],
    ["zapier", "ZAPIER_MCP_URL", "https://evil.example.com/api/mcp/s/x/mcp"],
    ["zapier", "ZAPIER_MCP_URL", "https://user:pw@mcp.zapier.com/api/mcp/s/x/mcp"],
    ["memory", "BOPS_SELF_HOSTED", "0"],
    ["memory", "OPENAI_API_KEY", KEYS.HONCHO_API_KEY],
    ["nope", "HONCHO_API_KEY", KEYS.HONCHO_API_KEY],
    ["memory", "HONCHO_API_KEY", ""],
    ["memory", "HONCHO_API_KEY", 12345],
  ];
  for (const [service, name, value] of bad) {
    const r = await save(service, name, value);
    assert.equal(r.status, 400, `${service} ${name} ${JSON.stringify(value)}: ${r.text}`);
    assert.ok(r.json.error && !/\/|\\/.test(r.json.error.replace(/https:\/\/[^\s)]*/g, "")), `plain words, no path: ${r.json.error}`);
  }
  assert.equal(readFileSync(envFile, "utf8"), before);
  // And the writer itself, whoever calls it.
  assert.throws(() => envLocal.setEnvLocal(envFile, "HONCHO_API_KEY", "abc\nX=1", () => true), /doesn't look like a key/);
  assert.throws(() => envLocal.setEnvLocal(envFile, "bad name", KEYS.HONCHO_API_KEY), /isn't a setting/);
  assert.throws(() => envLocal.setEnvLocal(envFile, "HONCHO_API_KEY=X", KEYS.HONCHO_API_KEY), /isn't a setting/);
});

await test("Composio (your account): https on connect.composio.dev only, a Platform ak_ key refused; behind in-progress until #83", async () => {
  assert.ok(services.looksLikeComposioMcpUrl("https://connect.composio.dev/mcp"));
  for (const bad of ["http://connect.composio.dev/mcp", "https://evil.example/mcp", "https://connect.composio.dev:8443/mcp", "https://a:b@connect.composio.dev/mcp", "https://connect.composio.dev.evil.example/mcp"])
    assert.ok(!services.looksLikeComposioMcpUrl(bad), bad);
  assert.match(services.composioMcpKeyProblem(["ak", "x".repeat(12)].join("_")), /Platform project key/);
  assert.equal(services.composioMcpKeyProblem(["ck", "x".repeat(12)].join("_")), null);
  const v = await call(route.GET);
  const row = v.json.services.find((s) => s.id === "composio-account");
  if (!services.COMPOSIO_ACCOUNT_IN_THIS_BUILD) {
    assert.ok(row.pending && row.pending.percent > 0 && row.pending.percent < 100, "in progress, with a percent");
    assert.equal(row.fields, undefined, "no boxes while it's in progress");
    assert.equal((await save("composio-account", "COMPOSIO_MCP_URL", "https://connect.composio.dev/mcp")).status, 400, "and nothing saved for it");
  }
});

await test("masked display: a key shows as 'ends in' its last four, an address with a token by its host only", async () => {
  const v = await call(route.GET);
  const mail = v.json.services.find((s) => s.id === "mail");
  assert.equal(mail.fields[0].shown, `ends in ${KEYS.AGENTMAIL_API_KEY.slice(-4)}`);
  assert.equal(mail.fields[0].set, true);
  assert.equal(envLocal.maskKey(KEYS.HONCHO_API_KEY), "ends in H5c6");
  assert.equal((await save("zapier", "ZAPIER_MCP_URL", ZAPIER_URL)).status, 200);
  const z = (await call(route.GET)).json.services.find((s) => s.id === "zapier");
  assert.equal(z.fields[0].shown, "mcp.zapier.com/•••");
  // The public address texts arrive at isn't a secret: it shows as it is.
  assert.equal((await save("phone", "BOPS_AGENTPHONE_HOOK_URL", "https://hooks.example.com/hooks/agentphone")).status, 200);
  const phone = (await call(route.GET)).json.services.find((s) => s.id === "phone");
  assert.equal(phone.fields[1].shown, "https://hooks.example.com/hooks/agentphone");
  assert.match(phone.words, /add the agentphone key too/, "texting needs both");
});

await test("the atomic write: other lines kept, the setting replaced not doubled, owner-only, no .tmp left, even on failure", async () => {
  for (const [service, name] of [["phone", "AGENTPHONE_API_KEY"], ["memory", "HONCHO_API_KEY"], ["apps", "COMPOSIO_API_KEY"]]) assert.equal((await save(service, name, KEYS[name])).status, 200);
  const newer = fake("fake", "mail", "y".repeat(8), "N9e0");
  assert.equal((await save("mail", "AGENTMAIL_API_KEY", newer)).status, 200);
  const text = readFileSync(envFile, "utf8");
  assert.ok(text.startsWith("# Bops settings\nBOPS_SELF_HOSTED=1\nOPENAI_API_KEY=keep-this-line\n"), "every other line as it was");
  assert.equal(text.match(/^AGENTMAIL_API_KEY=/gm).length, 1, "one line per setting");
  assert.ok(text.includes(`AGENTMAIL_API_KEY=${newer}\n`));
  assert.equal(envLocal.readEnvLocalValue(envFile, "AGENTMAIL_API_KEY"), newer);
  if (process.platform !== "win32") assert.equal(statSync(envFile).mode & 0o777, 0o600, "owner only");
  assert.ok(!readdirSync(join(tmp, "app")).some((f) => f.endsWith(".tmp")), "no .tmp file left");
  // A move that fails (the target is a folder): plain words, no path, no copy of the key left behind.
  const blocked = join(tmp, "blocked", ".env.local");
  mkdirSync(join(blocked, "x"), { recursive: true });
  assert.throws(() => envLocal.setEnvLocal(blocked, "HONCHO_API_KEY", KEYS.HONCHO_API_KEY), (e) => /couldn't save the key/.test(e.message) && !e.message.includes(tmp));
  assert.ok(!readdirSync(join(tmp, "blocked")).some((f) => f.endsWith(".tmp")), "no .tmp file after a failed move");
  // Saved but not what Bops started with: "Restart Bops to use it".
  const memory = (await call(route.GET)).json.services.find((s) => s.id === "memory");
  assert.equal(memory.status, "restart");
  assert.match(memory.words, /Restart Bops to use it/);
});

await test("Check: the saved key at the provider's fixed address; a turned-down key says 'Key saved but not working'", async () => {
  const seen = [];
  const answer = (status) => async (url, init) => (seen.push({ url, init }), new Response(JSON.stringify({ error: `upstream says ${init.headers.Authorization ?? init.headers["x-api-key"]}` }), { status }));
  let r = await services.checkService("memory", answer(200));
  assert.deepEqual([r.ok, r.status], [true, "works"]);
  assert.equal(seen[0].url, "https://api.honcho.dev/v3/workspaces/list?size=1");
  assert.equal(seen[0].init.redirect, "error", "a redirect can't carry the key elsewhere");
  assert.equal(seen[0].init.headers.Authorization, `Bearer ${KEYS.HONCHO_API_KEY}`, "the key goes to the provider, and only there");
  r = await services.checkService("apps", answer(401));
  assert.equal(r.status, "invalid");
  assert.equal(seen[1].url, "https://backend.composio.dev/api/v3.1/auth_configs?limit=1");
  assert.ok(!r.words.includes("upstream"), "never the provider's own words");
  const apps = (await call(route.GET)).json.services.find((s) => s.id === "apps");
  assert.equal(apps.status, "broken");
  assert.match(apps.words, /^Key saved but not working/);
  r = await services.checkService("mail", async () => Promise.reject(new Error(`boom ${KEYS.AGENTMAIL_API_KEY}`)));
  assert.equal(r.status, "unavailable");
  assert.notEqual((await call(route.GET)).json.services.find((s) => s.id === "mail").status, "broken", "unreachable isn't 'not working'");
  // A new key clears the last Check's verdict.
  assert.equal((await save("apps", "COMPOSIO_API_KEY", KEYS.COMPOSIO_API_KEY)).status, 200);
  assert.notEqual((await call(route.GET)).json.services.find((s) => s.id === "apps").status, "broken");
  // Zapier's own check reads what Bops started with: a value saved since says to restart first.
  r = await services.checkService("zapier");
  assert.match(r.words, /Restart Bops first/);
  assert.equal(await services.checkService("composio-account"), null, "no Check while it's in progress");
});

await test("signed in with Orgo: status from Bops Cloud, no boxes, no self-hosted-only rows", async () => {
  globalThis.__cloud = true;
  const v = await call(route.GET);
  globalThis.__cloud = false;
  assert.equal(v.json.mode, "cloud");
  assert.equal(v.json.editable, false);
  assert.deepEqual(v.json.services.map((s) => s.id), ["phone", "mail", "memory", "apps"]);
  assert.ok(v.json.services.every((s) => !s.fields && !/\.env\.local/.test(s.words)));
});

await test("keys never in any answer, log line or the state", async () => {
  const secrets = [...Object.values(KEYS), fake("fake", "mail", "y".repeat(8), "N9e0"), ZAPIER_URL];
  const everything = [...answers, ...logs, JSON.stringify(fakeState)].join("\n");
  for (const k of secrets) assert.ok(!everything.includes(k), `a key leaked (one ending ${k.slice(-4)})`);
  assert.ok(answers.length > 20, "every answer above was looked at");
});

await test("the proxy keeps saving to this desktop's window: POST without it is refused before the route", async () => {
  const src = at("proxy.ts");
  assert.match(src, /path === "\/api\/services" && method !== "GET" && \(!token \|\| !LOOPBACK\.has\(hostname\(host\)\) \|\| request\.headers\.has\("x-bops-remote"\) \|\| request\.cookies\.has\("bops_remote"\) \|\| !fromWindow\(request, token\)\)/);
});

await test("each 'not set up yet' note links to its own row in Services, never to .env.local", async () => {
  const app = at("components/app/bops-app.tsx");
  const reach = app.slice(app.indexOf("function SetUpHere"), app.indexOf("function ReachSettings"));
  for (const id of ["phone", "mail"]) assert.ok(reach.includes(`data-open-service="${id}"`) && reach.includes(`open("${id}")`), `How bots reach you / Email and phone: ${id}`);
  assert.match(reach, /openSettings\("services", \{ service \}\)/);
  assert.ok(app.includes('<SetUpHere service="mail"') && app.includes('<SetUpHere service="phone"'), "This PC's Email and Phone cards");
  assert.doesNotMatch(reach, /\.env\.local/, "(a) no note says edit .env.local");
  assert.doesNotMatch(app, /Off\. Add AGENT(PHONE|MAIL)_API_KEY/);
  assert.doesNotMatch(app, /See what&apos;s set up in/, "(c) the button goes to the right row now");
  const apps = at("components/app/apps.tsx");
  const off = apps.slice(apps.indexOf("function AppsOff"), apps.indexOf("/** An app's real logo"));
  assert.match(off, /openSettings\("services", \{ service: "apps" \}\)/);
  assert.doesNotMatch(off, /\.env\.local/);
  const mem = at("components/app/bot-memory.tsx");
  assert.match(mem, /openSettings\("services", \{ service: "memory" \}\)/);
  assert.doesNotMatch(mem.slice(mem.indexOf("data-memory-off"), mem.indexOf("data-memory-off") + 1500), /\.env\.local/);
  const card = at("components/app/connections-card.tsx");
  assert.match(card, /COMPOSIO_API_KEY: "apps", COMPOSIO_MCP_URL: "composio-account", ZAPIER_MCP_URL: "zapier"/, "the Connections card's rows");
  // The rows are there to land on: services.tsx gives each its id, and Settings passes the asked-for row as focus.
  const pane = at("components/app/services.tsx");
  assert.match(pane, /export const serviceAnchor = \(id: ServiceRow\) => `service-\$\{id\}`/);
  assert.match(pane, /id=\{serviceAnchor\(s\.id\)\}/);
  assert.match(app, /<ServicesSettings focus=\{service && atAt \? \{ id: service, at: atAt \} : undefined\} \/>/);
  // (b) the memory route reads the cloud session before deciding memory is off.
  const memRoute = at("app/api/memory/route.ts");
  assert.ok(memRoute.indexOf("await cloudSession()") > 0 && memRoute.indexOf("await cloudSession()") < memRoute.indexOf("if (!memoryOn()) return Response.json({ off: true"));
});

rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failed ? 1 : 0);

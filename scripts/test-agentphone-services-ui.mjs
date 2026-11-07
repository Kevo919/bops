// Settings, Services, AgentPhone (components/app/services.tsx AgentPhonePanel, lib/server/services.ts,
// lib/server/agentphone-status.ts), in the real built app, light and dark, at 1280 px and 412 px: with AGENTPHONE_API_KEY
// set (local mode, no Bops Cloud), the panel shows the key by its last four only, the number and agent a read-only
// probe found (GET /v1/numbers and /v1/agents, nothing placed or sent), calls "key works; funds not checked" (AgentPhone
// has no balance to read; never "Ready to call"), and texting's 10DLC registration needed in Bops' own words; after a
// real call's 402 (kept in .data/agentphone-calls.json) it says calls need funds. Settings, Email and phone and Boppy's
// profile show the same number as Services, as "your AgentPhone number" (lib/bot-number.ts), never "No number yet".
// It's marked Being tested at 80%; the page isn't blank, never scrolls sideways, and nothing throws. AgentPhone is a stub on 127.0.0.1; a made-up Orgo too; nothing leaves this computer.
// The same harness as scripts/test-agent-instances-ui.mjs (`npx next build` first).
// Usage: node scripts/test-agentphone-services-ui.mjs   (SHOTS=<dir> saves the screenshots there)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
if (!existsSync(join(root, ".next", "BUILD_ID"))) {
  console.error("No production build: run `npx next build` first.");
  process.exit(1);
}
const { chromium } = await import("playwright");

// The AgentPhone stub: one agent with one number whose texting needs 10DLC registration. A made-up key.
const KEY = ["fake", "agentphone", "q".repeat(10), "Wx81"].join("-");
const apSeen = [];
const agentphone = createServer((req, res) => {
  apSeen.push(`${req.method} ${req.url}`);
  const j = (s, x) => (res.writeHead(s, { "content-type": "application/json" }), res.end(JSON.stringify(x)));
  if (req.headers.authorization !== `Bearer ${KEY}`) return j(401, { detail: "Invalid API key" });
  const p = (req.url ?? "").split("?")[0];
  if (req.method === "GET" && p === "/v1/numbers") return j(200, { data: [{ id: "num_1", phoneNumber: "+15550102000", agentId: "agt_1", outboundSms: "registration_required" }], hasMore: false, total: 1 });
  if (req.method === "GET" && p === "/v1/agents") return j(200, { data: [{ id: "agt_1", name: "Front desk" }], hasMore: false, total: 1 });
  j(404, { detail: "not here" });
});
await new Promise((ok) => agentphone.listen(0, "127.0.0.1", ok));
const apBase = `http://127.0.0.1:${agentphone.address().port}`;

let failed = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}\n     ${String(e.message ?? e).split("\n").slice(0, 4).join("\n     ")}`);
  }
}

// ---- a made-up Orgo: who the made-up key is, and empty answers for the rest ------------------------------------------
const orgo = createServer((req, res) => {
  const j = (x, s = 200) => (res.writeHead(s, { "content-type": "application/json" }), res.end(JSON.stringify(x)));
  req.resume();
  req.on("end", () => {
    const p = (req.url ?? "").split("?")[0];
    if (p === "/api/user/profile") return j({ id: "u_mobile", email: "ava@example.test", full_name: "Ava Reed" });
    if (p === "/api/cli/auth/start") return j({ device_code: "dev_fake", user_code: "ABCD-EFGH", verification_uri: "http://127.0.0.1/cli/approve", interval_seconds: 1, expires_in_seconds: 600 });
    if (p === "/api/cli/auth/poll") return j({ status: "approved", api_key: "sk_orgo_fake_mobile", user: { id: "u_mobile", email: "ava@example.test" } });
    if (p === "/api/secrets" && req.method === "GET") return j({ secrets: [] });
    if (p === "/api/workspaces") return j([]);
    if (/computers|projects/.test(p) && req.method === "GET") return j({ computers: [], projects: [] });
    return j({ error: "made-up orgo: not here" }, 404);
  });
});
await new Promise((ok) => orgo.listen(0, "127.0.0.1", ok));
const orgoPort = orgo.address().port;

// ---- the scratch folder: the repo's files linked in, its own .data with made-up bots and chats -----------------------
const dir = mkdtempSync(join(tmpdir(), "bops-wip-"));
for (const name of readdirSync(root)) if (name !== ".data" && !name.startsWith(".env") && name !== ".git") symlinkSync(join(root, name), join(dir, name));
mkdirSync(join(dir, "home"));
const now = Date.now();
const H = 3600e3;
const user = "u_mobile";
mkdirSync(join(dir, ".data", "users", user), { recursive: true });
writeFileSync(
  join(dir, ".data", "users", user, "state.json"),
  JSON.stringify({
    host: "orgo",
    account: { user: { id: user, email: "ava@example.test", name: "Ava Reed" } },
    owner: { name: "Ava Reed", timeZone: "America/Chicago" },
    workspaces: [{ id: "ws_main", name: "Main", createdAt: now - 30 * 24 * H }],
    workspace: "ws_main",
    bots: [
      { id: "boppy", name: "Boppy", role: "Chief of staff", color: "#E9FF3B", isMain: true, computerStatus: "none", workspaceId: "ws_main" },
      { id: "rook", name: "Rook", role: "Recruiting", color: "#47C46B", isMain: false, computer: "shared", computerStatus: "none", workspaceId: "ws_main" },
      { id: "pip", name: "Pip", role: "Research", color: "#5B8CFF", isMain: false, computer: "shared", computerStatus: "none", workspaceId: "ws_main" },
    ],
    chats: [
      { id: "bot:boppy", kind: "bot", botIds: ["boppy"], createdAt: now - 5 * H, typing: [], workspaceId: "ws_main" },
      { id: "bot:rook", kind: "bot", botIds: ["rook"], createdAt: now - 4 * H, typing: [], workspaceId: "ws_main" },
      { id: "bot:pip", kind: "bot", botIds: ["pip"], createdAt: now - 3 * H, typing: [], workspaceId: "ws_main" },
      { id: "c_team", kind: "group", title: "Launch crew", botIds: ["boppy", "rook", "pip"], createdAt: now - 2 * H, typing: [], workspaceId: "ws_main" },
    ],
    messages: [
      { id: "m1", chatId: "bot:boppy", role: "user", text: "Morning! What's on my plate today?", at: now - 5 * H },
      { id: "m2", chatId: "bot:boppy", role: "bot", botId: "boppy", text: "Three things:\n\n1. **Reply to Dana** about the Q4 plan\n2. Review the hiring pipeline\n3. Pay the invoice", at: now - 5 * H + 60e3 },
      { id: "m3", chatId: "bot:rook", role: "bot", botId: "rook", text: "A long word to wrap: " + "supercalifragilisticexpialidocious".repeat(6), at: now - 4 * H },
      { id: "m4", chatId: "c_team", role: "user", text: "Team, let's plan the launch.", at: now - 2 * H },
    ],
    sessions: [],
    routines: [{ id: "r_daily", botId: "boppy", title: "Morning brief", goal: "Send me a summary of my day", schedule: { kind: "weekdays", time: "08:00" }, enabled: true, createdAt: now - 20 * 24 * H, run: "chat" }],
  }),
);
// A paired phone (lib/server/remote.ts): its code's hash.
const phoneCode = randomBytes(24).toString("hex");
writeFileSync(join(dir, ".data", "remote.json"), JSON.stringify({ hash: createHash("sha256").update(phoneCode).digest("hex"), created: now }));
// No socket off loopback for the server (the made-up Orgo is on 127.0.0.1).
const guard = join(dir, "home", "netguard.cjs");
writeFileSync(
  guard,
  `const net = require("node:net");
const ok = (h) => !h || h === "localhost" || h === "::1" || /^127\\./.test(h) || h === "0.0.0.0";
const orig = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  let o = Array.isArray(a[0]) ? a[0][0] : a[0];
  const host = o && typeof o === "object" ? (o.path ? null : o.host) : typeof a[1] === "string" ? a[1] : "localhost";
  if (!ok(host)) { const s = this; process.nextTick(() => s.destroy(Object.assign(new Error("blocked " + host), { code: "ECONNREFUSED" }))); return s; }
  return orig.apply(this, a);
};`,
);

// ---- the server --------------------------------------------------------------------------------------------------
const token = randomBytes(16).toString("hex");
const port = await new Promise((ok) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => ok(p));
  });
});
const BASE = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: dir,
  env: {
    PATH: process.env.PATH,
    HOME: join(dir, "home"),
    USERPROFILE: join(dir, "home"),
    TMPDIR: tmpdir(),
    NODE_OPTIONS: `--require ${guard}`,
    BOPS_SELF_HOSTED: "1",
    BOPS_UI_TOKEN: token,
    ORGO_API_KEY: "sk_orgo_fake_mobile",
    BOPS_ORGO_ORIGIN: `http://127.0.0.1:${orgoPort}`,
    NEXT_TELEMETRY_DISABLED: "1",
    BOPS_TELEMETRY: "0",
    AGENTPHONE_API_KEY: KEY,
    BOPS_AGENTPHONE_BASE: apBase,
    BOPS_ENV_LOCAL: join(dir, "home", "env.local"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stop = async () => {
  if (server.exitCode === null) {
    const gone = new Promise((ok) => server.once("exit", ok));
    server.kill();
    await gone;
  }
  orgo.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
};
process.on("exit", () => server.exitCode === null && server.kill());

const owner = { cookie: `bops_window=${token}`, "content-type": "application/json" };
for (let i = 0; ; i++) {
  const ok = await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false);
  if (ok) break;
  if (i > 120 || server.exitCode !== null) {
    console.error(serverLog.slice(-2000));
    await stop();
    throw new Error("the server didn't start");
  }
  await new Promise((r) => setTimeout(r, 500));
}
// Signed in, as the desktop app's window does it (the made-up Orgo approves at once).
await fetch(`${BASE}/api/auth/start`, { method: "POST", headers: owner, body: "{}" });
await new Promise((r) => setTimeout(r, 1500));
await fetch(`${BASE}/api/auth/poll`, { method: "POST", headers: owner });

// ---- the browser -------------------------------------------------------------------------------------------------
async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    // A Chromium Playwright put elsewhere (another version's): PLAYWRIGHT_CHROMIUM, else any headless shell under PLAYWRIGHT_BROWSERS_PATH.
    const at = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const found =
      process.env.PLAYWRIGHT_CHROMIUM ||
      (at && existsSync(at)
        ? readdirSync(at)
            .filter((d) => d.startsWith("chromium_headless_shell-"))
            .map((d) => join(at, d, "chrome-headless-shell-linux64", "chrome-headless-shell"))
            .find((p) => existsSync(p))
        : undefined);
    if (!found) throw e;
    return chromium.launch({ headless: true, executablePath: found });
  }
}
const browser = await launch();
async function context(kind, desktopApp = false) {
  const ctx =
    kind === "phone"
      ? await browser.newContext({
          viewport: { width: 412, height: 915 },
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
          userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 BopsAndroid",
        })
      : await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addCookies([kind === "phone" ? { name: "bops_remote", value: phoneCode, url: BASE } : { name: "bops_window", value: token, url: BASE }]);
  // Nothing past this computer: what the page asks of the web is refused (app logos, fonts already inlined by Next).
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    return u.hostname === "127.0.0.1" || u.protocol === "data:" || u.protocol === "blob:" ? route.continue() : route.abort("blockedbyclient");
  });
  // The desktop app's bridge, made up (no screens, nothing else), so the This PC side of AI subscriptions shows.
  if (desktopApp) await ctx.addInitScript(() => { window.bopsMac = { screens: async () => ({ access: "denied", displays: [], sources: [] }), openScreenSettings: async () => {} }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}


const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const settle = (page) => page.waitForTimeout(450);
const shot = async (page, name) => shots && page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
async function openServices(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /team, account and settings/ }).first().click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
  await settle(page);
  if (await page.locator("[data-settings-pane-back]").isVisible().catch(() => false)) await page.locator("[data-settings-pane-back]").click();
  await page.locator('[data-settings-nav="services"]').click();
  await settle(page);
}
async function openEmailAndPhone(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /team, account and settings/ }).first().click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
  await settle(page);
  if (await page.locator("[data-settings-pane-back]").isVisible().catch(() => false)) await page.locator("[data-settings-pane-back]").click();
  await page.locator('[data-settings-nav="email"]').click();
  await settle(page);
}
async function openProfile(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.locator("aside button").filter({ hasText: /^\s*Boppy/ }).first().click();
  await settle(page);
  await page.getByRole("button", { name: "Boppy's profile", exact: true }).first().click();
  await settle(page);
}
// The last real call's outcome, as agentphone-status.ts keeps it (a hash of the key, never the key).
const keyHash = createHash("sha256").update(KEY).digest("hex").slice(0, 16);
const callsFile = join(dir, ".data", "agentphone-calls.json");
async function noSideways(page, what) {
  const m = await page.evaluate(() => ({ W: innerWidth, s: Math.max(document.scrollingElement.scrollWidth, document.body.scrollWidth) }));
  assert.ok(m.s <= m.W + 1, `${what}: the page scrolls sideways (${m.s}px in ${m.W}px)`);
}

try {
  for (const theme of ["light", "dark"]) {
    await fetch(`${BASE}/api/look`, { method: "POST", headers: owner, body: JSON.stringify({ action: "set", look: { theme } }) });
    for (const width of [1280, 412]) {
      const { ctx, page, errors } = await context("owner");
      await page.setViewportSize({ width, height: width > 500 ? 860 : 915 });
      const tag = `${theme}-${width}`;
      await check(`${tag}: the AgentPhone panel shows the key's last four, the number and agent, funds not checked, texting's 10DLC words`, async () => {
        await openServices(page);
        const card = page.locator('[data-service="phone"]');
        await card.waitFor({ state: "visible", timeout: 20000 });
        const panel = card.locator("[data-agentphone-panel]");
        await panel.waitFor({ state: "visible", timeout: 15000 });
        const text = await panel.innerText();
        assert.match(text, /Key: saved, ends in Wx81/);
        assert.match(text, /Number: \+1 \(555\) 010-2000 \(your AgentPhone number\), agent "Front desk"/);
        assert.match(text, /Calls: Key works; funds not checked\. If a call fails, add funds in AgentPhone → Billing\./);
        assert.doesNotMatch(text, /Ready to call/);
        assert.match(text, /Texts: Texting needs AgentPhone's 10DLC registration: agentphone\.ai\/register/);
        const wip = card.locator('[data-in-progress="agentphone-calls-texts"]').first();
        assert.equal(await wip.getAttribute("data-in-progress-state"), "testing");
        assert.equal((await wip.locator("[data-in-progress-label]").first().innerText()).trim(), "Being tested");
        assert.match(await wip.locator("[data-in-progress-percent]").first().innerText(), /80%/);
        assert.ok(!(await page.content()).includes(KEY), "the key is on the page");
        // Not a blank screen: the pane has its rows, with real text.
        assert.ok((await page.locator("[data-service]").count()) >= 4, "the services are listed");
        assert.ok((await page.locator("body").innerText()).length > 200, "the page has words");
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        assert.ok(theme === "light" ? !/rgb\(0, 0, 0\)/.test(bg) : !/rgb\(255, 255, 255\)/.test(bg), `${theme} body background: ${bg}`);
        await noSideways(page, tag);
        await card.scrollIntoViewIfNeeded();
        await shot(page, `agentphone-services-${tag}`);
        if (shots) await card.screenshot({ path: join(shots, `agentphone-card-${tag}.png`) });
      });
      await check(`${tag}: Settings, Email and phone shows the same number, as your AgentPhone number`, async () => {
        await openEmailAndPhone(page);
        const box = page.locator('[data-bot-number="agentphone"]').first();
        await box.waitFor({ state: "visible", timeout: 15000 });
        const text = await box.innerText();
        assert.match(text, /Boppy calls and texts from \+1 \(555\) 010-2000 \(your AgentPhone number\)/);
        assert.doesNotMatch(await page.locator("main, body").first().innerText(), /No number yet/);
        await noSideways(page, `${tag} email and phone`);
        await shot(page, `agentphone-email-phone-${tag}`);
      });
      await check(`${tag}: Boppy's profile shows the same number, as your AgentPhone number`, async () => {
        await openProfile(page);
        const box = page.locator('section[data-panel] [data-bot-number="agentphone"]').first();
        await box.waitFor({ state: "visible", timeout: 15000 });
        const text = await box.innerText();
        assert.match(text, /mobile · your AgentPhone number/);
        assert.match(text, /\+1 \(555\) 010-2000/);
        assert.doesNotMatch(text, /No number yet/);
        assert.ok(await page.getByRole("button", { name: "Call +1 (555) 010-2000" }).first().isVisible(), "Call it");
        await noSideways(page, `${tag} profile`);
        await shot(page, `agentphone-profile-${tag}`);
      });
      await check(`${tag}: nothing threw`, async () => assert.deepEqual(errors, []));
      await ctx.close();
    }
  }
  // A real call came back 402: calls need funds until one goes through, in both looks.
  writeFileSync(callsFile, JSON.stringify({ state: "needs funds", at: Date.now(), key: keyHash }));
  for (const theme of ["light", "dark"]) {
    await fetch(`${BASE}/api/look`, { method: "POST", headers: owner, body: JSON.stringify({ action: "set", look: { theme } }) });
    const { ctx, page, errors } = await context("owner");
    await page.setViewportSize({ width: 1280, height: 860 });
    await check(`${theme}: after a 402, the panel says calls need funds`, async () => {
      await openServices(page);
      const card = page.locator('[data-service="phone"]');
      const panel = card.locator("[data-agentphone-panel]");
      await panel.waitFor({ state: "visible", timeout: 15000 });
      const text = await panel.innerText();
      assert.match(text, /Calls: Calls need funds: add funds in AgentPhone → Billing\./);
      assert.doesNotMatch(text, /funds not checked|Ready to call/);
      await card.scrollIntoViewIfNeeded();
      if (shots) await card.screenshot({ path: join(shots, `agentphone-card-needs-funds-${theme}.png`) });
      assert.deepEqual(errors, []);
    });
    await ctx.close();
  }
  await check("the probe only read: no call placed, no text sent", async () => {
    assert.ok(apSeen.length > 0, "the probe ran");
    assert.ok(apSeen.every((x) => x.startsWith("GET ")), apSeen.join(", "));
  });
} finally {
  console.log(results.join("\n"));
  await browser.close();
  agentphone.close();
  await stop();
}

console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);

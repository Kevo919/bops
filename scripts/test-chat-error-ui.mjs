// The chat's error card (components/app/chat-error.tsx, Message.chatError), in the real built app: a bot whose model's
// provider said no (OpenAI out of credit, "429 You have no credits remaining" with a URL) shows a plain line in place
// of the raw words, a button that opens Settings → AI subscriptions, and a Details toggle with the provider's words (never a
// key), in light and in dark, at 1280 px and at a phone's 412 px, nothing sideways, and nothing thrown.
// The same harness as scripts/test-in-progress-ui.mjs: the production build (`npx next build` first) with `next start`
// in a scratch folder, a made-up Orgo on 127.0.0.1, a made-up bot; nothing leaves this computer.
// Usage: node scripts/test-chat-error-ui.mjs   (SHOTS=<dir> saves a screenshot of each screen there)
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
const dir = mkdtempSync(join(tmpdir(), "bops-chat-error-ui-"));
for (const name of readdirSync(root)) if (name !== ".data" && !name.startsWith(".env") && name !== ".git") symlinkSync(join(root, name), join(dir, name));
mkdirSync(join(dir, "home"));
const now = Date.now();
const H = 3600e3;
const user = "u_mobile";
mkdirSync(join(dir, ".data", "users", user), { recursive: true });
// Boppy's chat ends with a reply its model's provider turned down: OpenAI out of credit (Kevin's case), as chat.ts writes it.
const failure = {
  kind: "credit",
  title: "Out of credit",
  text: "Your OpenAI account is out of credit, so Boppy can't answer. Add credit at platform.openai.com, Billing, or pick another model in the chat box's model picker.",
  provider: "OpenAI",
  status: 429,
  details: "429 You have no credits remaining. Add credits at https://platform.openai.com/settings/organization/billing (key …)",
};
writeFileSync(
  join(dir, ".data", "users", user, "state.json"),
  JSON.stringify({
    host: "orgo",
    account: { user: { id: user, email: "ava@example.test", name: "Ava Reed" } },
    owner: { name: "Ava Reed", timeZone: "America/Chicago" },
    workspaces: [{ id: "ws_main", name: "Main", createdAt: now - 30 * 24 * H }],
    workspace: "ws_main",
    bots: [{ id: "boppy", name: "Boppy", role: "Chief of staff", color: "#E9FF3B", isMain: true, computerStatus: "none", workspaceId: "ws_main" }],
    chats: [{ id: "bot:boppy", kind: "bot", botIds: ["boppy"], createdAt: now - 5 * H, typing: [], workspaceId: "ws_main" }],
    messages: [
      { id: "m1", chatId: "bot:boppy", role: "user", text: "Morning! What's on my plate today?", at: now - 60e3 },
      { id: "m2", chatId: "bot:boppy", role: "bot", botId: "boppy", text: failure.text, chatError: failure, bops: true, at: now - 50e3 },
    ],
    sessions: [],
    routines: [],
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
const look = (theme) => fetch(`${BASE}/api/look`, { method: "POST", headers: owner, body: JSON.stringify({ action: "set", look: { theme } }) }).then((r) => assert.ok(r.ok, `the look didn't take ${theme}`));

async function noSideways(page, what) {
  const m = await page.evaluate(() => ({ W: innerWidth, s: Math.max(document.scrollingElement.scrollWidth, document.body.scrollWidth) }));
  assert.ok(m.s <= m.W + 1, `${what}: the page scrolls sideways (${m.s}px in ${m.W}px)`);
}
const shot = async (page, name) => shots && page.screenshot({ path: join(shots, `${name}.png`) });
async function openChat(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  const card = page.locator("[data-chat-error]").filter({ visible: true }).first();
  if (!(await card.isVisible().catch(() => false))) {
    await page.locator("aside button").filter({ hasText: /^\s*Boppy/ }).filter({ visible: true }).first().click();
    await settle(page);
  }
  await card.waitFor({ state: "visible", timeout: 15000 });
  return card;
}
// The theme's own colors for the card's title (amber) and face, light and dark: never the light ones in dark.
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

try {
  for (const theme of ["light", "dark"]) {
    await look(theme);
    for (const kind of ["desktop", "phone"]) {
      const { ctx, page, errors } = await context(kind === "phone" ? "phone" : "owner");
      const tag = `${kind}-${theme}`;
      await check(`${tag}: the card says it plainly, never the raw 429 or a key, with Settings → AI subscriptions and Details`, async () => {
        const card = await openChat(page);
        assert.equal(await card.getAttribute("data-chat-error"), "credit");
        // From the chat's history, not new in this window: a status, not an alert.
        assert.equal(await card.getAttribute("role"), "status");
        assert.match(await card.locator("[data-chat-error-settings]").getAttribute("aria-label"), /^Open Settings → AI subscriptions, for the OpenAI error at \d{1,2}:\d{2}/);
        assert.equal((await card.locator("[data-chat-error-title]").innerText()).trim(), "Out of credit");
        assert.equal((await card.locator("[data-chat-error-text]").innerText()).trim(), failure.text);
        const seen = await card.innerText();
        assert.ok(!/429 You have no credits|https:\/\//.test(seen), `the raw words show before Details: ${seen}`);
        assert.equal(await card.locator("[data-chat-error-details]").count(), 0, "Details starts closed");
        // The theme's colors: the card's face is light in light and dark in dark, and its words read on it.
        const face = await card.evaluate((n) => getComputedStyle(n).backgroundColor);
        const ink = await card.locator("[data-chat-error-text]").evaluate((n) => getComputedStyle(n).color);
        if (theme === "dark") assert.ok(lum(face) < 90 && lum(ink) > 150, `dark: face ${face}, words ${ink}`);
        else assert.ok(lum(face) > 200 && lum(ink) < 90, `light: face ${face}, words ${ink}`);
        await noSideways(page, tag);
        await card.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-chat-error`);
        const toggle = card.locator("[data-chat-error-toggle]");
        assert.equal(await toggle.getAttribute("aria-expanded"), "false");
        await toggle.click();
        const details = card.locator("[data-chat-error-details]");
        await details.waitFor({ state: "visible", timeout: 3000 });
        assert.equal(await toggle.getAttribute("aria-expanded"), "true");
        assert.equal(await toggle.innerText(), "Hide details");
        const raw = await details.innerText();
        assert.match(raw, /OpenAI · HTTP 429/);
        assert.match(raw, /You have no credits remaining/);
        assert.ok(!/sk-[A-Za-z0-9]/.test(raw), "a key in Details");
        await noSideways(page, `${tag} details`);
        await shot(page, `${tag}-chat-error-details`);
        await toggle.click();
        assert.equal(await card.locator("[data-chat-error-details]").count(), 0, "Hide details closes it");
      });
      await check(`${tag}: its button opens Settings at AI subscriptions, with the AI subscriptions card in sight`, async () => {
        const card = page.locator("[data-chat-error]").filter({ visible: true }).first();
        await card.locator("[data-chat-error-settings]").click();
        // The card's own place since #116 (it once sat on top of Profile): that pane, and the card shown in it.
        const pane = page.locator('main[data-settings-pane="subscriptions"]');
        await pane.waitFor({ state: "visible", timeout: 10000 });
        const subs = pane.locator('section[aria-label="AI subscriptions"]');
        await subs.waitFor({ state: "visible", timeout: 10000 });
        await subs.scrollIntoViewIfNeeded();
        assert.ok(await subs.isVisible(), "the AI subscriptions card isn't in sight");
        assert.match(await subs.innerText(), /AI subscriptions/);
        assert.equal(await page.locator('main[data-settings-pane="profile"]').count(), 0, "it opened Profile");
        await noSideways(page, `${tag} settings`);
        await shot(page, `${tag}-chat-error-settings`);
      });
      await check(`${tag}: nothing threw`, async () => assert.deepEqual(errors, []));
      await ctx.close();
    }
  }
} finally {
  await look("light").catch(() => {});
  console.log(results.join("\n"));
  await browser.close();
  await stop();
}

console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);

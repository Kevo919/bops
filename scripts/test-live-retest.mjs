// The live retest on Kevin's PC (agent-desktop, at 61b03c6), tasks 93 to 96, against the real built app as his PC runs
// it (self-hosted, the desktop window and its bridge, /api/config saying win32), in the light look and the dark:
// - 93: the message box's agent chip says where the Default stands (Claude isn't signed in on this PC) and its picker
//   opens and lists its agents, none refused (in a build with agent harnesses, NEXT_PUBLIC_BOPS_BRAINS=1; a build
//   without them has no chip, and says so: scripts/test-agent-chip-ui.mjs checks the chip in every build);
// - 94: words that reach the box without an input event (an accessibility client's, an input method's) go on the first
//   Send, and so do words typed;
// - 95: a provider's no says to pick another model in the chat box's model picker, its button opens that picker, AI
//   subscriptions is the second way; a message stored before the card (the raw 429) shows as the card, no key in it;
// - 96: Settings' Widgets row and its "Opens your Home page" line are whole; the chat's More and Call glyphs read at
//   3:1 in Dark; every switch in Logins and Routines (Skills) flips on a click and on Space, and one that can't (a
//   workspace with no bots for a site login) is held and says why; the desktop app is told the theme and keeps it for
//   its next start.
// It runs the production build (`npx next build` first) with `next start` in a scratch folder, a made-up Orgo on
// 127.0.0.1; nothing leaves this computer. Needs Playwright's Chromium.
// Usage: node scripts/test-live-retest.mjs   (SHOTS=<dir> saves pictures; ONLY=<regex> runs some)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
async function check(name, fn) {
  if (only && !only.test(name)) return;
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}\n     ${String(e.message ?? e).split("\n").slice(0, 10).join("\n     ")}`);
  }
  if (process.env.VERBOSE) console.log(results.at(-1));
}

// ---- a made-up Orgo ------------------------------------------------------------------------------------------------
const orgo = createServer((req, res) => {
  const j = (x, s = 200) => (res.writeHead(s, { "content-type": "application/json" }), res.end(JSON.stringify(x)));
  req.resume();
  req.on("end", () => {
    const p = (req.url ?? "").split("?")[0];
    if (p === "/api/user/profile") return j({ id: "u_pass", email: "kevin@example.test", full_name: "Kevin Test" });
    if (p === "/api/cli/auth/start") return j({ device_code: "dev_fake", user_code: "ABCD-EFGH", verification_uri: "http://127.0.0.1/cli/approve", interval_seconds: 1, expires_in_seconds: 600 });
    if (p === "/api/cli/auth/poll") return j({ status: "approved", api_key: "sk_orgo_fake_pass", user: { id: "u_pass", email: "kevin@example.test" } });
    if (p === "/api/secrets" && req.method === "GET") return j({ secrets: [] });
    if (p === "/api/workspaces") return j([]);
    if (/computers|projects/.test(p) && req.method === "GET") return j({ computers: [], projects: [] });
    return j({ error: "made-up orgo: not here" }, 404);
  });
});
await new Promise((ok) => orgo.listen(0, "127.0.0.1", ok));

// ---- the scratch folder ----------------------------------------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "bops-live-retest-"));
for (const name of readdirSync(root)) if (name !== ".data" && !name.startsWith(".env") && name !== ".git") symlinkSync(join(root, name), join(dir, name));
mkdirSync(join(dir, "home"));
const now = Date.now();
const H = 3600e3;
const user = "u_pass";
const LAYOUT = {
  pages: [
    {
      id: "home",
      name: "Home",
      widgets: [
        { id: "w_clock", kind: "clock", size: "small" },
        { id: "w_note", kind: "note", size: "medium", text: "Call the plumber." },
        { id: "w_count", kind: "counter", size: "small", title: "Showings", value: 3, step: 1 },
      ],
    },
    { id: "p_rent", name: "Rentals", widgets: [{ id: "w_rcheck", kind: "checklist", size: "wide", title: "Turnover", items: [{ text: "Paint unit 2", done: false }] }] },
  ],
  tabs: [],
};
mkdirSync(join(dir, ".data", "users", user), { recursive: true });
writeFileSync(
  join(dir, ".data", "users", user, "state.json"),
  JSON.stringify({
    host: "orgo",
    account: { user: { id: user, email: "kevin@example.test", name: "Kevin Test" } },
    owner: { name: "Kevin Test", about: "Runs the rentals", timeZone: "America/Chicago" },
    workspaces: [
      { id: "ws_main", name: "Main", createdAt: now - 30 * 24 * H },
      { id: "ws_rent", name: "Rentals LLC", createdAt: now - 20 * 24 * H },
    ],
    workspace: "ws_main",
    bots: [
      // Boppy works on this PC with Claude Code (a Claude plan) as its Default, Bops agent beside it: Kevin's chip.
      { id: "boppy", name: "Boppy", role: "Chief of staff", color: "#E9FF3B", isMain: true, computerStatus: "none", workspaceId: "ws_main", runsOn: "mac", ai: { agents: [{ id: "bops", kind: "bops", pays: "credit" }, { id: "ag_CLAUDE0001", kind: "claude", pays: "plan", account: "brain_claude" }], default: "ag_CLAUDE0001" } },
      { id: "rook", name: "Rook", role: "Recruiting", color: "#47C46B", isMain: false, computer: "shared", computerStatus: "none", workspaceId: "ws_main" },
    ],
    chats: [
      { id: "bot:boppy", kind: "bot", botIds: ["boppy"], createdAt: now - 5 * H, typing: [], workspaceId: "ws_main" },
      { id: "bot:rook", kind: "bot", botIds: ["rook"], createdAt: now - 4 * H, typing: [], workspaceId: "ws_main" },
    ],
    brains: [{ id: "brain_claude", kind: "claude", name: "Claude Code", auth: "plan", bots: ["boppy"], workspaceId: "ws_main", createdAt: now - 9 * H, signIns: [] }],
    messages: [
      { id: "m1", chatId: "bot:boppy", role: "user", text: "Morning!", at: now - 5 * H },
      // What a Bops from before the card wrote for OpenAI's no (task 95), a key in its words as one could be.
      { id: "m_old429", chatId: "bot:boppy", role: "bot", botId: "boppy", bops: true, at: now - 5 * H + 60e3, text: "Something went wrong on my side: 429 You exceeded your current quota, please check your plan and billing details. sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 (insufficient_quota)" },
    ],
    sessions: [],
    routines: [{ id: "r_daily", botId: "boppy", title: "Morning brief", goal: "Send me a summary of my day", schedule: { kind: "weekdays", time: "08:00" }, enabled: true, createdAt: now - 20 * 24 * H, run: "chat", workspaceId: "ws_main" }],
    vault: [{ id: "vl_site", site: "rent.example.com", username: "kevin", hasPassword: true, hasTotp: false, bots: "all", auto: false, addedAt: now - 2 * H }],
    accounts: [{ id: "acc_gmail", app: "gmail", appName: "Gmail", name: "kevin@example.test", status: "active", at: now - H, workspaceId: "ws_main" }],
    look: { current: { layout: LAYOUT }, history: [] },
  }),
);
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

// ---- the server ------------------------------------------------------------------------------------------------------
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
    ORGO_API_KEY: "sk_orgo_fake_pass",
    BOPS_ORGO_ORIGIN: `http://127.0.0.1:${orgo.address().port}`,
    NEXT_TELEMETRY_DISABLED: "1",
    BOPS_TELEMETRY: "0",
    AGENTPHONE_API_KEY: "",
    AGENTMAIL_API_KEY: "",
    HONCHO_API_KEY: "",
    COMPOSIO_API_KEY: "",
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
  if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break;
  if (i > 120 || server.exitCode !== null) {
    console.error(serverLog.slice(-2000));
    await stop();
    throw new Error("the server didn't start");
  }
  await new Promise((r) => setTimeout(r, 500));
}
await fetch(`${BASE}/api/auth/start`, { method: "POST", headers: owner, body: "{}" });
await new Promise((r) => setTimeout(r, 1500));
await fetch(`${BASE}/api/auth/poll`, { method: "POST", headers: owner });
const setTheme = (theme) => fetch(`${BASE}/api/look`, { method: "POST", headers: owner, body: JSON.stringify({ action: "set", look: { theme } }) }).then((r) => assert.ok(r.ok, `POST /api/look: ${r.status}`));

// ---- the browser -----------------------------------------------------------------------------------------------------
async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
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
/** Kevin's PC: the desktop window (its bridge), the server saying win32, and DeepSeek Harness and Hermes added. */
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await ctx.addCookies([{ name: "bops_window", value: token, url: BASE }]);
  await ctx.addInitScript(() => {
    const none = () => Promise.resolve(null);
    window.bopsMac = {
      screens: () => Promise.resolve({ access: "granted", displays: [], sources: [] }),
      openScreenSettings: none,
      permissions: { status: () => Promise.resolve({ screen: "granted", microphone: "granted", notifications: "granted" }), request: () => Promise.resolve("granted"), openSettings: none, automationApps: none },
      screenNeedsRestart: () => Promise.resolve(false),
      relaunch: none,
      // The window's frame follows the look's theme (desktop/main.cjs, nativeTheme): what the page asked for, kept.
      setTheme: (t) => ((window.__themes ??= []).push(t), Promise.resolve()),
      update: { info: none, onChange: () => () => {}, dismiss: none, download: none, install: none, auto: none, setAuto: none },
    };
  });
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (!(u.hostname === "127.0.0.1" || u.protocol === "data:" || u.protocol === "blob:")) return route.abort("blockedbyclient");
    if (u.pathname === "/api/config") {
      const r = await route.fetch();
      return route.fulfill({ response: r, json: { ...(await r.json().catch(() => ({}))), platform: "win32" } });
    }
    // Claude isn't signed in on this PC (Kevin's PC as the retest found it): Bot tasks here have no runner.
    if (u.pathname === "/api/pc-task-runner" && route.request().method() === "GET") return route.fulfill({ json: { choice: null, runner: null, problem: "Sign in to Claude in Settings, AI subscriptions, This PC, then try again.", openaiKey: { set: false, masked: "" } } });
    if (u.pathname === "/api/agent-instances" && route.request().method() === "GET") {
      const agent = (id, kind, name) => ({ id, kind, name, reach: "pc", command: `C:\\Tools\\${kind}.exe`, home: `C:\\Users\\kevin\\.bops\\${id}`, key: { needed: false, set: false, label: "No key needed" } });
      return route.fulfill({ json: { agents: [agent("a_dsh", "deepseek-harness", "DeepSeek Harness"), agent("a_hermes", "hermes", "Hermes Agent")] } });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  return { ctx, page, errors };
}

const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const shot = async (page, name) => shots && page.screenshot({ path: join(shots, `${name}.png`) });
const settle = (page, ms = 400) => page.waitForTimeout(ms);

async function home(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("aside").first().waitFor({ state: "visible", timeout: 30000 });
  await page.getByRole("button", { name: /team, account and settings/ }).first().waitFor({ state: "visible", timeout: 15000 });
  await settle(page, 600);
}
async function settings(page, pane) {
  await home(page);
  for (let i = 1; ; i++) {
    try {
      await page.getByRole("button", { name: /team, account and settings/ }).first().click({ timeout: 10000 });
      await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click({ timeout: 5000 });
      await page.locator('nav[aria-label="Settings"]').waitFor({ state: "visible", timeout: 5000 });
      break;
    } catch (e) {
      if (i >= 3) throw e;
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
  if (pane) {
    await page.locator(`[data-settings-nav="${pane}"]`).click({ timeout: 10000 });
    await page.locator(`main[data-settings-pane="${pane}"]`).waitFor({ state: "visible", timeout: 15000 });
  }
  await settle(page);
}

/** A glyph's paint (`prop`: stroke or fill) against the button it's in and what's behind that, composited. */
const GLYPH_CONTRAST = (shape, prop, button) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (s) => {
    if (!s || s === "transparent" || s === "none") return [0, 0, 0, 0];
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = s;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (t, u) => [t[0] * t[3] + u[0] * (1 - t[3]), t[1] * t[3] + u[1] * (1 - t[3]), t[2] * t[3] + u[2] * (1 - t[3]), 1];
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const chain = [];
  for (let n = button; n; n = n.parentElement) chain.push(n);
  let bg = over(rgba(getComputedStyle(document.body).backgroundColor), [255, 255, 255, 1]);
  for (const n of chain.reverse()) bg = over(rgba(getComputedStyle(n).backgroundColor), bg);
  let alpha = Number(getComputedStyle(shape)[prop === "stroke" ? "strokeOpacity" : "fillOpacity"] || 1);
  for (let n = shape; n && n !== button.parentElement; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
  const raw = rgba(getComputedStyle(shape)[prop]);
  const fg = over([raw[0], raw[1], raw[2], raw[3] * alpha], bg);
  const [a, b] = [lum(fg), lum(bg)].sort((p, q) => q - p);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
};

const chat = async (page) => {
  await home(page);
  await page.locator("#composer").waitFor({ state: "visible", timeout: 15000 });
};

try {
  for (const theme of ["light", "dark"]) {
    await setTheme(theme);
    const { ctx, page, errors } = await context();
    const T = (name) => `${theme}: ${name}`;

    // ---- 93 ----
    await check(T("93 the agent chip says where the Default stands, and its picker opens and lists its agents"), async () => {
      await chat(page);
      const chip = page.getByRole("button", { name: /^Agent for new tasks/ });
      await page.waitForTimeout(800);
      if (!(await chip.count())) {
        // A build without agent harnesses has no chip (scripts/test-agent-chip-ui.mjs checks it in every build).
        if (process.env.NEXT_PUBLIC_BOPS_BRAINS === "1") throw new Error("no agent chip, in a build said to have agent harnesses");
        results.push(`info ${theme}: 93 skipped here: no agent chip in a build without agent harnesses (NEXT_PUBLIC_BOPS_BRAINS=1 to run it)`);
        return;
      }
      await page.waitForFunction(() => document.querySelector('[data-agent-ready]')?.getAttribute("data-agent-ready") !== "checking", null, { timeout: 10000 });
      const name = await chip.getAttribute("aria-label");
      assert.match(name, /not signed in on this PC/, `the chip says nothing of where it stands: ${name}`);
      assert.match(await chip.getAttribute("title"), /Claude isn't signed in on this PC/);
      assert.match(await page.locator("[data-agent-status]").innerText(), /not signed in on this PC/);
      await shot(page, `${theme}-93-chip`);
      // Opened as an accessibility client does (focus, Enter), then as a click does.
      await chip.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu", { name: "Agent for new tasks" });
      await menu.waitFor({ state: "visible", timeout: 5000 });
      const items = await menu.getByRole("menuitemradio").evaluateAll((els) => els.map((e) => ({ name: e.textContent.trim(), disabled: e.getAttribute("aria-disabled"), checked: e.getAttribute("aria-checked") })));
      assert.ok(items.length >= 2, `items: ${JSON.stringify(items)}`);
      for (const it of items) assert.equal(it.disabled, null, `${it.name} is refused`);
      assert.ok(items.some((it) => /Claude Code.*not signed in on this PC/.test(it.name)), "the Default says why");
      await shot(page, `${theme}-93-picker`);
      // Picking Bops agent takes; picking the Default back takes too.
      await menu.getByRole("menuitemradio", { name: /^Bops agent/ }).click();
      await menu.waitFor({ state: "hidden", timeout: 5000 });
      assert.match(await chip.getAttribute("aria-label"), /^Agent for new tasks: Bops agent/);
      await chip.click();
      await menu.getByRole("menuitemradio", { name: /Claude Code/ }).click();
      assert.match(await chip.getAttribute("aria-label"), /Claude Code.*not signed in on this PC/);
    });

    // ---- 94 ----
    await check(T("94 words that reached the box without an input event go on the first Send"), async () => {
      await chat(page);
      const sent = [];
      const listen = (r) => r.url().includes("/api/chats/") && r.url().endsWith("/messages") && r.method() === "POST" && sent.push(r.postData());
      page.on("request", listen);
      // As an accessibility client sets a value (UI Automation's SetValue): no input event, so the draft didn't hear it.
      await page.locator("#composer").evaluate((el) => {
        el.focus();
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, "first click, set by the accessibility tree");
      });
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.waitForTimeout(1000);
      // And words typed, Send clicked once.
      await page.locator("#composer").pressSequentially("typed, then one click");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.waitForTimeout(1000);
      assert.equal(sent.length, 2, `sends: ${JSON.stringify(sent)}`);
      assert.match(sent[0], /first click, set by the accessibility tree/);
      assert.match(sent[1], /typed, then one click/);
      assert.equal(await page.locator("#composer").inputValue(), "", "the box is empty after sending");
      // Empty, Send shows faint, but is never refused (aria-disabled), and a click sends nothing.
      const send = page.getByRole("button", { name: "Send", exact: true });
      assert.equal(await send.getAttribute("aria-disabled"), null);
      assert.equal(await send.isEnabled(), true);
      await send.click();
      await page.waitForTimeout(500);
      assert.equal(sent.length, 2, "an empty Send sent something");
      page.off("request", listen);
    });

    // ---- 95 ----
    await check(T("95 a stored 429 shows as the card: pick another model in the chat box, the picker opens, no key"), async () => {
      await chat(page);
      const card = page.locator('[data-chat-error="credit"]').first();
      await card.waitFor({ state: "visible", timeout: 10000 });
      await card.scrollIntoViewIfNeeded();
      await shot(page, `${theme}-95-card`);
      const text = await card.innerText();
      assert.match(text, /pick another model in the chat box's model picker/);
      const main = await page.locator("main").first().innerText();
      assert.ok(!/429 You exceeded|insufficient_quota/.test(main), "the raw 429 shows");
      assert.ok(!/sk-proj-/.test(await page.content()), "a key in the page");
      // The second way: AI subscriptions.
      assert.ok(await card.locator("[data-chat-error-settings]").count(), "no AI subscriptions button");
      await card.locator("[data-chat-error-model]").click();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Model for this chat", "the model picker isn't focused");
      await page.keyboard.press("Escape");
    });

    // ---- 96 ----
    await check(T("96 Settings' Widgets row and its Opens your Home page line are whole"), async () => {
      await settings(page);
      const row = page.locator("[data-settings-widgets]");
      await row.scrollIntoViewIfNeeded();
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll("[data-settings-widgets] span, [data-widgets-opens]")]
          .filter((s) => s.textContent.trim())
          .map((s) => ({ t: s.textContent.trim(), w: s.clientWidth, need: s.scrollWidth }))
          .filter((s) => s.need > s.w + 1),
      );
      assert.deepEqual(cut, [], "cut short");
      assert.match(await page.locator("[data-widgets-opens]").innerText(), /Opens your Home page/);
      await shot(page, `${theme}-96-widgets-row`);
    });
    if (theme === "dark")
      await check(T("96 the chat's More and Call glyphs read at 3:1 or more"), async () => {
        await chat(page);
        for (const name of ["More", "Call Boppy"]) {
          const b = page.getByRole("button", { name, exact: true }).first();
          const ratio = await b.evaluate((btn, src) => {
            const contrast = eval(`(${src})`);
            const shape = btn.querySelector("svg circle, svg path");
            const cs = getComputedStyle(shape);
            return contrast(shape, cs.fill !== "none" && cs.fill !== "rgba(0, 0, 0, 0)" ? "fill" : "stroke", btn);
          }, GLYPH_CONTRAST.toString());
          assert.ok(ratio >= 3, `${name}: ${ratio}:1`);
        }
        await shot(page, `${theme}-96-chat-icons`);
      });
    await check(T("96 every switch in Logins and Routines flips on a click and on Space; one that can't is held and says why"), async () => {
      const flipAll = async (scope, where) => {
        const sws = page.locator(`${scope} [role="switch"]`);
        const n = await sws.count();
        assert.ok(n > 0, `${where}: no switch`);
        let flipped = 0;
        for (let i = 0; i < n; i++) {
          const s = sws.nth(i);
          if (await s.isDisabled()) continue;
          for (const how of ["click", "Space"]) {
            const was = await s.getAttribute("aria-checked");
            if (how === "click") await s.click();
            else {
              await s.focus();
              await page.keyboard.press("Space");
            }
            await page.waitForFunction(([el, w]) => el.getAttribute("aria-checked") !== w, [await s.elementHandle(), was], { timeout: 5000 }).catch(() => {});
            assert.notEqual(await s.getAttribute("aria-checked"), was, `${where} ${await s.getAttribute("aria-label")}: a ${how} did nothing`);
            await page.waitForTimeout(300);
            flipped++;
          }
        }
        assert.ok(flipped > 0, `${where}: nothing to flip`);
      };
      await settings(page, "logins");
      const pane = 'main[data-settings-pane="logins"]';
      await page.locator(`${pane} [data-list-heading]`).filter({ hasText: "rent.example.com" }).first().click();
      await page.locator(`${pane} [data-logins]`).getByRole("button", { name: "rent.example.com", exact: true }).first().click();
      await page.locator("[data-login-panel]").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(400);
      // Rentals LLC has no bots: a site login can't be switched there, so its switch is held and says why.
      const rent = page.locator('[data-login-panel] [role="switch"][aria-label="Used in Rentals LLC"]');
      assert.equal(await rent.isDisabled(), true, "Rentals LLC's switch takes a click it can't keep");
      assert.match(await page.locator("[data-login-panel]").innerText(), /No bots here yet/);
      await flipAll("[data-login-panel]", "Logins");
      await shot(page, `${theme}-96-logins-switches`);
      await home(page);
      await page.locator("aside").first().getByRole("button", { name: /^Routines/ }).first().click();
      await page.locator("section[data-panel]").getByRole("button", { name: "Skills", exact: true }).first().click();
      await page.locator("[data-label-suggest]").waitFor({ state: "visible", timeout: 10000 });
      await flipAll("section[data-panel]", "Routines, Skills");
    });
    await check(T("96 the desktop app is told the theme, and keeps it for its next start"), async () => {
      await home(page);
      await page.waitForFunction((t) => window.__themes?.at(-1) === t, theme, { timeout: 5000 }).catch(() => {});
      assert.equal(await page.evaluate(() => window.__themes?.at(-1)), theme);
      const main = readFileSync(join(root, "desktop", "main.cjs"), "utf8");
      assert.match(main, /ipcMain\.handle\("set-theme"[\s\S]{0,400}writeFileSync\(themeFile\(\), next\)/, "the theme isn't kept");
      assert.match(main, /async function createWindow\(\) \{\s*startTheme\(\);/, "the window doesn't start with it");
    });
    await check(T("nothing threw"), async () => assert.deepEqual(errors, []));
    await ctx.close();
  }
} finally {
  await setTheme("light").catch(() => {});
  console.log(results.join("\n"));
  await browser.close();
  await stop();
}
console.log(failed ? `\n${failed} failed, ${results.filter((r) => r.startsWith("ok")).length} passed` : `\nlive retest: all ${results.filter((r) => r.startsWith("ok")).length} passed`);
process.exit(failed ? 1 : 0);

// The live UI pass Kevin's Windows PC found with agent-desktop (tasks 83 to 87), each against the real built app as his
// PC runs it (self-hosted, the desktop window and its bridge, /api/config saying win32), in the light look and the dark:
// - 83: Settings, Profile is the profile (who your bots work for, your account), not the AI subscriptions card, which
//   has its own place (AI subscriptions);
// - 84: a page in Edit: its Done button reads (4.5:1 or more against its own fill), in both looks;
// - 85: Handy's steps on This PC give the Windows installer, never the Mac's .dmg (the chat's words are checked in
//   scripts/test-windows-wording.mjs);
// - 86: Look's choices (Theme, Spacing, Animations, Speed) and a widget's sizes are buttons with aria-pressed, each
//   pressed by the accessibility tree alone (no mouse: focus and the keyboard, as a screen reader or agent-desktop does),
//   the one pressed is the one that shows, and repeated buttons each have a name of their own (Check, Remove, Set it
//   up, the three Normals);
// - 87: the sidebar and Settings mark only the place that's open; Settings' Widgets row says it opens Home; Tasks and
//   People open with their own title and an empty state that says what to do; Look has its padding; the top bar turns
//   with the look; the right panel's tab labels keep a readable width with the whole name in a tooltip; a page's widget
//   count follows the change without a reload; the faint icon buttons read at 3:1 in Dark; and the Logins and Routines
//   switches say the state they show.
//
// It runs the production build (`npx next build` first) with `next start` in a scratch folder (its own .data, HOME and
// UI token, made-up bots, chats, widgets, a login and a routine), a made-up Orgo on 127.0.0.1; nothing leaves this
// computer. Needs Playwright's Chromium.
// Usage: node scripts/test-live-ui-pass.mjs   (SHOTS=<dir> saves a picture of each screen; ONLY=<regex> runs some)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
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
const dir = mkdtempSync(join(tmpdir(), "bops-live-pass-"));
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
      { id: "boppy", name: "Boppy", role: "Chief of staff", color: "#E9FF3B", isMain: true, computerStatus: "none", workspaceId: "ws_main" },
      { id: "rook", name: "Rook", role: "Recruiting", color: "#47C46B", isMain: false, computer: "shared", computerStatus: "none", workspaceId: "ws_main" },
    ],
    chats: [
      { id: "bot:boppy", kind: "bot", botIds: ["boppy"], createdAt: now - 5 * H, typing: [], workspaceId: "ws_main" },
      { id: "bot:rook", kind: "bot", botIds: ["rook"], createdAt: now - 4 * H, typing: [], workspaceId: "ws_main" },
    ],
    messages: [{ id: "m1", chatId: "bot:boppy", role: "user", text: "Morning!", at: now - 5 * H }],
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

/** WCAG contrast between an element's text (or `prop`) and what's behind it, composited, measured in the page. */
const CONTRAST = (el, prop) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (s) => {
    if (!s || s === "transparent") return [0, 0, 0, 0];
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
  // What's behind: each ancestor's background, composited from the page up.
  const chain = [];
  for (let n = el; n; n = n.parentElement) chain.push(n);
  let bg = [255, 255, 255, 1];
  const body = getComputedStyle(document.body).backgroundColor;
  bg = over(rgba(body), bg);
  for (const n of chain.reverse()) bg = over(rgba(getComputedStyle(n).backgroundColor), bg);
  let opacity = 1;
  for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
  const fgRaw = rgba(getComputedStyle(el)[prop || "color"]);
  const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacity], bg);
  const [a, b] = [lum(fg), lum(bg)].sort((p, q) => q - p);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
};

/** WCAG contrast of an element's own fill (`prop`, backgroundColor) against what's behind it: its parent's, composited. */
const CONTRAST_AGAINST_PARENT = (el, prop) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (s) => {
    if (!s || s === "transparent") return [0, 0, 0, 0];
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
  for (let n = el.parentElement; n; n = n.parentElement) chain.push(n);
  let bg = over(rgba(getComputedStyle(document.body).backgroundColor), [255, 255, 255, 1]);
  for (const n of chain.reverse()) bg = over(rgba(getComputedStyle(n).backgroundColor), bg);
  const fg = over(rgba(getComputedStyle(el)[prop || "backgroundColor"]), bg);
  const [a, b] = [lum(fg), lum(bg)].sort((p, q) => q - p);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
};

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

/** What the accessibility tree says of the buttons in `scope`: each one's role, name and pressed or checked state. */
async function axButtons(page, scope) {
  return page.locator(scope).first().evaluate((box) =>
    [...box.querySelectorAll("button, [role=button], [role=radio], [role=switch], input[type=radio]")].map((b) => ({
      role: b.getAttribute("role") || (b.tagName === "INPUT" ? "radio" : "button"),
      name: (b.getAttribute("aria-label") || b.textContent || "").trim(),
      pressed: b.getAttribute("aria-pressed"),
      checked: b.getAttribute("aria-checked") ?? (b.tagName === "INPUT" ? String(b.checked) : null),
    })),
  );
}

/** Press a control the way an accessibility client does: by its role and name, with focus and the keyboard. */
async function pressByAx(page, role, name, key = "Enter") {
  const el = page.getByRole(role, { name, exact: true }).first();
  await el.focus();
  await page.keyboard.press(key);
}

const EXPLORE = process.env.EXPLORE;

try {
  if (EXPLORE) {
    const { ctx, page, errors } = await context();
    const mod = await import(EXPLORE);
    await mod.default({ page, BASE, owner, setTheme, settings, home, shot, settle, CONTRAST, axButtons, errors });
    await ctx.close();
  } else
    for (const theme of ["light", "dark"]) {
      await setTheme(theme);
      const { ctx, page, errors } = await context();
      const T = (name) => `${theme}: ${name}`;

      // ---- 83 ----
      await check(T("83 Settings, Profile shows the profile, not the AI subscriptions card"), async () => {
        await settings(page, "profile");
        const pane = page.locator('main[data-settings-pane="profile"]');
        await shot(page, `${theme}-83-profile`);
        assert.equal(await pane.locator('section[aria-label="AI subscriptions"]').count(), 0, "the AI subscriptions card is on Profile");
        const first = await pane.locator("[data-pane-head]").first().innerText();
        assert.match(first, /^Profile/, `the pane opens with: ${first.slice(0, 60)}`);
        assert.equal(await pane.getByRole("textbox", { name: "Your name" }).inputValue(), "Kevin Test");
        assert.match(await pane.innerText(), /kevin@example\.test/, "the account it's signed in as");
        assert.equal(await page.locator('[data-settings-nav="profile"]').getAttribute("aria-current"), "page");
      });
      await check(T("83 AI subscriptions has a place of its own, with This PC's sign ins"), async () => {
        await settings(page, "subscriptions");
        const pane = page.locator('main[data-settings-pane="subscriptions"]');
        await pane.locator('section[aria-label="AI subscriptions"]').waitFor({ state: "visible", timeout: 10000 });
        assert.match(await pane.locator("[data-pane-head]").first().innerText(), /^AI subscriptions/);
        assert.equal(await page.locator('[data-settings-nav="subscriptions"]').getAttribute("aria-current"), "page");
        assert.equal(await page.locator('[data-settings-nav="profile"]').getAttribute("aria-current"), null);
      });

      // ---- 84 ----
      await check(T("84 a page in Edit: Done reads on its fill and gets you out"), async () => {
        await home(page);
        await page.locator('[data-page-row="home"]').click();
        await page.locator('[data-widget-page="home"]').waitFor({ state: "visible", timeout: 10000 });
        const edit = page.locator("[data-edit-widgets]");
        await edit.click();
        await settle(page);
        assert.equal((await edit.innerText()).trim(), "Done");
        await shot(page, `${theme}-84-edit-done`);
        const ratio = await edit.evaluate(CONTRAST);
        assert.ok(ratio >= 4.5, `Done reads at ${ratio}:1`);
        assert.equal(await edit.getAttribute("aria-pressed"), null, "its name says the state (Done), not aria-pressed as well");
        await edit.click();
        await settle(page);
        assert.equal((await edit.innerText()).trim(), "Edit", "Done leaves Edit");
        assert.equal(await page.locator("[data-widget-tools]").count(), 0);
      });

      // ---- 85 ----
      await check(T("85 Handy's steps on This PC give the Windows installer, not the Mac's"), async () => {
        await settings(page, "mac");
        const card = page.locator("[data-handy-card]");
        await card.scrollIntoViewIfNeeded();
        const text = await card.innerText();
        assert.match(text, /Handy_<version>_x64-setup\.exe/);
        assert.doesNotMatch(text, /\.dmg|\bMac\b|macOS/, text);
        assert.match(text, /Windows/);
      });

      // ---- 86 ----
      await check(T("86 Look's choices are buttons pressed through the accessibility tree, one name each"), async () => {
        await settings(page, "look");
        const look = page.locator("[data-look-settings]");
        const ax = await axButtons(page, "[data-look-settings]");
        const choices = ax.filter((b) => /theme|spacing|animations|speed/i.test(b.name) && b.pressed !== null);
        assert.ok(choices.length >= 13, `Look's choices as pressed buttons: ${JSON.stringify(ax.slice(0, 6))}`);
        for (const b of choices) assert.equal(b.role, "button", `${b.name}: role ${b.role}`);
        const names = ax.map((b) => b.name);
        assert.equal(new Set(names).size, names.length, `repeated names: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
        for (const n of ["Normal spacing", "Normal animations", "Normal speed"]) assert.ok(names.includes(n), `no ${n}: ${names}`);
        // Each pressed with the keyboard on the element the accessibility tree names: no mouse.
        const want = theme === "light" ? "Dark theme" : "Light theme";
        await pressByAx(page, "button", want);
        await page.getByRole("button", { name: want, pressed: true }).waitFor({ timeout: 5000 });
        await pressByAx(page, "button", "Roomy spacing", " ");
        await page.getByRole("button", { name: "Roomy spacing", pressed: true }).waitFor({ timeout: 5000 });
        assert.equal(await page.getByRole("button", { name: "Normal spacing" }).getAttribute("aria-pressed"), "false");
        await pressByAx(page, "button", "Subtle animations");
        await page.getByRole("button", { name: "Subtle animations", pressed: true }).waitFor({ timeout: 5000 });
        await pressByAx(page, "button", "Fast speed");
        await page.getByRole("button", { name: "Fast speed", pressed: true }).waitFor({ timeout: 5000 });
        // What shows is what's pressed: the pressed one has the raised fill, the others none.
        const shows = await look.locator('[role="group"][aria-label="Spacing"] button').evaluateAll((bs) => bs.map((b) => ({ p: b.getAttribute("aria-pressed"), bg: getComputedStyle(b).backgroundColor })));
        for (const s of shows) assert.equal(s.p === "true", s.bg !== "rgba(0, 0, 0, 0)", `shows ${s.bg} for pressed=${s.p}`);
        // Put back what this changed (the theme last).
        for (const n of ["Normal spacing", "Normal animations", "Normal speed", theme === "light" ? "Light theme" : "Dark theme"]) await pressByAx(page, "button", n);
        await page.getByRole("button", { name: theme === "light" ? "Light theme" : "Dark theme", pressed: true }).waitFor({ timeout: 5000 });
      });
      await check(T("86 a widget's sizes are buttons pressed through the accessibility tree; its tools have names of their own"), async () => {
        await home(page);
        await page.locator('[data-page-row="home"]').click();
        await page.locator("[data-edit-widgets]").click();
        await settle(page);
        const ax = await axButtons(page, '[data-widget-page="home"]');
        const sizes = ax.filter((b) => / size for /.test(b.name));
        assert.ok(sizes.length >= 9, `sizes: ${JSON.stringify(ax.slice(0, 12))}`);
        for (const b of sizes) assert.equal(b.role, "button");
        const names = ax.map((b) => b.name).filter(Boolean);
        assert.equal(new Set(names).size, names.length, `repeated names: ${[...new Set(names.filter((n, i) => names.indexOf(n) !== i))]}`);
        assert.ok(names.includes("Set up Showings"), names.join(" | "));
        assert.ok(names.includes("Remove Showings"));
        await pressByAx(page, "button", "Medium size for Showings");
        await page.getByRole("button", { name: "Medium size for Showings", pressed: true }).waitFor({ timeout: 5000 });
        await pressByAx(page, "button", "Small size for Showings", " ");
        await page.getByRole("button", { name: "Small size for Showings", pressed: true }).waitFor({ timeout: 5000 });
        // The arrow keys move along the sizes and pick, as Look's do.
        await page.getByRole("button", { name: "Small size for Showings" }).focus();
        await page.keyboard.press("ArrowRight");
        await page.getByRole("button", { name: "Medium size for Showings", pressed: true }).waitFor({ timeout: 5000 });
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Medium size for Showings", "focus moved with the arrow");
        await page.keyboard.press("ArrowLeft");
        await page.getByRole("button", { name: "Small size for Showings", pressed: true }).waitFor({ timeout: 5000 });
        await page.locator("[data-edit-widgets]").click();
      });
      await check(T("86 Agents you run: each Check, Change and Remove names its agent"), async () => {
        await settings(page, "agents");
        await page.locator("[data-agent]").first().waitFor({ state: "visible", timeout: 10000 });
        const names = (await axButtons(page, 'main[data-settings-pane="agents"]')).map((b) => b.name);
        for (const n of ["Check DeepSeek Harness", "Check Hermes Agent", "Remove DeepSeek Harness", "Remove Hermes Agent", "Change DeepSeek Harness"]) assert.ok(names.includes(n), `no ${n}: ${names}`);
        const dup = names.filter((n, i) => n && names.indexOf(n) !== i);
        assert.deepEqual(dup, [], "repeated names");
      });

      // ---- 87 ----
      await check(T("87 the sidebar and Settings mark only what's open"), async () => {
        await settings(page, "look");
        const current = await page.locator('nav[aria-label="Settings"] [aria-current="page"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-settings-nav")));
        assert.deepEqual(current, ["look"]);
        // Nothing in the sidebar says it's open while Settings is (no chat row, no page row, no footer pill pressed).
        const side = await page.locator("aside").first().evaluate((a) => [...a.querySelectorAll('[aria-current="page"], [aria-pressed="true"], [aria-selected="true"]')].map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)));
        assert.deepEqual(side, [], "the sidebar marks something while Settings is open");
        // A chat open: its row alone.
        await page.keyboard.press("Escape");
        await settle(page);
        const chatSide = await page.locator("aside").first().evaluate((a) => [...a.querySelectorAll('[aria-current="page"]')].map((e) => (e.textContent || "").trim().slice(0, 30)));
        assert.equal(chatSide.length, 1, `the sidebar marks ${JSON.stringify(chatSide)}`);
      });
      await check(T("87 Settings' Widgets row says it opens Home"), async () => {
        await settings(page);
        const row = page.locator("[data-settings-widgets]");
        const name = (await row.getAttribute("aria-label")) ?? (await row.innerText());
        assert.match(name, /opens? (your )?Home/i, name);
        // Where it shows: the line under the row (since task 96, so beside Being tested neither is cut short).
        assert.match(await page.locator("[data-widgets-opens]").innerText(), /Opens your Home page/, "it says so where it shows");
      });
      for (const [kind, title] of [
        ["todos", "Tasks"],
        ["people", "People"],
      ])
        await check(T(`87 ${title} opens with its own title and an empty state that helps`), async () => {
          await home(page);
          await page.locator("aside").first().getByRole("button", { name: new RegExp(`^${title}`) }).first().click();
          await page.locator("section[data-panel]").waitFor({ state: "visible", timeout: 10000 });
          await settle(page, 800);
          const panel = page.locator("section[data-panel]");
          await shot(page, `${theme}-87-${kind}`);
          const head = await panel.locator("[data-knowledge-title]").innerText();
          assert.equal(head.trim(), title);
          const text = await panel.innerText();
          assert.ok(!/^\s*Memory isn.t on yet\.\s*$/m.test(text) || /set up|Services/i.test(text), "only 'Memory isn't on yet'");
          assert.match(text, /Services/, "it says where memory is turned on");
          assert.ok(await panel.getByRole("button", { name: /Set up memory/ }).count(), "a way to turn it on");
        });
      await check(T("87 Look has its padding"), async () => {
        await settings(page, "look");
        const box = await page.locator("[data-look-settings]").boundingBox();
        const head = await page.locator('main[data-settings-pane="look"] [data-pane-head]').boundingBox();
        const main = await page.locator('main[data-settings-pane="look"]').boundingBox();
        assert.ok(box.x - main.x >= 16, `Look's card is ${box.x - main.x}px from the pane's edge`);
        assert.ok(box.y - (head.y + head.height) >= 12, "no room under the heading");
        assert.ok(main.x + main.width - (box.x + box.width) >= 16, "no room on the right");
      });
      await check(T("87 the window's top bar (Windows' own title and menu bar) turns with the look"), async () => {
        // The title and menu bar are the system's on Windows: the page tells the desktop app the theme, which sets it
        // (desktop/main.cjs, nativeTheme.themeSource). Here, the bridge keeps what it was told.
        await home(page);
        await page.waitForFunction((t) => window.__themes?.at(-1) === t, theme, { timeout: 5000 }).catch(() => {});
        assert.equal(await page.evaluate(() => window.__themes?.at(-1)), theme, "the desktop app wasn't told the theme");
        // And the page's own bar above the panel turns too.
        const bg = await page.evaluate(() => {
          // Read through a canvas, so lab() and the rest come out as RGB.
          const cx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
          cx.fillStyle = getComputedStyle(document.body).backgroundColor;
          cx.fillRect(0, 0, 1, 1);
          return [...cx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
        });
        assert.equal(bg.reduce((a, b) => a + b, 0) / 3 > 128, theme === "light", `the page is rgb(${bg}) in ${theme}`);
      });
      await check(T("87 the right panel's tab labels stay readable, the whole name in a tooltip"), async () => {
        await home(page);
        // Open many tabs: Routines, Knowledge, Logins and a bot's profile, at a narrow panel.
        await page.setViewportSize({ width: 1000, height: 800 });
        for (const n of ["Routines", "Knowledge"]) {
          await page.locator("aside").first().getByRole("button", { name: new RegExp(`^${n}`) }).first().click().catch(() => {});
          await settle(page, 300);
        }
        await page.getByRole("button", { name: "Boppy's profile" }).first().click().catch(() => {});
        await settle(page);
        const tabs = await page.locator("[data-panel-tab]").evaluateAll((els) =>
          els.map((t) => {
            const label = t.querySelector("[data-tab-label]") ?? t;
            return { w: label.getBoundingClientRect().width, text: (label.textContent || "").trim(), tip: t.getAttribute("title") || t.getAttribute("data-tip") || t.getAttribute("aria-label") || "", truncates: getComputedStyle(label).textOverflow };
          }),
        );
        await shot(page, `${theme}-87-tabs`);
        await page.setViewportSize({ width: 1280, height: 800 });
        assert.ok(tabs.length >= 3, `tabs: ${JSON.stringify(tabs)}`);
        for (const t of tabs.filter((x) => x.text)) {
          assert.ok(t.w >= 40, `a tab label is ${Math.round(t.w)}px wide: ${JSON.stringify(t)}`);
          assert.equal(t.truncates, "ellipsis", `${t.text} doesn't truncate with an ellipsis`);
          assert.ok(t.tip.length >= t.text.length, `${t.text} has no tooltip with its whole name`);
        }
      });
      await check(T("87 a page's widget count follows a change without a reload"), async () => {
        await home(page);
        const count = page.locator('[data-page-row="p_rent"] [data-page-count]');
        await page.locator('[data-page-row="p_rent"]').click();
        await page.locator("[data-edit-widgets]").click();
        const before = Number(await count.innerText());
        await page.locator('[data-add-widget="note"]').click();
        await page.waitForFunction((n) => Number(document.querySelector('[data-page-row="p_rent"] [data-page-count]')?.textContent) === n + 1, before, { timeout: 5000 });
        // And back: the new one removed.
        const added = page.locator('[data-widget-page="p_rent"] [data-widget="note"]').last();
        const remove = added.getByRole("button", { name: /^Remove / });
        await remove.click();
        await added.getByRole("button", { name: /^Remove .* for sure/ }).click();
        await page.waitForFunction((n) => Number(document.querySelector('[data-page-row="p_rent"] [data-page-count]')?.textContent) === n, before, { timeout: 5000 });
        await page.locator("[data-edit-widgets]").click();
      });
      if (theme === "dark")
        await check(T("87 icon buttons read at 3:1 or more"), async () => {
          // Every icon-only button in the sidebar, the top bar and the panel: its glyph (the SVG's stroke, else its fill,
          // as the page paints it) against what's behind the button, at 3:1 or more (WCAG's non-text contrast).
          await home(page);
          await page.locator("aside").first().getByRole("button", { name: /^Routines/ }).first().click();
          await settle(page, 600);
          const faint = await page.evaluate((src) => {
            const contrast = eval(`(${src})`);
            const out = [];
            for (const b of document.querySelectorAll("aside button, section[data-panel] button, [data-panel-tab] button, button[title*='side panel']")) {
              const r = b.getBoundingClientRect();
              if (r.width < 4 || r.height < 4 || b.disabled || b.textContent.trim().length > 1) continue;
              const shape = [...b.querySelectorAll("svg path, svg rect, svg circle, svg line, svg polyline")].find((n) => {
                const cs = getComputedStyle(n);
                return (cs.stroke !== "none" && cs.stroke !== "rgba(0, 0, 0, 0)") || (cs.fill !== "none" && cs.fill !== "rgba(0, 0, 0, 0)");
              });
              if (!shape || shape.closest("[data-mascot], .mascot")) continue;
              const cs = getComputedStyle(shape);
              const ink = cs.stroke !== "none" && cs.stroke !== "rgba(0, 0, 0, 0)" ? "stroke" : "fill";
              const ratio = contrast(shape, ink, b);
              if (ratio < 3) out.push(`${b.getAttribute("aria-label") || b.getAttribute("title") || "?"}: ${ratio}:1`);
            }
            return out;
          }, GLYPH_CONTRAST.toString());
          assert.deepEqual(faint, [], "icon buttons under 3:1");
        });
      await check(T("87 the Logins and Routines switches say the state they show"), async () => {
        // A switch's checked state and how it looks agree, in both looks: on is a strong track (3:1 or more against what
        // it sits on), off a quieter one than any on; its name says what it is, the same either way (never "Stop..." or
        // "Let...", which reads as the opposite state). Logins: a login's Used in (one workspace on, one off); Routines:
        // its Skills' Suggest labels with AI (on).
        const switches = async () =>
          page.locator('[role="switch"]').evaluateAll((els, contrastSrc) => {
            const contrast = eval(`(${contrastSrc})`);
            return els
              .filter((e) => e.getBoundingClientRect().width > 0)
              .map((e) => {
                // The track: the switch itself when it's filled, else the first filled thing in it.
                const filled = (n) => getComputedStyle(n).backgroundColor !== "rgba(0, 0, 0, 0)";
                const track = filled(e) ? e : [...e.querySelectorAll("span")].find(filled);
                return { name: e.getAttribute("aria-label") || e.textContent.trim().slice(0, 40), checked: e.getAttribute("aria-checked"), prominence: track ? contrast(track.parentElement ? track : e, "backgroundColor") : 0 };
              });
          }, CONTRAST_AGAINST_PARENT.toString());
        const judge = (sw, where) => {
          assert.ok(sw.length > 0, `${where}: no switch`);
          for (const x of sw) {
            assert.ok(x.checked === "true" || x.checked === "false", `${where} ${x.name}: aria-checked ${x.checked}`);
            assert.ok(!/^(Stop|Let|Turn (on|off)|Pause|Resume)\b/.test(x.name), `${where} ${x.name}: the name says what a press does`);
          }
          const on = sw.filter((x) => x.checked === "true").map((x) => x.prominence);
          const off = sw.filter((x) => x.checked === "false").map((x) => x.prominence);
          for (const p of on) assert.ok(p >= 3, `${where}: an on switch shows at ${p}:1, as faint as off (${JSON.stringify(sw)})`);
          if (on.length) for (const p of off) assert.ok(p < Math.min(...on), `${where}: an off switch shows stronger than an on one (${JSON.stringify(sw)})`);
        };
        await settings(page, "logins");
        const pane = 'main[data-settings-pane="logins"]';
        await page.locator(`${pane} [data-list-heading]`).filter({ hasText: "rent.example.com" }).first().click();
        await page.locator(`${pane} [data-logins]`).getByRole("button", { name: "rent.example.com", exact: true }).first().click();
        await page.locator("[data-login-panel]").waitFor({ state: "visible", timeout: 10000 });
        await settle(page, 500);
        await shot(page, `${theme}-87-logins-switches`);
        judge(await switches(), "Logins");
        await home(page);
        await page.locator("aside").first().getByRole("button", { name: /^Routines/ }).first().click();
        await page.locator("section[data-panel]").getByRole("button", { name: "Skills", exact: true }).first().click();
        await page.locator("[data-label-suggest]").waitFor({ state: "visible", timeout: 10000 });
        await shot(page, `${theme}-87-routines-switch`);
        judge(await switches(), "Routines, Skills");
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
console.log(failed ? `\n${failed} failed, ${results.length - failed} passed` : `\nlive ui pass: all ${results.length} passed`);
process.exit(failed ? 1 : 0);

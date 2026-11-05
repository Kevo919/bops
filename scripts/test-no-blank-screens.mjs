// No blank screens, no dead features: every place a person can click to, in the owner's window as it is on a self-hosted
// Windows PC (BOPS_SELF_HOSTED=1, the desktop window's token, no texting, email or memory service, no Composio key), at
// 1280x800, against the real built app. For each screen it fails if:
//  (a) its pane has nothing under its header: under ~20 characters of visible text, or no visible control;
//  (b) its visible text says "undefined", "NaN", "[object Object]", raw JSON ({") or raw error words ("fetch failed", "Failed to fetch", ECONNREFUSED, a TypeError…), or an error page shows;
//  (c) the page threw or logged a console error, or an /api call answered 5xx;
// and it warns (only) when (d) a visible button is disabled with nothing near it saying why.
// The screens: every place in Settings' nav (Account and Workspace: Profile, Plan and credit, Usage, How bots reach you,
// AI plans when built with it, Look, This PC, General, Team, Org chart, Bots, Logins, Email and phone, Repos), a bot's
// chat and a group chat, the panel's tabs (the chat's computer, a bot's profile, New tab), Routines, Skills, Knowledge,
// Issues, New chat or bot, and a bot's settings page with each of its sections. Plus How bots reach you while it's
// still asking the server (it says "Checking", never a blank pane).
//
// It runs the production build (`npx next build` first) with `next start` in a scratch folder, a made-up Orgo on
// 127.0.0.1 and made-up bots and chats, the same harness as test-mobile-layout.mjs. Nothing leaves this computer: the
// server's sockets off loopback are refused (a preload), and so are the browser's requests.
// Usage: node scripts/test-no-blank-screens.mjs   (SHOTS=<dir> to save the screenshots elsewhere; default
// /tmp/claude-0/qa-shots; ONLY=<regex> to run only the screens whose names match)
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

/**
 * Screens meant to be as they are, though a rule above would flag them. Keep this short, and say why for each.
 * `controls`: the screen may have no control of its own (it only tells you something).
 */
const ALLOW = {
  // (Empty: no screen needs it today. Example: "settings-plan": { controls: true }.)
};

let failed = 0;
const results = [];
const warnings = [];
async function check(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, "i").test(name)) return;
  try {
    try {
      await fn();
    } catch (e) {
      // The browser's tab crashed (not the app): a new tab, and this screen once more.
      if (!(crashed || /Target crashed|Page crashed|Target page, context or browser has been closed/.test(String(e.message ?? e)))) throw e;
      results.push(`info ${name}: the browser's tab crashed; tried again in a new tab`);
      await newTab();
      await fn();
    }
    results.push(`ok   ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}\n     ${String(e.message ?? e).split("\n").slice(0, 6).join("\n     ")}`);
  }
}

// ---- a made-up Orgo: who the made-up key is, and empty answers for the rest ------------------------------------------
const orgo = createServer((req, res) => {
  const j = (x, s = 200) => (res.writeHead(s, { "content-type": "application/json" }), res.end(JSON.stringify(x)));
  req.resume();
  req.on("end", () => {
    const p = (req.url ?? "").split("?")[0];
    if (p === "/api/user/profile") return j({ id: "u_pc", email: "kevin@example.test", full_name: "Kevin Test" });
    if (p === "/api/cli/auth/start") return j({ device_code: "dev_fake", user_code: "ABCD-EFGH", verification_uri: "http://127.0.0.1/cli/approve", interval_seconds: 1, expires_in_seconds: 600 });
    if (p === "/api/cli/auth/poll") return j({ status: "approved", api_key: "sk_orgo_fake_pc", user: { id: "u_pc", email: "kevin@example.test" } });
    if (p === "/api/secrets" && req.method === "GET") return j({ secrets: [] });
    if (p === "/api/workspaces") return j([]);
    if (/computers|projects/.test(p) && req.method === "GET") return j({ computers: [], projects: [] });
    return j({ error: "made-up orgo: not here" }, 404);
  });
});
await new Promise((ok) => orgo.listen(0, "127.0.0.1", ok));
const orgoPort = orgo.address().port;

// ---- the scratch folder: the repo's files linked in, its own .data with made-up bots and chats -----------------------
const dir = mkdtempSync(join(tmpdir(), "bops-blank-"));
for (const name of readdirSync(root)) if (name !== ".data" && !name.startsWith(".env") && name !== ".git") symlinkSync(join(root, name), join(dir, name));
mkdirSync(join(dir, "home"));
const now = Date.now();
const H = 3600e3;
const user = "u_pc";
mkdirSync(join(dir, ".data", "users", user), { recursive: true });
writeFileSync(
  join(dir, ".data", "users", user, "state.json"),
  JSON.stringify({
    host: "orgo",
    account: { user: { id: user, email: "kevin@example.test", name: "Kevin Test" } },
    owner: { name: "Kevin Test", timeZone: "America/Chicago" },
    workspaces: [{ id: "ws_main", name: "Main", createdAt: now - 30 * 24 * H }],
    workspace: "ws_main",
    bots: [
      { id: "boppy", name: "Boppy", role: "Chief of staff", color: "#E9FF3B", isMain: true, computerStatus: "none", workspaceId: "ws_main" },
      { id: "rook", name: "Rook", role: "Recruiting", color: "#47C46B", isMain: false, computer: "shared", computerStatus: "none", workspaceId: "ws_main" },
    ],
    chats: [
      { id: "bot:boppy", kind: "bot", botIds: ["boppy"], createdAt: now - 5 * H, typing: [], workspaceId: "ws_main" },
      { id: "bot:rook", kind: "bot", botIds: ["rook"], createdAt: now - 4 * H, typing: [], workspaceId: "ws_main" },
      { id: "c_team", kind: "group", title: "Launch crew", botIds: ["boppy", "rook"], createdAt: now - 2 * H, typing: [], workspaceId: "ws_main" },
    ],
    messages: [
      { id: "m1", chatId: "bot:boppy", role: "user", text: "Morning! What's on my plate today?", at: now - 5 * H },
      { id: "m2", chatId: "bot:boppy", role: "bot", botId: "boppy", text: "Three things:\n\n1. **Reply to Dana** about the Q4 plan\n2. Review the hiring pipeline", at: now - 5 * H + 60e3 },
      { id: "m4", chatId: "c_team", role: "user", text: "Team, let's plan the launch.", at: now - 2 * H },
    ],
    sessions: [],
    routines: [{ id: "r_daily", botId: "boppy", title: "Morning brief", goal: "Send me a summary of my day", schedule: { kind: "weekdays", time: "08:00" }, enabled: true, createdAt: now - 20 * 24 * H, run: "chat" }],
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

// ---- the server, as Kevin's PC runs it: self-hosted, the desktop window's token, and no texting, email, memory or Composio key
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
    ORGO_API_KEY: "sk_orgo_fake_pc",
    BOPS_ORGO_ORIGIN: `http://127.0.0.1:${orgoPort}`,
    NEXT_TELEMETRY_DISABLED: "1",
    BOPS_TELEMETRY: "0",
    // Named empty so nothing from a shell leaks in: no AgentPhone (texting), AgentMail (email), Honcho (memory), Composio.
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
  const ok = await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false);
  if (ok) break;
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

// ---- the browser: the owner's window, 1280x800 -------------------------------------------------------------------
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "bops_window", value: token, url: BASE }]);
/** Requests the page made past this computer (refused): listed at the end, never counted as the page's own errors. */
const offMachine = new Set();
/** A pause put on one /api path (to see a screen while it's still asking). */
let hold = null;
await ctx.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (!(u.hostname === "127.0.0.1" || u.protocol === "data:" || u.protocol === "blob:")) {
    offMachine.add(u.hostname);
    return route.abort("blockedbyclient");
  }
  if (hold && u.pathname === hold.path) await hold.until;
  // The server runs on Linux here; Kevin's runs on Windows. The window words its places by the server's platform.
  if (u.pathname === "/api/config") {
    const r = await route.fetch();
    const j = await r.json().catch(() => ({}));
    return route.fulfill({ response: r, json: { ...j, platform: "win32" } });
  }
  return route.continue();
});
let seen = { errors: [], api5xx: [] };
/**
 * The tab every screen is looked at in. Headless Chromium's renderer can crash on this machine (out of memory, not
 * the app: it shows as "Target crashed" with no page error first); then a new tab takes its place, and the screen it
 * crashed on is tried once more (check, above), so one crash doesn't fail every screen after it.
 */
let page;
let crashed = false;
async function newTab() {
  if (page && !page.isClosed()) await page.close().catch(() => {});
  page = await ctx.newPage();
  crashed = false;
  page.on("crash", () => (crashed = true));
  page.on("pageerror", (e) => seen.errors.push(`threw: ${String(e).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/ERR_BLOCKED_BY_CLIENT/.test(t)) return; // our own refusal of the internet, above
    const at = m.location()?.url ? ` (${new URL(m.location().url).pathname})` : "";
    // An app's logo is fetched from the web by the server, refused here (the preload): a 404 the page draws a letter for.
    if (/status of 404/.test(t) && /\/api\/apps\/logo\//.test(at)) return;
    seen.errors.push(`console: ${t.slice(0, 200)}${at}`);
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && r.status() >= 500) seen.api5xx.push(`${r.status()} ${r.request().method()} ${u.pathname}`);
  });
}
await newTab();

const shots = process.env.SHOTS || "/tmp/claude-0/qa-shots";
mkdirSync(shots, { recursive: true });

/** What a screen's pane holds: its visible text past its header, its visible controls, disabled buttons with no reason near. */
const LOOK = ([sel, headSel]) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const shown = (n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    return r.width >= 2 && r.height >= 2 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0" && !n.closest("[aria-hidden=true]");
  };
  const text = (el.innerText || "").replace(/\s+/g, " ").trim();
  const head = headSel ? (el.querySelector(headSel)?.innerText ?? "").replace(/\s+/g, " ").trim() : "";
  const under = head && text.startsWith(head) ? text.slice(head.length).trim() : text.replace(head, "").trim();
  const controls = [...el.querySelectorAll("button, a[href], input, select, textarea, [role=button], [role=switch], [role=tab]")].filter(shown);
  const quiet = [];
  for (const b of controls) {
    if (!(b.disabled || b.getAttribute("aria-disabled") === "true")) continue;
    if (b.title || b.dataset.tip || b.getAttribute("aria-describedby")) continue;
    // Words near it, past its own: its row (two parents up).
    const near = (b.parentElement?.parentElement?.innerText ?? "").replace(b.innerText, "").replace(/\s+/g, " ").trim();
    if (near.length < 12) quiet.push((b.getAttribute("aria-label") || b.innerText || "a button").trim().slice(0, 40));
  }
  const overlay = !!document.querySelector("nextjs-portal") || /Application error: a client-side exception/.test(document.body.innerText);
  return { text, under, controls: controls.length, quiet, overlay };
};
// Raw error words a person should never read: a fetch's own failure, a server's stack, JSON that didn't parse.
const BAD = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /\{"/, /fetch failed/i, /Failed to fetch/, /NetworkError/, /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/, /Internal Server Error/, /Unexpected token/, /is not valid JSON/, /\bTypeError\b/, /\bSyntaxError\b/];

/** One screen, judged: what `sel` holds (past `head`), and what the page did meanwhile. */
async function judge(name, sel, head) {
  // Wait out what's still loading ("Checking", "Loading") for up to 8 seconds, as a person would.
  for (let i = 0; i < 16; i++) {
    const t = await page.evaluate((s) => document.querySelector(s)?.innerText ?? "", sel);
    if (!/^\s*(Checking|Loading)\b|Loading…/m.test(t)) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, `${name}.png`) });
  const m = await page.evaluate(LOOK, [sel, head]);
  assert.ok(m, `${name}: ${sel} isn't on the page`);
  const allow = ALLOW[name] ?? {};
  const problems = [];
  if (m.under.length < 20) problems.push(`(a) blank: only ${JSON.stringify(m.under)} under its header`);
  if (!m.controls && !allow.controls) problems.push("(a) no visible control");
  for (const re of BAD) {
    const hit = m.text.match(re);
    if (hit) problems.push(`(b) shows ${JSON.stringify(m.text.slice(Math.max(0, hit.index - 30), hit.index + 30))}`);
  }
  if (m.overlay) problems.push("(b) an error page or overlay");
  for (const e of seen.errors) problems.push(`(c) ${e}`);
  for (const e of seen.api5xx) problems.push(`(c) /api answered ${e}`);
  for (const q of m.quiet) warnings.push(`warn ${name}: (d) "${q}" is disabled with nothing near it saying why`);
  assert.deepEqual(problems, [], `${name}`);
}

/** One wait, with its own timeout, failing with what it was waiting for (not just "Timeout exceeded"). */
async function step(label, ms, fn) {
  try {
    return await fn(ms);
  } catch (e) {
    throw new Error(`waiting for ${label} (${ms} ms): ${String(e.message ?? e).split("\n")[0]}`);
  }
}

/**
 * The window, loaded afresh and ready: the page, the sidebar, the state's first answer, and the account button that
 * opens Settings (no fixed sleep: each is waited for, each with its own timeout).
 */
async function fresh() {
  seen = { errors: [], api5xx: [] };
  if (crashed || page.isClosed()) await newTab();
  const stateRead = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/state" && r.request().method() === "GET", { timeout: 30000 }).catch(() => null);
  await step("the page to load", 30000, (ms) => page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: ms }));
  await step("the sidebar", 30000, (ms) => page.locator("aside").first().waitFor({ state: "visible", timeout: ms }));
  await stateRead;
  await step("the account button", 15000, (ms) => button(/team, account and settings/, false).waitFor({ state: "visible", timeout: ms }));
  await step("the page to settle", 10000, (ms) => page.waitForLoadState("load", { timeout: ms }));
}
const button = (name, exact = true) => page.getByRole("button", { name, exact }).first();
const row = (name) => page.locator("aside button").filter({ hasText: new RegExp(`^\\s*${name}`) }).first();
/** Settings, from the account menu: tried again (up to three times) when a click lands before the menu is ready. */
async function openSettings() {
  const nav = page.locator('nav[aria-label="Settings"]');
  for (let i = 1; ; i++) {
    try {
      await step("the account menu's button", 10000, (ms) => button(/team, account and settings/, false).click({ timeout: ms }));
      await step("the account menu's Settings", 5000, (ms) => page.getByRole("menuitem", { name: "Settings", exact: true }).first().click({ timeout: ms }));
      await step("Settings to open", 5000, (ms) => nav.waitFor({ state: "visible", timeout: ms }));
      return;
    } catch (e) {
      if (i >= 3) throw new Error(`Settings didn't open after ${i} tries: ${e.message}`);
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
}

try {
  // ---- Settings: every place in its nav ----------------------------------------------------------------------------
  await fresh();
  await openSettings();
  // Some places come in once their own read answers (Your phone, after /api/remote): read the nav once it has held
  // still for a second (at most 8 seconds), not at the first paint.
  await step("Settings' nav to settle", 8000, async (ms) => {
    let last = -1;
    let still = 0;
    for (const end = Date.now() + ms; Date.now() < end; ) {
      const n = await page.locator("[data-settings-nav]").count();
      still = n === last ? still + 1 : 0;
      last = n;
      if (still >= 4) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`still changing (${last} places)`);
  });
  const places = await page.locator("[data-settings-nav]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-settings-nav"), e.innerText.trim().split("\n")[0]]));
  results.push(`info Settings' nav here: ${places.map(([, n]) => n).join(", ")}`);
  await check("Settings' nav names This PC (a Windows PC's words)", async () => {
    assert.ok(places.some(([id, n]) => id === "mac" && /This PC/.test(n)), `This Mac's place is named ${JSON.stringify(places.find(([id]) => id === "mac")?.[1])}`);
  });
  for (const [p, label] of places)
    await check(`Settings, ${label}`, async () => {
      await fresh();
      await openSettings();
      // Logins reads Composio's accounts again as it opens (PATCH /api/apps): wait for that answer, and its page.
      const synced = p === "logins" ? page.waitForResponse((r) => new URL(r.url()).pathname === "/api/apps" && r.request().method() === "PATCH", { timeout: 20000 }) : null;
      await step(`${label} in the nav`, 10000, (ms) => page.locator(`[data-settings-nav="${p}"]`).click({ timeout: ms }));
      await step(`the ${label} pane`, 15000, (ms) => page.locator(`main[data-settings-pane="${p}"]`).waitFor({ state: "visible", timeout: ms }));
      if (synced) {
        await step("the Logins page", 15000, (ms) => page.locator("[data-logins]").waitFor({ state: "visible", timeout: ms }));
        await step("PATCH /api/apps to answer", 20000, () => synced);
      }
      await judge(`settings-${p}`, `main[data-settings-pane="${p}"]`, "[data-pane-head]");
    });

  // Logins' Connect, An app: with no Composio key, it says what it takes (never an empty list to search).
  await check("Settings, Logins, Connect an app", async () => {
    await fresh();
    await openSettings();
    await page.locator('[data-settings-nav="logins"]').click();
    await step("the Logins page", 15000, (ms) => page.locator("[data-logins]").waitFor({ state: "visible", timeout: ms }));
    await button("Connect").click();
    await page.getByRole("button", { name: /^An app/ }).click();
    await page.locator("[data-app-picker]").waitFor({ state: "visible" });
    await judge("settings-logins-connect-app", "[data-app-picker]");
  });

  // Each "not set up yet" note opens Settings, Services at its own row, with the cursor in that row's key box.
  const landsOn = async (id) => {
    const pane = page.locator('main[data-settings-pane="services"]');
    await pane.waitFor({ state: "visible" });
    const row = pane.locator(`#service-${id}`);
    await row.waitFor({ state: "visible" });
    await page.waitForFunction((rid) => document.activeElement?.closest(`#service-${rid}`) != null, id, { timeout: 5000 });
    assert.ok(await row.locator("input").first().isVisible(), `${id}: its key box is there`);
  };
  for (const [id, label] of [["phone", "Set up texting"], ["mail", "Set up email"]])
    await check(`Settings, How bots reach you: "${label}" opens Services at its row`, async () => {
      await fresh();
      await openSettings();
      await page.locator('[data-settings-nav="reach"]').click();
      await page.getByRole("button", { name: label, exact: true }).click();
      await landsOn(id);
    });
  await check("Settings, Email and phone: its note opens Services at texting's row", async () => {
    await fresh();
    await openSettings();
    await page.locator('[data-settings-nav="email"]').click();
    await page.locator('main[data-settings-pane="email"] [data-open-service="phone"]').first().click();
    await landsOn("phone");
  });
  await check("Settings, This PC: the Phone card's Set up texting opens Services at its row", async () => {
    await fresh();
    await openSettings();
    await page.locator('[data-settings-nav="mac"]').click();
    await page.locator('main[data-settings-pane="mac"]').getByRole("button", { name: "Set up texting", exact: true }).click();
    await landsOn("phone");
  });
  await check("Settings, Logins, Connect an app: Add a Composio key opens Services at its row", async () => {
    await fresh();
    await openSettings();
    await page.locator('[data-settings-nav="logins"]').click();
    await step("the Logins page", 15000, (ms) => page.locator("[data-logins]").waitFor({ state: "visible", timeout: ms }));
    await button("Connect").click();
    await page.getByRole("button", { name: /^An app/ }).click();
    await page.locator("[data-app-picker] [data-open-service=apps]").click();
    await landsOn("apps");
  });
  await check("Boppy's profile, Memory: Add a Honcho key opens Services at its row", async () => {
    await fresh();
    await row("Boppy").click();
    await button("Boppy's profile").click();
    await page.locator("section[data-panel]").getByRole("button", { name: /^Memory$/i }).first().click();
    await page.locator("[data-memory-off] [data-open-service=memory]").click();
    await landsOn("memory");
  });
  // Services, the whole pane at the desktop width (every row, and what isn't built yet).
  await check("Settings, Services: every row, the whole pane", async () => {
    await fresh();
    await openSettings();
    await page.locator('[data-settings-nav="services"]').click();
    const pane = page.locator('main[data-settings-pane="services"]');
    await pane.locator("[data-service]").first().waitFor({ state: "visible" });
    const rows = await pane.locator("[data-service]").evaluateAll((els) => els.map((e) => e.getAttribute("data-service")));
    assert.deepEqual(rows, ["phone", "mail", "memory", "apps", "composio-account", "zapier"]);
    assert.ok((await pane.locator("[data-in-progress]").count()) >= 1, "what isn't built yet shows as in progress");
    // A tall window, so one picture holds the whole pane (an element shot of a scrolling pane cuts off).
    await page.setViewportSize({ width: 1280, height: 2300 });
    try {
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(shots, "settings-services-full.png") });
    } finally {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
  });
  // Services at a phone's width (412 wide): every row and its boxes fit, nothing scrolls sideways.
  await check("Settings, Services at 412 wide", async () => {
    await page.setViewportSize({ width: 412, height: 915 });
    try {
      await fresh();
      await button(/team, account and settings/, false).click();
      await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
      await page.locator('[data-settings-nav="services"]').click();
      await page.locator('main[data-settings-pane="services"] [data-service]').first().waitFor({ state: "visible" });
      await judge("settings-services-412", 'main[data-settings-pane="services"]', "[data-pane-head]");
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(wide <= 0, `the page scrolls sideways by ${wide}px`);
      await page.setViewportSize({ width: 412, height: 3000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(shots, "settings-services-412-full.png") });
    } finally {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
  });

  // How bots reach you while the server hasn't answered yet: "Checking", not a blank pane.
  await check("Settings, How bots reach you, while it's still asking: says Checking", async () => {
    await fresh();
    let let_go;
    hold = { path: "/api/phone", until: new Promise((ok) => (let_go = ok)) };
    try {
      await openSettings();
      await page.locator('[data-settings-nav="reach"]').click();
      const pane = page.locator('main[data-settings-pane="reach"]');
      await pane.getByText("Checking", { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
      await page.screenshot({ path: join(shots, "settings-reach-checking.png") });
    } finally {
      let_go();
      hold = null;
    }
  });

  // ---- the main screens --------------------------------------------------------------------------------------------
  for (const [name, title] of [
    ["Boppy", "chat-bot"],
    ["Launch crew", "chat-group"],
  ])
    await check(`Chat: ${name}`, async () => {
      await fresh();
      await row(name).click();
      await page.locator("#composer").waitFor({ state: "visible" });
      await judge(title, "main");
    });

  const PANEL = "section[data-panel]";
  for (const [title, go] of [
    ["panel-computer", async () => (await row("Boppy").click(), await page.getByText("Boppy's computer", { exact: true }).first().click())],
    ["panel-profile", async () => (await row("Boppy").click(), await button("Boppy's profile").click())],
    ["panel-new-tab", async () => (await row("Boppy").click(), await button("New tab").click())],
    ["routines", async () => await button("Routines").click()],
    ["skills", async () => (await button("Routines").click(), await page.waitForTimeout(300), await button("Skills").click())],
    ["knowledge", async () => await button("Knowledge").click()],
    ["issues", async () => await row("Issues").click()],
  ])
    await check(`Panel: ${title}`, async () => {
      await fresh();
      await go();
      await page.waitForTimeout(400);
      await judge(title, PANEL);
    });

  // A bot's profile's own tabs (Memory reads the memory service, which isn't set up here).
  for (const tab of ["Skills", "Routines", "Memory"])
    await check(`Panel: Boppy's profile, ${tab}`, async () => {
      await fresh();
      await row("Boppy").click();
      await button("Boppy's profile").click();
      await page.locator(PANEL).getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).first().click();
      await page.waitForTimeout(500);
      await judge(`panel-profile-${tab.toLowerCase()}`, PANEL);
    });

  await check("New chat or bot", async () => {
    await fresh();
    await button("New chat or bot").click();
    await page.getByRole("button", { name: /Create new bot/ }).waitFor({ state: "visible" });
    await judge("new-chat", "main");
  });

  // A bot's settings page, and each of its sections opened.
  let sections = [];
  await check("A bot's settings page", async () => {
    await fresh();
    await openSettings();
    await page.locator('[data-settings-nav="bots"]').click();
    await button("Open settings").click();
    await page.locator("[data-bot-settings]").waitFor({ state: "visible" });
    sections = await page.locator("[data-bot-settings] [data-nav]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-nav"), e.innerText.trim()]));
    await judge("bot-page", "[data-bot-settings]");
  });
  for (const [s, label] of sections)
    await check(`A bot's settings, ${label}`, async () => {
      await fresh();
      await openSettings();
      await page.locator('[data-settings-nav="bots"]').click();
      await button("Open settings").click();
      await page.locator("[data-bot-settings]").waitFor({ state: "visible" });
      await page.locator(`[data-bot-settings] [data-nav="${s}"]`).click();
      await page.waitForTimeout(500);
      await judge(`bot-section-${s}`, `[data-bot-settings] #settings-${s}`, "button[aria-expanded]");
    });
} finally {
  console.log(results.join("\n"));
  if (warnings.length) console.log(warnings.join("\n"));
  if (offMachine.size) console.log(`info refused off this computer: ${[...offMachine].sort().join(", ")}`);
  console.log(`info screenshots in ${shots}`);
  await browser.close();
  await stop();
}

const n = results.filter((r) => !r.startsWith("info")).length;
console.log(failed ? `\n${failed} failed` : `\nall ${n} passed${warnings.length ? ` (${warnings.length} warnings)` : ""}`);
process.exit(failed ? 1 : 0);

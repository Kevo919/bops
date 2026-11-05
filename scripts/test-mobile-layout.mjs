// The web UI in a narrow window (a phone: the Android app is a WebView of this page), against the real built app:
// - at 412x915 (a paired phone's cookie, a phone's user agent and touch), every main screen can be reached from the list of
//   chats, takes the whole width, and the page never scrolls sideways: the list, a bot's chat and a group chat (and the
//   chat's More menu), the side panel (the chat's computer, a bot's profile, New tab), Routines and Skills, Knowledge,
//   Issues, New chat or bot, Settings' nav and every place in it, and a bot's settings page with its sections;
// - each has its way back (the chat to the list, the panel to the chat, a Settings place to its nav, Settings and a bot's
//   page to where they opened from; the panel to the list when it opened from there), at least 40 px square, and no control of the screen lies past the window's edge;
// - the page asks to go edge to edge (viewport-fit=cover) and keeps clear of a notch (env(safe-area-inset-*));
// - at 1280x800 (the owner's window, as the Windows app opens it) it is the three columns as before: the sidebar 340 px
//   beside the chat and the panel, Settings' nav 240 px beside its place, nothing narrow.
//
// It runs the production build (`npx next build` first; it is not built here) with `next start` in a scratch folder (its
// own .data, HOME and UI token, every other file of the repo linked in), a made-up Orgo on 127.0.0.1 for the sign in, and
// made-up bots and chats. Nothing leaves this computer: the server's sockets off loopback are refused (a preload), and so
// are the browser's requests. Needs Playwright's Chromium (`npx playwright install chromium`, or PLAYWRIGHT_CHROMIUM=<path>).
// Usage: node scripts/test-mobile-layout.mjs   (SHOTS=<dir> also saves a screenshot of each screen there)
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
const dir = mkdtempSync(join(tmpdir(), "bops-mobile-"));
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
async function context(kind) {
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
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

/** What a narrow screen must be: no sideways scroll, nothing of it past the window's edges (but in a row that scrolls sideways). */
const MEASURE = () => {
  const W = innerWidth;
  const se = document.scrollingElement;
  const past = [];
  for (const el of document.querySelectorAll("button, a[href], [role=button], [role=tab], input, select, textarea")) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0" || el.closest("[inert],[aria-hidden=true]")) continue;
    if (r.bottom <= 0 || r.top >= innerHeight) continue;
    let sideways = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/(auto|scroll)/.test(o.overflowX) && p.scrollWidth > p.clientWidth + 1) sideways = true;
    }
    if (sideways) continue;
    // Clipped out of sight by a column (the old layout's way of hiding what didn't fit) counts as past the edge too.
    let right = Math.min(r.right, W);
    let left = Math.max(r.left, 0);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(o.overflowX)) {
        const q = p.getBoundingClientRect();
        right = Math.min(right, q.right);
        left = Math.max(left, q.left);
      }
    }
    if (r.right > W + 1 || r.left < -1 || right - left < Math.min(r.width, 8) - 0.5)
      past.push(`${(el.getAttribute("aria-label") || el.innerText || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
  }
  return { W, scroll: Math.max(se.scrollWidth, document.body.scrollWidth), past: past.slice(0, 8), narrow: document.querySelector("[data-narrow]")?.getAttribute("data-narrow") ?? null };
};

async function open(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
}
async function settle(page) {
  await page.waitForTimeout(450);
}
/** The screen as it should be at this width: no sideways scroll, nothing past the edge. */
async function wellLaid(page, name) {
  const m = await page.evaluate(MEASURE);
  assert.ok(m.scroll <= m.W + 1, `${name}: the page scrolls sideways (${m.scroll}px in a ${m.W}px window)`);
  assert.deepEqual(m.past, [], `${name}: controls past the window's edge`);
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
  return m;
}
/** A control at least 40 px square (a thumb's). */
async function thumbSized(loc, what) {
  const b = await loc.boundingBox();
  assert.ok(b, `${what}: not on screen`);
  assert.ok(b.width >= 40 && b.height >= 40, `${what}: ${Math.round(b.width)}x${Math.round(b.height)}, under 40 px`);
}
const fullWidth = async (loc, W, what) => {
  const b = await loc.boundingBox();
  assert.ok(b && b.x <= 1 && b.width >= W - 2, `${what}: ${b ? `${Math.round(b.x)}+${Math.round(b.width)}` : "not shown"}, not the window's width`);
};

try {
  // ---- the phone, 412 px ----------------------------------------------------------------------------------------
  const { page, errors } = await context("phone");
  const W = 412;
  const row = (name) => page.locator("aside button").filter({ hasText: new RegExp(`^\\s*${name}`) }).first();
  const button = (name, exact = true) => page.getByRole("button", { name, exact }).first();
  const backToChats = page.locator('[data-narrow-back][aria-label="Back to chats"]').filter({ visible: true });
  const backToChat = page.locator('[data-narrow-back][aria-label="Back to the chat"]').filter({ visible: true });
  const openSettings = async () => {
    await button(/team, account and settings/, false).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
    await settle(page);
  };

  await check("phone: the page goes edge to edge, clear of a notch", async () => {
    await open(page);
    const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
    assert.match(meta ?? "", /width=device-width/);
    assert.match(meta ?? "", /viewport-fit=cover/);
    const cls = await page.locator("[data-narrow]").getAttribute("class");
    for (const side of ["top", "bottom", "left", "right"]) assert.match(cls ?? "", new RegExp(`safe-area-inset-${side}`), `no safe-area-inset-${side}`);
  });

  await check("phone: the list of chats is the whole window", async () => {
    await open(page);
    const m = await wellLaid(page, "phone-list");
    assert.equal(m.narrow, "list");
    await fullWidth(page.locator("aside").first(), W, "the sidebar");
    for (const b of ["Search", "New chat or bot"]) await thumbSized(button(b), b);
    // No title bar with tabs beside it, no sidebar collapse: one column.
    assert.equal(await page.getByRole("button", { name: "Collapse the sidebar" }).count(), 0);
  });

  for (const [name, title] of [
    ["Boppy", "a bot's chat"],
    ["Launch crew", "a group chat"],
  ])
    await check(`phone: ${title} (${name}) takes the window, Back goes to the list`, async () => {
      await open(page);
      await row(name).click();
      await settle(page);
      const m = await wellLaid(page, `phone-chat-${name.replace(/\s/g, "-").toLowerCase()}`);
      assert.equal(m.narrow, "chat");
      assert.equal(await page.locator("aside").first().isVisible(), false, "the list is still in sight");
      await fullWidth(page.locator("main").first(), W, "the chat");
      await page.locator("#composer").waitFor({ state: "visible" });
      const box = await page.locator("#composer").boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= W, "the message box is past the edge");
      await thumbSized(backToChats, "Back to chats");
      await backToChats.click();
      await settle(page);
      assert.equal(await page.locator("aside").first().isVisible(), true, "Back didn't go to the list");
    });

  await check("phone: the chat's More menu opens inside the window", async () => {
    await open(page);
    await row("Boppy").click();
    await settle(page);
    await button("More").click();
    await settle(page);
    await page.getByRole("menuitem", { name: /Select messages/ }).waitFor({ state: "visible" });
    await wellLaid(page, "phone-chat-more");
  });

  await check("phone: the side panel is a screen of its own (the chat's computer), Back goes to the chat", async () => {
    await open(page);
    await row("Boppy").click();
    await settle(page);
    await button(/^Boppy's computer/, false).click();
    await settle(page);
    const m = await wellLaid(page, "phone-panel-computer");
    assert.equal(m.narrow, "panel");
    assert.equal(await page.locator("main").first().isVisible(), false, "the chat is still beside it");
    await thumbSized(backToChat, "Back to the chat");
    await thumbSized(button("New tab"), "New tab");
    await backToChat.click();
    await settle(page);
    assert.equal(await page.locator("#composer").isVisible(), true, "Back didn't go to the chat");
  });

  await check("phone: New tab and a bot's profile in the panel", async () => {
    await open(page);
    await row("Boppy").click();
    await settle(page);
    await button(/^Boppy's computer/, false).click();
    await settle(page);
    await button("New tab").click();
    await settle(page);
    await page.getByPlaceholder(/Search Google or type a URL/).waitFor({ state: "visible" });
    await wellLaid(page, "phone-panel-new-tab");
    await backToChat.click();
    await settle(page);
    await button("Boppy's profile").click();
    await settle(page);
    assert.equal((await page.evaluate(MEASURE)).narrow, "panel");
    await page.getByText(/^details$/i).filter({ visible: true }).first().waitFor({ state: "visible" });
    await wellLaid(page, "phone-panel-profile");
  });

  await check("phone: Routines and its Skills, from the list", async () => {
    await open(page);
    await button("Routines").click();
    await settle(page);
    assert.equal((await page.evaluate(MEASURE)).narrow, "panel");
    await page.getByText("Morning brief").first().waitFor({ state: "visible" });
    await wellLaid(page, "phone-routines");
    await button("Skills").click();
    await settle(page);
    await wellLaid(page, "phone-skills");
    // Opened from the list, its Back goes to the list.
    await thumbSized(backToChats, "the panel's Back to chats");
    await backToChats.click();
    await settle(page);
    assert.equal(await page.locator("aside").first().isVisible(), true, "Back didn't go to the list");
  });

  for (const [what, go] of [
    ["Knowledge", () => button("Knowledge").click()],
    ["Issues", () => row("Issues").click()],
  ])
    await check(`phone: ${what}, from the list`, async () => {
      await open(page);
      await go();
      await settle(page);
      assert.equal((await page.evaluate(MEASURE)).narrow, "panel");
      await wellLaid(page, `phone-${what.toLowerCase()}`);
    });

  await check("phone: New chat or bot, then Cancel back to the list", async () => {
    await open(page);
    await button("New chat or bot").click();
    await settle(page);
    await page.getByRole("button", { name: /Create new bot/ }).waitFor({ state: "visible" });
    await wellLaid(page, "phone-new-chat");
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await settle(page);
    assert.equal(await page.locator("aside").first().isVisible(), true, "Cancel didn't go to the list");
  });

  // Settings: its nav, then each place in it full width, Back to the nav; Back from the nav to the list.
  let places = [];
  await check("phone: Settings opens at its nav, the whole window", async () => {
    await open(page);
    await openSettings();
    const nav = page.locator('nav[aria-label="Settings"]');
    await nav.waitFor({ state: "visible" });
    await fullWidth(nav, W, "Settings' nav");
    assert.equal(await page.locator("main[data-settings-pane]").isVisible(), false, "a place is beside the nav");
    await wellLaid(page, "phone-settings");
    places = await page.locator("[data-settings-nav]").evaluateAll((els) => els.map((e) => e.getAttribute("data-settings-nav")));
    assert.ok(places.length >= 10, `only ${places.length} places in the nav`);
    for (const p of places) await thumbSized(page.locator(`[data-settings-nav="${p}"]`), `Settings' ${p}`);
    await thumbSized(page.locator("[data-settings-back]"), "Settings' Back");
    await page.locator("[data-settings-back]").click();
    await settle(page);
    assert.equal(await page.locator("[data-settings]").count(), 0, "Back didn't leave Settings");
  });
  for (const p of places)
    await check(`phone: Settings, ${p}: full width, Back to the nav`, async () => {
      await open(page);
      await openSettings();
      await page.locator(`[data-settings-nav="${p}"]`).click();
      await settle(page);
      const pane = page.locator(`main[data-settings-pane="${p}"]`);
      await pane.waitFor({ state: "visible" });
      await fullWidth(pane, W, `Settings' ${p}`);
      assert.equal(await page.locator('nav[aria-label="Settings"]').isVisible(), false, "the nav is beside the place");
      await wellLaid(page, `phone-settings-${p}`);
      await thumbSized(page.locator("[data-settings-pane-back]"), "Back to Settings");
      await page.locator("[data-settings-pane-back]").click();
      await settle(page);
      assert.equal(await page.locator('nav[aria-label="Settings"]').isVisible(), true, "Back didn't go to the nav");
    });

  await check("phone: a bot's settings page, its sections a row of chips, Back to where it opened from", async () => {
    await open(page);
    await openSettings();
    await page.locator('[data-settings-nav="bots"]').click();
    await settle(page);
    await page.getByRole("button", { name: "Open settings", exact: true }).nth(1).click();
    await settle(page);
    const pageEl = page.locator("[data-bot-settings]");
    await pageEl.waitFor({ state: "visible" });
    await fullWidth(pageEl, W, "the bot's page");
    await wellLaid(page, "phone-bot-page");
    await thumbSized(page.locator("[data-bot-settings] [data-back]"), "the bot page's Back");
    await thumbSized(page.locator("[data-bot-settings] [data-close]"), "the bot page's close");
    const sections = page.locator("[data-bot-settings] [data-nav]");
    assert.ok((await sections.count()) >= 4, "no sections");
    await sections.nth(2).click();
    await settle(page);
    await wellLaid(page, "phone-bot-page-section");
    await page.locator("[data-bot-settings] [data-back]").click();
    await settle(page);
    assert.equal(await page.locator("[data-bot-settings]").count(), 0, "Back didn't leave the page");
  });

  await check("phone: nothing threw", async () => assert.deepEqual(errors, []));

  // ---- the owner's window, 1280 px: as before ----------------------------------------------------------------------
  const desk = await context("owner");
  await check("desktop 1280: three columns as before (sidebar 340 px, chat, panel), nothing narrow", async () => {
    const p = desk.page;
    await open(p);
    assert.equal(await p.locator("[data-narrow]").count(), 0);
    assert.equal(await p.locator("[data-narrow-back]").count(), 0);
    assert.equal(await p.locator("[data-panel-bar]").count(), 0);
    const aside = await p.locator("aside").first().boundingBox();
    assert.equal(Math.round(aside.width), 340);
    await p.locator("main").first().waitFor({ state: "visible" });
    await p.getByRole("button", { name: "New tab", exact: true }).waitFor({ state: "visible" });
    await p.getByRole("button", { name: /team, account and settings/ }).first().click();
    await p.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
    await settle(p);
    const nav = await p.locator('nav[aria-label="Settings"]').boundingBox();
    assert.equal(Math.round(nav.width), 240);
    assert.equal(await p.locator("main[data-settings-pane]").isVisible(), true, "the place isn't beside the nav");
    assert.equal(await p.locator("[data-settings-pane-back]").count(), 0);
    assert.deepEqual(desk.errors, []);
  });
} finally {
  console.log(results.join("\n"));
  await browser.close();
  await stop();
}

console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);

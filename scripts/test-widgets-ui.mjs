// The widgets in the real built app (components/app/widgets.tsx, Look.layout): Home and a page of the owner's open from
// the sidebar's Pages and draw every widget kind, none of them blank and nothing reading "undefined"; a kind that
// isn't one (left in the state) and a javascript: link are never drawn; Edit resizes, moves, adds and removes;
// a tab pinned to a page shows in the side panel; the window's Animations setting (Settings, Look) stops the
// motion classes when Off, and the system's reduced motion does too; dark works; a phone's window shows Home
// without scrolling sideways; and the server refuses a paired phone's change and a script link. Screenshots of
// each screen go to SHOTS (default /tmp/claude-0/widget-shots).
//
// The harness is scripts/test-mobile-layout.mjs's: the production build (`npx next build` first) with `next start`
// in a scratch folder, a made-up Orgo on 127.0.0.1, made-up bots, and nothing leaves this computer.
// Usage: node scripts/test-widgets-ui.mjs
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


// The owner's widgets as a bot would have left them (Look.layout): every kind on Home, a Rentals page, a tab for it.
const LAYOUT = {
  pages: [
    {
      id: "home",
      name: "Home",
      widgets: [
        { id: "w_clock", kind: "clock", size: "small" },
        { id: "w_chi", kind: "clock", size: "small", title: "Chicago", timeZone: "America/Chicago" },
        { id: "w_note", kind: "note", size: "medium", text: "Call the plumber about 430 Echo before Friday." },
        { id: "w_routines", kind: "routines", size: "medium" },
        { id: "w_needs", kind: "needs-you", size: "small" },
        { id: "w_status", kind: "bot-status", size: "small", botId: "boppy" },
        { id: "w_ask", kind: "quick-ask", size: "medium", botId: "boppy" },
        { id: "w_links", kind: "links", size: "medium", links: [{ label: "Zillow", url: "https://www.zillow.com/" }, { label: "County taxes", url: "https://example.com/taxes" }, { label: "Bad one", url: "javascript:alert(1)" }] },
        { id: "w_count", kind: "counter", size: "small", title: "Showings", value: 3, step: 1 },
        { id: "w_check", kind: "checklist", size: "medium", title: "This week", items: [{ text: "Collect rent", done: true }, { text: "Fix the fence", done: false }, { text: "Renew insurance", done: false }] },
        { id: "w_count2", kind: "countdown", size: "small", title: "Closing day", date: new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10) },
        { id: "w_evil", kind: "script", size: "wide" },
        { id: "w_ghost", kind: "bot-status", size: "small", title: "Ghost", botId: "ghost" },
      ],
    },
    { id: "p_rent", name: "Rentals", widgets: [{ id: "w_rcheck", kind: "checklist", size: "wide", title: "Turnover", items: [{ text: "Paint unit 2", done: false }] }, { id: "w_rroutines", kind: "routines", size: "medium", botId: "rook" }] },
  ],
  tabs: [{ id: "t_rent", label: "Rentals", page: "p_rent" }],
};

// ---- the scratch folder: the repo's files linked in, its own .data with made-up bots and chats -----------------------
const dir = mkdtempSync(join(tmpdir(), "bops-widgets-ui-"));
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
    routines: [
      { id: "r_daily", botId: "boppy", title: "Morning brief", goal: "Send me a summary of my day", schedule: { kind: "weekdays", time: "08:00" }, enabled: true, createdAt: now - 20 * 24 * H, run: "chat", nextRunAt: now + 3 * H },
      { id: "r_rent", botId: "rook", title: "Check rent payments", goal: "Check who paid rent", schedule: { kind: "monthly", dayOfMonth: 2, time: "09:00" }, enabled: true, createdAt: now - 20 * 24 * H, run: "chat", nextRunAt: now + 30 * H },
    ],
    look: { current: { layout: LAYOUT }, history: [] },
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



const shots = process.env.SHOTS || "/tmp/claude-0/widget-shots";
mkdirSync(shots, { recursive: true });
async function open(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
}
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`) });
const look = (body) => fetch(`${BASE}/api/look`, { method: "POST", headers: owner, body: JSON.stringify(body) });
/** Nothing on the page reads as a gap: no "undefined", "NaN", "null" or "[object", and every widget has something in it. */
async function noBlanks(page, where) {
  const text = await page.locator("[data-widget-page], [data-widget-tab]").first().innerText();
  for (const bad of ["undefined", "NaN", "null", "[object"]) assert.ok(!text.includes(bad), `${where}: "${bad}" on the page`);
  const empty = await page.locator("[data-widget]").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 40 || !(e.innerText.trim() || e.querySelector("input, textarea, svg"))).map((e) => e.dataset.widget));
  assert.deepEqual(empty, [], `${where}: blank widgets`);
}
const MEASURE_SIDEWAYS = () => ({ W: innerWidth, scroll: document.scrollingElement.scrollWidth });

try {
  const desk = await context("owner");
  const p = desk.page;
  await check("Pages in the sidebar: Home and Rentals", async () => {
    await open(p);
    await p.locator("[data-pages-nav]").waitFor();
    assert.deepEqual(await p.locator("[data-page-row]").evaluateAll((els) => els.map((e) => e.innerText.split("\n")[0])), ["Home", "Rentals"]);
  });
  await check("Home draws every widget kind, none blank, no undefined; the bad kind and the javascript: link are never drawn", async () => {
    await p.locator('[data-page-row="home"]').click();
    await p.locator('[data-widget-page="home"]').waitFor();
    await settle(p, 700);
    const kinds = await p.locator("[data-widget]").evaluateAll((els) => els.map((e) => e.dataset.widget));
    assert.deepEqual(kinds, ["clock", "clock", "note", "routines", "needs-you", "bot-status", "quick-ask", "links", "counter", "checklist", "countdown", "bot-status"]);
    assert.match(await p.locator('[data-widget-id="w_ghost"]').innerText(), /That bot isn't in this workspace/, "a bot from elsewhere is said, not swapped for the main bot");
    await noBlanks(p, "Home");
    assert.equal(await p.locator('[data-widget="links"] a').count(), 2, "only the two good links");
    assert.equal(await p.locator('a[href^="javascript"]').count(), 0);
    assert.match(await p.locator('[data-widget="routines"]').innerText(), /Morning brief[\s\S]*Check rent payments/);
    assert.match(await p.locator('[data-widget="countdown"]').innerText(), /12[\s\S]*days until/);
    assert.match(await p.locator('[data-widget="checklist"]').innerText(), /1 of 3 done/);
    // Built and reviewed, not yet live tested: Pages is marked "Being tested" with its percent (lib/feature-status.ts).
    assert.match(await p.locator('[data-in-progress="widgets-by-chat"]').first().innerText(), /Being tested[\s\S]*85%/);
    await shot(p, "home-desktop");
  });
  await check("using a widget: the counter counts, the checklist ticks, kept", async () => {
    await p.getByRole("button", { name: "Add 1" }).click();
    await settle(p);
    assert.equal(await p.locator("[data-count]").innerText(), "4");
    await p.getByRole("checkbox", { name: "Fix the fence" }).click();
    await settle(p);
    assert.match(await p.locator('[data-widget="checklist"]').innerText(), /2 of 3 done/);
  });
  await check("Edit: resize, move, add and remove", async () => {
    await p.locator("[data-edit-widgets]").click();
    await settle(p);
    await shot(p, "home-edit");
    const cut = await p.locator("[data-widget-title]").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.innerText));
    assert.deepEqual(cut, [], "titles cut short in Edit");
    assert.equal(await p.locator('[data-widget-id="w_chi"] [data-widget-title]').innerText(), "CHICAGO");
    const first = p.locator("[data-widget]").first();
    await first.getByRole("button", { name: /^Wide size for / }).click();
    await settle(p);
    assert.match(await p.locator("[data-widget-grid] > div").first().getAttribute("class"), /col-span-4/);
    await p.locator("[data-widget]").first().getByRole("button", { name: /^Move .* later$/ }).click();
    await settle(p);
    assert.equal(await p.locator("[data-widget]").nth(1).getAttribute("data-widget-id"), "w_clock", "moved one later");
    const n = await p.locator("[data-widget]").count();
    await p.locator('[data-add-widget="countdown"]').click();
    await settle(p);
    assert.equal(await p.locator("[data-widget]").count(), n + 1, "added");
    const last = p.locator("[data-widget]").last();
    await last.getByRole("button", { name: /^Remove (?!.*for sure$)/ }).click();
    await last.getByRole("button", { name: /^Remove .* for sure$/ }).click();
    await settle(p);
    assert.equal(await p.locator("[data-widget]").count(), n, "removed");
    await p.locator("[data-edit-widgets]").click();
  });
  await check("a page of the owner's, and its pinned tab in the side panel", async () => {
    await p.locator('[data-page-row="p_rent"]').click();
    await p.locator('[data-widget-page="p_rent"]').waitFor();
    await settle(p);
    await noBlanks(p, "Rentals");
    await shot(p, "rentals-page");
    await p.getByRole("button", { name: "Close the page" }).click();
    await settle(p);
    await p.locator("div[title='Rentals']").first().click();
    await p.locator('[data-widget-tab="p_rent"]').waitFor();
    await settle(p);
    await noBlanks(p, "Rentals tab");
    await shot(p, "rentals-tab");
  });
  await check("the Undo in Settings takes back a change made on a page", async () => {
    const before = await fetch(`${BASE}/api/state`, { headers: owner }).then((r) => r.json());
    const r = await look({ action: "undo" });
    assert.equal((await r.json()).ok, true);
    const after = await fetch(`${BASE}/api/state`, { headers: owner }).then((r) => r.json());
    assert.notDeepEqual(after.state.look.current.layout, before.state.look.current.layout);
  });
  await check("Animations in Settings, Look: Off stops the motion classes, Normal plays them", async () => {
    await p.locator('[data-page-row="home"]').click();
    await p.locator('[data-widget-page="home"]').waitFor();
    const anim = () => p.locator("[data-widget-page] .motion-widget-in").first().evaluate((e) => getComputedStyle(e).animationName);
    assert.equal(await anim(), "widget-in");
    await p.getByRole("button", { name: /team, account and settings/ }).first().click();
    await p.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
    await settle(p);
    await p.locator("nav[aria-label='Settings']").getByText("Look", { exact: true }).click();
    await p.locator("[data-animations]").waitFor();
    await shot(p, "settings-look-animations");
    assert.match(await p.locator('[data-in-progress="animations-setting"]').innerText(), /Being tested[\s\S]*85%/);
    await p.locator("[data-animations]").getByRole("button", { name: "Off animations" }).click();
    await settle(p);
    const st = await fetch(`${BASE}/api/state`, { headers: owner }).then((r) => r.json());
    assert.equal(st.state.look.current.motion, "off");
    assert.equal(await p.locator("[data-animation-speed]").getByRole("button", { name: "Fast speed" }).isDisabled(), true, "speed waits while Off");
    await p.keyboard.press("Escape");
    await settle(p);
    assert.equal(await p.locator('[data-widget-page="home"]').count(), 1, "Esc closed Settings only, not the page under it");
    assert.equal(await anim(), "none", "Off: the widget's arrival doesn't play");
    const slide = await p.locator("[data-widget-page]").evaluate((e) => getComputedStyle(e.parentElement).transitionDuration);
    assert.equal(slide, "0s", "Off: the page's slide (a Tailwind duration-200) doesn't move either");
    await look({ action: "set", look: { motion: "lively", motion_speed: "slow" } });
    await settle(p, 900);
    assert.equal(await anim(), "widget-in");
    const time = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--motion-time").trim());
    assert.equal(time, "1.92", "lively and slow: 1.2 x 1.6");
  });
  await check("the system's reduced motion stops them, whatever the setting", async () => {
    const calm = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    await calm.addCookies([{ name: "bops_window", value: token, url: BASE }]);
    await calm.route("**/*", (route) => (new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient")));
    const cp = await calm.newPage();
    await open(cp);
    await cp.locator('[data-page-row="home"]').click();
    await cp.locator(".motion-widget-in").first().waitFor();
    assert.equal(await cp.locator(".motion-widget-in").first().evaluate((e) => getComputedStyle(e).animationName), "none");
    await calm.close();
  });
  await check("dark: Home in the dark theme, nothing blank", async () => {
    await look({ action: "set", look: { theme: "dark", motion: "normal", motion_speed: "normal" } });
    await settle(p, 900);
    const bg = await p.locator('[data-widget="note"]').evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.notEqual(bg, "rgb(255, 255, 255)", "the cards take the dark palette");
    await noBlanks(p, "Home dark");
    await shot(p, "home-dark");
    await p.locator("[data-edit-widgets]").click();
    await settle(p);
    await shot(p, "home-edit-dark");
    await p.locator("[data-edit-widgets]").click();
    await p.getByRole("button", { name: "Close the page" }).click();
    await settle(p);
    await p.locator("div[title='Rentals']").first().click();
    await p.locator('[data-widget-tab="p_rent"]').waitFor();
    await settle(p);
    await shot(p, "rentals-tab-dark");
    await look({ action: "set", look: { theme: "light" } });
  });
  await check("a page made the way the chat makes it: its note shows its words, in light and dark, and after a reload", async () => {
    // The live bug: "make a Test Rentals page with a note that says Verification" left the note on the new page blank.
    const made = await fetch(`${BASE}/api/widgets`, {
      method: "POST",
      headers: owner,
      body: JSON.stringify({ changes: [{ action: "add_page", name: "Test Rentals" }, { action: "add_widget", page: "Test Rentals", kind: "note", text: "Verification" }, { action: "add_widget", page: "Test Rentals", kind: "links", links: [{ label: "Zillow", url: "https://www.zillow.com" }] }] }),
    });
    assert.equal(made.status, 200, await made.clone().text());
    const st = await fetch(`${BASE}/api/state`, { headers: owner }).then((r) => r.json());
    const testPage = st.state.look.current.layout.pages.find((x) => x.name === "Test Rentals");
    assert.equal(testPage.widgets[0].text, "Verification", "kept with its words");
    const noteShows = async (where) => {
      await p.locator(`[data-page-row="${testPage.id}"]`).click();
      await p.locator(`[data-widget-page="${testPage.id}"]`).waitFor();
      await settle(p, 700);
      const note = p.locator(`[data-widget-page="${testPage.id}"] [data-widget="note"] textarea`);
      assert.equal(await note.inputValue(), "Verification", `${where}: the note's words`);
      // Readable: the words' color isn't the note's own background.
      const [fg, bg] = await note.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
      assert.notEqual(fg, bg, `${where}: the words can be seen`);
      assert.equal(await p.locator(`[data-widget-page="${testPage.id}"] [data-widget="links"] a`).innerText(), "Zillow");
      await noBlanks(p, where);
    };
    await noteShows("Test Rentals, light");
    await shot(p, "test-rentals-light");
    await look({ action: "set", look: { theme: "dark" } });
    await settle(p, 900);
    await noteShows("Test Rentals, dark");
    await shot(p, "test-rentals-dark");
    await look({ action: "set", look: { theme: "light" } });
    await open(p);
    await noteShows("Test Rentals, after a reload");
    await p.getByRole("button", { name: "Close the page" }).click();
    await settle(p);
  });
  await check("the server refuses a paired phone's change, a script link and an unknown kind", async () => {
    const phone = await fetch(`${BASE}/api/widgets`, { method: "POST", headers: { cookie: `bops_remote=${phoneCode}`, "x-bops-remote": "1", "content-type": "application/json" }, body: JSON.stringify({ changes: [{ action: "add_widget", kind: "clock" }] }) });
    assert.equal(phone.status, 403);
    const js = await fetch(`${BASE}/api/widgets`, { method: "POST", headers: owner, body: JSON.stringify({ changes: [{ action: "add_widget", kind: "links", links: [{ label: "x", url: "javascript:alert(1)" }] }] }) });
    assert.equal(js.status, 400);
    assert.match((await js.json()).error, /may only open a web page/);
    const sneaky = await fetch(`${BASE}/api/widgets`, { method: "POST", headers: owner, body: JSON.stringify({ quiet: true, changes: [{ action: "add_page", name: "Sneaky" }] }) });
    assert.equal(sneaky.status, 400, "quiet is only for using a widget");
    assert.match((await sneaky.json()).error, /can skip Undo/);
    const kind = await fetch(`${BASE}/api/widgets`, { method: "POST", headers: owner, body: JSON.stringify({ changes: [{ action: "add_widget", kind: "iframe" }] }) });
    assert.equal(kind.status, 400);
  });
  await check("no errors on the page", async () => assert.deepEqual(desk.errors, []));

  const phoneCtx = await context("phone");
  await check("phone 412: Home from the list, the whole width, nothing sideways", async () => {
    const pp = phoneCtx.page;
    await open(pp);
    await pp.locator('[data-page-row="home"]').click();
    await pp.locator('[data-widget-page="home"]').waitFor();
    await settle(pp, 700);
    const m = await pp.evaluate(MEASURE_SIDEWAYS);
    assert.ok(m.scroll <= m.W + 1, `scrolls sideways (${m.scroll} in ${m.W})`);
    const box = await pp.locator('[data-widget-page="home"]').boundingBox();
    assert.ok(Math.abs(box.width - 412) < 2, `the page takes the width (${box.width})`);
    await noBlanks(pp, "phone Home");
    await shot(pp, "home-phone");
    await look({ action: "set", look: { theme: "dark" } });
    await settle(pp, 900);
    await noBlanks(pp, "phone Home dark");
    await shot(pp, "home-phone-dark");
    await look({ action: "set", look: { theme: "light" } });
    assert.deepEqual(phoneCtx.errors, []);
  });
} finally {
  console.log(results.join("\n"));
  await browser.close();
  await stop();
}
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
console.log(`screenshots: ${shots}`);
process.exit(failed ? 1 : 0);

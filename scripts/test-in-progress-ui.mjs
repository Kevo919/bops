// Features being built (lib/feature-status.ts), in the real built app: each placeholder shows where it will live,
// grayed and out of reach, its red label and its percent, in light and in dark, at 1280 px and at a phone's 412 px:
// - Settings' nav: Widgets, a compact row (a tap says what's left, nothing opens);
// - Settings, Look: Animations; Logins: Composio (your account); This computer: Bot tasks on this PC;
// - the child under each is inert (a click lands on the placeholder, never on what's under it), aria-disabled, its
//   red the light or the dark one as the look's theme says, and at 412 px the page never scrolls sideways.
// The same harness as scripts/test-mobile-layout.mjs: the production build (`npx next build` first) with `next start`
// in a scratch folder, a made-up Orgo on 127.0.0.1, made-up bots; nothing leaves this computer.
// Usage: node scripts/test-in-progress-ui.mjs   (SHOTS=<dir> saves a screenshot of each screen there)
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
const settle = (page) => page.waitForTimeout(450);
const look = (theme) => fetch(`${BASE}/api/look`, { method: "POST", headers: owner, body: JSON.stringify({ action: "set", look: { theme } }) }).then((r) => assert.ok(r.ok, `the look didn't take ${theme}`));
const RED = { light: "rgb(180, 35, 24)", dark: "rgb(255, 154, 144)" };

async function openSettings(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /team, account and settings/ }).first().click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
  await settle(page);
}
async function place(page, phone, p) {
  if (phone && (await page.locator("[data-settings-pane-back]").isVisible().catch(() => false))) {
    await page.locator("[data-settings-pane-back]").click();
    await settle(page);
  }
  await page.locator(`[data-settings-nav="${p}"]`).click();
  await settle(page);
}
/** A placeholder: shown, aria-disabled, its label red (light or dark), its percent, and a click lands on it, not under it. */
async function placeholder(page, id, percent, theme) {
  const el = page.locator(`[data-in-progress="${id}"]`).filter({ visible: true }).first();
  await el.waitFor({ state: "visible", timeout: 10000 });
  await el.scrollIntoViewIfNeeded();
  assert.equal(await el.getAttribute("aria-disabled"), "true", `${id}: not aria-disabled`);
  const holder = page.locator(`:is([data-in-progress="${id}"], span:has(> [data-in-progress="${id}"]))`).filter({ visible: true }).first();
  assert.equal((await holder.locator("[data-in-progress-percent]").first().innerText()).trim(), `${percent}%`, `${id}: its percent`);
  const color = await holder.locator("[data-in-progress-label]").first().evaluate((n) => getComputedStyle(n).color);
  assert.equal(color, RED[theme], `${id}: its label is ${color}, not the ${theme} red`);
  const hit = await el.evaluate((n) => {
    const inner = n.querySelector("[inert]");
    if (!inner) return "no inert child";
    const r = inner.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 10));
    return at && (at === n || (n.contains(at) && !inner.contains(at))) ? "ok" : `the click lands on ${at?.outerHTML.slice(0, 80)}`;
  });
  assert.ok(hit === "ok" || id === "widgets-by-chat", `${id}: ${hit}`);
  return el;
}
async function noSideways(page, what) {
  const m = await page.evaluate(() => ({ W: innerWidth, s: Math.max(document.scrollingElement.scrollWidth, document.body.scrollWidth) }));
  assert.ok(m.s <= m.W + 1, `${what}: the page scrolls sideways (${m.s}px in ${m.W}px)`);
}
const shot = async (page, name) => shots && page.screenshot({ path: join(shots, `${name}.png`) });

try {
  for (const theme of ["light", "dark"]) {
    await look(theme);
    for (const kind of ["desktop", "phone"]) {
      const { ctx, page, errors } = await context(kind === "phone" ? "phone" : "owner");
      const phone = kind === "phone";
      const tag = `${kind}-${theme}`;
      await check(`${tag}: Settings' nav has Widgets, compact, In progress and 10%; a tap says what's left, nothing opens`, async () => {
        await openSettings(page);
        const row = await placeholder(page, "widgets-by-chat", 10, theme);
        assert.equal(await row.locator("xpath=..").locator("[data-in-progress-label]").innerText(), "In progress");
        await noSideways(page, tag);
        await shot(page, `${tag}-settings-nav`);
        const before = await page.locator("main[data-settings-pane]").getAttribute("data-settings-pane").catch(() => null);
        // Playwright waits on aria-disabled; a person taps it anyway, so the tap goes in at its place (a real mouse click).
        await row.click({ force: true });
        const tip = page.locator('[role="tooltip"]').filter({ hasText: "What's left" }).filter({ visible: true }).first();
        await tip.waitFor({ state: "visible", timeout: 3000 });
        assert.match(await tip.innerText(), /^10% built\. What's left: Ask a bot in the chat for a widget or a page/);
        assert.equal(await page.locator("main[data-settings-pane]").getAttribute("data-settings-pane").catch(() => null), before, "the tap opened a place");
        await shot(page, `${tag}-settings-nav-tip`);
      });
      for (const [p, id, percent, name] of [
        ["look", "animations-setting", 10, "look"],
        ["logins", "composio-for-you", 15, "logins"],
        ["mac", "pc-tasks-claude-plan", 60, "this-pc"],
      ])
        await check(`${tag}: Settings, ${p}: the ${id} placeholder, grayed, red label, ${percent}%`, async () => {
          await openSettings(page);
          await place(page, phone, p);
          const el = await placeholder(page, id, percent, theme);
          await noSideways(page, `${tag} ${p}`);
          await el.focus();
          await page.keyboard.press("Enter");
          await page.locator(`[data-in-progress="${id}"] [role="tooltip"]`).waitFor({ state: "visible", timeout: 3000 });
          await shot(page, `${tag}-settings-${name}`);
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

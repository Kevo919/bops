// The dark look on every screen (Settings > Look > Theme: Dark, lib/look-theme.ts), against the real built app:
// - set from Settings > Look as the owner does it, the whole window turns: on each screen (the chat, the sidebar's list
//   and its footer, Settings' nav and every place in it, a bot's settings page and profile with its starter offers,
//   Routines, Skills, Knowledge, Issues, the chat's computer and New tab, New chat or bot, the account and More menus,
//   at 1280x800 and at a phone's 412 px) no large element that's in sight has a light background (relative luminance
//   over 0.6), and no text in sight reads under 4.5:1 (WCAG AA) against what's behind it, inputs' and textareas'
//   placeholders too;
// - System follows the computer: dark when it prefers dark, the light look when it prefers light;
// - Light is as it was: every element's colors on each screen (text, background, borders, shadow, outline), written
//   with LIGHT_SNAPSHOT=<file> and compared with LIGHT_BASELINE=<file> (a snapshot from the build before a change;
//   LIGHT_ONLY=1 takes just the snapshot, for a build that has no dark look to test).
// Allowed light, and why (ALLOWED below): the highlighter and the owner's accent (yellow marks what needs you, with
// dark ink on it), a color the owner or a bot picked (a bot's avatar, set inline), pictures (img, video, canvas,
// iframe, svg) and the white QR box a phone scans (it must be dark on white to scan).
// Text is measured where it is: what's under its middle (elementsFromPoint), each background composited down to the
// first opaque one, its own opacity and its parents' counted. Disabled controls are exempt, as WCAG has them.
//
// It runs the production build (`npx next build` first) with `next start` in a scratch folder (its own .data, HOME and
// UI token, made-up bots and chats), and a made-up Orgo on 127.0.0.1; nothing leaves this computer. Needs Playwright's
// Chromium. Usage: node scripts/test-dark-mode.mjs   (SHOTS=<dir> saves a screenshot of each screen there)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
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
// ONLY=<regex> runs just the checks whose names match (the rest are skipped), for working on one screen.
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
async function check(name, fn) {
  if (only && !only.test(name)) return;
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}\n     ${String(e.message ?? e).split("\n").slice(0, 14).join("\n     ")}`);
  }
  if (process.env.VERBOSE) console.log(results.at(-1));
}

// ---- a made-up Orgo ------------------------------------------------------------------------------------------------
const orgo = createServer((req, res) => {
  const j = (x, s = 200) => (res.writeHead(s, { "content-type": "application/json" }), res.end(JSON.stringify(x)));
  req.resume();
  req.on("end", () => {
    const p = (req.url ?? "").split("?")[0];
    if (p === "/api/user/profile") return j({ id: "u_dark", email: "ava@example.test", full_name: "Ava Reed" });
    if (p === "/api/cli/auth/start") return j({ device_code: "dev_fake", user_code: "ABCD-EFGH", verification_uri: "http://127.0.0.1/cli/approve", interval_seconds: 1, expires_in_seconds: 600 });
    if (p === "/api/cli/auth/poll") return j({ status: "approved", api_key: "sk_orgo_fake_dark", user: { id: "u_dark", email: "ava@example.test" } });
    if (p === "/api/secrets" && req.method === "GET") return j({ secrets: [] });
    if (p === "/api/workspaces") return j([]);
    if (/computers|projects/.test(p) && req.method === "GET") return j({ computers: [], projects: [] });
    return j({ error: "made-up orgo: not here" }, 404);
  });
});
await new Promise((ok) => orgo.listen(0, "127.0.0.1", ok));
const orgoPort = orgo.address().port;

// ---- the scratch folder: made-up bots, chats (a code block, a list, a look card), a routine, a Gmail just connected ----
const dir = mkdtempSync(join(tmpdir(), "bops-dark-"));
for (const name of readdirSync(root)) if (name !== ".data" && !name.startsWith(".env") && name !== ".git") symlinkSync(join(root, name), join(dir, name));
mkdirSync(join(dir, "home"));
const now = Date.now();
const H = 3600e3;
const user = "u_dark";
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
      { id: "bot:rook", kind: "bot", botIds: ["rook"], createdAt: now - 4 * H, typing: [], workspaceId: "ws_main", favorite: true },
      { id: "bot:pip", kind: "bot", botIds: ["pip"], createdAt: now - 3 * H, typing: [], workspaceId: "ws_main" },
      { id: "c_team", kind: "group", title: "Launch crew", botIds: ["boppy", "rook", "pip"], createdAt: now - 2 * H, typing: [], workspaceId: "ws_main" },
    ],
    messages: [
      { id: "m1", chatId: "bot:boppy", role: "user", text: "Morning! What's on my plate today?", at: now - 5 * H },
      { id: "m2", chatId: "bot:boppy", role: "bot", botId: "boppy", text: "Three things:\n\n1. **Reply to Dana** about the Q4 plan\n2. Review the hiring pipeline\n3. Pay the invoice\n\nThe script I ran:\n\n```js\nconst total = invoices.reduce((a, b) => a + b.amount, 0);\nconsole.log(`Total: ${total}`);\n```\n\nAnd `npm test` passed. See [the plan](https://example.test/plan).", at: now - 5 * H + 60e3 },
      { id: "m3", chatId: "bot:boppy", role: "user", text: "Make the app dark", at: now - 4 * H },
      { id: "m4", chatId: "bot:boppy", role: "system", text: "Look changed: Dark", at: now - 4 * H + 1e3, look: { summary: "Dark", before: {} } },
      { id: "m5", chatId: "c_team", role: "user", text: "Team, let's plan the launch.", at: now - 2 * H },
    ],
    sessions: [],
    accounts: [{ id: "acc_gmail", app: "gmail", appName: "Gmail", name: "ava@example.test", status: "active", at: now - H, workspaceId: "ws_main" }],
    suggest: { app: "gmail", botId: "boppy", at: now - 60e3 },
    routines: [{ id: "r_daily", botId: "boppy", title: "Morning brief", goal: "Send me a summary of my day", schedule: { kind: "weekdays", time: "08:00" }, enabled: true, createdAt: now - 20 * 24 * H, run: "chat" }],
    look: { current: {}, history: [] },
  }),
);
const phoneCode = randomBytes(24).toString("hex");
writeFileSync(join(dir, ".data", "remote.json"), JSON.stringify({ hash: createHash("sha256").update(phoneCode).digest("hex"), created: now }));
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
    ORGO_API_KEY: "sk_orgo_fake_dark",
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
await fetch(`${BASE}/api/auth/start`, { method: "POST", headers: owner, body: "{}" });
await new Promise((r) => setTimeout(r, 1500));
await fetch(`${BASE}/api/auth/poll`, { method: "POST", headers: owner });
const setTheme = (theme) => fetch(`${BASE}/api/look`, { method: "POST", headers: owner, body: JSON.stringify({ action: "set", look: { theme } }) }).then((r) => assert.ok(r.ok, `POST /api/look: ${r.status}`));

// ---- the browser -------------------------------------------------------------------------------------------------
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
async function context(kind, colorScheme = "light") {
  const ctx =
    kind === "phone"
      ? await browser.newContext({
          viewport: { width: 412, height: 915 },
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
          colorScheme,
          reducedMotion: "reduce",
          userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 BopsAndroid",
        })
      : await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme, reducedMotion: "reduce" });
  await ctx.addCookies([kind === "phone" ? { name: "bops_remote", value: phoneCode, url: BASE } : { name: "bops_window", value: token, url: BASE }]);
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

/**
 * What's on the screen, measured in the page: large light backgrounds and text under 4.5:1 (dark), or every element's
 * colors (the light snapshot). Colors are read through a canvas, so oklab(), color-mix() and the rest come out as RGBA.
 */
const MEASURE = ({ mode, minArea, maxLum, minContrast }) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const rgba = (s) => {
    if (!s || s === "transparent" || s === "rgba(0, 0, 0, 0)") return [0, 0, 0, 0];
    if (cache.has(s)) return cache.get(s);
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = s;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const v = [d[0], d[1], d[2], d[3] / 255];
    cache.set(s, v);
    return v;
  };
  const over = (top, under) => {
    const a = top[3];
    return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
  };
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.opacity === "0" || p.hasAttribute("inert") || p.getAttribute("aria-hidden") === "true") return false;
    }
    return true;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let p = el; p; p = p.parentElement) o *= Number(getComputedStyle(p).opacity);
    return o;
  };
  const W = innerWidth;
  const Hh = innerHeight;
  const inView = (r) => r.width >= 1 && r.height >= 1 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < Hh;
  const pageBase = rgba(getComputedStyle(document.documentElement).colorScheme.includes("dark") ? "#121212" : "#ffffff");
  // A gradient's colors (a bot's wash, a fade): each stop, its position dropped; transparent ones left out.
  const stops = (img) => {
    const out = [];
    for (const g of img.matchAll(/(?:linear|radial|conic)-gradient\(/g)) {
      let depth = 1;
      let part = "";
      const parts = [];
      for (let i = g.index + g[0].length; i < img.length && depth > 0; i++) {
        const ch = img[i];
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if ((ch === "," && depth === 1) || depth === 0) {
          parts.push(part.trim());
          part = "";
        } else part += ch;
      }
      for (const p of parts) {
        const color = p.replace(/(\s+-?[\d.]+(%|px|deg))+$/, "").trim();
        if (/^(to |from |in |at |[\d.]+deg|circle|ellipse)/.test(color)) continue;
        const c = rgba(color);
        if (c[3] > 0.05) out.push(c);
      }
    }
    return out;
  };
  // The colors behind a point under an element: the backgrounds under it, top down, until one is opaque; a gradient
  // there gives one color for each of its stops, and the words must read on every one.
  const behindAll = (el, x, y) => {
    const stack = document.elementsFromPoint(Math.min(W - 1, Math.max(0, x)), Math.min(Hh - 1, Math.max(0, y)));
    let i = stack.indexOf(el);
    if (i < 0) {
      for (let p = el; p && i < 0; p = p.parentElement) i = stack.indexOf(p);
      if (i < 0) i = 0;
    }
    const layers = [];
    let bases = [pageBase];
    for (const e of stack.slice(i)) {
      const cs = getComputedStyle(e);
      if (/^(IMG|VIDEO|CANVAS|IFRAME)$/.test(e.tagName)) return null;
      const o = opacityOf(e);
      if (/gradient/.test(cs.backgroundImage)) {
        const st = stops(cs.backgroundImage);
        // An opaque gradient is what's behind; a fade over something else is taken at its stops over that.
        if (st.length && st.every((c) => c[3] >= 0.999) && o >= 0.999) {
          bases = st;
          break;
        }
      }
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) layers.push([c[0], c[1], c[2], c[3] * o]);
      if (c[3] * o >= 0.999) break;
    }
    return bases.map((b) => {
      let col = b;
      for (const l of [...layers].reverse()) col = over(l, col);
      return col;
    });
  };
  const behind = (el, x, y) => behindAll(el, x, y)?.[0] ?? null;
  const name = (el) => {
    const t = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 36);
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter((c) => /^(bg|text|shadow)-/.test(c)).slice(0, 3).join(" ");
    return `<${el.tagName.toLowerCase()}${t ? ` "${t}"` : ""}${cls ? ` .${cls}` : ""}>`;
  };
  const hl = rgba(getComputedStyle(document.documentElement).getPropertyValue("--color-highlighter").trim() || "#e9ff3b");
  const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 9;
  // Allowed light (see the top of the file).
  const allowed = (el, c) => same(c, hl) || !!el.style.backgroundColor || !!el.style.background || el.closest("svg, [data-qr], [data-light-ok]") || /^(IMG|VIDEO|CANVAS|IFRAME)$/.test(el.tagName);
  const all = [...document.querySelectorAll("body *")];
  if (mode === "snapshot") {
    const out = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (!inView(r) || !visible(el)) continue;
      const cs = getComputedStyle(el);
      out.push([el.tagName, cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderBottomColor, cs.borderLeftColor, cs.boxShadow, cs.outlineColor, cs.fill === "rgb(0, 0, 0)" ? "" : cs.fill].join("|"));
    }
    return { snapshot: out.sort() };
  }
  const light = [];
  const dim = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!inView(r)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    // Large light backgrounds: its own background, over what's behind it.
    const own = rgba(cs.backgroundColor);
    const area = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, Hh) - Math.max(r.top, 0));
    if (own[3] >= 0.35 && area >= minArea && visible(el) && !allowed(el, own)) {
      const under = behind(el.parentElement ?? el, r.left + Math.min(r.width, W) / 2, r.top + Math.min(r.height, Hh) / 2) ?? pageBase;
      const c = over([own[0], own[1], own[2], own[3] * opacityOf(el)], under);
      if (lum(c) > maxLum) light.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)} bg ${cs.backgroundColor} (luminance ${lum(c).toFixed(2)})`);
    }
    // A large gradient that's light all through (a pale wash) is a light background too.
    if (/gradient/.test(cs.backgroundImage) && area >= minArea && visible(el) && !el.closest("[data-qr], [data-light-ok]")) {
      const st = stops(cs.backgroundImage);
      // A pattern (dots over the paper: a stop that's transparent) is the paper's, measured as its background color.
      if (st.length && !/transparent|rgba\([^)]*,\s*0\)/.test(cs.backgroundImage) && st.every((c) => c[3] >= 0.5 && lum(c) > maxLum)) light.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)} gradient ${cs.backgroundImage.slice(0, 90)}`);
    }
    // Text: an element with words of its own, or an input's value or placeholder.
    const field = el.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=hidden]), textarea");
    const words = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!words && !field) continue;
    if (el.closest("svg, [disabled], [aria-disabled=true]") || el.matches(":disabled") || !visible(el)) continue;
    if (r.width < 2 || r.height < 2 || cs.clip === "rect(0px, 0px, 0px, 0px)" || /sr-only/.test(el.className)) continue;
    let rect = r;
    if (words && !field) {
      const range = document.createRange();
      const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      range.selectNodeContents(tn);
      const rr = range.getClientRects()[0];
      if (rr && rr.width >= 1) rect = rr;
    }
    if (!inView(rect)) continue;
    const texts = [];
    if (field) {
      if (el.value) texts.push(["value", cs.color]);
      else if (el.placeholder) texts.push(["placeholder", getComputedStyle(el, "::placeholder").color]);
    } else texts.push(["text", cs.color]);
    const unders = behindAll(el, rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!unders) continue;
    for (const [what, color] of texts)
      for (const under of unders) {
        const t = rgba(color);
        const fg = over([t[0], t[1], t[2], t[3] * opacityOf(el)], under);
        const k = ratio(fg, under);
        if (k < minContrast) {
          dim.push(`${name(el)} ${what} ${color} on rgb(${under.slice(0, 3).map(Math.round).join(", ")}): ${k.toFixed(2)}:1`);
          break;
        }
      }
  }
  return { light, dim, scheme: getComputedStyle(document.documentElement).colorScheme, body: getComputedStyle(document.body).backgroundColor };
};

const LIMITS = { minArea: 3000, maxLum: 0.6, minContrast: 4.5 };
const snapshot = {};
const baseline = process.env.LIGHT_BASELINE ? JSON.parse(readFileSync(process.env.LIGHT_BASELINE, "utf8")) : null;
let mode = "dark";
let tag = "";

async function settle(page, ms = 500) {
  await page.mouse.move(1, 1).catch(() => {});
  await page.waitForTimeout(ms);
}
/** One screen: in the dark run, nothing large and light, no text under 4.5:1; in the light run, its colors kept. */
async function screen(page, name) {
  await settle(page, 350);
  const id = `${tag}${name}`;
  if (shots) await page.screenshot({ path: join(shots, `${mode}-${id}.png`) });
  if (mode === "light") {
    const { snapshot: s } = await page.evaluate(MEASURE, { mode: "snapshot", ...LIMITS });
    snapshot[id] = s;
    if (baseline?.[id]) {
      const was = new Map();
      for (const x of baseline[id]) was.set(x, (was.get(x) ?? 0) + 1);
      const added = [];
      for (const x of s) {
        const n = was.get(x) ?? 0;
        if (n) was.set(x, n - 1);
        else added.push(x);
      }
      const gone = [...was].filter(([, n]) => n > 0).map(([x]) => x);
      assert.ok(added.length === 0 && gone.length === 0, `${id}: light colors changed\n  now: ${added.slice(0, 5).join("\n  now: ")}\n  was: ${gone.slice(0, 5).join("\n  was: ")}`);
    }
    return;
  }
  const m = await page.evaluate(MEASURE, { mode: "dark", ...LIMITS });
  assert.match(m.scheme, /dark/, `${id}: the page isn't in the dark scheme (${m.scheme})`);
  const bad = [...m.light.map((x) => `light background: ${x}`), ...m.dim.map((x) => `low contrast: ${x}`)];
  assert.deepEqual(bad, [], `${id}: ${bad.length} problems\n  ${bad.slice(0, 12).join("\n  ")}`);
}

async function open(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(700);
}

/** Every screen, at 1280x800 and at 412 px, each from a fresh load of the window. */
async function walk(ctx, phone, errors) {
  let page;
  const fresh = async () => {
    // A page of its own for each screen: one page through them all grows past what a phone's renderer holds.
    if (page) await page.close();
    page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await open(page);
  };
  const button = (name, exact = true) => page.getByRole("button", { name, exact }).first();
  const row = (name) => page.locator("aside button").filter({ hasText: new RegExp(`^\\s*${name}`) }).first();
  const openSettings = async () => {
    await button(/team, account and settings/, false).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
    await settle(page);
  };
  const ck = (n, fn) => check(`${mode}${phone ? " phone" : ""}: ${n}`, fn);

  await ck("the chat (sidebar, chat list, Favorites, footer, messages, code, composer)", async () => {
    await fresh();
    await row("Boppy").click();
    await page.locator("#composer").waitFor({ state: "visible" });
    await page.locator("#composer").fill("A draft in the message box");
    await screen(page, "chat");
  });
  await ck("a group chat", async () => {
    await fresh();
    await row("Launch crew").click();
    await screen(page, "group-chat");
  });
  await ck("the chat's More menu", async () => {
    await fresh();
    await row("Boppy").click();
    await settle(page);
    await button("More").click();
    await page.getByRole("menuitem", { name: /Select messages/ }).waitFor({ state: "visible" });
    await screen(page, "chat-more-menu");
  });
  await ck("the account menu", async () => {
    await fresh();
    await button(/team, account and settings/, false).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).first().waitFor({ state: "visible" });
    await screen(page, "account-menu");
  });
  await ck("search", async () => {
    await fresh();
    await button("Search").click();
    await page.keyboard.type("bo");
    await screen(page, "search");
  });
  await ck("New chat or bot", async () => {
    await fresh();
    await button("New chat or bot").click();
    await page.getByRole("button", { name: /Create new bot/ }).waitFor({ state: "visible" });
    await screen(page, "new-chat");
  });
  await ck("the chat's computer and New tab", async () => {
    await fresh();
    await row("Boppy").click();
    await settle(page);
    // Wide, the panel beside the chat may be open on it already.
    if (!(await button("New tab").isVisible())) await button(/^Boppy's computer/, false).click();
    await button("New tab").waitFor({ state: "visible" });
    await screen(page, "computer");
    await button("New tab").click();
    await page.getByPlaceholder(/Search Google or type a URL/).waitFor({ state: "visible" });
    await screen(page, "new-tab");
  });
  await ck("a bot's profile, with the starter offers of an app just connected", async () => {
    await fresh();
    await row("Boppy").click();
    await settle(page);
    await button("Boppy's profile").click();
    await page.getByText(/^details$/i).filter({ visible: true }).first().waitFor({ state: "visible" });
    await settle(page, 800);
    await screen(page, "bot-profile");
  });
  await ck("Routines and Skills", async () => {
    await fresh();
    await button("Routines").click();
    await page.getByText("Morning brief").first().waitFor({ state: "visible" });
    await screen(page, "routines");
    await button("Skills").click();
    await screen(page, "skills");
  });
  for (const [what, go] of [
    ["Knowledge", () => button("Knowledge").click()],
    ["Issues", () => row("Issues").click()],
  ])
    await ck(what, async () => {
      await fresh();
      await go();
      await screen(page, what.toLowerCase());
    });

  let places = [];
  await ck("Settings' nav", async () => {
    await fresh();
    await openSettings();
    await page.locator('nav[aria-label="Settings"]').waitFor({ state: "visible" });
    places = await page.locator("[data-settings-nav]").evaluateAll((els) => els.map((e) => e.getAttribute("data-settings-nav")));
    assert.ok(places.length >= 10, `only ${places.length} places`);
    await screen(page, "settings");
  });
  for (const p of places)
    await ck(`Settings, ${p}`, async () => {
      await fresh();
      await openSettings();
      await page.locator(`[data-settings-nav="${p}"]`).click();
      await page.locator("main[data-settings-pane]").waitFor({ state: "visible" });
      await settle(page, 700);
      if (p === "look") await page.getByLabel("Custom CSS").fill(".x { color: red }");
      await screen(page, `settings-${p}`);
      // Down the place, for what's under the fold.
      const more = await page.locator("main[data-settings-pane]").evaluate((el) => {
        const s = [el, ...el.querySelectorAll("*")].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 40);
        if (!s) return false;
        s.scrollTop = s.scrollHeight;
        return true;
      });
      if (more) await screen(page, `settings-${p}-end`);
    });
  await ck("a bot's settings page", async () => {
    await fresh();
    await openSettings();
    await page.locator('[data-settings-nav="bots"]').click();
    await settle(page);
    await page.getByRole("button", { name: "Open settings", exact: true }).nth(1).click();
    await page.locator("[data-bot-settings]").first().waitFor({ state: "visible" });
    await screen(page, "bot-settings");
  });
  if (page) await page.close();
}

try {
  // ---- dark: set from Settings > Look, as the owner does (LIGHT_ONLY=1 skips to the light snapshot) ----------------
  if (!process.env.LIGHT_ONLY) {
    const { ctx, page, errors } = await context("desk");
    await check("dark: Theme Dark in Settings > Look turns the window dark", async () => {
      await open(page);
      await page.getByRole("button", { name: /team, account and settings/ }).first().click();
      await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click();
      await page.locator('[data-settings-nav="look"]').click();
      await page.getByRole("radio", { name: "Dark" }).or(page.getByRole("button", { name: /^Dark( theme)?$/ })).first().click();
      await page.waitForFunction(() => getComputedStyle(document.documentElement).colorScheme.includes("dark"), null, { timeout: 10000 });
      const kept = await fetch(`${BASE}/api/state`, { headers: owner }).then((r) => r.json());
      assert.equal(kept?.state?.look?.current?.theme, "dark", "the state keeps it");
      const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.notEqual(body, "rgb(255, 255, 255)", "the page behind the sidebar is still white");
    });
    mode = "dark";
    tag = "";
    await walk(ctx, false, errors);
    await ctx.close();
    const ph = await context("phone");
    tag = "phone-";
    await walk(ph.ctx, true, errors);
    await check("dark: no page errors", async () => assert.deepEqual(errors, []));
    await ph.ctx.close();
  }

  // ---- system: follows the computer ---------------------------------------------------------------------------------
  await setTheme("system");
  for (const scheme of process.env.LIGHT_ONLY ? [] : ["dark", "light"])
    await check(`system: follows the computer preferring ${scheme}`, async () => {
      const { ctx, page } = await context("desk", scheme);
      await open(page);
      await page.locator("aside button").filter({ hasText: /^\s*Boppy/ }).first().click();
      await settle(page);
      const s = await page.evaluate(() => [getComputedStyle(document.documentElement).colorScheme, getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue("--hb-f2f2f0").trim()]);
      if (scheme === "dark") {
        assert.match(s[0], /dark/);
        assert.notEqual(s[1], "rgb(255, 255, 255)");
        assert.notEqual(s[2].toLowerCase(), "#f2f2f0", "the palette didn't turn");
        mode = "dark";
        tag = "system-";
        await screen(page, "chat");
      } else {
        assert.doesNotMatch(s[0], /dark/);
        assert.equal(s[2].toLowerCase(), "#f2f2f0", "the palette turned in a light computer");
      }
      await ctx.close();
    });

  // ---- light: as it was ---------------------------------------------------------------------------------------------
  await setTheme("light");
  mode = "light";
  {
    const { ctx, errors } = await context("desk");
    tag = "";
    await walk(ctx, false, errors);
    await ctx.close();
    const ph = await context("phone");
    tag = "phone-";
    await walk(ph.ctx, true, errors);
    await ph.ctx.close();
  }
  if (process.env.LIGHT_SNAPSHOT) writeFileSync(process.env.LIGHT_SNAPSHOT, JSON.stringify(snapshot));
  if (baseline) await check("light: every screen of the baseline was compared", async () => assert.deepEqual(Object.keys(baseline).filter((k) => !snapshot[k]), []));
} finally {
  await browser.close();
  await stop();
}
for (const r of results) console.log(r);
console.log(`dark mode: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

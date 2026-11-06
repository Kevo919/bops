// Crawl item 4 + option B: Mac wording on a Windows computer, and the vault's OpenAI row saying it isn't
// the chat's key. computerWords already swapped Mac/PC; it now also maps Keychain -> Windows Credential
// Manager and ⌘ -> Ctrl (the shortcut is CommandOrControl everywhere), and the raw sites that bypassed it
// are wrapped: the Kbd badge, both sidebar tooltips, the token note (channels), the Logins Keychain
// strings, Skills' "Kept on this Mac", plus the keys row's new note (option B).
//
// Task 62: the Mac words left on a Windows PC (a bot's profile said "Works on: Your Mac", Settings' Profile still said
// subscription tasks weren't enabled). The words helpers are checked here first; then, when there's a production build
// (`npx next build`), the screens those words are on are rendered for real, in the built app as Kevin's Windows PC runs it
// (self-hosted, the desktop window, /api/config saying win32, the desktop app's bridge), and no text a person can read
// there may say Mac, Macs, macOS or Keychain, except where a Mac is meant (ALLOWED_MAC, below).
// Usage: node scripts/test-windows-wording.mjs   (SCREENS=0 to skip the screens; SHOTS=<dir> for their pictures)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootPath = fileURLToPath(new URL("..", import.meta.url));
const rootUrl = pathToFileURL(rootPath).href;
const read = (p) => readFileSync(new URL(p, rootUrl), "utf8");
// lib/*.ts import through "@/" and without extensions, which plain node can't load: resolved here.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), rootUrl).href;
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier))
        for (const ext of [".ts", ".tsx"])
          try {
            return next(specifier + ext, context);
          } catch {
            /* the next one */
          }
      throw e;
    }
  },
});
const { computerWords } = await import(new URL("lib/computer-words.ts", rootUrl).href);

let failures = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 3).join("\n  ") ?? e.message}`);
  }
}

check("computerWords maps what a Windows user reads", () => {

  assert.equal(computerWords("your Mac's Keychain", "win32"), "an encrypted store on your PC");
  assert.equal(computerWords("Collapse the sidebar (⌘\\)", "win32"), "Collapse the sidebar (Ctrl\\)");
  assert.equal(computerWords("Kept on this Mac.", "win32"), "Kept on this PC.");
assert.equal(computerWords("Stored in your Mac's Keychain", "win32"), "Stored in an encrypted store on your PC");
  assert.equal(computerWords("your Mac's Keychain", "darwin"), "your Mac's Keychain", "the Mac keeps its own words");
  assert.equal(computerWords("⌘", "linux"), "Ctrl", "CommandOrControl is Ctrl off the Mac");
});

check("every raw site is wrapped (no bare ⌘/Keychain/Mac copy left in the UI files)", () => {
  const files = ["components/app/chat-view.tsx", "components/app/sidebar.tsx", "components/app/sidebar-rail.tsx", "components/app/channels.tsx", "components/app/logins.tsx", "components/app/skills.tsx", "components/app/screen-cards.tsx", "components/app/vault.tsx", "components/app/your-data.tsx"];
  for (const f of files) {
    const s = read(f);
    for (const line of s.split("\n")) {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*")) continue;
      assert.ok(!/(title|data-tip|aria-label)="[^"]*(⌘|Keychain)[^"]*"/.test(line), `${f}: a raw Mac string in an attribute: ${t.slice(0, 60)}`);
      assert.ok(!/>[^<{]*(⌘|Keychain)/.test(line), `${f}: a raw Mac string in text: ${t.slice(0, 60)}`);
    }
  }
  assert.match(read("components/app/chat-view.tsx"), /computerWords\("⌘"\)/);
  assert.match(read("components/app/sidebar.tsx"), /computerWords\("Collapse the sidebar/);
  assert.match(read("components/app/sidebar-rail.tsx"), /computerWords\("Expand the sidebar/);
  assert.match(read("components/app/channels.tsx"), /computerWords\(`The token stays/);
  assert.match(read("components/app/skills.tsx"), /computerWords\("Kept on this Mac\."\)/);
});

check("option B: the vault's OpenAI row says it isn't the chat's key", () => {
  const s = read("components/app/keys.tsx");
  assert.match(s, /NOT_THE_CHAT: Record<string, string> = \{ OPENAI_API_KEY:/);
  assert.match(s, /NOT_THE_CHAT\[p\.name\]/, "rendered on the row");
  assert.match(s, /the chat's models read this computer's own OpenAI key, not the vault/);
});

// ---- Task 62: the words helpers ----------------------------------------------------------------------------------------
const { computerWordsFor } = await import(new URL("lib/computer-words.ts", rootUrl).href);
const { claudeLocalLine, codexLocalLine } = await import(new URL("lib/local-plan-words.ts", rootUrl).href);
const { clearLine } = await import(new URL("lib/privacy.ts", rootUrl).href);

check("a name someone gave that has Mac in it stays as they wrote it: only fixed words change", () => {
  const words = computerWordsFor("win32");
  assert.equal(words`${"Mac Studio"} works on this Mac`, "Mac Studio works on this PC");
  assert.equal(words`${"Macbook Bot"} works on your Mac, so its threads use Bops agent.`, "Macbook Bot works on your PC, so its threads use Bops agent.");
  // Delete now names the bot: its name stays, the fixed words are this PC's.
  assert.equal(clearLine(null, 0, "Mac", words), "Bops couldn't check what this deletes. It deletes Mac's messages and threads from Bops Cloud and all your PCs. Knowledge keeps what it learned from them.");
  assert.equal(
    clearLine({ olderThan: null, messages: 2, threads: 0, files: 1, lines: 0 }, 30, "Mac", words),
    "This deletes Mac's 2 messages from Bops Cloud and all your PCs, and 1 file from this PC. You can restore the messages and threads from Recently deleted on this PC for 30 days. The files and notes can't be restored. Knowledge keeps what it learned from them.",
  );
  assert.equal(clearLine(null, 0, "Mac"), "Bops couldn't check what this deletes. It deletes Mac's messages and threads from Bops Cloud and all your Macs. Knowledge keeps what it learned from them.", "the Mac keeps its own words");
});

check("the Claude and ChatGPT cards on This PC say what a sign in does now (never 'not enabled')", () => {
  assert.match(claudeLocalLine(true, "claude"), /^Claude Code is signed in on this PC, and bot tasks on this PC run on your Claude plan\./);
  assert.match(claudeLocalLine(true, "openai"), /use the OpenAI key for now: choose Your Claude plan below/);
  assert.match(claudeLocalLine(true, null), /can run on your Claude plan: choose that below/);
  assert.match(claudeLocalLine(false, "claude"), /^Connect Claude Code's own subscription on this PC/);
  assert.match(claudeLocalLine(undefined, undefined), /^Once Claude Code is signed in on this PC/, "not checked yet: never 'not signed in'");
  assert.match(codexLocalLine(true), /^Codex is signed in on this PC\. Bops chat and bot tasks don't run on a ChatGPT plan yet\. Bot tasks on this PC run on your Claude plan or an OpenAI key/);
  assert.match(codexLocalLine(false), /^Connect the official Codex account on this PC\./);
  for (const line of [claudeLocalLine(true, "claude"), claudeLocalLine(true, "openai"), claudeLocalLine(true, null), claudeLocalLine(false, null), claudeLocalLine(undefined, undefined), codexLocalLine(true), codexLocalLine(undefined)]) {
    assert.ok(!/not enabled|enabled yet/i.test(line), `still stale: ${line}`);
    assert.ok(!/[\u2012-\u2015]| - /.test(line), `a dash: ${line}`);
    assert.equal(computerWordsFor("win32")(line), line, "already PC words");
  }
  const setup = read("components/app/setup.tsx");
  assert.ok(!setup.includes("are not enabled yet"), "the stale ChatGPT line is gone");
  assert.match(setup, /codexLocalLine\(s\?\.connected\)/);
  assert.match(setup, /claudeLocalLine\(s\?\.connected, runner\)/);
});

// ---- Task 62: the screens, rendered on Windows -----------------------------------------------------------------------
/**
 * Mac words that are right on a Windows PC too, each for its reason. Matched against the visible text and each
 * tooltip; anything else that says Mac, Macs, macOS or Keychain fails.
 */
const ALLOWED_MAC = [
  // Handy (This PC, Voice typing): its own installers, one for each kind of computer.
  /on a Mac, the \.dmg/,
  /on a Mac, Accessibility/,
];
const MAC_WORDS = /\b(Macs?|macOS|Keychain)\b/;

async function screens() {
  if (process.env.SCREENS === "0") return console.log("info screens skipped (SCREENS=0)");
  if (!existsSync(join(rootPath, ".next", "BUILD_ID"))) {
    failures++;
    return console.error("FAIL screens: no production build. Run `npx next build` first (or SCREENS=0 for the words alone).");
  }
  const { chromium } = await import("playwright");

  // A made-up Orgo: who the made-up key is, and empty answers for the rest (as test-no-blank-screens.mjs).
  const orgo = createServer((req, res) => {
    const j = (x, st = 200) => (res.writeHead(st, { "content-type": "application/json" }), res.end(JSON.stringify(x)));
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

  // The scratch folder: the repo's files linked in, its own .data. Boppy works where Bops picks (Works on: Auto), Rook
  // on this PC (Works on: Your PC), each with a chat.
  const dir = mkdtempSync(join(tmpdir(), "bops-words-"));
  for (const name of readdirSync(rootPath)) if (name !== ".data" && !name.startsWith(".env") && name !== ".git") symlinkSync(join(rootPath, name), join(dir, name));
  mkdirSync(join(dir, "home"));
  const now = Date.now();
  const H = 3600e3;
  mkdirSync(join(dir, ".data", "users", "u_pc"), { recursive: true });
  writeFileSync(
    join(dir, ".data", "users", "u_pc", "state.json"),
    JSON.stringify({
      host: "orgo",
      account: { user: { id: "u_pc", email: "kevin@example.test", name: "Kevin Test" } },
      owner: { name: "Kevin Test", timeZone: "America/Chicago" },
      workspaces: [{ id: "ws_main", name: "Main", createdAt: now - 30 * 24 * H }],
      workspace: "ws_main",
      bots: [
        { id: "boppy", name: "Boppy", role: "Chief of staff", color: "#E9FF3B", isMain: true, computerStatus: "none", workspaceId: "ws_main" },
        { id: "rook", name: "Rook", role: "Recruiting", color: "#47C46B", isMain: false, runsOn: "mac", computerStatus: "none", workspaceId: "ws_main" },
      ],
      chats: [
        { id: "bot:boppy", kind: "bot", botIds: ["boppy"], createdAt: now - 5 * H, typing: [], workspaceId: "ws_main" },
        { id: "bot:rook", kind: "bot", botIds: ["rook"], createdAt: now - 4 * H, typing: [], workspaceId: "ws_main" },
      ],
      messages: [{ id: "m1", chatId: "bot:boppy", role: "user", text: "Morning! What's on my plate today?", at: now - 5 * H }],
      sessions: [],
      routines: [],
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
  const token = randomBytes(16).toString("hex");
  const port = await new Promise((ok) => {
    const sv = createServer().listen(0, "127.0.0.1", () => {
      const p = sv.address().port;
      sv.close(() => ok(p));
    });
  });
  const BASE = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [join(rootPath, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
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
  process.on("exit", () => server.exitCode === null && server.kill());
  let browser;
  try {
    const owner = { cookie: `bops_window=${token}`, "content-type": "application/json" };
    for (let i = 0; ; i++) {
      if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break;
      if (i > 120 || server.exitCode !== null) throw new Error(`the server didn't start\n${serverLog.slice(-1500)}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    await fetch(`${BASE}/api/auth/start`, { method: "POST", headers: owner, body: "{}" });
    await new Promise((r) => setTimeout(r, 1500));
    await fetch(`${BASE}/api/auth/poll`, { method: "POST", headers: owner });

    const at = process.env.PLAYWRIGHT_BROWSERS_PATH;
    browser = await chromium.launch({ headless: true }).catch((e) => {
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
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addCookies([{ name: "bops_window", value: token, url: BASE }]);
    // The desktop app's bridge (desktop/preload.cjs), as the Windows app has it: its This PC tab and permissions show.
    await ctx.addInitScript(() => {
      const none = () => Promise.resolve(null);
      window.bopsMac = {
        screens: () => Promise.resolve({ access: "granted", displays: [], sources: [] }),
        openScreenSettings: none,
        popOut: none,
        closePip: none,
        showMain: none,
        permissions: { status: () => Promise.resolve({ screen: "granted", microphone: "granted", notifications: "granted" }), request: () => Promise.resolve("granted"), openSettings: none, automationApps: none },
        screenNeedsRestart: () => Promise.resolve(false),
        relaunch: none,
        copySecret: () => Promise.resolve(true),
        previewSignIn: () => Promise.resolve(false),
        pickFolder: none,
        revealFolder: none,
        update: { info: none, onChange: () => () => {}, dismiss: none, download: none, install: none, auto: none, setAuto: none },
      };
    });
    await ctx.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (!(u.hostname === "127.0.0.1" || u.protocol === "data:" || u.protocol === "blob:")) return route.abort("blockedbyclient");
      // The server runs on Linux here; Kevin's runs on Windows. The window words its places by the server's platform.
      if (u.pathname === "/api/config") {
        const r = await route.fetch();
        return route.fulfill({ response: r, json: { ...(await r.json().catch(() => ({}))), platform: "win32" } });
      }
      // Claude Code signed in on this PC and chosen for bot tasks, the ChatGPT one not: what the cards say then.
      if (u.pathname === "/api/local-subscriptions" && route.request().method() === "GET") {
        const subs = [
          { kind: "codex", available: true, connected: false, state: "signed-out", checkedAt: now },
          { kind: "claude", available: true, connected: true, state: "connected", account: "kevin@example.test", plan: "max", checkedAt: now },
        ];
        const kind = u.searchParams.get("kind");
        return route.fulfill({ json: { subscriptions: kind ? subs.filter((x) => x.kind === kind) : subs } });
      }
      if (u.pathname === "/api/pc-task-runner" && route.request().method() === "GET") return route.fulfill({ json: { choice: "claude", runner: "claude", openaiKey: { set: false, masked: "" } } });
      return route.continue();
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    const shots = process.env.SHOTS || join(tmpdir(), "bops-windows-words");
    mkdirSync(shots, { recursive: true });

    /** Everything a person can read in `sel`: its text, and each tooltip, label and alt text there. */
    const readable = (sel) =>
      page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const tips = [...el.querySelectorAll("[title], [aria-label], [data-tip], [alt], [placeholder]")].flatMap((n) => ["title", "aria-label", "data-tip", "alt", "placeholder"].map((a) => n.getAttribute(a)).filter(Boolean));
        return { text: (el.innerText || "").replace(/\s+/g, " ").trim(), tips };
      }, sel);
    /** One screen: it's there, it says something, and nothing it says is a Mac's words. */
    const looked = [];
    async function judge(name, sel, more) {
      await page.waitForTimeout(600);
      // What's still loading ("Checking", "Loading"), waited out for up to 6 seconds, as a person would.
      for (let i = 0; i < 12; i++) {
        const t = (await readable(sel))?.text ?? "";
        if (!/^\s*(Checking|Loading)\b|Loading…|Checking official CLI/m.test(t)) break;
        await page.waitForTimeout(500);
      }
      await page.screenshot({ path: join(shots, `${name}.png`) });
      const r = await readable(sel);
      assert.ok(r, `${name}: ${sel} isn't on the page`);
      assert.ok(r.text.length > 20, `${name}: blank (${JSON.stringify(r.text)})`);
      const said = [r.text, ...r.tips];
      const hits = [];
      for (const t of said) {
        let left = t;
        for (const ok of ALLOWED_MAC) left = left.replace(new RegExp(ok.source, "g"), "");
        const m = left.match(MAC_WORDS);
        if (m) hits.push(JSON.stringify(left.slice(Math.max(0, m.index - 50), m.index + 40)));
      }
      assert.deepEqual(hits, [], `${name} says a Mac's words on a Windows PC`);
      assert.deepEqual(errors.splice(0), [], `${name}: the page threw`);
      looked.push(name);
      await more?.(r.text);
    }
    const button = (name, exact = true) => page.getByRole("button", { name, exact }).first();
    const row = (name) => page.locator("aside button").filter({ hasText: new RegExp(`^\\s*${name}`) }).first();
    async function fresh() {
      const state = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/state" && r.request().method() === "GET", { timeout: 30000 }).catch(() => null);
      // The window's words come from /api/config (components/app/computer-words.ts): answered before anything is judged.
      const config = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/config", { timeout: 30000 });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator("aside").first().waitFor({ state: "visible", timeout: 30000 });
      await state;
      await config;
      await button(/team, account and settings/, false).waitFor({ state: "visible", timeout: 15000 });
    }
    async function settings(pane) {
      await fresh();
      for (let i = 1; ; i++) {
        try {
          await button(/team, account and settings/, false).click({ timeout: 10000 });
          await page.getByRole("menuitem", { name: "Settings", exact: true }).first().click({ timeout: 5000 });
          await page.locator('nav[aria-label="Settings"]').waitFor({ state: "visible", timeout: 5000 });
          break;
        } catch (e) {
          if (i >= 3) throw e;
          await page.keyboard.press("Escape").catch(() => {});
        }
      }
      await page.locator(`[data-settings-nav="${pane}"]`).click({ timeout: 10000 });
      await page.locator(`main[data-settings-pane="${pane}"]`).waitFor({ state: "visible", timeout: 15000 });
    }
    async function screen(name, fn) {
      try {
        await fn();
        passed++;
        console.log(`ok   ${name}`);
      } catch (e) {
        failures++;
        console.error(`FAIL ${name}\n     ${String(e.message ?? e).split("\n").slice(0, 8).join("\n     ")}`);
      }
    }

    await screen("Settings' nav says This PC", async () => {
      await settings("profile");
      const nav = await readable('nav[aria-label="Settings"]');
      assert.match(nav.text, /This PC/);
      assert.ok(!MAC_WORDS.test(nav.text), nav.text);
    });
    // Profile: who you are, then AI subscriptions on This PC: what the Claude sign in does now, and the ChatGPT one.
    await screen("Settings, Profile (AI subscriptions, This PC)", async () => {
      await settings("profile");
      const pane = 'main[data-settings-pane="profile"]';
      await page.locator(`${pane} [data-local-line="claude"]`).waitFor({ state: "visible", timeout: 15000 });
      await page.locator(`${pane} [data-local-line="claude"]`).filter({ hasText: /signed in/ }).waitFor({ timeout: 15000 });
      await judge("settings-profile", pane, (text) => {
        assert.match(text, /Claude Code is signed in on this PC, and bot tasks on this PC run on your Claude plan\./, "the Claude card says what tasks do now");
        assert.match(text, /Bops chat and bot tasks don't run on a ChatGPT plan yet/, "the ChatGPT card says it as it is");
        assert.ok(!/not enabled|enabled yet/i.test(text), "no stale 'not enabled'");
      });
    });
    for (const [pane, label] of [["mac", "This PC"], ["general", "General"], ["team", "Team"], ["bots", "Bots"], ["logins", "Logins"], ["look", "Look"], ["services", "Services"]])
      await screen(`Settings, ${label}`, async () => {
        await settings(pane);
        await judge(`settings-${pane}`, `main[data-settings-pane="${pane}"]`);
      });
    // A bot's profile, in the panel: Works on says this PC, for Boppy (Auto) and Rook (always on this PC).
    for (const [bot, line] of [["Boppy", /Works on\s*Its cloud computer, or your PC when a task needs it/], ["Rook", /Works on\s*Your PC, always/]])
      await screen(`${bot}'s profile (Works on)`, async () => {
        await fresh();
        await row(bot).click();
        await button(`${bot}'s profile`).click();
        await page.locator("section[data-panel]").getByText("Works on", { exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
        await judge(`profile-${bot.toLowerCase()}`, "section[data-panel]", (text) => {
          assert.match(text, line);
          assert.match(text, /\bYour PC\b/, "its Works on choice says Your PC");
        });
      });
    // A bot's settings page, each section opened (AI's Works on, Computer, Skills' Works on your PC...).
    for (const bot of ["Boppy", "Rook"])
      await screen(`${bot}'s settings page, every section`, async () => {
        await settings("bots");
        await page.locator('main[data-settings-pane="bots"]').getByRole("button", { name: "Open settings" }).nth(bot === "Boppy" ? 0 : 1).click();
        await page.locator("[data-bot-settings]").waitFor({ state: "visible", timeout: 15000 });
        const sections = await page.locator("[data-bot-settings] [data-nav]").evaluateAll((els) => els.map((e) => e.getAttribute("data-nav")));
        for (const sec of sections) {
          await page.locator(`[data-bot-settings] [data-nav="${sec}"]`).click();
          await page.waitForTimeout(250);
        }
        await judge(`bot-page-${bot.toLowerCase()}`, "[data-bot-settings]", bot === "Rook" ? (text) => assert.match(text, /Your PC, always/) : undefined);
      });
    for (const bot of ["Boppy", "Rook"])
      await screen(`Chat: ${bot}`, async () => {
        await fresh();
        await row(bot).click();
        await page.locator("#composer").waitFor({ state: "visible", timeout: 15000 });
        await judge(`chat-${bot.toLowerCase()}`, "main");
      });
    for (const [name, go] of [
      ["Routines", async () => await button("Routines").click()],
      ["Skills", async () => (await button("Routines").click(), await page.waitForTimeout(300), await button("Skills").click())],
      ["Knowledge", async () => await button("Knowledge").click()],
    ])
      await screen(`Panel: ${name}`, async () => {
        await fresh();
        await go();
        await judge(`panel-${name.toLowerCase()}`, "section[data-panel]");
      });
    console.log(`info screens looked at on win32: ${looked.length} (pictures in ${shots})`);
  } finally {
    await browser?.close().catch(() => {});
    if (server.exitCode === null) {
      const gone = new Promise((ok) => server.once("exit", ok));
      server.kill();
      await gone;
    }
    orgo.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}
try {
  await screens();
} catch (e) {
  failures++;
  console.error(`FAIL screens\n  ${String(e.stack ?? e).split("\n").slice(0, 6).join("\n  ")}`);
}

if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`windows wording: ${passed} passed`);
process.exit(0);

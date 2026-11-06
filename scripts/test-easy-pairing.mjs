// Tests for Settings, Your phone as a guided flow (components/app/setup.tsx PhoneCard, app/api/remote/route.ts):
// three steps on one screen (Get the app, Tailscale, Pair), the app download as a QR code the server made, what to do
// when this computer has no Tailscale address, a pairing QR big enough to scan at arm's length with its quiet zone,
// and no dashes in what it shows. Settings has a top level Your phone place (right after How bots reach you) that opens
// this flow, only where pairing works (the server answers /api/remote) and never in a shared workspace, and This PC no
// longer has a second copy.
//
// The real route runs (its QR codes come from qrcode, as in the app) with the pairing store, the address lookup and
// the window check stubbed: nothing is written, no network, and the code is a fake one.
// Usage: node scripts/test-easy-pairing.mjs   (not with --conditions=react-server: a client component)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const stub = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS = {
  "server-only": stub("export {};"),
  "@/lib/server/owner-email": stub("export const fromThisMac = () => true;"),
  "@/lib/server/ui-token": stub("export const fromBopsWindow = () => true;"),
  "@/lib/server/remote": stub(
    "export const pair = () => (globalThis.__remote.paired = true, 'x'.repeat(43));" +
      "export const unpair = () => { globalThis.__remote.paired = false; };" +
      "export const pairing = () => (globalThis.__remote.paired ? { hash: 'h', created: 1 } : null);" +
      "export const addresses = () => globalThis.__remote.addresses;" +
      "export const tailscaleState = () => globalThis.__remote.tailscale ?? { installed: false, connected: false, needsLogin: false };",
  ),
};
// The real lib/server/remote.ts (for tailscaleState): a Tailscale CLI that's there and answers slowly, through a stand-in
// execFile that records how it was called, and no network interfaces (so the CLI is asked).
const REMOTE_STUBS = {
  "node:child_process": stub(
    "import { promisify } from 'node:util';" +
      "export function execFile(bin, args, opts, cb) { const t = globalThis.__tailscale; t.calls.push({ bin, args, opts }); setTimeout(() => cb(null, t.stdout, ''), t.delay); }" +
      "execFile[promisify.custom] = (bin, args, opts) => new Promise((res, rej) => execFile(bin, args, opts, (e, stdout, stderr) => (e ? rej(e) : res({ stdout, stderr }))));" +
      "export function execFileSync() { throw new Error('execFileSync blocks the server'); }",
  ),
  "node:fs": stub("import * as fs from 'node:fs'; export * from 'node:fs'; export const existsSync = (p) => /tailscale/i.test(String(p)) || fs.existsSync(p);"),
  "node:os": stub("export * from 'node:os'; export const networkInterfaces = () => ({});"),
};
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
    if (REMOTE_STUBS[specifier] && context.parentURL?.endsWith("/lib/server/remote.ts")) return { url: REMOTE_STUBS[specifier], shortCircuit: true };
    if (specifier.startsWith("@/")) specifier = pathToFileURL(`${root}/${specifier.slice(2)}`).href;
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier))
        for (const ext of [".ts", ".tsx"])
          try {
            return next(specifier + ext, context);
          } catch {}
      throw e;
    }
  },
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    if (!url.endsWith(".tsx")) return next(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: url });
    return { format: "module", source: out.outputText, shortCircuit: true };
  },
});
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => (rest[0]?.code === "MODULE_TYPELESS_PACKAGE_JSON" ? undefined : emitWarning(warning, ...rest));

const { parseHTML } = await import("linkedom");
const { window: win } = parseHTML("<!doctype html><html><body></body></html>");
win.HTMLElement.prototype.focus = function () {};
win.HTMLElement.prototype.scrollIntoView = () => {};
win.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = win.document;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.EventSource = class {
  close() {}
};
globalThis.location = { origin: "http://localhost:3210" };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const route = await import(pathToFileURL(`${root}/app/api/remote/route.ts`).href);
const { APP_URL, TAILSCALE_ANDROID_URL, TAILSCALE_WINDOWS_URL } = await import(pathToFileURL(`${root}/lib/remote-links.ts`).href);
const { PhoneCard } = await import(pathToFileURL(`${root}/components/app/setup.tsx`).href);
const App = await import(pathToFileURL(`${root}/components/app/bops-app.tsx`).href);

const TAILNET = { tailnet: ["http://100.64.0.7:3210"], home: ["http://192.168.1.20:3210"], public: null };
const NONE = { tailnet: [], home: ["http://192.168.1.20:3210"], public: null };
globalThis.__remote = { paired: false, addresses: TAILNET };
// Whether this is the owner's own Bops window: when not, /api/remote says no (403), as the route's check does.
let window_ = true;
const calls = [];
// The page's fetch goes straight to the real route handlers.
globalThis.fetch = async (input, init = {}) => {
  const path = typeof input === "string" ? input : input.url;
  if (path.split("?")[0] !== "/api/remote") return new Response("{}", { status: 404 });
  calls.push(`${init.method ?? "GET"} ${path}`);
  if (!window_) return new Response(JSON.stringify({ error: "A phone can only be paired in the Bops app." }), { status: 403 });
  const method = init.method ?? "GET";
  return route[method](new Request(`http://localhost:3210${path}`, { method }));
};

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const settle = () => new Promise((r) => setTimeout(r, 20));
async function mount() {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const r = createRoot(box);
  await act(async () => {
    r.render(h(PhoneCard));
    await settle();
  });
  return { box, done: () => act(async () => r.unmount()).then(() => box.remove()) };
}
const click = async (box, label) => {
  const b = [...box.querySelectorAll("button")].find((x) => x.textContent.trim() === label);
  assert.ok(b, `a ${label} button`);
  await act(async () => {
    b.dispatchEvent(new win.Event("click", { bubbles: true }));
    await settle();
  });
};
const step = (box, n) => box.querySelector(`[data-step="${n}"]`);
const qr = (box, label) => box.querySelector(`[data-qr="${label}"]`);
// How wide a QR code is drawn where there's room: its max width (it shrinks to a narrow window, never cut off).
const px = (el) => {
  const max = Number(/max-width:\s*(\d+)px/.exec(el.getAttribute("style") ?? "")?.[1] ?? 0);
  assert.match(el.getAttribute("class"), /\bw-full\b/, "fills the width up to it");
  assert.match(el.getAttribute("class"), /\baspect-square\b/, "stays square as it shrinks");
  return max;
};
const DASHES = /[‐‑‒–—―]| - /;
// Shown text only: links and codes are what they are (the APK link has dashes in it).
const words = (el) => {
  const copy = el.cloneNode(true);
  for (const x of copy.querySelectorAll("a, code, svg")) x.remove();
  return copy.textContent;
};

await test("three steps on one screen: Get the app, Tailscale, Pair", async () => {
  globalThis.__remote = { paired: false, addresses: TAILNET };
  const m = await mount();
  const list = m.box.querySelector('ol[aria-label="Set up your phone"]');
  assert.ok(list, "one list of steps");
  assert.deepEqual([...list.querySelectorAll("[data-step]")].map((s) => s.querySelector("span + div > span").textContent.trim()), ["Step 1: Get the app", "Step 2: Tailscale", "Step 3: Pair"]);
  await m.done();
});

await test("step 1 has a server-made QR code of the APK link, and the link itself", async () => {
  const m = await mount();
  const s1 = step(m.box, 1);
  const code = qr(s1, "Download the Bops app");
  assert.ok(code?.querySelector("svg"), "a QR code");
  assert.match(code.innerHTML, /^<svg[^>]*viewBox/, "an SVG from qrcode");
  assert.ok(px(code) >= 160, `app QR ${px(code)}px`);
  assert.equal(s1.querySelector("a").getAttribute("href"), APP_URL);
  assert.equal(APP_URL, "https://github.com/Kevo919/bops/releases/download/android-latest/bops-remote.apk");
  await m.done();
});

await test("step 2 with Tailscale: says it is ready and shows the address", async () => {
  const m = await mount();
  const s2 = step(m.box, 2);
  assert.ok(s2.querySelector('[data-tailscale="ready"]'));
  assert.match(s2.textContent, /100\.64\.0\.7:3210/);
  assert.equal(s2.querySelector('[data-qr="Tailscale on Google Play"]'), null);
  await m.done();
});

await test("no Tailscale address: says exactly what to do, with Google Play QR, Windows link and Check again", async () => {
  globalThis.__remote = { paired: false, addresses: NONE };
  const m = await mount();
  const s2 = step(m.box, 2);
  const missing = s2.querySelector('[data-tailscale="missing"]');
  assert.ok(missing);
  assert.match(missing.textContent, /no Tailscale address yet/);
  assert.match(missing.textContent, /Install Tailscale here/);
  assert.match(missing.textContent, /same account/);
  assert.ok(qr(s2, "Tailscale on Google Play")?.querySelector("svg"), "a Google Play QR code");
  const hrefs = [...s2.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(hrefs, [TAILSCALE_WINDOWS_URL, TAILSCALE_ANDROID_URL]);
  assert.match(missing.textContent, /home wifi address is not used/);
  assert.ok([...s2.querySelectorAll("button")].some((b) => b.textContent === "Check again"));
  assert.doesNotMatch(m.box.textContent, /192\.168\.1\.20/, "never offers the home address");
  assert.match(step(m.box, 3).textContent, /No QR yet: step 2/);
  assert.doesNotMatch(m.box.textContent, /none yet\b(?! \(see step 2\))/);
  // Nothing to pair with: Pair a phone is off, and pressing it anyway sends nothing.
  const pairButton = [...m.box.querySelectorAll("button")].find((b) => b.textContent.trim() === "Pair a phone");
  assert.ok(pairButton.disabled, "Pair a phone is off without a usable address");
  calls.length = 0;
  await click(m.box, "Pair a phone");
  assert.deepEqual(calls.filter((c) => c.startsWith("POST")), [], "nothing sent");
  assert.equal(globalThis.__remote.paired, false, "not paired");
  assert.equal(qr(step(m.box, 3), "Pairing QR code"), null);
  await m.done();
});

await test("Tailscale installed but signed out: says so plainly (not install it), and step 3 says why there is no QR", async () => {
  globalThis.__remote = { paired: false, addresses: NONE, tailscale: { installed: true, connected: false, needsLogin: true, backend: "NeedsLogin" } };
  const m = await mount();
  const s2 = step(m.box, 2);
  const signedOut = s2.querySelector('[data-tailscale="signed-out"]');
  assert.ok(signedOut, "its own state, not the missing one");
  assert.match(signedOut.textContent, /installed on this computer but not signed in/);
  assert.match(signedOut.textContent, /system tray/);
  assert.match(signedOut.textContent, /same account as your phone/);
  assert.ok([...signedOut.querySelectorAll("button")].some((b) => b.textContent === "Check again"));
  assert.match(step(m.box, 3).textContent, /Tailscale on this computer is not signed in \(step 2\)/);
  const pairButton = [...m.box.querySelectorAll("button")].find((b) => b.textContent.trim() === "Pair a phone");
  assert.ok(pairButton?.disabled, "still off until signed in");
  await m.done();
});

await test("one press shows a big pairing QR (at least 220px, quiet zone), with address and code as a fallback", async () => {
  globalThis.__remote = { paired: false, addresses: TAILNET };
  const m = await mount();
  await click(m.box, "Pair a phone");
  const s3 = step(m.box, 3);
  const code = qr(s3, "Pairing QR code");
  assert.ok(code, "pairing QR right after one press");
  assert.ok(px(code) >= 220, `pairing QR ${px(code)}px`);
  const svg = code.querySelector("svg");
  assert.ok(Number(svg.getAttribute("width")) >= 220, "the SVG itself is drawn that big");
  // Quiet zone: qrcode margin 4, the first dark module starts four modules in.
  assert.match(code.innerHTML, /<path stroke="#000000" d="M4 4\.5/);
  assert.match(code.innerHTML, /fill="#ffffff"/);
  assert.match(s3.textContent, /press Scan QR code/);
  assert.match(s3.textContent, /Address: http:\/\/100\.64\.0\.7:3210/);
  assert.match(s3.textContent, /Pairing code: x{43}/);
  assert.match(s3.textContent, /shown only now/);
  await m.done();
});

await test("the pairing QR carries a bops://pair link with the Tailscale address, never a home one", async () => {
  globalThis.__remote = { paired: false, addresses: TAILNET };
  const res = await route.POST(new Request("http://localhost:3210/api/remote", { method: "POST" }));
  const body = await res.json();
  assert.match(body.qr, /width="264"/);
  const QR = (await import("qrcode")).default;
  const expected = await QR.toString(`bops://pair?a=${encodeURIComponent("http://100.64.0.7:3210")}&c=${"x".repeat(43)}`, { type: "svg", margin: 4, width: 264, errorCorrectionLevel: "M" });
  assert.equal(body.qr, expected);
});

await test("the server refuses to pair without a usable address, before it makes a code: no Paired that no phone can reach", async () => {
  globalThis.__remote = { paired: false, addresses: NONE };
  const res = await route.POST(new Request("http://localhost:3210/api/remote", { method: "POST" }));
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, undefined, "no code");
  assert.equal(body.qr, undefined, "no QR");
  assert.match(body.error, /no Tailscale address yet/);
  assert.equal(globalThis.__remote.paired, false, "pair() never ran");
  // A phone paired before keeps working: a refused Pair again changes nothing.
  globalThis.__remote = { paired: true, addresses: NONE };
  assert.equal((await route.POST(new Request("http://localhost:3210/api/remote", { method: "POST" }))).status, 409);
  assert.equal(globalThis.__remote.paired, true);
});

await test("paired but the address went away: the Tailscale step shows, and Pair again is off", async () => {
  globalThis.__remote = { paired: true, addresses: NONE };
  const m = await mount();
  assert.ok(step(m.box, 2)?.querySelector('[data-tailscale="missing"]'), "step 2 says what to do");
  assert.ok([...m.box.querySelectorAll("button")].find((b) => b.textContent.trim() === "Pair again").disabled);
  assert.match(step(m.box, 3).textContent, /No QR yet: step 2/);
  await m.done();
});

await test("step 2 and the pairing QR show the same address (an https address wins over Tailscale in both)", async () => {
  const both = { tailnet: ["http://100.64.0.7:3210"], home: [], public: "https://bops.example.com" };
  globalThis.__remote = { paired: false, addresses: both };
  const m = await mount();
  const s2 = step(m.box, 2);
  assert.ok(s2.querySelector('[data-tailscale="public"]'));
  assert.equal(s2.querySelector("code").textContent, "https://bops.example.com");
  await click(m.box, "Pair a phone");
  assert.match(step(m.box, 3).textContent, /Address: https:\/\/bops\.example\.com/);
  const body = await (await route.POST(new Request("http://localhost:3210/api/remote", { method: "POST" }))).json();
  const QR = (await import("qrcode")).default;
  assert.equal(body.qr, await QR.toString(`bops://pair?a=${encodeURIComponent("https://bops.example.com")}&c=${"x".repeat(43)}`, { type: "svg", margin: 4, width: 264, errorCorrectionLevel: "M" }));
  await m.done();
});

await test("the app and Tailscale QR codes are made only for the open Your phone pane (help=1), never for Settings' plain check", async () => {
  globalThis.__remote = { paired: false, addresses: TAILNET };
  const plain = await (await route.GET(new Request("http://localhost:3210/api/remote"))).json();
  assert.equal(plain.help, undefined, "no QR codes for a plain GET");
  const open = await (await route.GET(new Request("http://localhost:3210/api/remote?help=1"))).json();
  assert.match(open.help.app, /^<svg/);
  const pairedBody = await (await route.POST(new Request("http://localhost:3210/api/remote", { method: "POST" }))).json();
  assert.equal(pairedBody.help, undefined, "pairing makes only its own QR");
});

await test("paired: the steps stay out of the way until Pair again, which still asks first", async () => {
  globalThis.__remote = { paired: true, addresses: TAILNET };
  const m = await mount();
  assert.equal(m.box.querySelector("ol"), null);
  await click(m.box, "Pair again");
  assert.ok(m.box.querySelector('[role="alertdialog"]'), "asked first");
  await click(m.box, "Pair again");
  assert.ok(qr(step(m.box, 3), "Pairing QR code"));
  await m.done();
});

await test("plain words: no dashes in anything shown, in every state", async () => {
  for (const [paired, addresses] of [[false, TAILNET], [false, NONE], [false, { tailnet: [], home: [], public: "https://bops.example.com" }]]) {
    globalThis.__remote = { paired, addresses };
    const m = await mount();
    assert.doesNotMatch(words(m.box), DASHES);
    await click(m.box, "Pair a phone");
    assert.doesNotMatch(words(m.box), DASHES);
    await m.done();
  }
});

await test("tailscaleState asks the CLI without blocking the server, with no console window, a timeout, and a cache", async () => {
  const real = await import(pathToFileURL(`${root}/lib/server/remote.ts`).href);
  globalThis.__tailscale = { calls: [], delay: 200, stdout: JSON.stringify({ BackendState: "NeedsLogin" }) };
  let ticked = false;
  setTimeout(() => (ticked = true), 5);
  const started = Date.now();
  const asking = real.tailscaleState();
  assert.ok(asking instanceof Promise, "answers with a promise");
  assert.ok(Date.now() - started < 50, "returns at once, before the CLI answers");
  const again = real.tailscaleState();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(ticked, "timers run while the CLI is being asked: the event loop isn't held");
  const state = await asking;
  assert.deepEqual(state, { installed: true, connected: false, needsLogin: true, backend: "NeedsLogin" });
  assert.equal(await again, state, "a poll while it's asked waits for the same answer");
  assert.equal(globalThis.__tailscale.calls.length, 1, "the CLI is asked once");
  const { args, opts } = globalThis.__tailscale.calls[0];
  assert.deepEqual(args, ["status", "--json"]);
  assert.equal(opts.windowsHide, true, "no console window flashes on Windows");
  assert.ok(opts.timeout > 0 && opts.timeout <= 4000, `a timeout (${opts.timeout} ms)`);
  assert.deepEqual(await real.tailscaleState(), state, "cached");
  assert.equal(globalThis.__tailscale.calls.length, 1, "cached: not asked again within ten seconds");
});

/* ---------------- Settings, Your phone ---------------- */

const stateOf = (o = {}) => ({
  account: { user: { id: "u_ava", name: "Ava Reed", email: "ava@example.test" } },
  owner: { name: "Ava" },
  host: "mac",
  workspace: "ws_main",
  workspaces: [{ id: "ws_main", name: "Main", createdAt: 1 }],
  bots: [],
  accounts: [],
  vault: [],
  brains: [],
  chats: [],
  sessions: [],
  messages: [],
  routines: [],
  watches: [],
  usage: [],
  madeApps: [],
  ...o,
});
const noop = () => {};
const settings = (o = {}, props = {}) => h(App.Settings, { state: stateOf(o), onClose: noop, onShowScreen: noop, onOpenVault: noop, onOpenBot: noop, ...props });
const navIds = (box) => [...box.querySelectorAll("[data-settings-nav]")].map((b) => b.getAttribute("data-settings-nav"));
async function mountEl(el) {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const r = createRoot(box);
  await act(async () => {
    r.render(el);
    await settle();
  });
  return { box, done: () => act(async () => r.unmount()).then(() => box.remove()) };
}
const press = (el) =>
  act(async () => {
    el.dispatchEvent(new win.Event("click", { bubbles: true, cancelable: true }));
    await settle();
  });

await test("Settings has Your phone right after How bots reach you, and it opens the three step pairing flow", async () => {
  window_ = true;
  calls.length = 0;
  globalThis.__remote = { paired: false, addresses: TAILNET };
  const m = await mountEl(settings());
  assert.ok(calls.includes("GET /api/remote"), "Settings asks the plain way, with no QR codes made");
  assert.ok(!calls.some((c) => c.includes("help=1")), "no QR codes before Your phone opens");
  const ids = navIds(m.box);
  assert.equal(ids[ids.indexOf("reach") + 1], "phone", `Your phone right after How bots reach you: ${ids.join(", ")}`);
  const item = m.box.querySelector('[data-settings-nav="phone"]');
  assert.equal(item.textContent.trim(), "Your phone");
  await press(item);
  assert.ok(calls.includes("GET /api/remote?help=1"), "the QR codes once Your phone is open");
  const main = m.box.querySelector('main[data-settings-pane="phone"]');
  assert.ok(main, "the Your phone pane");
  assert.match(main.textContent, /^Your phone/, "its heading first");
  const list = main.querySelector('ol[aria-label="Set up your phone"]');
  assert.ok(list, "the guided flow in the pane");
  assert.equal(main.querySelector("[data-step]"), list.querySelector("[data-step]"), "the steps at the top, before anything else");
  assert.ok([...main.querySelectorAll("button")].some((b) => b.textContent.trim() === "Pair a phone"));
  assert.doesNotMatch(words(main), DASHES);
  await m.done();
});

await test("This PC has no second copy of the pairing card", async () => {
  window_ = true;
  const m = await mountEl(settings());
  await press(m.box.querySelector('[data-settings-nav="mac"]'));
  const main = m.box.querySelector('main[data-settings-pane="mac"]');
  assert.ok(main);
  assert.equal(main.querySelector('ol[aria-label="Set up your phone"]'), null);
  assert.ok(![...main.querySelectorAll("button")].some((b) => b.textContent.trim() === "Pair a phone"));
  await m.done();
});

await test("no Your phone where pairing does not work: not the owner's window, or a shared workspace", async () => {
  window_ = false;
  let m = await mountEl(settings());
  assert.ok(!navIds(m.box).includes("phone"), "the server said no");
  await m.done();
  window_ = true;
  m = await mountEl(settings({ shared: { name: "Fernway", role: "editor" } }));
  assert.ok(!navIds(m.box).includes("phone"), "a shared workspace");
  await m.done();
  // Asked to open at Your phone there anyway: it doesn't.
  m = await mountEl(settings({ shared: { name: "Fernway", role: "editor" } }, { at: "phone" }));
  assert.notEqual(m.box.querySelector("main[data-settings-pane]")?.getAttribute("data-settings-pane"), "phone");
  await m.done();
});

console.log(`easy pairing: ${passed} passed`);

// Tests for Settings, Your phone as a guided flow (components/app/setup.tsx PhoneCard, app/api/remote/route.ts):
// three steps on one screen (Get the app, Tailscale, Pair), the app download as a QR code the server made, what to do
// when this computer has no Tailscale address, a pairing QR big enough to scan at arm's length with its quiet zone,
// and no dashes in what it shows.
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
      "export const addresses = () => globalThis.__remote.addresses;",
  ),
};
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
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
globalThis.window = win;
globalThis.document = win.document;
globalThis.location = { origin: "http://localhost:3210" };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const route = await import(pathToFileURL(`${root}/app/api/remote/route.ts`).href);
const { APP_URL, TAILSCALE_ANDROID_URL, TAILSCALE_WINDOWS_URL } = await import(pathToFileURL(`${root}/lib/remote-links.ts`).href);
const { PhoneCard } = await import(pathToFileURL(`${root}/components/app/setup.tsx`).href);

const TAILNET = { tailnet: ["http://100.64.0.7:3210"], home: ["http://192.168.1.20:3210"], public: null };
const NONE = { tailnet: [], home: ["http://192.168.1.20:3210"], public: null };
globalThis.__remote = { paired: false, addresses: TAILNET };
// The page's fetch goes straight to the real route handlers.
globalThis.fetch = async (input, init = {}) => {
  const path = typeof input === "string" ? input : input.url;
  if (path !== "/api/remote") return new Response("{}", { status: 404 });
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
const px = (el) => Number(/width:\s*(\d+)px/.exec(el.getAttribute("style") ?? "")?.[1] ?? 0);
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
  assert.match(step(m.box, 3).textContent, /Finish step 2 first/);
  assert.doesNotMatch(m.box.textContent, /none yet\b(?! \(see step 2\))/);
  // Pairing anyway: no QR (no safe address), and what to do instead of a bare "none yet".
  await click(m.box, "Pair a phone");
  const s3 = step(m.box, 3);
  assert.equal(qr(s3, "Pairing QR code"), null);
  assert.match(s3.querySelector("[data-no-address]").textContent, /no Tailscale address yet.*Do step 2, then press Pair again/);
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
  globalThis.__remote = { paired: false, addresses: NONE };
  const none = await (await route.POST(new Request("http://localhost:3210/api/remote", { method: "POST" }))).json();
  assert.equal(none.qr, null, "no QR without a Tailscale or https address");
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

console.log(`easy pairing: ${passed} passed`);

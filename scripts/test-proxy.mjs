// Who may call Bops' API (proxy.ts): the app on this Mac only, and on the Mac app, only its window (the
// httpOnly cookie desktop/main.cjs sets, or its own header), so a bot's Chrome that reached the server
// can neither act nor read. The tailnet's and the cloud tunnel's paths prove themselves; the app's health
// and bots' pages are open reads. main.cjs's own calls (desktop/own-call.cjs: a restart, the Mac going to
// sleep), sent as it sends them, get through, and it makes no other call to the API but the open health read.
// Run: node --conditions=react-server scripts/test-proxy.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// proxy.ts imports "next/server" the way Next resolves it (the package's CommonJS entry file).
registerHooks({
  resolve(specifier, context, next) {
    return next(specifier === "next/server" ? "next/server.js" : specifier === "./lib/routine-hook" ? "./lib/routine-hook.ts" : specifier, context);
  },
});
const { NextRequest } = await import("next/server");
const { proxy } = await import(pathToFileURL(join(root, "proxy.ts")).href);

const TOKEN = "t".repeat(64);
const call = (method, path, { host = "localhost:3210", origin = "http://localhost:3210", cookie, header } = {}) => {
  const headers = { host };
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  if (header) headers["x-bops-window"] = header;
  return proxy(new NextRequest(`http://${host}${path}`, { method, headers }));
};
const passes = (res) => res.headers.get("x-middleware-next") === "1";

// No token (a hosted server, or a dev server outside the app): same-origin calls go through as before.
delete process.env.BOPS_UI_TOKEN;
assert.equal(call("GET", "/api/local-subscriptions").status, 403, "local CLI status requires an authenticated desktop even in development");
assert.ok(passes(call("POST", "/api/apps/approvals")), "no token: as before");
assert.equal(call("POST", "/api/apps/approvals", { host: "192.168.1.5:3210", origin: null }).status, 403, "another host still can't");
assert.equal(call("POST", "/api/apps/approvals", { origin: "https://evil.example" }).status, 403, "another origin still can't");

process.env.BOPS_UI_TOKEN = TOKEN;
for (const method of ["GET", "POST"]) {
  assert.ok(passes(call(method, "/api/local-subscriptions", { cookie: `bops_window=${TOKEN}` })), "the desktop can manage its local CLI");
  assert.equal(call(method, "/api/local-subscriptions", { cookie: `bops_window=${TOKEN}; bops_remote=phone` }).status, 403, "phone credentials never grant local CLI access");
  assert.equal(call(method, "/api/local-subscriptions", { cookie: `bops_window=${TOKEN}`, origin: "https://evil.example" }).status, 403, "foreign origin cannot manage CLI auth");
}
// What a bot's Chrome on this Mac could send after a redirect onto the app's own page: same origin, no cookie.
for (const [method, path] of [["POST", "/api/apps/approvals"], ["POST", "/api/chats/c1/messages"], ["POST", "/api/sessions/s1/where"], ["POST", "/api/apps"], ["PATCH", "/api/mac"], ["DELETE", "/api/bots"], ["POST", "/api/restart"]]) {
  const res = call(method, path);
  assert.equal(res.status, 403, `${method} ${path} without the window's token`);
  assert.deepEqual(await res.json(), { error: "Only the Bops app can do that." });
}
assert.equal(call("POST", "/api/apps/approvals", { cookie: `bops_window=${"x".repeat(64)}` }).status, 403, "another token");
assert.equal(call("POST", "/api/apps/approvals", { cookie: "bops_window=short" }).status, 403, "a short one");
// The window: its cookie (every request it makes), or main.cjs's header.
assert.ok(passes(call("POST", "/api/apps/approvals", { cookie: `theme=dark; bops_window=${TOKEN}` })), "the window's cookie");
assert.ok(passes(call("POST", "/api/restart", { origin: null, header: TOKEN })), "main.cjs's own call");
// Reads too: the chats, a bot computer's VNC password, the Mac's windows.
for (const path of ["/api/state", "/api/vnc?bot=boppy", "/api/mac/windows?all=1", "/api/mac/window?app=Notes", "/api/screen?bot=boppy", "/api/account", "/api/memory?ws=main"])
  assert.equal(call("GET", path).status, 403, `GET ${path} without the window's token`);
assert.ok(passes(call("GET", "/api/state", { cookie: `bops_window=${TOKEN}` })), "the window reads");
assert.ok(passes(call("GET", "/api/vnc?bot=boppy", { origin: null, cookie: `bops_window=${TOKEN}` })), "an img or a stream of the window's, no Origin");
// Open reads: the app's health (main.cjs, before the window loads) and bots' pages (a tab of their own, or the browser).
assert.ok(passes(call("HEAD", "/api/health", { origin: null })));
assert.ok(passes(call("GET", "/api/health", { origin: null })));
assert.ok(passes(call("GET", "/api/pages/p_123", { origin: null })));
assert.equal(call("POST", "/api/pages/p_123").status, 403, "but nothing else on them");
// A document a bot made (docs.ts): its download link is clicked as a navigation, which the shell's
// download handler or a new tab makes without the window's cookie - so like pages and files, an open read.
assert.ok(passes(call("GET", "/api/docs/docs_0123456789abcdef", { origin: null })), "a doc download reaches the route, which 404s unknown ids");
assert.equal(call("POST", "/api/docs/docs_0123456789abcdef").status, 403, "but only reads on them");
// An app a bot made: its page (code only) is an open read; what it keeps, its code and its bridge are the window's.
assert.ok(passes(call("GET", "/api/made-apps/app_123/view?v=2", { origin: null })));
for (const [method, path] of [["POST", "/api/made-apps/app_123/bridge"], ["GET", "/api/made-apps/app_123"], ["POST", "/api/made-apps/app_123"], ["GET", "/api/made-apps/app_123/view/x"]])
  assert.equal(call(method, path).status, 403, `${method} ${path} without the window's token`);
assert.ok(passes(call("OPTIONS", "/api/state")));
// The tailnet's paths and the tunnel's prove themselves (a bot's secret, a webhook signature, the tunnel's token).
assert.ok(passes(call("POST", "/api/apps/call", { host: "100.64.0.3:3210", origin: null })));
assert.ok(passes(call("POST", "/api/phone/agentphone", { origin: null })));
assert.ok(passes(call("POST", "/api/cloud/event", { host: "127.0.0.1:3210", origin: null })));
// desktop/main.cjs's own calls, as Node's fetch sends them: to 127.0.0.1, no Origin, no cookie, the token in a header.
const { ownCall } = createRequire(import.meta.url)(`${root}/desktop/own-call.cjs`);
const asSent = ([url, init]) => proxy(new NextRequest(url, { method: init.method, headers: { host: new URL(url).host, ...init.headers } }));
assert.ok(passes(asSent(ownCall("http://127.0.0.1:3210", TOKEN, "/api/restart", { method: "POST", timeoutMs: 20_000 }))), "a restart");
assert.equal(asSent(ownCall("http://127.0.0.1:3210", "x".repeat(64), "/api/restart", { method: "POST", timeoutMs: 20_000 })).status, 403, "another token still can't");
// Every call main.cjs makes to the API goes as its own (ownCall), but the open health read.
const main = readFileSync(`${root}/desktop/main.cjs`, "utf8");
const bare = [...main.matchAll(/fetch\(\s*`\$\{(?:LOCAL|URL)\}(\/api\/[^`?]*)/g)].map((m) => m[1]).filter((path) => path !== "/api/health");
assert.deepEqual(bare, [], "main.cjs calls the API without the window's token");
assert.ok(/fetch\(\.\.\.ownCall\(LOCAL, windowToken\(\), "\/api\/restart", \{ method: "POST", timeoutMs: 20_000 \}\)\)/.test(main), "main.cjs's restart call is the one checked above");
assert.ok(!main.includes("sleeping: true"), "the Mac going to sleep hands nothing back: a computer's routines are never the Mac's to hold");
delete process.env.BOPS_UI_TOKEN;
console.log("proxy: ok");

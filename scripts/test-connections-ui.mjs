// Settings, Connections as the owner sees it (components/app/connections-card.tsx): a row each for Composio
// (connected apps), Zapier and OpenRouter, with a status dot (not set, set, and after Check working or not in plain
// words), where to get a key, what to paste where, a Check that asks /api/key-check, and the way to Connected apps
// in Logins. Only what /api/key-check says reaches the window: never a key or an address. It sits after Models.
//
// Rendered into a DOM (linkedom) against a fake Bops: nothing reaches a server.
// Usage: node scripts/test-connections-ui.mjs   (not with --conditions=react-server: a client component)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const rootPath = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const rootUrl = pathToFileURL(rootPath).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = `${rootUrl}/${specifier.slice(2)}`;
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
    if (!url.endsWith(".tsx")) return next(url, context);
    const out = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: url });
    return { format: "module", source: out.outputText, shortCircuit: true };
  },
});
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => (rest[0]?.code === "MODULE_TYPELESS_PACKAGE_JSON" ? undefined : emitWarning(warning, ...rest));

const { parseHTML } = await import("linkedom");
const { window: win } = parseHTML("<!doctype html><html><body></body></html>");
const doc = win.document;
globalThis.window = globalThis;
globalThis.document = doc;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* ---------------- A fake Bops ---------------- */

const rows = [
  { key: "OPENAI_API_KEY", label: "OpenAI", status: "set" },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter", status: "set" },
  { key: "COMPOSIO_API_KEY", label: "Composio (connected apps)", status: "set" },
  { key: "ZAPIER_MCP_URL", label: "Zapier", status: "not set" },
  { key: "COMPOSIO_MCP_URL", label: "Composio (your account)", status: "set", shown: "connect.composio.dev/mcp, key ck_•••••••• saved" },
];
const sent = [];
const answers = {
  OPENROUTER_API_KEY: { key: "OPENROUTER_API_KEY", label: "OpenRouter", status: "works", message: "The authenticated check succeeded." },
  COMPOSIO_API_KEY: { key: "COMPOSIO_API_KEY", label: "Composio (connected apps)", status: "invalid", message: "The provider rejected this key's authentication." },
  COMPOSIO_MCP_URL: { key: "COMPOSIO_MCP_URL", label: "Composio (your account)", status: "works", message: "Composio answered with 2 tools: apps: Gmail, Google Drive.", shown: "connect.composio.dev/mcp, key ck_•••••••• saved" },
};
const json = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
globalThis.fetch = async (url, opts = {}) => {
  if (url !== "/api/key-check") throw new Error(`unexpected ${url}`);
  if (!opts.method || opts.method === "GET") return json({ keys: rows });
  const { key } = JSON.parse(opts.body);
  sent.push(key);
  return json({ result: answers[key] });
};

const { createElement: h, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ConnectionsCard, CONNECTIONS } = await import(`${rootUrl}/components/app/connections-card.tsx`);

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};
const click = (el) =>
  act(async () => {
    el.dispatchEvent(new win.Event("click", { bubbles: true, cancelable: true }));
    await settle();
  });
const row = (key) => box.querySelector(`[data-connection="${key}"]`);
const checkButton = (key) => [...row(key).querySelectorAll("button")].find((b) => b.textContent.trim() === "Check");

// Settings' nav, as bops-app.tsx has it: Connected apps opens Logins.
const nav = doc.createElement("button");
nav.setAttribute("data-settings-nav", "logins");
let navClicks = 0;
nav.addEventListener("click", () => navClicks++);
doc.body.appendChild(nav);
const box = doc.createElement("div");
doc.body.appendChild(box);
const root = createRoot(box);
await act(async () => {
  root.render(h(ConnectionsCard, { state: { accounts: [{ id: "ca_1", app: "gmail", appName: "Gmail", status: "active", at: 1 }] } }));
  await settle();
});
for (let i = 0; i < 20 && /Reading…/.test(box.textContent); i++) await act(async () => settle());

try {
  await test("four rows in plain words: Composio, Composio (your account), Zapier, OpenRouter, each with where to get a key and what to paste where", async () => {
    const text = box.textContent;
    assert.match(text, /Connections/);
    assert.deepEqual([...box.querySelectorAll("[data-connection]")].map((r) => r.getAttribute("data-connection")), ["COMPOSIO_API_KEY", "COMPOSIO_MCP_URL", "ZAPIER_MCP_URL", "OPENROUTER_API_KEY"]);
    assert.match(text, /3 of 4 set up/);
    const links = Object.fromEntries(CONNECTIONS.map((c) => [c.key, [...row(c.key).querySelectorAll("a")].map((a) => a.getAttribute("href"))]));
    assert.deepEqual(links, { COMPOSIO_API_KEY: ["https://composio.dev"], COMPOSIO_MCP_URL: ["https://composio.dev"], ZAPIER_MCP_URL: ["https://mcp.zapier.com"], OPENROUTER_API_KEY: ["https://openrouter.ai/keys"] });
    for (const [key, words] of [["COMPOSIO_API_KEY", "COMPOSIO_API_KEY=your_key"], ["ZAPIER_MCP_URL", "ZAPIER_MCP_URL=that_url"], ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY=your_key"], ["COMPOSIO_MCP_URL", "COMPOSIO_MCP_URL= followed by the address"]]) {
      assert.ok(row(key).textContent.includes(words), `${key}: what to paste`);
      assert.ok(row(key).textContent.includes(".env.local"), `${key}: where`);
    }
    assert.match(row("ZAPIER_MCP_URL").textContent, /not for team members, Telegram, Discord/);
    assert.match(row("OPENROUTER_API_KEY").textContent, /:free/);
    assert.ok(!box.querySelector("[data-connection=OPENAI_API_KEY]"), "only these four");
    assert.ok(box.querySelector("a[href$='docs/connections.md']"));
    assert.ok(!/—|–/.test(text), "no dashes");
  });

  await test("status dots: set before Check, not set without a key (and no Check then)", async () => {
    assert.equal(row("COMPOSIO_API_KEY").querySelector("[data-dot]").getAttribute("data-dot"), "set");
    assert.match(row("COMPOSIO_API_KEY").querySelector("[data-status]").textContent, /Set\. Press Check/);
    assert.equal(row("ZAPIER_MCP_URL").querySelector("[data-dot]").getAttribute("data-dot"), "off");
    assert.equal(row("ZAPIER_MCP_URL").querySelector("[data-status]").textContent, "Not set up yet");
    assert.ok(checkButton("ZAPIER_MCP_URL").disabled, "nothing to check");
  });

  await test("Check asks /api/key-check for that row only, then says working or what's wrong", async () => {
    await click(checkButton("OPENROUTER_API_KEY"));
    assert.deepEqual(sent, ["OPENROUTER_API_KEY"]);
    assert.equal(row("OPENROUTER_API_KEY").querySelector("[data-dot]").getAttribute("data-dot"), "ok");
    assert.equal(row("OPENROUTER_API_KEY").querySelector("[data-status]").textContent, "Working");
    await click(checkButton("COMPOSIO_API_KEY"));
    assert.equal(row("COMPOSIO_API_KEY").querySelector("[data-dot]").getAttribute("data-dot"), "error");
    assert.match(row("COMPOSIO_API_KEY").querySelector("[data-status]").textContent, /Not working: the key or address was turned down/);
    assert.match(row("COMPOSIO_API_KEY").querySelector("[data-message]").textContent, /rejected this key/);
  });

  await test("Composio (your account): plain steps, shown only masked, and Check lists what it found", async () => {
    const r = row("COMPOSIO_MCP_URL");
    assert.match(r.textContent, /In Composio, open For You, then Connect my agent, copy the address, paste it here/);
    assert.match(r.textContent, /COMPOSIO_MCP_KEY= followed by the key/);
    assert.match(r.textContent, /sends, changes, deletes or pays asks you first/);
    assert.match(r.textContent, /not for team members, Telegram, Discord/);
    assert.equal(r.querySelector("[data-shown]").textContent, "Saved: connect.composio.dev/mcp, key ck_•••••••• saved");
    assert.ok(!/—|–| - /.test(r.textContent), "no dashes");
    await click(checkButton("COMPOSIO_MCP_URL"));
    assert.equal(sent.at(-1), "COMPOSIO_MCP_URL");
    assert.equal(r.querySelector("[data-dot]").getAttribute("data-dot"), "ok");
    assert.match(r.querySelector("[data-message]").textContent, /Gmail, Google Drive/);
  });

  await test("Connected apps: how many there are, and a click opens Logins", async () => {
    const b = row("COMPOSIO_API_KEY").querySelector("[data-open-apps]");
    assert.match(b.textContent, /Connected apps \(1\)/);
    await click(b);
    assert.equal(navClicks, 1);
  });

  await test("in Settings, This Mac: Connections comes right after Models (Keys, Models, Connections)", async () => {
    const setup = readFileSync(`${rootPath}/components/app/setup.tsx`, "utf8");
    assert.match(setup, /<KeysCard \/>\s*<\/div>\s*<ModelsCard \/>\s*<ConnectionsCard state=\{state\} \/>/);
  });

  console.log(`PASS: ${passed} Connections card UI checks (fake Bops, no server)`);
} finally {
  await act(async () => root.unmount());
}

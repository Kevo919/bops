// Blank template IDs use documented defaults; disabled memory never constructs an SDK client.
// Synthetic configuration and intercepted fetch only. No personal state or live service access.
// Usage: node --conditions=react-server scripts/test-memory-blank-config.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-memory-reach";
const rootPath = fileURLToPath(new URL("..", import.meta.url));
const rootUrl = pathToFileURL(rootPath).href;
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-memory-reach-"));
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier.startsWith("@/")) specifier = at(specifier.slice(2));
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
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});
import { readFileSync } from "node:fs";

let calls = 0;
globalThis.fetch = async () => { calls++; throw new TypeError("synthetic offline"); };
const M = await import(at("lib/server/memory.ts"));
const route = await import(at("app/api/memory/route.ts"));
const S = await import(at("lib/server/store.ts"));
const { MAIN_WORKSPACE } = await import(at("lib/types.ts"));
clearInterval(globalThis.__bopsRoutines);
let passed = 0;
try {
  for (const blank of [undefined, "", "  \t "]) {
    for (const name of ["HONCHO_WORKSPACE_ID", "HONCHO_USER_PEER"]) {
      if (blank === undefined) delete process.env[name]; else process.env[name] = blank;
    }
    assert.deepEqual(M.bindingOf(MAIN_WORKSPACE), { bank: "bops", peer: "user" });
  }
  passed++;
  process.env.HONCHO_WORKSPACE_ID = "existing-bank";
  process.env.HONCHO_USER_PEER = "existing-peer";
  assert.deepEqual(M.bindingOf(MAIN_WORKSPACE), { bank: "existing-bank", peer: "existing-peer" });
  process.env.HONCHO_WORKSPACE_ID = " invalid existing bank ";
  assert.equal(M.bindingOf(MAIN_WORKSPACE).bank, " invalid existing bank ", "nonblank identities are never silently remapped");
  passed++;
  S.update(s => {
    s.workspaces ??= [];
    const ws = s.workspaces.find(w => w.id === MAIN_WORKSPACE);
    if (ws) ws.memory = { bank: "", peer: "" };
    else s.workspaces.push({ id: MAIN_WORKSPACE, name: "Test", memory: { bank: "", peer: "" } });
  });
  delete process.env.HONCHO_API_KEY;
  // The route answers a bot's Memory tab {off: true} before memoryFor is reached (8bb46bd, No blank screens:
  // the tab says memory isn't set up and how, components/app/bot-memory.tsx); memoryFor on its own says why.
  for (const query of ["?bot=boppy", "?bot=boppy&mine=1", "?bot=boppy&q=test"]) {
    const response = await route.GET(new Request(`http://localhost/api/memory${query}`));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result, { off: true, workspace: "", ws: "", card: [], facts: [] });
  }
  for (const opts of [{}, { mine: true }, { q: "test" }]) {
    const result = await M.memoryFor("boppy", opts);
    assert.equal(result.on, false);
    assert.match(result.error, /Memory is not set up/);
    assert.deepEqual(result.facts, []);
    assert.deepEqual(result.card, []);
    assert.equal(result.unreachable, undefined);
    assert.ok(!JSON.stringify(result).includes("workspaceId"));
  }
  assert.equal(calls, 0, "disabled memory does not contact any service, even with invalid persisted bindings");
  passed++;
  S.update(s => { for (const ws of s.workspaces) delete ws.memory; });
  process.env.HONCHO_API_KEY = "hc-synthetic-test";
  process.env.HONCHO_WORKSPACE_ID = "";
  process.env.HONCHO_USER_PEER = "";
  const response = await route.GET(new Request("http://localhost/api/memory?bot=boppy"));
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.unreachable, true);
  assert.ok(calls > 0, "enabled blank IDs reach the network using valid defaults, not SDK validation failure");
  assert.ok(!JSON.stringify(result).includes("workspaceId"));
  passed++;
  console.log(`memory blank config: ${passed} passed, 0 failed`);
} finally {
  process.chdir(tmpdir());
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.exit(0);

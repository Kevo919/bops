// Tests for what /api/memory says when memory is ON but its service won't answer (the 0855 crawl bug): a
// 503 with {unreachable: true} the Memory sheet and the bot's Memory tab turn into "can't reach the
// memory service" — not the fetch's error JSON, whose missing `on` field the sheet read as "Memory isn't
// on yet" (the wrong reason). With memory off, the same failure is a plain 500 {error} as before.
// Honcho is unreachable by construction (fetch to its origin fails); nothing reaches a real service.
// Usage: node --conditions=react-server scripts/test-memory-reachable.mjs
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

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 4).join("\n  ") ?? e.message}`);
  }
}

// Every fetch fails (the memory service is down, and so is everything else this test never needs).
globalThis.fetch = async (input) => {
  throw new TypeError(`offline: ${new URL(input instanceof Request ? input.url : String(input)).host}`);
};

const route = await import(at("app/api/memory/route.ts"));
const S = await import(at("lib/server/store.ts"));
clearInterval(globalThis.__bopsRoutines);
S.update((s) => {
  s.owner = { name: "Alex", timeZone: "America/New_York" };
});

const get = (q = "") => route.GET(new Request(`http://localhost/api/memory${q}`));

await check("memory on and its service unreachable (the bot tab, ?bot=): 503 with {unreachable: true}, not a plain 500", async () => {
  process.env.HONCHO_API_KEY = "hc-test-memory-reach";
  const r = await get("?bot=boppy");
  assert.equal(r.status, 503, `503, got ${r.status}`);
  const j = await r.json();
  assert.equal(j.unreachable, true, "the flag the tab reads");
  assert.ok(typeof j.error === "string" && j.error.length > 0, "the underlying error is still there");
});

await check("memory off: the same failure carries no unreachable flag", async () => {
  delete process.env.HONCHO_API_KEY;
  const r = await get("?bot=boppy");
  const j = await r.json().catch(() => ({}) );
  assert.equal(j.unreachable, undefined, "no flag when memory is off (whatever the failure then is)");
  process.env.HONCHO_API_KEY = "hc-test-memory-reach";
});

await check("the sheet and the tab distinguish the state in what they render (the wording, in the components)", async () => {
  const sheet = readFileSync(new URL(at("components/app/memory-sheet.tsx")), "utf8");
  assert.ok(/unreachable \?/.test(sheet), "the sheet branches on unreachable");
  assert.ok(/Can&rsquo;t reach the memory service/.test(sheet), "and says so in plain words");
  assert.ok(/!info\.on \?/.test(sheet), "keeping the isn't-on case for when memory really is off");
  const tab = readFileSync(new URL(at("components/app/bot-memory.tsx")), "utf8");
  assert.ok(/data\.unreachable \?/.test(tab), "the bot tab branches on unreachable");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`memory reachable: ${passed} passed`);
process.exit(0);

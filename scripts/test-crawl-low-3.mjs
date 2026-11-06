// Crawl LOW batch part 3 (L7, L9, L10): Look's Reset asks once before it resets (both places); an Orgo
// that won't answer is asked at most once a minute, then with a doubling back-off (not ~25 asks a
// minute); an app whose logo isn't at Composio's service is remembered as missing for ten minutes and
// its 404 is cacheable, so an offline run stops logging one console error per render.
// Usage: node --conditions=react-server scripts/test-crawl-low-3.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootPath = fileURLToPath(new URL("..", import.meta.url));
const rootUrl = pathToFileURL(rootPath).href;
const at = (p) => new URL(p, rootUrl).href;
const read = (p) => readFileSync(new URL(p, rootUrl), "utf8");

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 3).join("\n  ") ?? e.message}`);
  }
}

await check("L7: Reset asks once, at both places (the settings row and the chat's card)", () => {
  const ls = read("components/app/look-settings.tsx");
  assert.match(ls, /confirmReset \? "Reset for sure\?" : "Reset"/, "the settings button's two labels");
  assert.match(ls, /onBlur=\{\(\) => setConfirmReset\(false\)\}/, "clicking away cancels");
  const cv = read("components/app/chat-view.tsx");
  assert.match(cv, /confirmReset \? "For sure\?" : "Reset"/, "the card button's two labels");
  assert.match(cv, /action === "reset" && !confirmReset\) return setConfirmReset\(true\)/, "the first press only arms it");
});

await check("L9: a missed Orgo read is kept, with a doubling back-off (the real orgoPlan, against an Orgo that 404s)", async () => {
  // lib/server/plan.ts as the server runs it: a throwaway file store, the key in memory (never the Keychain), Orgo a
  // fake fetch, and the clock moved by hand. Modules that start processes when loaded are stand-ins (test-plan.mjs).
  process.env.BOPS_SELF_HOSTED = "1";
  for (const k of ["ORGO_API_KEY", "BOPS_ORGO_WORKSPACE", "BOPS_DATABASE_URL", "AGENTMAIL_API_KEY", "OPENAI_API_KEY", "TAILSCALE_AUTH_KEY"]) delete process.env[k];
  process.env.BOPS_ORGO_ORIGIN = "https://orgo.test";
  const STAND_INS = new Set(["mac", "relay", "desktop", "mirror"]);
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
    load(url, context, next) {
      const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
      if (!name || !STAND_INS.has(name)) return next(url, context);
      const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
      return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
    },
  });
  const scratch = mkdtempSync(join(tmpdir(), "bops-crawl-low-3-"));
  const home = process.cwd();
  process.chdir(scratch);
  globalThis.bopsOrgoKey = "sk_test_crawl";
  let plan = false;
  let asks = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.origin !== "https://orgo.test") throw new Error(`not the fake Orgo: ${url}`);
    if (url.pathname === "/api/user/subscription") {
      asks++;
      if (plan) return new Response(JSON.stringify({ tier: "hacker_v2" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });
  };
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const MIN = 60_000;
  try {
    const L = await import(at("lib/server/plan.ts"));
    const keep = () => globalThis.bopsOrgoPlan.keep;
    /** The plan, asked now: whether Orgo was asked for it. */
    const look = async () => {
      const before = asks;
      await L.orgoPlan();
      await new Promise((r) => setTimeout(r, 0));
      return asks > before;
    };
    assert.equal(await look(), true, "the first look asks Orgo");
    assert.equal(keep(), 2 * MIN, "a miss is kept, twice the minute");
    now += MIN + 1;
    assert.equal(await look(), false, "a minute on: still the kept miss (it used not to be kept at all)");
    // Each miss in a row doubles the keep, starting where the last left off (the 1505 fix), up to half an hour.
    const waits = [];
    for (let i = 0; i < 6; i++) {
      const wait = keep();
      now = globalThis.bopsOrgoPlan.at + wait - 1;
      assert.equal(await look(), false, `just inside ${wait / MIN} minutes: not asked`);
      now += 2;
      assert.equal(await look(), true, `past ${wait / MIN} minutes: asked again`);
      waits.push(wait / MIN);
    }
    assert.deepEqual(waits, [2, 4, 8, 16, 30, 30], "doubling, capped at half an hour");
    // Orgo answers again: the plan keeps the plain minute.
    plan = true;
    now = globalThis.bopsOrgoPlan.at + keep() + 1;
    assert.ok(await L.orgoPlan(), "a plan");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(keep(), MIN, "a plan resets it to the minute");
  } finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
    process.chdir(home);
    rmSync(scratch, { recursive: true, force: true });
  }
});

await check("L10: a logo miss is remembered, and its 404 tells the browser to stop asking", () => {
  const s = read("app/api/apps/logo/[app]/route.ts");
  assert.match(s, /bopsLogoMiss/, "the in-memory miss table");
  assert.match(s, /MISS_MS = 10 \* 60_000/, "ten minutes");
  assert.equal((s.match(/max-age=600/g) ?? []).length, 2, "both 404 paths are cacheable");
});

if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`crawl low 3: ${passed} passed`);
process.exit(0);

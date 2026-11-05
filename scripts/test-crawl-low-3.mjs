// Crawl LOW batch part 3 (L7, L9, L10): Look's Reset asks once before it resets (both places); an Orgo
// that won't answer is asked at most once a minute, then with a doubling back-off (not ~25 asks a
// minute); an app whose logo isn't at Composio's service is remembered as missing for ten minutes and
// its 404 is cacheable, so an offline run stops logging one console error per render.
// Usage: node --conditions=react-server scripts/test-crawl-low-3.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

await check("L9: a missed Orgo read is kept, with a doubling back-off", () => {
  const s = read("lib/server/plan.ts");
  assert.ok(!/not kept, so the next look asks again/.test(s), "the old un-cache-on-null is gone");
  assert.match(s, /keep: lastWasMiss \? kept!\.keep : KEEP_MS/, "a read after misses starts where the last left off (the 1505 fix)");
  assert.match(s, /read\.keep \* 2, FAIL_KEEP_MAX_MS/, "each miss in a row doubles it, capped");
  assert.match(s, /kept\.at < kept\.keep\)/, "the cache window is the record's own keep");
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

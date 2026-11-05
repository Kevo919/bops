// Crawl LOW batch part 1 (L2, L3): a paired phone's Logins refusal says the desktop app instead of a
// "Try again" that can never pass; and a half-typed cron expression can't be saved - Save is disabled in
// the routine editors (autopilot.tsx) and the pick-to-save row (routines.tsx) skips it until it's good,
// so the server's 400 ("99" isn't a minute) can't be reached from the UI.
// Usage: node scripts/test-crawl-low-1.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

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

check("L3: both routine editors gate Save (and submit, and Ctrl/Cmd-Enter) on a good cron", () => {
  const s = read("components/app/autopilot.tsx");
  const gates = s.match(/disabled=\{!changed \|\| busy \|\| !!cronBad\}/g) ?? [];
  assert.equal(gates.length, 2, "both Save buttons");
  assert.match(s, /!busy && !cronBad\) onSave/, "the form submit waits");
  assert.match(s, /changed && !busy && !cronBad\) \{/, "Ctrl/Cmd-Enter waits too");
  assert.equal((s.match(/cronError\(when\.schedule\.expr\)/g) ?? []).length, 2, "each editor computes its own cronBad");
  const r = read("components/app/routines.tsx");
  assert.match(r, /kind === "cron" && cronError\(s\.expr\)\) return;/, "pick-to-save skips a bad cron instead of sending it");
});

check("L2: a paired phone's Logins refusal names the desktop app, not Try again", () => {
  const s = read("components/app/logins.tsx");
  assert.match(s, /res\.status === 403\) setError\("Open the Bops desktop app to do this/, "the 403 branch");
  assert.match(s, /a paired phone can/, "says why retrying can't help");
});

if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`crawl low 1: ${passed} passed`);

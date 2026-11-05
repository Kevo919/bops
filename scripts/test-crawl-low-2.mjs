// Crawl LOW batch part 2 (L4, L5, L6, L8-partial): a routine whose when isn't a suggestion opens Change
// with its own chip picked (not Custom, whose fields then never open); Save-as-skill answers 503 when
// the model can't be reached (a right-now problem, not the caller's 400); new-bot/group-name fields cap
// at what the server keeps (40) instead of taking 3000 characters; the chat header's avatar button is
// labelled for screen readers.
// Usage: node scripts/test-crawl-low-2.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

check("L4: the picker's Custom starts from chips (the routine's own chip included)", () => {
  const s = read("components/app/cadence-picker.tsx");
  assert.match(s, /const \[custom, setCustom\] = useState\(\(\) => !chips\.some/, "custom opens only when the value matches no chip at all");
  assert.match(s, /crawl L4/, "the why is written down");
});

check("L5: a draft the model couldn't write is 503, the request's own faults stay 400", () => {
  const s = read("app/api/skills/route.ts");
  assert.match(s, /\/Try again\|right now\/\.test\(r\.error/) && assert.match(s, /\? 503 : 400/);
});

check("L6: the new-bot and group-name fields cap where the server cuts (40)", () => {
  const s = read("components/app/chat-view.tsx");
  assert.match(s, /maxLength=\{40\} onChange=\{\(e\) => setName\(e\.target\.value\)\} placeholder="Name, e\.g\. Nova"/);
  assert.match(s, /maxLength=\{40\} onChange=\{\(e\) => setName\(e\.target\.value\)\} placeholder="Group name \(optional\)"/);
  assert.match(s, /maxLength=\{80\}/, "role bounded too");
  const b = read("lib/server/bots.ts");
  assert.match(b, /slice\(0, 40\)/, "the server's own cap, matched");
});

check("L8: the chat header's avatar button is labelled", () => {
  const s = read("components/app/chat-view.tsx");
  assert.match(s, /aria-label=\{solo \? `\$\{solo\.name\}'s profile` : "Chat profile"\}/);
});

if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`crawl low 2: ${passed} passed`);

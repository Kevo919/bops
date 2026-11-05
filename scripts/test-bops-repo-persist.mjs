// OS persistence for repo steps (the reviewer's crontab/at item): `begin` schedules _run through at(1)
// when atd is running — the same script with the same regex/base64-validated arguments, so atd adds no
// new input — falling back to setsid when at is absent; and after a Bops restart, a cut-off run is
// settled by what the computer's poll says (running→keep waiting, exit→said truthfully, past the limit→
// failed and stopped) instead of being failed on sight.
// Usage: node --conditions=react-server scripts/test-bops-repo-persist.mjs
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

check("begin prefers at now, with the same validated arguments, and keeps setsid as the fallback", () => {
  const s = read("vm/bin/bops-repo");
  assert.ok(s.includes('command -v at >/dev/null 2>&1 && echo "$JOB" | at now'), "at first");
  assert.match(s, /JOB="\\?"\$0\\" _run \\"\$ID\\" \\"\$U\\" \\"\$NAME\\" \\"\$SECS\\" \\"\$ENVB\\" \\"\$CMDB\\""/, "the job is the same call, arguments untouched");
  assert.ok(s.includes('setsid nohup "$0" _run'), "setsid kept for a computer without atd");
  assert.match(s, /and again in _run/, "the re-validation is written down");
  assert.ok(!/crontab/.test(s), "no crontab edits: atd only, no root-crontab surface");
});

check("a restart-cut-off run reconciles with the computer instead of failing on sight", () => {
  const s = read("lib/server/repos.ts");
  assert.match(s, /void reconcile\(r\.id, r\.computerId, r\.repoId\)/, "repoRuns hands stale runs to the reconciler");
  assert.match(s, /The step finished while Bops was restarting; run it again to continue\./, "exit 0 says so, truthfully");
  assert.match(s, /It stopped by itself while Bops was restarting \(exit /, "a real failure keeps its code");
  assert.match(s, /lost track of this step past its own time limit/, "the cap ends it");
});

if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`bops-repo persist: ${passed} passed`);
process.exit(0);

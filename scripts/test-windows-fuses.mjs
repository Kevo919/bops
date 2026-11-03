// node scripts/test-windows-fuses.mjs [path/to/packaged/Bops.exe]
// Static configuration + synthetic shutdown checks never launch Bops or call a provider.
// Optional binary inspection reads fuse bytes only; it does not execute the binary.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(pkg.build.electronFuses.enableNodeCliInspectArguments, false);
assert.notEqual(pkg.build.electronFuses.runAsNode, false, "bundled server requires RunAsNode");
const smoke = readFileSync(join(root, "scripts", "smoke-windows.ps1"), "utf8");
assert.ok(!smoke.includes("--inspect") && !smoke.includes("Runtime.evaluate") && !smoke.includes("webSocketDebuggerUrl"));
assert.ok(smoke.includes("saved-tree-shutdown") && !smoke.includes("tray-quit-lifecycle"));
const source = smoke.match(/\$source = @'\r?\n([\s\S]*?)\r?\n'@/)?.[1];
assert.ok(source, "embedded private helper found");
let count = 1;
console.log("ok 1 - packaged inspector disabled, RunAsNode preserved, smoke inspector removed");

const config = {
  mode: "save-stop", repo: root, pid: 101, exe: "synthetic-Bops.exe", created: "root-created",
  owned: [{ pid: 101, created: "root-created" }, { pid: 202, created: "server-created" }],
  tokenFile: "synthetic-window-token", port: 3210, build: "synthetic-build",
};
for (const scenario of ["success", "wrong-proof", "failed-save", "foreign-server", "reused-root", "missing-token"]) {
  const prelude = `
import Module from 'node:module';
import testFs from 'node:fs';
import testCp from 'node:child_process';
import { syncBuiltinESMExports as syncMocks } from 'node:module';
import { createHmac as testHmac } from 'node:crypto';
import testAssert from 'node:assert/strict';
const scenario = ${JSON.stringify(scenario)};
const testToken = 'a'.repeat(64);
let saves = 0, stops = 0, roots = 0;
const oldRead = testFs.readFileSync;
testFs.readFileSync = (file, ...args) => {
  if (file === 'synthetic-window-token') { if (scenario === 'missing-token') throw new Error('fixture missing token'); return testToken; }
  return oldRead(file, ...args);
};
testFs.realpathSync = file => file;
testCp.execFileSync = (command, args) => {
  testAssert.equal(command, 'powershell.exe');
  const pid = Number(args.at(-1).match(/ProcessId=(\\d+)/)[1]);
  testAssert.ok([101,202].includes(pid));
  if (pid === 101) roots++;
  return JSON.stringify({pid, exe:'synthetic-Bops.exe', created: pid === 202 ? 'server-created' : scenario === 'reused-root' && roots > 1 ? 'reused' : 'root-created'});
};
const oldLoad = Module._load;
Module._load = function(id, ...args) {
  if (id.endsWith('windows.cjs')) return { stopServerTree(pid, port, token) {
    testAssert.equal(pid, 101, 'stop app root, not server only');
    testAssert.equal(port, 3210); testAssert.equal(token, testToken);
    testAssert.equal(saves, 1); testAssert.equal(roots, 2); stops++;
  }};
  return oldLoad.call(this, id, ...args);
};
syncMocks();
globalThis.fetch = async (url, options) => {
  testAssert.equal(options.redirect, 'error');
  const parsed = new URL(url);
  testAssert.equal(parsed.origin, 'http://127.0.0.1:3210', 'no external requests');
  if (parsed.pathname === '/api/health') {
    const nonce = parsed.searchParams.get('nonce'); testAssert.match(nonce, /^[a-f0-9]{32}$/);
    return Response.json({bops:true, build:'synthetic-build', proof:scenario === 'wrong-proof' ? '0'.repeat(64) : testHmac('sha256',testToken).update(nonce).digest('hex')});
  }
  testAssert.equal(parsed.pathname, '/api/restart');
  testAssert.equal(options.method, 'POST');
  testAssert.equal(options.headers['x-bops-window'], testToken);
  testAssert.equal(options.headers.origin, parsed.origin);
  saves++;
  return Response.json({ok:scenario !== 'failed-save', pid:scenario === 'foreign-server' ? 303 : 202});
};
process.on('exit', () => console.log(JSON.stringify({fixture:true,saves,stops,roots})));
`;
  const child = spawnSync(process.execPath, ["--input-type=module"], {
    input: prelude + "\n" + source.replace("__CONFIG__", Buffer.from(JSON.stringify(config)).toString("base64")),
    cwd: root, encoding: "utf8", timeout: 15000, windowsHide: true,
  });
  assert.ifError(child.error);
  const records = child.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  const trace = records.find(record => record.fixture);
  assert.ok(trace, `fixture trace: ${scenario}`);
  assert.equal(child.status, scenario === "success" ? 0 : 1, scenario);
  assert.equal(trace.stops, scenario === "success" ? 1 : 0, scenario);
  assert.equal(trace.saves, ["wrong-proof", "missing-token"].includes(scenario) ? 0 : 1, scenario);
  assert.ok(!child.stdout.includes("a".repeat(64)), "token never returned/logged");
  console.log(`ok ${++count} - private shutdown ${scenario}`);
}

if (process.argv[2]) {
  const require = createRequire(join(root, "package.json"));
  const { getCurrentFuseWire, FuseV1Options, FuseState } = require("@electron/fuses");
  const wire = await getCurrentFuseWire(resolve(process.argv[2]));
  // FuseState is exported by some versions only from constants; use documented wire byte value.
  assert.equal(wire[FuseV1Options.EnableNodeCliInspectArguments], FuseState?.DISABLE ?? 48);
  assert.equal(wire[FuseV1Options.RunAsNode], FuseState?.ENABLE ?? 49);
  console.log(`ok ${++count} - packaged executable inspector fuse off and RunAsNode on`);
} else {
  console.log("SKIP packaged binary fuse inspection: supply the newly built Bops.exe path");
}
console.log(`${count} checks passed; no app launched or provider contacted.`);

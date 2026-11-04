// Usage: node scripts/test-agent-api-path.mjs. Synthetic paths; no API, executor or model requests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { agentApiPath } from '../lib/server/agent-api-path.ts';
let passed = 0;
const test = (name, run) => { run(); console.log(`ok ${++passed} - ${name}`); };
const wire = (p) => agentApiPath(p, 'win32');
test('drive, spaces, Unicode and already-namespaced paths retain their drive', () => {
  for (const native of ['C:\\Users\\Example\\workspace', 'D:\\Team Files\\日本語\\workspace', 'c:/team/workspace', 'C:\\']) {
    const encoded = wire(native);
    assert.match(encoded, /^\/\/\?\/[A-Za-z]:\//);
    assert.equal(encoded.slice(4), native.replaceAll('\\', '/'));
    assert.equal(wire(encoded), encoded);
    assert.equal(wire(encoded.replaceAll('/', '\\')), encoded);
  }
});
test('UNC shares keep both server and share without mapping to another drive', () => {
  assert.equal(wire('\\\\server\\Team Share\\日本語'), '//?/UNC/server/Team Share/日本語');
  assert.equal(wire('\\\\?\\UNC\\server\\share\\folder'), '//?/UNC/server/share/folder');
  assert.equal(wire('//?/UNC/server/share/folder'), '//?/UNC/server/share/folder');
});
test('relative, traversal, device and ambiguous Windows paths fail closed', () => {
  for (const p of ['workspace', 'C:workspace', '\\workspace', '/workspace', 'C:\\x\\..\\y', 'C:\\x\\.\\y', '//?/C:/x/../y', '\\\\server', '\\\\.\\pipe\\x', '\\\\?\\GLOBALROOT\\Device\\x', 'C:\\x:stream', 'C:\\x.\\y', 'C:\\x \\y', 'C:\\x\\\\y', 'C:\\x\0y']) assert.throws(() => wire(p), /Windows workspace path/, p);
});
test('non-Windows paths are byte-for-byte unchanged', () => {
  for (const platform of ['darwin', 'linux']) for (const p of ['/workspace', '/Users/Team Files/日本語', '/tmp/a/../b']) assert.equal(agentApiPath(p, platform), p);
});
if (process.platform === 'win32') {
  const root = mkdtempSync(join(tmpdir(), 'bops-api-path-'));
  try {
    test('wire paths address the same real files and work as child cwd on Windows', () => {
      const native = join(root, 'Team Files 日本語', 'workspace');
      mkdirSync(native, { recursive: true });
      writeFileSync(join(native, 'fixture.txt'), 'synthetic only');
      const encoded = wire(native);
      assert.ok(existsSync(encoded));
      for (const suffix of ['', '/fixture.txt']) {
        const a = statSync(native + suffix, { bigint: true }), b = statSync(encoded + suffix, { bigint: true });
        assert.equal(a.dev, b.dev); assert.equal(a.ino, b.ino);
      }
      const result = execFileSync(process.execPath, ['-e', 'process.stdout.write(require("node:fs").readFileSync("fixture.txt","utf8"))'], { cwd: encoded, encoding: 'utf8', timeout: 5000, windowsHide: true });
      assert.equal(result, 'synthetic only');
    });
  } finally {
    const owned = relative(resolve(tmpdir()), resolve(root));
    assert.ok(owned.startsWith('bops-api-path-') && !owned.includes('..') && !isAbsolute(owned), 'cleanup stays within the owned temporary directory');
    rmSync(root, { recursive: true, force: true });
  }
} else console.log('SKIP: native Windows filesystem/child cwd identity (Windows only)');
test('API serialization is confined to local transport fields, not native execution or resume identity', () => {
  const sessions = readFileSync(new URL('../lib/server/sessions.ts', import.meta.url), 'utf8');
  const local = readFileSync(new URL('../lib/server/local.ts', import.meta.url), 'utf8');
  assert.match(sessions, /workspace_directory: folder \? agentApiPath\(workspace\) : workspace/);
  assert.match(sessions, /capability_directories: \[folder \? agentApiPath\(join\(workspace, "capabilities", "skills"\)\) : `\$\{workspace\}\/capabilities\/skills`\]/);
  assert.match(sessions, /s\.env\?\.workspace === workspace/);
  assert.match(sessions, /remoteUrl: created\.environment\.remote_url, workspace, fn: true/);
  assert.equal((local.match(/cwd: agentApiPath\(join\(dir, "workspace"\)\)/g) ?? []).length, 3, 'both browser transports and Mac UI transport');
  assert.equal((local.match(/cwd: join\(dir, "workspace"\), env:/g) ?? []).length, 3, 'native executors remain native');
});
console.log(`PASS: ${passed} Agents API path checks`);

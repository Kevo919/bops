// Native Windows SSH carrier contract; all child SSH processes below are local test doubles.
import assert from 'node:assert/strict';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import net from 'node:net';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const scratch = mkdtempSync(join(tmpdir(), 'bops-ssh-native-test-'));
globalThis.__sshTestDir = scratch;
globalThis.__sshExecFile = execFile;
const children = [];
let behavior = 'ok';
globalThis.__sshSpawn = (binary, args, options) => {
  assert.ok(binary.endsWith('ssh.exe') || binary.endsWith('/ssh'));
  assert.ok(args.includes('-W')); assert.ok(!args.includes('-L'));
  assert.ok(!('OPENAI_API_KEY' in options.env));
  const code = behavior === 'fail' ? 'process.stderr.write("SECRET diagnostic");process.exit(255)' : behavior === 'empty' ? 'process.exit(0)' : behavior === 'hang' ? 'setInterval(()=>{},1000)' : 'process.stdin.once("data",()=>{process.stdout.write("HTTP/1.1 200 OK\\r\\nContent-Length: 2\\r\\nConnection: close\\r\\n\\r\\nOK",()=>process.exit(0))})';
  const child = spawn(behavior === 'spawn-error' ? process.execPath + '.missing' : process.execPath, ['-e', code], { ...options });
  children.push(child);
  return child;
};
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/computer-ssh.ts')) {
      if (specifier === 'node:child_process') return { url: 'test:child', shortCircuit: true };
      if (specifier === './orgo') return { url: 'test:orgo', shortCircuit: true };
      if (specifier === './store') return { url: 'test:store', shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:child') return { format: 'module', shortCircuit: true, source: 'export const spawn = (...a) => globalThis.__sshSpawn(...a); export const execFile = (...a) => globalThis.__sshExecFile(...a);' };
    if (url === 'test:orgo') return { format: 'module', shortCircuit: true, source: 'export const computerSsh = () => {}; export const orgo = {}; export class OrgoError extends Error {}' };
    if (url === 'test:store') return { format: 'module', shortCircuit: true, source: 'export const userDir = () => globalThis.__sshTestDir;' };
    if (url.endsWith('/computer-ssh.ts')) return { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8') + '\nexport { stdioCarrier };') };
    return next(url, context);
  },
});
const { sshStdioArgs, sshKey, stdioCarrier } = await import('../lib/server/computer-ssh.ts');
const preview = await import('../lib/server/local-preview.ts');
const at = { host: '198.51.100.7', port: 2222, user: 'root', key: 'C:\\test key', knownHosts: 'C:\\test hosts' };
const argv = sshStdioArgs(at, 3000);
for (const option of ['IdentitiesOnly=yes', 'IdentityAgent=none', 'BatchMode=yes', 'StrictHostKeyChecking=yes', 'HostKeyAlgorithms=ssh-ed25519', 'UpdateHostKeys=no']) assert.ok(argv.includes(option), option);
assert.deepEqual(argv.slice(-7), ['127.0.0.1:3000', '-p', '2222', '-l', 'root', '--', at.host]);
assert.equal(argv[argv.indexOf('-F') + 1], process.platform === 'win32' ? 'NUL' : '/dev/null');
const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(r => probe.close(r));
let closed = 0;
const nativeCarrier = stdioCarrier(at, 3000);
const carrier = { ...nativeCarrier, close() { closed++; nativeCarrier.close(); } };
const request = async (host = `localhost:${port}`) => {
  const s = net.connect(port, '127.0.0.1'); let answer = ''; s.setEncoding('utf8'); s.on('data', d => answer += d); s.on('error', () => {});
  await once(s, 'connect'); s.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`); await once(s, 'close'); return answer;
};
const waitGone = async child => { for (let n = 0; n < 100 && child.exitCode === null && child.signalCode === null; n++) await new Promise(r => setTimeout(r, 20)); assert.ok(child.exitCode !== null || child.signalCode !== null, 'SSH child exited'); };
try {
  if (process.platform === 'win32') {
    const key = await sshKey();
    assert.match(key.pub, /^ssh-ed25519 /);
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const check = "$ErrorActionPreference='Stop';$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$a=[System.IO.File]::GetAccessControl($env:BOPS_TEST_KEY);if(!$a.AreAccessRulesProtected){throw 'inherited ACL'};foreach($r in $a.Access){if($r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid){throw 'other identity'}};'private'";
    assert.equal(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(check, 'utf16le').toString('base64')], { encoding: 'utf8', env: { ...process.env, BOPS_TEST_KEY: key.key } }).trim(), 'private');
    const again = await sshKey(); assert.equal(again.pub, key.pub);
    const config = execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe'), ['-G', ...sshStdioArgs({ ...at, key: key.key }, 3000)], { encoding: 'utf8' });
    assert.match(config, /^stricthostkeychecking true$/m); assert.match(config, /^clearallforwardings yes$/m); assert.match(config, /^exitonforwardfailure yes$/m);
    console.log('PASS native key generation, current-SID ACL, reuse and SSH argument parsing');
  }
  await preview.openForward({ key: 'test', app: 'test', macPort: port, host: at.host, port: 3000, carrier });
  assert.match(await request('evil.example'), /^HTTP\/1.1 403/); assert.equal(children.length, 0); console.log('PASS Host gate before SSH spawn');
  assert.match(await request(), /^HTTP\/1.1 200[\s\S]*OK$/); await waitGone(children.at(-1)); console.log('PASS response and completed-child cleanup');
  behavior = 'spawn-error'; const notStarted = await request(); assert.match(notStarted, /^HTTP\/1.1 502/); assert.equal(children.at(-1).pid, undefined); console.log('PASS process start error returns fixed 502');
  behavior = 'fail'; const failed = await request(); assert.match(failed, /^HTTP\/1.1 502/); assert.ok(!failed.includes('SECRET')); await waitGone(children.at(-1)); console.log('PASS fixed redacted 502 after spawn/auth failure');
  behavior = 'empty'; assert.match(await request(), /^HTTP\/1.1 502/); await waitGone(children.at(-1)); console.log('PASS empty successful exit is not readiness');
  behavior = 'hang'; const began = Date.now(); const timed = await request(); assert.match(timed, /^HTTP\/1.1 502/); assert.ok(Date.now() - began >= 18000 && Date.now() - began < 23000); await waitGone(children.at(-1)); console.log('PASS first-byte deadline survives connect and clears child');
  const client = net.connect(port, '127.0.0.1'); await once(client, 'connect'); client.write(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`); await new Promise(r => setTimeout(r, 200)); const cancelled = children.at(-1); client.destroy(); await waitGone(cancelled); console.log('PASS client cancellation kills child');
  await new Promise(r => setTimeout(r, 50)); preview.sweepForwards(Date.now() + preview.IDLE_MS + 1); assert.equal(preview.forwardOn(port), undefined); assert.equal(closed, 1); console.log('PASS idle expiry closes carrier');
  const before = children.length; const ended = nativeCarrier.connect(); ended.on('error', () => {}); await new Promise(r => ended.once('close', r)); assert.equal(children.length, before); console.log('PASS closed carrier refuses without spawning');
  const activeCarrier = stdioCarrier(at, 3000); const active = activeCarrier.connect(); active.on('error', () => {}); await once(active, 'connect'); const owned = children.at(-1); activeCarrier.close(); await waitGone(owned); assert.equal(active.destroyed, true); console.log('PASS active carrier close kills child');
  console.log(`${process.platform === 'win32' ? 11 : 10} passed, 0 failed`);
} finally { preview.closeForward('test'); for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill(); rmSync(scratch, { recursive: true, force: true }); }

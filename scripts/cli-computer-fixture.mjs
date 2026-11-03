import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Only fake remote computers run in Linux. The test, app imports, assertions and
// UI render subprocess continue to run in the invoking Windows Node process.
export function linuxComputerFixture(nativeScratch) {
  const remote = '/bops-test';
  const mountedScratch = path.join(nativeScratch, 'computers');
  fs.mkdirSync(mountedScratch);
  const name = `bops-cli-fixture-${randomUUID()}`;
  const hostPath = value => typeof value === 'string' && (value === remote || value.startsWith(remote + '/'))
    ? path.join(mountedScratch, ...value.slice(remote.length).split('/')) : value;
  const join = (...parts) => typeof parts[0] === 'string' && (parts[0] === remote || parts[0].startsWith(remote + '/'))
    ? path.posix.join(...parts) : path.join(...parts);
  const hostFs = Object.fromEntries(['accessSync', 'existsSync', 'mkdirSync', 'readdirSync', 'readFileSync', 'realpathSync', 'rmdirSync', 'rmSync', 'writeFileSync'].map(key => [key, (file, ...args) => fs[key](hostPath(file), ...args)]));
  // Windows checkouts may have CRLF shell runners. Normalize only uploaded fixture
  // executables, exactly as a Linux checkout would; leave production files untouched.
  hostFs.writeFileSync = (file, data, options) => {
    if (typeof file === 'string' && file.startsWith(remote + '/') && options?.mode && (typeof data === 'string' || Buffer.isBuffer(data))) {
      const content = data.toString();
      if (content.startsWith('#!')) data = content.replace(/\r\n/g, '\n');
    }
    return fs.writeFileSync(hostPath(file), data, options);
  };
  const docker = (args, options = {}) => cp.execFileSync('docker', args, { timeout: 30000, ...options });
  let started = false;
  const stop = () => {
    if (!started) return;
    started = false;
    try { docker(['rm', '-f', name]); } catch {
      process.exitCode = 1;
      throw new Error(`Could not remove owned test container ${name}; test cleanup failed.`);
    }
  };
  const start = () => {
    try {
      if (docker(['info', '--format', '{{.OSType}}']).toString().trim() !== 'linux') throw new Error('Docker must use Linux containers');
      docker(['image', 'inspect', 'node:24-bookworm']);
      // No host networking, published ports, socket, credentials or repository mount.
      started = true; // Also clean up if Docker creates it but the client times out.
      docker(['run', '-d', '--name', name, '--network', 'none', '--memory', '1g', '--cpus', '1', '--mount', `type=bind,source=${mountedScratch},target=${remote}`, 'node:24-bookworm', 'sleep', 'infinity']);
      docker(['exec', name, 'bash', '-c', 'command -v node && command -v python3 && command -v ps && command -v pkill']);
    } catch (error) {
      stop();
      throw new Error('Windows CLI tests require running Linux Docker and a local node:24-bookworm image with bash, python3 and procps.', { cause: error });
    }
  };
  const poison = {
    ANTHROPIC_API_KEY: 'sk-ant-api03-PLANTED', ANTHROPIC_AUTH_TOKEN: 'planted-auth-token',
    CLAUDE_CODE_OAUTH_TOKEN: 'planted-oauth-token', ANTHROPIC_BASE_URL: 'https://planted.test',
    CLAUDECODE: '1', OPENAI_API_KEY: 'sk-PLANTED-openai', CODEX_API_KEY: 'sk-PLANTED-codex',
    OPENAI_BASE_URL: 'https://planted-openai.test', CODEX_HOME: '/planted/codex-home',
  };
  const pathKeys = new Set(['HOME', 'BOPS_AGENTS', 'BOPS_BRAINS', 'BOPS_BOTS', 'BOPS_WORKSPACE', 'BOPS_CLAUDE', 'BOPS_CODEX', 'BOPS_DSH', 'BOPS_LOGS', 'BOPS_HOME']);
  const fixtureEnvironment = env => Object.entries(env).flatMap(([key, value]) => {
    const allowed = Object.hasOwn(poison, key) ? value === poison[key]
      : pathKeys.has(key) ? typeof value === 'string' && value.startsWith(remote + '/') && !value.split('/').includes('..')
      : key === 'BOPS_DSH_NODE' ? value === '/usr/local/bin/node'
      : key === 'PATH' ? typeof value === 'string' && value.split(':').every(part => part.startsWith(remote + '/') || ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].includes(part))
      : false;
    if (!allowed) throw new Error(`Refusing non-fixture environment field: ${key}`);
    return ['-e', `${key}=${value}`];
  });
  const commandArgs = (command, options) => ['exec', '-w', remote, ...fixtureEnvironment(options.env ?? {}), name, '/bin/bash', ...command];
  const execFile = (file, args, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (file === '/bin/bash') return cp.execFile('docker', commandArgs(args, options), { timeout: options.timeout ?? 30000 }, callback);
    return cp.execFile(file, args.map(hostPath), options, callback);
  };
  const execFileSync = (file, args, options = {}) => {
    if (file === 'python3') return cp.execFileSync('python', args.map(hostPath), { ...options, env: { ...process.env, ...options.env, PYTHONPATH: hostPath(options.env?.PYTHONPATH) } });
    return cp.execFileSync(file, args, options);
  };
  const alive = pid => {
    if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('Invalid fixture PID');
    try { docker(['exec', name, 'kill', '-0', String(pid)]); return true; } catch { return false; }
  };
  return { scratch: remote, hostPath, join, fs: hostFs, start, stop, execFile, execFileSync, alive, node: '/usr/local/bin/node', parentPid: 1 };
}

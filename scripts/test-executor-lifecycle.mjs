// Synthetic child processes only: no CLI, credentials, network or model requests.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { monitorExecutor, sendExecutorInput, withExecutor } from '../lib/server/executor-lifecycle.ts';

const child = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
let passed = 0;
async function test(name, run) { await run(); console.log(`ok ${++passed} - ${name}`); }
await test('early exit rejects startup and never exposes CLI secrets', async () => {
  const c = child(); const start = monitorExecutor(c, 1000);
  c.stderr.write('unauthorized secret-value https://private.example/token');
  c.emit('exit', 1); c.emit('close');
  await assert.rejects(start, e => e.message === 'Local executor exited with code 1 (authentication rejected).');
  assert.equal(c.stderr.listenerCount('data'), 0);
});
await test('spawn errors are fixed messages rather than raw OS errors', async () => {
  const c = child(); const start = monitorExecutor(c, 1000);
  c.emit('error', new Error('secret executable path and credentials')); c.emit('close');
  await assert.rejects(start, /Local executor could not run\./);
});
await test('exit after startup interrupts a pending turn and cancels once', async () => {
  const c = child(); await monitorExecutor(c, 1);
  let cancelled = 0, signal;
  const turn = withExecutor(c, async s => { signal = s; return new Promise(() => {}); }, () => cancelled++);
  c.stderr.write('working directory unavailable secret-value');
  c.emit('exit', 9); c.emit('close');
  await assert.rejects(turn, /exited with code 9 \(working-directory diagnostic\)/);
  assert.equal(signal.aborted, true); assert.equal(cancelled, 1);
});
await test('death between turns prevents the next remote operation', async () => {
  const c = child(); await monitorExecutor(c, 1);
  assert.equal(await withExecutor(c, async () => 'first', () => assert.fail('unexpected cancel')), 'first');
  c.emit('exit', 0); c.emit('close');
  let started = false, cancelled = 0;
  await assert.rejects(withExecutor(c, async () => { started = true; }, () => cancelled++), /exited with code 0/);
  assert.equal(started, false); assert.equal(cancelled, 1);
});
await test('large split output remains drained and only fixed categories escape', async () => {
  const c = child(); await monitorExecutor(c, 1);
  c.stderr.write('x'.repeat(1_000_000));
  c.stderr.write('unexpected arg'); c.stderr.write('ument SECRET');
  c.emit('exit', 2); c.emit('close');
  await assert.rejects(withExecutor(c, async () => {}, () => {}), e => e.message === 'Local executor exited with code 2 (unsupported CLI arguments).');
});
await test('non-executor cloud runs and normal work errors are preserved', async () => {
  assert.equal(await withExecutor(undefined, async () => 42, () => assert.fail()), 42);
  const c = child(); await monitorExecutor(c, 1);
  const error = new Error('ordinary operation failure');
  await assert.rejects(withExecutor(c, async () => { throw error; }, () => assert.fail()), e => e === error);
  c.emit('exit', 0); c.emit('close');
});
await test('an executor exit during input cancels again after the late turn is created', async () => {
  const c = child(); await monitorExecutor(c, 1);
  const events = []; let finish;
  const input = new Promise(resolve => { finish = resolve; });
  let sending;
  const work = withExecutor(c, signal => {
    sending = sendExecutorInput(signal, async () => { await input; events.push('created'); }, async () => { events.push('cancel-after-send'); });
    return sending;
  }, () => events.push('cancel-on-exit'));
  c.emit('exit', 1); c.emit('close');
  await assert.rejects(work, /exited with code 1/);
  finish();
  await assert.rejects(sending, /exited with code 1/);
  assert.deepEqual(events, ['cancel-on-exit', 'created', 'cancel-after-send']);
});
console.log(`PASS: ${passed} executor lifecycle tests`);

// Fake processes only: never reads credential files or launches the installed CLIs.
// node --conditions=react-server scripts/test-local-subscriptions.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const calls = [];
let closeOnKill = true;
let reply = { code: 0, text: 'Logged in using ChatGPT' }, found = true, shared = false;
globalThis.__localFake = {
  found: () => found, shared: () => shared,
  spawn(file, args, options) {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 12345;
    child.kill = () => { child.killed = true; if (closeOnKill) queueMicrotask(() => child.emit('close', null)); return true; };
    calls.push({ file, args, options, child });
    if (reply) { const current = reply; queueMicrotask(() => { child.stdout.emit('data', Buffer.from(current.text)); child.emit('close', current.code); }); }
    return child;
  },
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try { return next(specifier, context); } catch (error) { for (const ext of ['.ts','.tsx']) { try { return next(specifier + ext, context); } catch {} } throw error; }
  },
  load(url, context, next) {
    let source;
    if (url === 'node:child_process') source = 'export const spawn = (...args) => globalThis.__localFake.spawn(...args);';
    if (url.endsWith('/codex-cli.ts')) source = 'export const findCodex = () => globalThis.__localFake.found() ? "/fake/codex" : undefined;';
    if (url === 'node:fs') source = 'export const constants = { X_OK: 1 }; export const accessSync = () => { if (!globalThis.__localFake.found()) throw Error("missing"); };';
    if (url.endsWith('/owner-email.ts')) source = 'export const fromThisMac = r => new URL(r.url).hostname === "localhost";';
    if (url.endsWith('/store.ts')) source = 'export const getState = () => ({ shared: globalThis.__localFake.shared() });';
    if (url.endsWith('/ready.ts')) source = 'export const notReady = () => null;';
    return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
  },
});
const api = await import('../lib/server/local-subscriptions.ts');
const route = await import('../app/api/local-subscriptions/route.ts');
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok ${name}`); };
await test('status requires exact subscription evidence; errors never count connected', async () => {
  assert.equal((await api.getLocalSubscriptionStatus('codex')).connected, true);
  for (const sample of [{code:0,text:'Logged in using an API key'}, {code:1,text:'Not logged in'}, {code:0,text:'unexpected secret'}]) { reply=sample; assert.equal((await api.getLocalSubscriptionStatus('codex')).connected,false); }
  reply={code:0,text:JSON.stringify({loggedIn:true,authMethod:'claude.ai',email:'person@example.test',subscriptionType:'max',accessToken:'SECRET'})};
  const claude=await api.getLocalSubscriptionStatus('claude'); assert.equal(claude.connected,true); assert.equal(claude.plan,'max'); assert.ok(!JSON.stringify(claude).includes('SECRET'));
  reply={code:0,text:'{"loggedIn":true,"authMethod":"api_key"}'}; assert.equal((await api.getLocalSubscriptionStatus('claude')).connected,false);
  reply={code:0,text:'invalid SECRET'}; const invalid=await api.getLocalSubscriptionStatus('claude'); assert.equal(invalid.state,'error'); assert.ok(!JSON.stringify(invalid).includes('SECRET'));
});
await test('runtime keeps official home but removes API and config overrides', async () => {
  process.env.OPENAI_API_KEY='SECRET'; process.env.CODEX_HOME='/custom'; process.env.ANTHROPIC_BASE_URL='https://bad.test'; process.env.CLAUDE_CONFIG_DIR='/custom';
  const runtime=api.localSubscriptionRuntime('codex'); assert.ok(runtime.env.HOME); for(const key of ['OPENAI_API_KEY','CODEX_HOME','ANTHROPIC_BASE_URL','CLAUDE_CONFIG_DIR']) assert.equal(runtime.env[key],undefined);
  assert.equal(calls.at(-1).options.shell,false);
});
await test('login is explicit, bounded output, official URL only and cancelled child owned', async () => {
  reply=null; await api.startLocalLogin('codex'); const call=calls.at(-1); assert.ok(call.args.includes('login'));
  call.child.stdout.emit('data',Buffer.from('https://evil.test/oauth/authorize')); assert.equal((await api.getLocalSubscriptionStatus('codex')).loginUrl,undefined);
  call.child.stdout.emit('data',Buffer.from(' https://auth.openai.com/oauth/authorize?state=synthetic ')); assert.match((await api.getLocalSubscriptionStatus('codex')).loginUrl,/^https:\/\/auth.openai.com\//);
  reply={code:1,text:'Not logged in'}; await api.cancelLocalLogin('codex'); assert.equal(call.child.killed,true);
  reply=null; await api.startLocalLogin('claude'); const oversized=calls.at(-1); oversized.child.stderr.emit('data',Buffer.alloc(65537,65)); assert.equal(oversized.child.killed,true); reply={code:1,text:'{"loggedIn":false}'}; assert.equal((await api.getLocalSubscriptionStatus('claude')).state,'error');
  reply={code:0,text:'{"loggedIn":false}'}; await api.cancelLocalLogin('claude');
});
await test('late status cannot report connected after login changes', async () => {
  reply=null;
  const pending=api.getLocalSubscriptionStatus('codex'); const stale=calls.at(-1).child;
  await api.startLocalLogin('codex'); const login=calls.at(-1).child;
  stale.stdout.emit('data',Buffer.from('Logged in using ChatGPT')); stale.emit('close',0);
  assert.equal((await pending).state,'connecting');
  login.emit('close',1); reply={code:1,text:'Not logged in'};
  assert.equal((await api.getLocalSubscriptionStatus('codex')).state,'error');
  reply={code:1,text:'Not logged in'}; await api.cancelLocalLogin('codex');
});
await test('login deadline kills only owned child and reports timeout', async () => {
  const original=globalThis.setTimeout; let expire;
  globalThis.setTimeout=(fn,ms,...args)=> { if(ms===300000) { expire=fn; return original(()=>{},300000); } return original(fn,ms,...args); };
  try {
    reply=null; closeOnKill=false; await api.startLocalLogin('codex'); const child=calls.at(-1).child;
    const timer=globalThis.bopsLocalSubscriptions.logins.get('codex').timer;
    clearTimeout(timer); expire(); assert.equal(child.killed,true);
    const before=calls.length; assert.equal((await api.getLocalSubscriptionStatus('codex')).state,'error'); assert.equal((await api.startLocalLogin('codex')).state,'error'); assert.equal(calls.length,before);
    child.emit('close',null); closeOnKill=true; reply={code:1,text:'Not logged in'};
    const result=await api.getLocalSubscriptionStatus('codex'); assert.equal(result.state,'error'); assert.match(result.error,/timed out/);
  } finally { globalThis.setTimeout=original; reply={code:1,text:'Not logged in'}; await api.cancelLocalLogin('codex'); }
});
await test('Check again recovers after an external CLI login without forgetting failed cause while out', async () => {
  reply=null; await api.startLocalLogin('codex'); calls.at(-1).child.emit('close',1);
  reply={code:1,text:'Not logged in'};
  assert.match((await api.getLocalSubscriptionStatus('codex')).error,/did not complete/);
  reply={code:0,text:'Logged in using ChatGPT'};
  assert.equal((await api.getLocalSubscriptionStatus('codex')).state,'connected');
  reply={code:1,text:'Not logged in'};
  assert.equal((await api.getLocalSubscriptionStatus('codex')).state,'signed-out');
});
await test('logout blocks concurrent login and verifies persisted CLI status', async () => {
  reply=null; const pending=api.logoutLocalSubscription('codex'); const logout=calls.at(-1);
  assert.deepEqual(logout.args,['logout']); const before=calls.length;
  assert.equal((await api.startLocalLogin('codex')).state,'error'); assert.equal(calls.length,before);
  reply={code:1,text:'Not logged in'}; logout.child.emit('close',0);
  assert.equal((await pending).state,'signed-out');
});
await test('cancel waits for delayed close; bounded stop remains locked until close', async () => {
  reply=null; closeOnKill=false; await api.startLocalLogin('codex'); const child=calls.at(-1).child;
  const original=globalThis.setTimeout; let expire;
  globalThis.setTimeout=(fn,ms,...args)=> { if(ms===5000) { expire=fn; return original(()=>{},5000); } return original(fn,ms,...args); };
  try {
    const cancelling=api.cancelLocalLogin('codex'); const before=calls.length;
    assert.equal((await api.startLocalLogin('codex')).state,'error');
    assert.equal((await api.logoutLocalSubscription('codex')).state,'error');
    assert.equal((await api.getLocalSubscriptionStatus('codex')).state,'error');
    assert.equal(calls.length,before,'no auth processes while the old login is stopping');
    expire(); assert.equal((await cancelling).state,'error');
    assert.equal((await api.startLocalLogin('codex')).state,'error'); assert.equal(calls.length,before,'timeout does not release the lock');
    child.emit('close',null); reply={code:1,text:'Not logged in'};
    assert.equal((await api.getLocalSubscriptionStatus('codex')).connected,false);
  } finally { globalThis.setTimeout=original; closeOnKill=true; }
});
await test('logout waits for login close before spawning logout', async () => {
  reply=null; closeOnKill=false; await api.startLocalLogin('codex'); const child=calls.at(-1).child;
  const before=calls.length; const loggingOut=api.logoutLocalSubscription('codex');
  await Promise.resolve(); assert.equal(calls.length,before);
  assert.equal((await api.startLocalLogin('codex')).state,'error');
  reply={code:0,text:'Not logged in'}; child.emit('close',null);
  assert.equal((await loggingOut).state,'signed-out'); assert.deepEqual(calls[before].args,['logout']); closeOnKill=true;
});
await test('overflow holds stopping lock until close', async () => {
  reply=null; closeOnKill=false; await api.startLocalLogin('claude'); const child=calls.at(-1).child;
  child.stderr.emit('data',Buffer.alloc(65537,65)); const before=calls.length;
  assert.equal((await api.startLocalLogin('claude')).state,'error');
  assert.equal((await api.logoutLocalSubscription('claude')).state,'error');
  assert.equal((await api.getLocalSubscriptionStatus('claude')).state,'error'); assert.equal(calls.length,before);
  child.emit('close',null); closeOnKill=true; reply={code:1,text:'{"loggedIn":false}'};
  await api.cancelLocalLogin('claude');
});
await test('missing native executable never spawns', async () => { found=false; const before=calls.length; assert.equal((await api.startLocalLogin('codex')).state,'missing'); assert.equal(calls.length,before); found=true; });
await test('owner window only; paired remote and shared state never launch processes', async () => {
  process.env.BOPS_SELF_HOSTED='1'; process.env.BOPS_UI_TOKEN='local-test-window';
  const req=(headers={})=>new Request('http://localhost/api/local-subscriptions',{headers});
  for(const headers of [{},{'x-bops-window':'wrong'},{'x-bops-window':'local-test-window','x-bops-remote':'fake'},{cookie:'bops_window=local-test-window; bops_remote=fake'}]) { const before=calls.length; assert.equal((await route.GET(req(headers))).status,403); assert.equal(calls.length,before); }
  process.env.BOPS_REQUIRE_REMOTE='1'; assert.equal((await route.GET(req({'x-bops-remote':'fake'}))).status,403); delete process.env.BOPS_REQUIRE_REMOTE;
  shared=true; assert.equal((await route.GET(req({'x-bops-window':'local-test-window'}))).status,403); shared=false;
  reply={code:0,text:'Not logged in'}; assert.equal((await route.GET(req({'x-bops-window':'local-test-window'}))).status,200);
});
await test('kind-specific refresh probes only that CLI and rejects unknown kinds', async () => {
  reply={code:0,text:'Logged in using ChatGPT'};
  const before=calls.length;
  const response=await route.GET(new Request('http://localhost/api/local-subscriptions?kind=codex',{headers:{'x-bops-window':'local-test-window'}}));
  assert.equal(response.status,200); assert.equal((await response.json()).subscriptions.length,1);
  assert.equal(calls.length,before+1); assert.ok(calls.at(-1).args.includes('status'));
  assert.equal((await route.GET(new Request('http://localhost/api/local-subscriptions?kind=other',{headers:{'x-bops-window':'local-test-window'}}))).status,400);
  assert.equal(calls.length,before+1);
});
await test('proxy and custom certificate overrides never reach the official CLI', async () => {
  for(const key of ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']) process.env[key]='synthetic-override';
  const runtime=api.localSubscriptionRuntime('codex');
  for(const key of ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']) { assert.equal(runtime.env[key],undefined); delete process.env[key]; }
});
await test('Claude printed manual code URLs are never exposed as a usable sign-in link', async () => {
  reply=null; await api.startLocalLogin('claude');
  const child=calls.at(-1).child;
  for(const host of ['claude.com','claude.ai','platform.claude.com']) child.stdout.emit('data',Buffer.from(`https://${host}/cai/oauth/authorize?fixture=only `));
  const snapshot=await api.getLocalSubscriptionStatus('claude');
  assert.equal(snapshot.state,'connecting'); assert.equal(snapshot.loginUrl,undefined);
  reply={code:1,text:'{"loggedIn":false}'}; await api.cancelLocalLogin('claude');
});
await test('the chip\'s cached check reuses the last minute\'s answer, and a sign-in change or a full check replaces it', async () => {
  closeOnKill=true; api.forgetLocalChecks();
  reply={code:0,text:'{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max"}'};
  const before=calls.length;
  assert.equal((await api.cachedLocalSubscriptionStatus('claude')).state,'connected');
  assert.equal(calls.length,before+1,'the first read asks the CLI');
  for (let i=0;i<3;i++) assert.equal((await api.cachedLocalSubscriptionStatus('claude')).state,'connected');
  assert.equal(calls.length,before+1,'mounting the chip or focusing the window again doesn\'t');
  // Settings' own check always asks, and what it found is what the chip reads next.
  reply={code:1,text:'{"loggedIn":false}'};
  assert.equal((await api.getLocalSubscriptionStatus('claude')).state,'signed-out');
  assert.equal(calls.length,before+2);
  assert.equal((await api.cachedLocalSubscriptionStatus('claude')).state,'signed-out');
  assert.equal(calls.length,before+2);
  // A sign-out here (Settings, AI plans) drops the old answer; its own check after is what the chip reads, not the old one.
  reply={code:0,text:'{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"pro"}'};
  await api.logoutLocalSubscription('claude');
  const after=calls.length;
  const now=await api.cachedLocalSubscriptionStatus('claude'); assert.equal(now.plan,'pro',JSON.stringify(now));
  assert.equal(calls.length,after,'the sign-out\'s own check is reused');
});
console.log(`local subscriptions: ${passed} passed`);

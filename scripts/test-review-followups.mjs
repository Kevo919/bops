import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0, failed = 0;
function check(name, f) { try { f(); console.log('PASS ' + name); passed++; } catch(e) { console.error('FAIL ' + name + ': ' + e.message); failed++; } }
function declaration(path, name) {
  const source = read(path), ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, name + ' exists');
  return ts.transpileModule(node.getText(ast).replace(/^export /, ""), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
}
check('91: placeholders remain readable while configured real keys are removed', () => {
  const context = {process:{env:{OLLAMA_API_KEY:'ollama', OLLAMA_API_KEY__LONG:'not-needed', OPENAI_API_KEY:'replace-me', ZAI_API_KEY:'abcdefg', DEEPSEEK_API_KEY:'secret-value-123456789', OTHER_PASSWORD:'long-private-value'}}};
  vm.createContext(context);
  const keys = vm.runInContext(declaration('lib/server/chat-failure.ts','serverKeys') + '\nserverKeys()', context);
  for (const placeholder of ['ollama','not-needed','replace-me','abcdefg']) assert.ok(!keys.includes(placeholder), placeholder + ' is not a secret');
  for (const key of ['secret-value-123456789','long-private-value']) assert.ok(keys.includes(key), 'real value still redacted');
});
for (const file of ['briefing.ts','sessions.ts','chat.ts']) check('92: ' + file + ' says the recorded owner platform, not the runner platform', () => {
  const source = read('lib/server/' + file);
  // Exercise the current implementation on the pre-fix tree too, so the negative control is behavioral.
  const local = source.match(/const ownPlatform = [^;]+;/)?.[0];
  const helper = local ?? declaration('lib/server/owner-platform.ts', 'ownPlatform');
  const words = declaration('lib/computer-words.ts', 'computerWords');
  for (const runner of [false,true]) for (const turn of [false,true]) for (const owner of ['win32','darwin',undefined]) {
    const context = {process:{platform:'linux'},onRunner:()=>runner,currentTurn:()=>turn,getState:()=>({mac:{platform:owner}}),ownerPlatformOf:()=>undefined};
    const actual = vm.runInNewContext(helper + words + '\ncomputerWords("your Mac", ownPlatform())',context);
    assert.equal(actual, runner || turn ? owner === 'win32' ? 'your PC' : owner === 'darwin' ? 'your Mac' : 'your computer' : 'your computer');
  }
  assert.ok(!local, 'modules use the shared owner-platform helper');
});
check('92: synced owner platforms resolve consistently and mixed owners stay neutral', () => {
  const code=declaration('cloud/ws-slice.ts','ownerPlatformOf')+declaration('lib/server/owner-platform.ts','ownPlatform');
  for (const [state, expected] of [
    [{macs:{a:{mac:{platform:'win32'}}}},'win32'],
    [{macs:{a:{mac:{platform:'darwin'}}}},'darwin'],
    [{macs:{a:{mac:{platform:'win32'}},b:{mac:{platform:'darwin'}}}},'unknown'],
    [{mac:{platform:'untrusted-value'}},'unknown'],
    [{},'unknown'],
  ]) {
    assert.equal(vm.runInNewContext(code+'\nownPlatform()', {getState:()=>state,onRunner:()=>true,currentTurn:()=>null,process:{platform:'linux'},PLATFORMS:['win32','darwin','linux'],isObject:v=>v!==null && typeof v==='object' && !Array.isArray(v)}),expected);
  }
});
check('92: real task instructions follow recorded owner OS and keep cloud execution Linux', () => {
  const definitions = [declaration('lib/server/owner-platform.ts','ownPlatform'), declaration('lib/computer-words.ts','computerWords'), declaration('lib/computer-words.ts','computerWordsFor'), declaration('lib/windows-task-instructions.ts','windowsTaskInstructions'), declaration('lib/server/sessions.ts','macChromeNote'), declaration('lib/server/sessions.ts','instructions')].join('\n');
  for (const platform of ['win32','darwin',undefined]) {
    const context={process:{platform:'linux',env:{}},getState:()=>({mac:{platform}}),onRunner:()=>true,currentTurn:()=>true,ownerPlatformOf:()=>undefined,ownerName:()=> 'Kevin',ownerLine:()=>'',screenLabel:()=> 'screen 1',MAX_HELPERS:3,WRITING:'',ASKING:''};
    const local=vm.runInNewContext(definitions+'\ninstructions("Boppy", "helper", true, 1, undefined, false, false, true)', context);
    if(platform==='win32') { assert.match(local,/Windows PC/); assert.match(local,/Use PowerShell/); assert.doesNotMatch(local,/Drive .* apps .*osascript/); }
    else if(platform==='darwin') { assert.match(local,/Drive Kevin's Mac apps/); assert.match(local,/osascript \(AppleScript/); }
    else { assert.match(local,/Kevin's computer/); assert.doesNotMatch(local,/osascript|Finder|Use PowerShell/); }
    const cloud=vm.runInNewContext(definitions+'\ninstructions("Boppy", "helper", false, 1)',context);
    assert.match(cloud,/your own Linux computer/);
    assert.ok(cloud.includes(platform==='win32' ? "can't reach Kevin's PC" : platform==='darwin' ? "can't reach Kevin's Mac" : "can't reach Kevin's computer"));
  }
});
check('99: executor key mask never exposes short values', () => {
  const source=read('lib/server/pc-task-runner.ts');
  const line=source.match(/export const maskKey = [^;]+;/)[0];
  const code=ts.transpileModule(line.replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const mask=vm.runInNewContext(code+'\nmaskKey');
  assert.equal(mask(undefined),'');
  for (const value of ['x','short', 'a'.repeat(19)]) assert.equal(mask(value),'saved');
  assert.equal(mask('a'.repeat(20)),'ends in aaaa');
});
check('97: scratch Credential Manager cleanup runs after an assertion failure', () => {
  const path='scripts/test-cloud.mjs', source=read(path), ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  const guard=ast.statements.find(n => ts.isTryStatement(n) && n.finallyBlock?.getText(ast).includes('deletePassword'));
  assert.ok(guard, 'scratch credential deletion is in a top-level finally');
  assert.ok(guard.tryBlock.getText(ast).includes('all cloud tests passed'), 'finally protects test execution');
  const cleanup=guard.finallyBlock.getText(ast);
  let deleted=0;
  const context={process:{platform:'win32',env:{BOPS_TEST_SECRET_KEY_ACCOUNT:'scratch-only'}},createRequire:()=>()=>({Entry:class{constructor(service,account){assert.equal(service,'Bops Vault');assert.equal(account,'scratch-only')}deletePassword(){deleted++}}}),unlinkSync:()=>{},rmSync:()=>{},join:(...p)=>p.join('/'),scratch:'scratch'};
  assert.throws(()=>vm.runInNewContext('try { throw new Error("test failed") } finally ' + cleanup.replaceAll('import.meta.url','"test"'),context), /test failed/);
  assert.equal(deleted,1);
});
console.log(`${passed} passed; ${failed} failed`);
if(failed) process.exitCode=1;

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
  return ts.transpileModule(node.getText(ast), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
}
check('91: placeholders remain readable while configured real keys are removed', () => {
  const context = {process:{env:{OLLAMA_API_KEY:'ollama', OLLAMA_API_KEY__LONG:'not-needed', OPENAI_API_KEY:'replace-me', ZAI_API_KEY:'abcdefg', DEEPSEEK_API_KEY:'secret-value-123456789', OTHER_PASSWORD:'long-private-value'}}};
  vm.createContext(context);
  const keys = vm.runInContext(declaration('lib/server/chat-failure.ts','serverKeys') + '\nserverKeys()', context);
  for (const placeholder of ['ollama','not-needed','replace-me','abcdefg']) assert.ok(!keys.includes(placeholder), placeholder + ' is not a secret');
  for (const key of ['secret-value-123456789','long-private-value']) assert.ok(keys.includes(key), 'real value still redacted');
});
for (const file of ['briefing.ts','sessions.ts','chat.ts']) check('92: ' + file + ' preserves owner wording on runner turns', () => {
  const source = read('lib/server/' + file);
  assert.match(source, /const ownPlatform = \(\) => \(onRunner\(\) \|\| currentTurn\(\) \? "darwin" : process\.platform\)/);
  assert.doesNotMatch(source, /computerWordsFor\(process\.platform\)|computerWords\([^\n]*, process\.platform\)/, 'owner copy must use owner platform');
  const declaration = source.match(/const ownPlatform = [^;]+;/)[0];
  for (const platform of ['win32','darwin','linux']) for (const runner of [false,true]) for (const turn of [false,true]) {
    assert.equal(vm.runInNewContext(declaration + '\nownPlatform()', {process:{platform},onRunner:()=>runner,currentTurn:()=>turn}), runner || turn ? 'darwin' : platform);
  }
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

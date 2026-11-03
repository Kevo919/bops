// Usage: node scripts/test-computer-identity.mjs [win32|darwin|linux]
// Actual React UI with a fake config response. No provider, local app or credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { computerWords, computerWordsFor } from '../lib/computer-words.ts';
import { windowsTaskInstructions } from '../lib/windows-task-instructions.ts';
const platform=process.argv[2]??'win32';
assert.ok(['win32','darwin','linux'].includes(platform));
const root=pathToFileURL(fileURLToPath(new URL('..',import.meta.url))).href.replace(/\/$/,'');
registerHooks({resolve(s,c,next){if(s.startsWith('@/'))s=`${root}/${s.slice(2)}`;try{return next(s,c);}catch(e){if(/^(file:|\.)/.test(s))for(const ext of ['.ts','.tsx'])try{return next(s+ext,c);}catch{}throw e;}},load(u,c,next){if(!u.endsWith('.tsx'))return next(u,c);return{format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(u),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},fileName:u}).outputText};}});
assert.equal(computerWords('Your Mac / This Mac / macOS','win32'),'Your PC / This PC / Windows');
assert.equal(computerWords('Your Mac / This Mac / macOS','darwin'),'Your Mac / This Mac / macOS');
assert.equal(computerWords('Your Mac'),'Your computer');
assert.equal(computerWordsFor('win32')`Your Mac: ${"Compare Mac and Windows"}`, 'Your PC: Compare Mac and Windows');
const full=windowsTaskInstructions('Fixture owner',true).join(' '),limited=windowsTaskInstructions('Fixture owner',false).join(' ');
assert.match(full,/Windows PC/);assert.match(full,/Use PowerShell and native Windows paths/);
assert.match(limited,/Full access is off: do not run shell commands/);assert.match(limited,/not a claim of file-read isolation/);
for(const text of [full,limited]){assert.match(text,/Bops itself is off limits/);assert.match(text,/only tools actually available/);assert.doesNotMatch(text,/Drive .*Mac apps|Use the shell .*Mac itself/);}
const {GET}=await import('../app/api/config/route.ts');assert.equal((await(await GET()).json()).platform,process.platform);
const {parseHTML}=await import('linkedom'),{window:win}=parseHTML('<html><body></body></html>');
globalThis.window=win;globalThis.document=win.document;Object.defineProperty(globalThis,'navigator',{value:{userAgent:platform==='win32'?'iPhone':'Windows'},configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let resolveConfig;globalThis.fetch=async u=>{assert.equal(u,'/api/config');return await new Promise(r=>{resolveConfig=r;});};
const {createElement:h,act}=await import('react'),{createRoot}=await import('react-dom/client');
const {MacSettings}=await import('../components/app/mac-tab.tsx');
const {RunsOnChoice}=await import('../components/app/runs-on.tsx');
const container=document.createElement('div');document.body.append(container);const renderer=createRoot(container);
const state={bots:[],mac:{ready:true,rules:[]}};
try{await act(async()=>{renderer.render(h('div',null,h(MacSettings,{state}),h(RunsOnChoice,{state,info:{runsOn:'mac'},busy:false,error:null,onPick:()=>{}})));});assert.match(container.textContent,/Your computer/);assert.doesNotMatch(container.textContent,/Your Mac|This Mac/);
await act(async()=>{resolveConfig({ok:true,json:async()=>({platform})});await new Promise(r=>setTimeout(r,0));});
const label=platform==='win32'?'PC':platform==='darwin'?'Mac':'computer';assert.match(container.textContent,new RegExp(`Your ${label}`));assert.match(container.textContent,new RegExp(`This ${label}`));if(platform==='win32')assert.doesNotMatch(container.textContent,/\bMac\b|&apos;/);
console.log(`PASS: ${platform} server identity, neutral loading, real settings/routing labels, config platform and Windows instruction permissions`);
}finally{await act(async()=>renderer.unmount());}

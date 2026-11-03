// node scripts/test-local-codex-chat.mjs — fake processes only; no account files or provider calls.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = readFileSync(fileURLToPath(new URL("../lib/server/local-codex-chat.ts", import.meta.url)), "utf8");
const calls = [];
let state, mode, statusHook, connected, help;
const normalHelp = "--ignore-user-config --ignore-rules --ephemeral --json --sandbox --skip-git-repo-check";
const payload = [{ type: "item.completed", item: { type: "agent_message", text: "synthetic answer" } }, { type: "turn.completed" }].map(JSON.stringify).join("\n");
function spawn(file, args, options) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.kill = () => { child.killed = true; if (mode !== "unkillable") queueMicrotask(() => child.emit("close", 1)); return true; };
  const call = { file, args, options, child }; calls.push(call);
  child.stdin.end = (input) => {
    call.input = input;
    queueMicrotask(() => {
      if (args.includes("--help")) { child.stdout.emit("data", Buffer.from(help)); child.emit("close", 0); return; }
      if (mode === "hang" || mode === "unkillable") return;
      if (mode === "overflow") { child.stderr.emit("data", Buffer.alloc(512 * 1024 + 1)); return; }
      if (mode === "failure") { child.stderr.emit("data", Buffer.from("PRIVATE_SECRET")); child.emit("close", 1); return; }
      if (mode === "scope-change") state.shared = {};
      if (mode === "account-change") state.account = { user: { id: "different-owner" } };
      child.stdout.emit("data", Buffer.from(mode === "incomplete" ? '{"type":"thread.started"}' : payload));
      child.emit("close", 0);
    });
  };
  return child;
}
const modules = {
  "server-only": {}, "node:child_process": { spawn }, "node:fs/promises": fsPromises, "node:os": os, "node:path": path,
  "@/lib/types": { MAIN_WORKSPACE: "main", workspaceOf: (x) => x?.workspaceId ?? "main" },
  "./store": { getState: () => state },
  "./owner-email": { fromThisMac: (r) => new URL(r.url).hostname === "127.0.0.1" },
  "./ui-token": { fromBopsWindow: (r) => r.headers.get("x-bops-window") === "synthetic-window" },
  "./local-subscriptions": {
    getLocalSubscriptionStatus: async () => { statusHook?.(); return { connected }; },
    localSubscriptionRuntime: () => ({ file: "synthetic-codex", env: { HOME: "synthetic-official-home", PATH: "synthetic-path" } }),
  },
};
const api = {};
new Function("require", "exports", "setTimeout", ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))((id) => {
  assert.ok(Object.hasOwn(modules, id), `unexpected dependency ${id}`); return modules[id];
}, api, (callback, ms) => setTimeout(callback, Math.min(ms, 50)));
const request = () => new Request("http://127.0.0.1/api/chat", { headers: { "x-bops-window": "synthetic-window" } });
const input = () => ({ request: request(), chatId: "chat", prompt: "synthetic prompt" });
const saved = { self: process.env.BOPS_SELF_HOSTED, token: process.env.BOPS_UI_TOKEN };
let passed = 0;
async function test(name, fn) {
  state = { chats: [{ id: "chat", kind: "bot", botIds: ["b"] }], bots: [{ id: "b" }] };
  mode = "ok"; statusHook = undefined; connected = true; help = normalHelp; calls.length = 0;
  process.env.BOPS_SELF_HOSTED = "1"; process.env.BOPS_UI_TOKEN = "synthetic-window";
  await fn(); passed++; console.log(`ok ${name}`);
  for (const c of calls) assert.ok(!existsSync(c.options.cwd), "owned empty working directory cleaned after process exit");
}
try {
  await test("missing actual request, phone, remote and shared requests fail before spawning", async () => {
    await assert.rejects(api.runLocalCodexChat({ ...input(), request: undefined }), /private desktop/);
    for (const r of [new Request("http://evil.test", { headers: { "x-bops-window": "synthetic-window" } }), new Request("http://127.0.0.1", { headers: { "x-bops-window": "synthetic-window", "x-bops-remote": "" } }), new Request("http://127.0.0.1")]) await assert.rejects(api.runLocalCodexChat({ ...input(), request: r }), /private desktop/);
    state.shared = {}; await assert.rejects(api.runLocalCodexChat(input()), /private desktop/);
    assert.equal(calls.length, 0);
  });
  await test("group, wrong workspace and absent configured token cannot use local account", async () => {
    state.chats[0].kind = "group"; await assert.rejects(api.runLocalCodexChat(input()), /private desktop/);
    state.chats[0].kind = "bot"; state.workspace = "other"; await assert.rejects(api.runLocalCodexChat(input()), /private desktop/);
    delete state.workspace; delete process.env.BOPS_UI_TOKEN; await assert.rejects(api.runLocalCodexChat(input()), /private desktop/);
    assert.equal(calls.length, 0);
  });
  await test("sign-in and authorization are rechecked after asynchronous status", async () => {
    connected = false; await assert.rejects(api.runLocalCodexChat(input()), /Sign in/);
    connected = true; statusHook = () => { state.shared = {}; }; await assert.rejects(api.runLocalCodexChat(input()), /private desktop/);
    assert.equal(calls.length, 0);
  });
  await test("unsupported CLI fails before model request", async () => {
    help = "--json"; await assert.rejects(api.runLocalCodexChat(input()), /Update Codex/); assert.equal(calls.length, 1);
  });
  await test("read-only exec uses isolated working directory, stdin and official sanitized environment", async () => {
    assert.equal(await api.runLocalCodexChat(input()), "synthetic answer");
    const c = calls.at(-1); assert.equal(c.options.shell, false); assert.equal(c.options.windowsHide, true);
    assert.equal(c.input, "synthetic prompt"); assert.ok(!c.args.includes(c.input));
    assert.deepEqual(c.options.env, { HOME: "synthetic-official-home", PATH: "synthetic-path" });
    assert.equal(c.args[c.args.indexOf("--sandbox") + 1], "read-only");
    for (const x of ["--ignore-user-config", "--ignore-rules", "--ephemeral", "mcp_servers={}", "features.plugins=false", "features.hooks=false", 'web_search="disabled"', 'approval_policy="never"']) assert.ok(c.args.includes(x), x);
    assert.ok(!c.args.some((x) => /bypass|danger-full-access/.test(x)));
  });
  await test("scope changed during generation cannot return an answer", async () => { mode = "scope-change"; await assert.rejects(api.runLocalCodexChat(input()), /private desktop/); });
  await test("changing owner identity cannot transfer an in-flight reply", async () => { mode = "account-change"; await assert.rejects(api.runLocalCodexChat(input()), /account changed/); });
  await test("stderr secrets stay out of errors and incomplete events are not answers", async () => {
    mode = "failure"; await assert.rejects(api.runLocalCodexChat(input()), (e) => !e.message.includes("PRIVATE_SECRET") && /safely/.test(e.message));
    mode = "incomplete"; await assert.rejects(api.runLocalCodexChat(input()), /completed text/);
  });
  await test("bounded output stops only the spawned child", async () => { mode = "overflow"; await assert.rejects(api.runLocalCodexChat(input()), /too much output/); assert.equal(calls.at(-1).child.killed, true); });
  await test("timeout and cancellation stop the owned process", async () => {
    mode = "hang"; await assert.rejects(api.runLocalCodexChat(input()), /too long/); assert.equal(calls.at(-1).child.killed, true);
    const ac = new AbortController(); const p = api.runLocalCodexChat({ ...input(), signal: ac.signal }); setTimeout(() => ac.abort(), 10);
    await assert.rejects(p, /cancelled/); assert.equal(calls.at(-1).child.killed, true);
  });
  await test("one conversation cannot start concurrent CLI processes", async () => {
    mode = "hang"; const first = api.runLocalCodexChat(input());
    await assert.rejects(api.runLocalCodexChat(input()), /already has a reply/);
    await assert.rejects(first, /too long/);
    assert.equal(calls.length, 2, "only one help probe and one model process");
  });
  await test("failed termination bounds the reply but retains lock and directory until actual exit", async () => {
    mode = "unkillable";
    await assert.rejects(api.runLocalCodexChat(input()), /still stopping/);
    const running = calls.at(-1);
    assert.ok(existsSync(running.options.cwd));
    await assert.rejects(api.runLocalCodexChat(input()), /already has a reply/);
    running.child.emit("close", 1);
    for (let i = 0; i < 50 && existsSync(running.options.cwd); i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(!existsSync(running.options.cwd));
  });
  await test("input is bounded before any CLI invocation", async () => { await assert.rejects(api.runLocalCodexChat({ ...input(), prompt: "x".repeat(128 * 1024 + 1) }), /too long/); assert.equal(calls.length, 0); });
  console.log(`local Codex chat: ${passed} passed`);
} finally {
  for (const [key, value] of [["BOPS_SELF_HOSTED", saved.self], ["BOPS_UI_TOKEN", saved.token]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
}

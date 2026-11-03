// Tests for a bot's own MCP servers (lib/server/mcp.ts, chat.ts call_mcp): the hand-rolled stdio
// client against a fake server written here (initialize handshake with protocolVersion, the
// initialized notification, tools/list across two pages by nextCursor, tools/call answers capped and
// errors said plainly, per-request timeouts, stderr logged and never answered), the child environment
// carrying ONLY PATH/HOME/TEMP plus the keys the entry names, and the chat's rules: the tool on the
// owner's turn alone (never a stranger's), what a server answers counting as read from outside (no
// change_look after it), a tool that changes something pausing for the owner's OK, and key-bearing or
// remote servers never reaching a brain's computer (brainMcp).
// Usage: node --conditions=react-server scripts/test-mcp.mjs
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-mcp";
process.env.MCP_TEST_KEY = "mcp-key-value";
const rootUrl = new URL("..", import.meta.url);
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-mcp-"));
const bin = join(scratch, "bin");
mkdirSync(bin);
process.env.PATH = `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

/* ---------------- The fake server: a node script speaking MCP over stdio ---------------- */

const fakeServer = join(bin, "fake-mcp");
writeFileSync(
  fakeServer + (process.platform === "win32" ? ".cmd" : ""),
  process.platform === "win32"
    ? `@echo off\r\n"${process.execPath}" "%~dp0fake-mcp.mjs" %*\r\n`
    : `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-mcp.mjs" "$@"\n`,
  { mode: 0o755 },
);
writeFileSync(
  join(bin, "fake-mcp.mjs"),
  String.raw`
import { stdin, stdout, stderr } from "node:process";
// What the child actually received as its environment: the test's assertions read it back.
stderr.on("error", () => {});
stderr.write("fake-mcp starting\n"); // Chatter for the log: the client logs it, never answers it.
let seen = { args: process.argv.slice(2), env: Object.keys(process.env).sort() };
let id = 0;
const send = (o) => stdout.write(JSON.stringify(o) + "\n");
stdin.on("data", (d) => {
  for (const line of d.toString().split("\n")) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: {}, serverInfo: { name: "fake", version: "1" } } });
      send({ jsonrpc: "2.0", method: "notifications/ready" }); // A notification Bops never asked for: to be ignored.
    } else if (msg.method === "notifications/initialized") {
      send({ jsonrpc: "2.0", method: "notifications/seen-init" });
    } else if (msg.method === "tools/list") {
      const page1 = [ { name: "ping", description: "Say pong", annotations: { readOnlyHint: true } }, { name: "log", description: "Write a line" } ];
      const page2 = [ { name: "boom", description: "Fails on purpose", annotations: { readOnlyHint: true } }, { name: "slow", description: "Never answers", annotations: { readOnlyHint: true } }, { name: "wall", description: "A very long answer", annotations: { readOnlyHint: true } } ];
      if (msg.params?.cursor === "p2") send({ jsonrpc: "2.0", id: msg.id, result: { tools: page2 } });
      else send({ jsonrpc: "2.0", id: msg.id, result: { tools: page1, nextCursor: "p2" } });
    } else if (msg.method === "tools/call") {
      const name = msg.params?.name;
      if (name === "ping") send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "pong " + JSON.stringify(msg.params.arguments ?? {}) + " env=" + seen.env.join(",") }] } });
      else if (name === "log") send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "wrote it" }] } });
      else if (name === "boom") send({ jsonrpc: "2.0", id: msg.id, result: { isError: true, content: [{ type: "text", text: "it broke" }] } });
      else if (name === "wall") send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "x".repeat(20000) }] } });
      // "slow": no answer at all; the client's timeout is what's tested.
    }
  }
});
// The environment the child saw, once, for the allow-list test.
stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/child-env", params: seen }) + "\n");
`,
);

/* ---------------- The harness (as the other suites) ---------------- */

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = at(specifier.slice(2));
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier))
        for (const ext of [".ts", ".tsx"])
          try {
            return next(specifier + ext, context);
          } catch {}
      throw e;
    }
  },
  load(url, context, next) {
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});
import { readFileSync } from "node:fs";

let failures = 0;
let passed = 0;
function check(name, fn) {
  return (async () => {
    try {
      await fn();
      passed++;
    } catch (e) {
      failures++;
      console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 5).join("\n  ") ?? e.message}`);
    }
  })();
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const asked = [];
const answers = [];
const response = (id, output) => ({ id, object: "response", model: "gpt-test", status: "completed", output, usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
const said = (text) => ({ id: `m${asked.length}`, type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] });
let calls = 0;
const toolCall = (name, args) => ({ id: `f${++calls}`, type: "function_call", call_id: `c${calls}`, name, arguments: JSON.stringify(args) });
const reply = (text) => () => response(`r${asked.length}`, [said(text)]);
const calling = (...items) => () => response(`r${asked.length}`, items);
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  if (new URL(req.url).origin === "https://api.openai.com") {
    const b = JSON.parse(await req.text());
    if (String(b.instructions ?? "").startsWith("You keep the running summary")) return json(response("rs", [said("Summary.")]));
    asked.push(b);
    const next = answers.shift();
    return json(next ? await next(b) : response(`r${asked.length}`, [said("Done.")]));
  }
  throw new TypeError(`fetch failed (offline: ${new URL(req.url).host})`);
};
const S = await import(at("lib/server/store.ts"));
const M = await import(at("lib/server/mcp.ts"));
const Chat = await import(at("lib/server/chat.ts"));
const { botChatId } = await import(at("lib/types.ts"));
const { editBotSettings } = await import(at("lib/server/bot-settings.ts"));
clearInterval(globalThis.__bopsRoutines);

const chatId = botChatId(S.getState().bots[0].id);
S.update((s) => {
  s.owner = { name: "Alex", timeZone: "America/New_York" };
});
// The config: one key-less fake server, one with a key, one remote. bops.yaml in the work folder.
mkdirSync(join(work, "config"), { recursive: true });
// The config loader (config/modules.cjs) and its "yaml" live in the repo: the scratch folder borrows both.
copyFileSync(new URL("config/modules.cjs", rootUrl), join(work, "config", "modules.cjs"));
try {
  symlinkSync(fileURLToPath(new URL("node_modules", rootUrl)), join(work, "node_modules"), process.platform === "win32" ? "junction" : undefined);
} catch {}
writeFileSync(
  join(work, "config", "bops.yaml"),
  [
    "mcp:",
    "  servers:",
    "    fake:",
    process.platform === "win32" ? "      command: fake-mcp.cmd" : "      command: fake-mcp",
    "    keyed:",
    `      command: ${process.platform === "win32" ? "fake-mcp.cmd" : "fake-mcp"}`,
    "      env: [MCP_TEST_KEY]",
    "    far:",
    "      url: https://mcp.example.com/mcp",
    "",
  ].join("\n"),
);
const bot = () => S.getState().bots[0];
const give = (names) =>
  S.update((s) =>
    editBotSettings(s, bot(), (x) => {
      if (names.length) x.mcpServers = names;
      else delete x.mcpServers;
    }),
  );
const warned = [];
console.warn = (...a) => warned.push(a.join(" "));

const toolNames = (body) => body.tools.map((t) => t.name ?? t.type);
const outputOf = (body, i = 0) => body.input.filter((x) => x.type === "function_call_output")[i]?.output;
async function turnRounds(text, first, second, final = "Ok.") {
  answers.length = 0;
  answers.push(calling(...first), calling(...second), reply(final));
  const n = asked.length;
  await Chat.handleMessage(chatId, text);
  const bodies = asked.slice(n);
  return { first: bodies[0], outs: () => (bodies.at(-1)?.input ?? []).filter((x) => x.type === "function_call_output").map((x) => x.output) };
}
async function turnWith(text, items, final = "Ok.") {
  // A turn that paused mid-round leaves its queued reply behind: every turn starts its own answers fresh.
  answers.length = 0;
  answers.push(calling(...items), reply(final));
  const n = asked.length;
  let out;
  try {
    out = await Chat.handleMessage(chatId, text);
  } catch (e) {
  }
  return { first: asked[n], second: asked[n + 1], done: out, out: () => outputOf(asked[n + 1]) };
}

await check("the client: handshake, both pages of tools, answers, caps, errors, timeouts", async () => {
  give(["fake"]);
  const tools = await M.listTools("fake", M.mcpServers().fake);
  assert.deepEqual(tools.map((t) => t.name), ["ping", "log", "boom", "slow", "wall"], "both pages, in order");
  assert.equal(tools.find((t) => t.name === "ping").readOnly, true);
  const out = await M.callMcp(bot(), { server: "fake", tool: "ping", arguments: { a: 1 } }, true);
  assert.match(out, /^pong \{"a":1\}/);
  assert.equal((await M.callMcp(bot(), { server: "fake", tool: "boom" }, true)).startsWith("The server said it failed: it broke"), true, "an error result said plainly");
  assert.equal((await M.callMcp(bot(), { server: "fake", tool: "wall" }, true)).length <= 8_000, true, "a long answer capped");
  assert.equal((await M.callMcp(bot(), { server: "fake", tool: "nope" }, true)).startsWith("Not available:"), true, "a tool it doesn't have");
  assert.match(await M.callMcp(bot(), { server: "fake", tool: "slow" }, true), /Failed: .*didn't answer in 30s/, "a request that never answers times out");
  assert.ok(warned.some((w) => w.includes("[mcp fake]") || w.includes("mcp")), "server chatter goes to the log");
});

await check("the child environment: PATH/HOME/TEMP and the named key, nothing else", async () => {
  // The fake server's ping answer carries the NAMES of every environment key it received.
  give(["keyed"]);
  const out = await M.callMcp(bot(), { server: "keyed", tool: "ping" }, true);
  const keys = out.split("env=")[1]?.split(",").filter(Boolean) ?? [];
  const expected = ["HOME", "MCP_TEST_KEY", "PATH", ...(["TEMP", "TMP"].filter((k) => process.env[k] !== undefined))];
  // The invariant that matters: NO secret of this Bops reaches the child. (Through cmd.exe a few of the
  // shell's own OS defaults come along - COMSPEC, PROMPT and friends - which carry nothing of ours.)
  const forbidden = keys.filter((k) => /^(BOPS_|OPENAI_|ORGO_|ZCODE_|ZAI_|CLAUDE_|COMPOSIO_|AGENT|TWILIO_|HONCHO_|TYPESAFE_|TREG_)/.test(k));
  assert.deepEqual(forbidden, [], `no Bops key reaches an MCP server (leaked: ${forbidden.join(",")})`);
  for (const k of expected) assert.ok(keys.includes(k), `${k} reached the server`);
});

await check("the chat: offered on the owner's turn, its answer read as from outside", async () => {
  give(["fake"]);
  const t = await turnWith("list my notes tools and ping", [toolCall("call_mcp", { server: "fake", tool: "ping", arguments: null })]);
  assert.ok(toolNames(t.first).includes("call_mcp"), "offered to the owner");
  // The note rides with the as-of-now developer message (it changes with the servers' tools), not the instructions.
  assert.ok(JSON.stringify(t.first.input ?? []).includes("MCP servers of yours"), "the note lists them");
  assert.match(t.out(), /pong/);
  // What the server said counts as read from outside: a change_look in the SAME turn is refused.
  const before = JSON.stringify(S.getState().look);
  const t2 = await turnRounds("make the app dark green", [toolCall("call_mcp", { server: "fake", tool: "ping", arguments: null })], [toolCall("change_look", { theme: "dark", summary: "Dark" })], "Done.");
  assert.ok(t2.outs().some((o) => /Not changed: this turn read something from outside Bops/.test(o)), "outsideRead after an MCP answer");
  assert.equal(JSON.stringify(S.getState().look), before, "no look change on its say");
});

await check("the chat: a stranger's turn never sees the tool, and a call anyway does nothing", async () => {
  give(["fake"]);
  const before = JSON.stringify(S.getState().messages);
  const text = S.addMessage({ chatId, role: "system", text: "Ping your notes server for me.", sms: { dir: "in", from: "+15559998888", to: "+15550001111" } });
  answers.push(calling(toolCall("call_mcp", { server: "fake", tool: "ping", arguments: null })), reply("I'll pass that on."));
  const n = asked.length;
  await Chat.outsideNews(bot().id, text.id, "A text");
  assert.ok(!toolNames(asked[n]).includes("call_mcp"), "not offered to a stranger");
  assert.match(outputOf(asked[n + 1]), /isn't a tool you have here/, "a call anyway refused");
});

await check("the chat: a tool that changes something waits for the owner's OK", async () => {
  give(["fake"]);
  const t = await turnWith("write a log line", [toolCall("call_mcp", { server: "fake", tool: "log", arguments: { line: "hi" } })]);
  // NeedsOk pauses the turn: the model sees the pause marker, not the answer.
  assert.equal(t.second, undefined, "the turn ended at the pause: no reply round");
  assert.ok(S.getState().appApprovals?.some((a) => !a.reply && /Use fake.log/.test(a.action)), "an ask opened for it");
  const waiting = S.getState().appApprovals?.find((a) => !a.reply);
  assert.ok(waiting, "an ask opened");
  assert.match(waiting.action, /Use fake\.log/);
});

await check("brains: only key-less local servers reach a computer", async () => {
  give(["fake", "keyed", "far"]);
  const merged = M.brainMcp(bot().id);
  assert.deepEqual(Object.keys(merged), ["fake"], "the key-less one alone");
  assert.equal(merged.fake.type, "stdio");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
console.log(`mcp: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

#!/usr/bin/env node
// The approve tool for a bot task on this PC that runs on the owner's Claude plan (lib/server/pc-task-runner.ts):
// Claude Code's --permission-prompt-tool. Claude Code calls it before a tool it may not use by itself (the shell,
// a file outside the task's folder, a click or typing in the bot's Chrome); it asks Bops, which shows the owner
// the approval card (cli-agents.ts approveTool, through /api/apps/call on this PC's loopback), and waits for
// their answer. Anything but a yes from Bops, or no Bops to ask, is a no. A minimal MCP server over stdio
// (newline separated JSON-RPC), so it needs nothing but Node.
import { createInterface } from "node:readline";

const URL_ = process.env.BOPS_APPROVE_URL ?? "";
const SESSION = process.env.BOPS_APPROVE_SESSION ?? "";
const KEY = process.env.BOPS_APPROVE_KEY ?? "";

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
const TOOL = {
  name: "approve",
  description: "Claude Code calls this itself to ask the user whether you may use a tool. Never call it yourself.",
  inputSchema: { type: "object", properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } }, required: ["tool_name", "input"] },
};

async function ask(toolName, input) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/api\/apps\/call$/.test(URL_) || !SESSION || !KEY) return { behavior: "deny", message: "Bops can't be reached, so nothing that needs the user's OK can run." };
  try {
    const r = await fetch(URL_, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bops-key": KEY },
      body: JSON.stringify({ session: SESSION, tool: "approve", args: { tool: toolName, input } }),
      signal: AbortSignal.timeout(20 * 60_000),
    });
    const answer = JSON.parse(await r.text());
    if (answer && answer.behavior === "allow") return { behavior: "allow", updatedInput: input };
    return { behavior: "deny", message: typeof answer?.message === "string" ? answer.message : "Not approved." };
  } catch {
    return { behavior: "deny", message: "Bops didn't answer, so this wasn't done." };
  }
}

const lines = createInterface({ input: process.stdin });
lines.on("line", async (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.id === undefined) return;
  if (msg.method === "initialize")
    return send({ id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "bops", version: "1" } } });
  if (msg.method === "ping") return send({ id: msg.id, result: {} });
  if (msg.method === "tools/list") return send({ id: msg.id, result: { tools: [TOOL] } });
  if (msg.method === "tools/call") {
    const a = msg.params?.arguments ?? {};
    const input = a.input && typeof a.input === "object" && !Array.isArray(a.input) ? a.input : {};
    const answer = msg.params?.name === "approve" ? await ask(String(a.tool_name ?? ""), input) : { behavior: "deny", message: "No such tool." };
    return send({ id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(answer) }] } });
  }
  send({ id: msg.id, error: { code: -32601, message: "Method not found" } });
});

import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAIN_WORKSPACE, workspaceOf } from "@/lib/types";
import { getState } from "./store";
import { fromThisMac } from "./owner-email";
import { fromBopsWindow } from "./ui-token";
import { getLocalSubscriptionStatus, localSubscriptionRuntime } from "./local-subscriptions";

export const LOCAL_CODEX_DISCLOSURE = "Runs in Codex on this PC with your ChatGPT plan. It can read files on this PC but can't change them or go online.";
const MAX_INPUT = 128 * 1024;
const MAX_OUTPUT = 512 * 1024;
const TIMEOUT = 120_000;
const busy = new Set<string>();
class PendingExit extends Error {
  constructor(message: string, readonly exited: Promise<void>) { super(message); }
}
const disabled = ["apps", "plugins", "hooks", "codex_hooks", "plugin_hooks", "shell_tool", "unified_exec", "browser_use", "browser_use_external", "computer_use", "view_image", "image_generation", "js_repl", "memory_tool", "collab", "multi_agent", "multi_agent_v2", "standalone_web_search", "web_search_request", "web_search_cached", "code_mode", "code_mode_only"];

/** Request must come from the owner route, never synthesized from a stored chat/model. */
export function requireLocalCodexChatOwner(request: Request, chatId: string): void {
  const state = getState();
  const chat = state.chats.find((x) => x.id === chatId);
  const bot = chat?.botIds.length === 1 ? state.bots.find((x) => x.id === chat.botIds[0]) : undefined;
  let allowed = false;
  try {
    allowed = request instanceof Request && process.env.BOPS_SELF_HOSTED === "1" && !!process.env.BOPS_UI_TOKEN && !state.shared &&
      !request.headers.has("x-bops-remote") && !/(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "") &&
      fromThisMac(request) && fromBopsWindow(request) && chat?.kind === "bot" && !!bot &&
      workspaceOf(chat) === (state.workspace ?? MAIN_WORKSPACE) && workspaceOf(bot) === workspaceOf(chat);
  } catch { /* Missing request and malformed credentials fail closed. */ }
  if (!allowed) throw new Error("ChatGPT-plan chat is only available in the owner's private desktop conversation.");
}

/**
 * Experimental, intentionally unwired: requests a read-only conversation, not a
 * no-tools mode. Real CLI sandbox enforcement and managed config/MCP precedence
 * must be verified before integration. Fake-process tests verify arguments only.
 * Never used by the API executor.
 */
export async function runLocalCodexChat(input: { request: Request; chatId: string; prompt: string; signal?: AbortSignal }): Promise<string> {
  requireLocalCodexChatOwner(input.request, input.chatId);
  const scope = () => {
    const state = getState();
    return JSON.stringify([state.account?.user.id, state.workspace, state.chats.find((x) => x.id === input.chatId)?.botIds]);
  };
  const initialScope = scope();
  const checkScope = () => {
    requireLocalCodexChatOwner(input.request, input.chatId);
    if (scope() !== initialScope) throw new Error("The conversation's account changed. Send your message again.");
  };
  if (typeof input.prompt !== "string" || !input.prompt.trim() || Buffer.byteLength(input.prompt) > MAX_INPUT) throw new Error("This conversation is too long or empty. Start a shorter message.");
  if (input.signal?.aborted) throw new Error("ChatGPT-plan reply cancelled.");
  if (busy.has(input.chatId)) throw new Error("This conversation already has a reply in progress.");
  busy.add(input.chatId);
  let directory: string | undefined;
  let pendingExit = false;
  try {
    if (!(await getLocalSubscriptionStatus("codex")).connected) throw new Error("Sign in to ChatGPT with Codex on this PC first.");
    checkScope();
    const runtime = localSubscriptionRuntime("codex");
    if (!runtime.file) throw new Error("Codex is not installed on this PC.");
    directory = await mkdtemp(join(tmpdir(), "bops-codex-chat-"));
    const invoke = (args: string[], stdin: string, timeout: number) => capture(runtime.file!, runtime.env, directory!, args, stdin, timeout, input.signal);
    const help = await invoke(["exec", "--help"], "", 10_000);
    for (const flag of ["--ignore-user-config", "--ignore-rules", "--ephemeral", "--json", "--sandbox", "--skip-git-repo-check"])
      if (!help.includes(flag)) throw new Error("This Codex version cannot enforce the required chat isolation. Update Codex first.");
    checkScope();
    // Ignore the user's config/rules, project instructions and remote extensions.
    // read-only denies writes/network; never request sandbox escape or approvals bypass.
    const config = ['forced_login_method="chatgpt"', 'model_provider="openai"', 'approval_policy="never"', 'web_search="disabled"', "mcp_servers={}", "plugins={}", "hooks={}", "project_doc_max_bytes=0", "project_doc_fallback_filenames=[]", "shell_environment_policy.inherit=\"none\"", ...disabled.map((key) => `features.${key}=false`)];
    const output = await invoke(["exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "--cd", directory, ...config.flatMap((c) => ["-c", c]), "-"], input.prompt, TIMEOUT);
    checkScope();
    if (!(await getLocalSubscriptionStatus("codex")).connected) throw new Error("The ChatGPT sign-in changed before the reply finished. Sign in and try again.");
    checkScope();
    return finalText(output);
  } catch (error) {
    if (error instanceof PendingExit) {
      pendingExit = true;
      const heldDirectory = directory;
      // The HTTP request has a bound, but resources/lock stay owned until real exit.
      void error.exited.then(async () => {
        try { if (heldDirectory) await rm(heldDirectory, { recursive: true, force: true }); }
        finally { busy.delete(input.chatId); }
      }).catch(() => {});
    }
    throw error;
  } finally {
    if (!pendingExit) {
      try { if (directory) await rm(directory, { recursive: true, force: true }); }
      finally { busy.delete(input.chatId); }
    }
  }
}

function capture(file: string, env: NodeJS.ProcessEnv, cwd: string, args: string[], stdin: string, timeout: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("ChatGPT-plan reply cancelled.")); return; }
    const child = spawn(file, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    let bytes = 0;
    const stdout: Buffer[] = [];
    let failure: string | undefined;
    let finishExit!: () => void;
    const exited = new Promise<void>((resolveExit) => { finishExit = resolveExit; });
    let grace: ReturnType<typeof setTimeout> | undefined;
    const stop = (message: string) => {
      if (failure) return;
      failure = message;
      grace = setTimeout(() => reject(new PendingExit(`${message} Its process is still stopping; wait before retrying this conversation.`, exited)), 2_500);
      if (child.pid && process.platform === "win32") {
        const killer = spawn(join(process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", shell: false });
        killer.on("error", () => child.kill());
      } else if (child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      } else child.kill();
    };
    const cancel = () => stop("ChatGPT-plan reply cancelled.");
    const timer = setTimeout(() => stop("Codex took too long. Try a shorter message."), timeout);
    signal?.addEventListener("abort", cancel, { once: true });
    const data = (chunk: Buffer, output: boolean) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT) { stop("Codex returned too much output. Try a shorter message."); return; }
      if (output) stdout.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => data(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => data(chunk, false));
    child.stdin.on("error", () => stop("Codex could not read the message."));
    child.on("error", () => { failure = "Codex could not start on this PC."; });
    child.once("close", (code) => {
      clearTimeout(timer);
      clearTimeout(grace);
      finishExit();
      signal?.removeEventListener("abort", cancel);
      if (failure || code !== 0) reject(new Error(failure ?? "Codex could not finish safely. Check its sign-in and sandbox support, then try again."));
      else resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.end(stdin);
  });
}

function finalText(output: string): string {
  let answer = "";
  let completed = false;
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { throw new Error("Codex returned an unreadable reply."); }
    if (event.type === "turn.failed" || event.type === "error") throw new Error("Codex could not complete this reply.");
    if (event.type === "item.completed" && event.item?.type === "agent_message") answer = event.item.text;
    if (event.type === "turn.completed") completed = true;
  }
  if (!completed || typeof answer !== "string" || !answer.trim()) throw new Error("Codex did not return a completed text reply.");
  return answer;
}

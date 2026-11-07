import "server-only";
import { APIError } from "openai";
import { chatErrorOf, withoutKeys, type ChatErrorInfo } from "@/lib/chat-error";
import { providerOf } from "@/lib/chat-models";
import { ChatProviderError } from "./chat-providers";

/** Values in this server's environment that are keys or tokens: each is taken out of what a card's Details shows. */
function serverKeys(): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(process.env)) if (v && v.length >= 12 && /KEY|TOKEN|SECRET|PASSWORD/i.test(k)) out.push(v.trim());
  if (typeof (globalThis as { bopsOrgoKey?: unknown }).bopsOrgoKey === "string") out.push((globalThis as unknown as { bopsOrgoKey: string }).bopsOrgoKey);
  return out;
}

/**
 * A chat turn's failure, as the chat shows it (Message.chatError, lib/chat-error.ts): a provider's no (OpenAI's SDK
 * error, or another provider's through chat-providers.ts) in plain words, its raw words kept for Details without a
 * key. Undefined for a failure that isn't a provider's no (Bops' own), which the chat says as before.
 */
export function chatFailure(e: unknown, ctx: { model?: string; bot?: string }): ChatErrorInfo | undefined {
  const keys = serverKeys();
  if (e instanceof ChatProviderError) {
    const info = chatErrorOf({ provider: e.provider, status: e.status, message: e.said ?? e.message, model: ctx.model, bot: ctx.bot }, keys);
    // Its own words (chat-providers.ts refusal) are already plain and say the fix on this server (the key to check in
    // .env.local, where to add credit, Ollama to start): they're the line; the card adds its kind, Settings and Details.
    return { ...info, text: withoutKeys(e.message, keys) };
  }
  // Reached and answered (a connection that failed, or a stop, has no status: said as before).
  if (e instanceof APIError && typeof e.status === "number") {
    const body = e.error as { message?: unknown; code?: unknown; type?: unknown } | undefined;
    const code = typeof e.code === "string" ? e.code : typeof body?.code === "string" ? body.code : typeof e.type === "string" ? e.type : undefined;
    return chatErrorOf({ provider: providerOf(ctx.model) ?? "openai", status: e.status, code, message: e.message, model: ctx.model, bot: ctx.bot }, keys);
  }
  return undefined;
}

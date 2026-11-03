import "server-only";
import { ROUTE_KEYS } from "@/lib/agents";
import { chatDefault } from "@/lib/chat-models";
import "./llms";

/**
 * The model a NEW owner chat starts on (Chat.model, set once as the chat is made): Your LLMs' chat default
 * (config/llms.yaml chat_default, Settings, Models), when its provider's key is set in this server's environment.
 * Undefined: the chat starts on Auto, as before. Only a bot's own chat and a group chat made from now on get it;
 * chats there already, pair chats and app chats are never changed, and Auto can always be picked again.
 */
export function newChatModel(): string | undefined {
  const keys = Object.fromEntries(Object.entries(ROUTE_KEYS).map(([p, name]) => [p, !!process.env[name]?.trim()]));
  return chatDefault(keys)?.id;
}

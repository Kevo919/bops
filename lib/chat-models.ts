import { llms, ROUTE_KEYS, ROUTE_NAMES, type AgentRoute } from "./agents";

/**
 * The models a chat can answer on (Chat.model), picked in the chat's message box: "provider/model", from
 * Your LLMs (config/llms.yaml) and a few built in, so Claude, GLM and DeepSeek are there without editing the
 * file. Unset is Auto: OpenAI, as before (chat.ts CHAT_MODEL and the router). The server calls each provider on
 * its key in .env.local (lib/server/chat-providers.ts); the window and the server both read this list.
 */
export type ChatModel = { id: string; name: string; provider: AgentRoute };

export const BUILTIN_CHAT_MODELS: ChatModel[] = [
  { id: "openai/gpt-6.1-sol", name: "GPT 6.1 Sol", provider: "openai" },
  { id: "anthropic/claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic" },
  { id: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic" },
  { id: "anthropic/claude-haiku-5-5", name: "Claude Haiku 5.5", provider: "anthropic" },
  { id: "zai-coding/glm-5.3", name: "GLM 5.3 (Coding Plan)", provider: "zai-coding" },
  { id: "zai/glm-5.2", name: "GLM 5.2", provider: "zai" },
  { id: "zai-coding-cn/glm-5.3", name: "GLM 5.3 (Coding Plan, China)", provider: "zai-coding-cn" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", provider: "deepseek" },
  { id: "deepseek/deepseek-reasoner", name: "DeepSeek Reasoner", provider: "deepseek" },
  // Shown only on a server with OLLAMA_BASE_URL set (chatModelShown); other Ollama models go in config/llms.yaml.
  { id: "ollama/qwen2.5:3b", name: "Qwen 2.5 3B", provider: "ollama" },
];

/** Your LLMs first (by their names in the file), then the built in ones they don't already have. */
export function chatModels(): ChatModel[] {
  const out: ChatModel[] = llms().map((l) => ({ id: `${l.provider}/${l.model}`, name: l.name, provider: l.provider }));
  for (const m of BUILTIN_CHAT_MODELS) if (!out.some((x) => x.id === m.id)) out.push(m);
  return out;
}

/**
 * The model new chats start on: Your LLMs' chat default (config/llms.yaml chat_default, Settings, Models), when
 * its provider has a key here (`keys`: provider to set or not, never a key). Set once on a chat as it's made
 * (lib/server/chat-default.ts); chats there already keep their model, or Auto. Undefined: new chats start on Auto.
 */
export function chatDefault(keys: Partial<Record<string, boolean>>): ChatModel | undefined {
  const l = llms().find((x) => x.chatDefault);
  return l && keys[l.provider] ? { id: `${l.provider}/${l.model}`, name: l.name, provider: l.provider } : undefined;
}

/** A model a chat may be set to: one of chatModels(). */
export const chatModelOk = (model: unknown): model is string => typeof model === "string" && chatModels().some((m) => m.id === model);

/** The provider a "provider/model" names, when it's one Bops knows; undefined for a plain OpenAI model name. */
export function providerOf(model: string | undefined): AgentRoute | undefined {
  const p = model?.split("/")[0];
  return p && model!.includes("/") && Object.hasOwn(ROUTE_KEYS, p) ? (p as AgentRoute) : undefined;
}

/**
 * A model the picker offers on this server: Ollama's only where it's set up (chatKeys.ollama, OLLAMA_BASE_URL set),
 * so it doesn't show for people without Ollama. Every other provider shows, with "(no key)" when it has none.
 */
export const chatModelShown = (m: ChatModel, keys: Partial<Record<string, boolean>>) => m.provider !== "ollama" || !!keys.ollama;

/** The key each provider's chat runs on, and its name for people ("Anthropic"). */
export const chatKeyName = (p: AgentRoute) => ROUTE_KEYS[p];
export const providerName = (p: AgentRoute) => ROUTE_NAMES[p];

/**
 * A chat model's provider said no (out of credit, too many requests, a bad key, no such model, down): what the chat
 * shows instead of the provider's raw words ("429 You have no credits remaining …"). One plain, actionable line, the
 * kind of no it was (for the card's look and its button to Settings → AI plans), and the provider's own words kept for
 * the card's Details toggle, with any key taken out. Shared by the server (lib/server/chat.ts, which writes it on the
 * bot's message as Message.chatError) and the window (components/app/chat-error.tsx), and free of imports so its
 * tests run on it alone (scripts/test-chat-error.mjs).
 */

export type ChatErrorKind = "credit" | "rate" | "key" | "model" | "down" | "other";

/** What the chat shows for a provider's no (Message.chatError). */
export type ChatErrorInfo = {
  kind: ChatErrorKind;
  /** A short heading for the card: "Out of credit". */
  title: string;
  /** The plain line, which is also the message's text (what an older Bops, or a copy, shows). */
  text: string;
  /** The provider by name ("OpenAI"), when Bops knows it. */
  provider?: string;
  /** The HTTP status it answered with, when it was reached. */
  status?: number;
  /** The provider's own words, short and with every key taken out: behind the card's Details toggle. */
  details?: string;
};

/** What Bops knows about a no: the provider's route ("openai", "anthropic"), its status, code and words. */
export type ChatErrorInput = {
  /** A route ("openai", "zai-coding") or a name ("OpenAI"). */
  provider?: string;
  status?: number;
  /** The provider's error code or type ("insufficient_quota", "model_not_found"), when it gave one. */
  code?: string;
  /** Its words, raw. */
  message?: string;
  /** The model asked for ("openai/gpt-5.5", "gpt-5.5"). */
  model?: string;
  /** The bot that couldn't answer ("Boppy"): who the line says can't. */
  bot?: string;
};

const NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepinfra: "DeepInfra",
  zai: "Z.ai",
  "zai-coding": "Z.ai",
  "zai-coding-cn": "Z.ai",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  ollama: "Ollama",
};

/** Where to add credit, by provider name. */
const BILLING: Record<string, string> = {
  OpenAI: "platform.openai.com, Billing",
  Anthropic: "console.anthropic.com, Billing",
  DeepInfra: "deepinfra.com, Billing",
  "Z.ai": "z.ai",
  DeepSeek: "platform.deepseek.com, Top up",
  OpenRouter: "openrouter.ai, Credits",
};

/** The route or name, as a provider's name: "openai" is OpenAI; one Bops doesn't know is said as given. */
export function providerName(p: string | undefined): string | undefined {
  const v = p?.trim();
  if (!v) return undefined;
  return NAMES[v.toLowerCase()] ?? Object.values(NAMES).find((n) => n.toLowerCase() === v.toLowerCase()) ?? v;
}

/** Key-like strings, whoever's: an OpenAI or Anthropic key, a bearer token, a key in a URL's query. */
const KEYISH = [
  /\bsk-(?:ant-|proj-|or-v1-|svcacct-)?[A-Za-z0-9_-]{8,}/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /([?&](?:key|api[_-]?key|token|access_token)=)[^&\s"']+/gi,
  /\b(?:xai|gsk|pk|rk|AIza)[-_][A-Za-z0-9_-]{12,}/g,
];

/**
 * `text` with every key taken out: the ones given (the keys this server has), and anything shaped like one. Never
 * shows a key, even one Bops wasn't told about.
 */
export function withoutKeys(text: string, keys: readonly string[] = []): string {
  let out = text;
  for (const k of keys) if (k && k.length >= 6) out = out.split(k).join("…");
  for (const re of KEYISH) out = out.replace(re, (m, lead?: string) => (typeof lead === "string" && m.startsWith(lead) ? `${lead}…` : "…"));
  return out;
}

const CREDIT = /insufficient[ _]quota|no credits?( remaining| left)?|out of credits?|credit balance|insufficient[ _](balance|credits?|funds)|exceeded your current quota|quota exceeded|billing|payment required|top ?up|no (resource package|balance)|\b1113\b/i;
const RATE = /rate[ _-]?limit|too many requests|slow down|requests per (minute|min|second)|tokens per (minute|min)|\btpm\b|\brpm\b|try again in \d/i;
const KEY = /invalid[ _](api[ _])?key|incorrect api key|api key|unauthori[sz]ed|authentication|invalid[ _]token|invalid x-api-key|permission denied|not authori[sz]ed/i;
const MODEL = /model[^.]*(not[ _]found|does not exist|not exist|invalid|unknown|not supported|unavailable)|unknown model|invalid model|no such model|model_not_found/i;
const DOWN = /overloaded|server error|internal error|service unavailable|bad gateway|gateway time-?out|temporarily unavailable|upstream/i;

/** The status a raw message starts with ("429 You have no credits…": the OpenAI SDK's way), when no status was given. */
const statusIn = (message: string | undefined) => {
  const m = message?.match(/^\s*(?:HTTP\s*)?([1-5]\d\d)\b/);
  return m ? Number(m[1]) : undefined;
};

/** The model's own name, without its provider ("openai/gpt-5.5" is gpt-5.5). */
const modelName = (m: string | undefined) => (m ? m.replace(/^[a-z-]+\//, "") : undefined);

/** Which kind of no it was, from its status, code and words. */
export function chatErrorKind(i: Pick<ChatErrorInput, "status" | "code" | "message">): ChatErrorKind {
  const status = i.status ?? statusIn(i.message);
  const words = `${i.code ?? ""} ${i.message ?? ""}`;
  if (status === 402 || /insufficient_quota|billing_hard_limit|insufficient_balance/i.test(i.code ?? "") || ((status === 429 || status === 403 || status === 400 || status === undefined) && CREDIT.test(words))) return "credit";
  if (status === 429 || (status === undefined && RATE.test(words))) return "rate";
  if (status === 401 || ((status === 403 || status === undefined) && KEY.test(words))) return "key";
  if (status === 404 || /model_not_found/i.test(i.code ?? "") || ((status === 400 || status === undefined) && MODEL.test(words))) return "model";
  if ((status !== undefined && status >= 500) || (status === undefined && DOWN.test(words))) return "down";
  return "other";
}

/** "Settings → AI plans": where the card's button goes, and what each line points to. */
export const AI_PLANS = "Settings → AI plans";

/**
 * A provider's no, for the chat: its kind, a heading, the plain line, and the provider's words for Details (`keys`:
 * the keys this server has, each taken out of them; anything shaped like a key goes too).
 */
export function chatErrorOf(i: ChatErrorInput, keys: readonly string[] = []): ChatErrorInfo {
  const status = i.status ?? statusIn(i.message);
  const kind = chatErrorKind({ ...i, status });
  const name = providerName(i.provider);
  const who = name ?? "The AI provider";
  const bot = i.bot?.trim() || "your bot";
  const elsewhere = `pick another model in ${AI_PLANS}`;
  const model = modelName(i.model);
  const raw = (i.message ?? "").replace(/\s+/g, " ").trim();
  const details = raw ? withoutKeys([status && !raw.startsWith(String(status)) ? `${status}` : "", i.code && !raw.includes(i.code) ? `(${i.code})` : "", raw].filter(Boolean).join(" "), keys).slice(0, 600) : undefined;
  const base = { kind, ...(name ? { provider: name } : {}), ...(status ? { status } : {}), ...(details ? { details } : {}) };
  switch (kind) {
    case "credit":
      return {
        ...base,
        title: "Out of credit",
        text: `${name ? `Your ${name} account` : "Your AI provider account"} is out of credit, so ${bot} can't answer. Add credit at ${name ? (BILLING[name] ?? name) : "your provider"}, or ${elsewhere}.`,
      };
    case "rate":
      return { ...base, title: "Too many requests", text: `${who} is getting too many requests right now, so ${bot} can't answer yet. Try again in a moment, or ${elsewhere}.` };
    case "key":
      return { ...base, title: "Key not accepted", text: `${who} didn't accept your API key, so ${bot} can't answer. Check the key in Keys, or ${elsewhere}.` };
    case "model":
      return { ...base, title: "Model not found", text: `${who} doesn't have the model${model ? ` "${model}"` : " this chat uses"}, so ${bot} can't answer. ${elsewhere.charAt(0).toUpperCase()}${elsewhere.slice(1)}.` };
    case "down":
      return { ...base, title: `${name ?? "The provider"} is down`, text: `${who} is having trouble on its side right now, so ${bot} can't answer. Try again in a minute, or ${elsewhere}.` };
    default:
      return { ...base, title: "Couldn't answer", text: `${bot.charAt(0).toUpperCase()}${bot.slice(1)} couldn't answer: ${who} turned the request down. Try again, or ${elsewhere}.` };
  }
}

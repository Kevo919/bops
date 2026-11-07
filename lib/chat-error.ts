/**
 * A chat model's provider said no (out of credit, too many requests, a bad key, no such model, down): what the chat
 * shows instead of the provider's raw words ("429 You have no credits remaining …"). One plain, actionable line, the
 * kind of no it was (for the card's look and its button to Settings → AI subscriptions), and the provider's own words kept for
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

/**
 * Key-like strings, whoever's, each with what's kept before the secret (a header's or a field's name), so the words
 * still read: provider keys (OpenAI, Anthropic, OpenRouter, Google, GitHub, Stripe-style live and test keys, Z.ai's
 * "<id>.<secret>"), bearer and basic credentials, `x-api-key:` and `authorization:` headers, JSON fields named like a
 * key, a URL's user:password@, and a key or token in a URL's query.
 */
const KEYISH: RegExp[] = [
  // Headers and JSON fields first, so their names stay and only the value goes.
  /((?:^|[\s{,;"'])(?:x-api-key|x-goog-api-key|api-key|authorization|proxy-authorization)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|(?:Bearer|Basic|Token)\s+\S+|[^\s,;}]+)/gi,
  /("(?:api[_-]?key|apiKey|access[_-]?token|accessToken|refresh[_-]?token|token|secret|client[_-]?secret|password|key)"\s*:\s*")[^"]*(?=")/gi,
  /((?:^|[\s{,])(?:api[_-]?key|apiKey|token|secret|password)\s*[=:]\s*)[^\s,;}&"']+/gi,
  /\b((?:Bearer|Basic|Token))\s+[A-Za-z0-9._~+/=-]{6,}/gi,
  // A URL's user:password@, and a key or token in its query.
  /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
  /([?&#](?:key|api[_-]?key|apikey|token|access[_-]?token|auth|secret|sig|signature)=)[^&\s"'#]+/gi,
  // Bare keys by shape.
  /\bsk-(?:ant-(?:api\d+-)?|proj-|or-v1-|svcacct-|admin-)?[A-Za-z0-9_-]{8,}/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\b(?:xai|gsk|hf)[-_][A-Za-z0-9_-]{12,}/g,
  /\b[0-9a-f]{32}\.[A-Za-z0-9]{16,}\b/gi,
];

/**
 * `text` with every key taken out: the ones given (every key this server has, at any length), and anything shaped like
 * one. Never shows a key, even one Bops wasn't told about.
 */
export function withoutKeys(text: string, keys: readonly string[] = []): string {
  let out = text;
  // Longest first, so a key that contains another goes whole.
  for (const k of [...keys].map((x) => x?.trim()).filter(Boolean).sort((a, b) => b.length - a.length)) out = out.split(k).join("…");
  for (const re of KEYISH) out = out.replace(re, (m: string, ...rest: unknown[]) => {
      const lead = typeof rest[0] === "string" ? rest[0] : undefined;
      if (lead && /^(Bearer|Basic|Token)$/i.test(lead)) return `${lead} …`;
      return lead && m.startsWith(lead) ? `${lead}…` : "…";
    });
  return out;
}

/*
 * The kind of a no. A provider's structured code (or error type) says it best, so it's read first: OpenAI's
 * `insufficient_quota` is credit and its `rate_limit_exceeded` is a rate limit, whatever the words around them (a rate
 * limit's message links ".../account/billing", and "Used 1113" in a tokens-per-minute message is a count, not Z.ai's
 * 1113). A code Bops doesn't know (Anthropic's `invalid_request_error`, which its low-credit 400 has) says nothing either
 * way, so then the status and the message's words decide; 1113 counts only as a code, never in the words.
 */
const CREDIT_CODE = /^(insufficient_quota|insufficient_balance|billing_hard_limit_reached|billing_not_active|payment_required|credit_balance_too_low|1113)$/i;
const RATE_CODE = /^(rate_limit_exceeded|rate_limit_error|rate_limited|too_many_requests|requests_limit_reached|tokens_limit_reached|1302|1303)$/i;
const KEY_CODE = /^(invalid_api_key|authentication_error|unauthorized|invalid_authentication|permission_error|1000|1001|1002)$/i;
const MODEL_CODE = /^(model_not_found|not_found_error|model_not_available|1211)$/i;
const DOWN_CODE = /^(overloaded_error|server_error|api_error|service_unavailable|internal_error|engine_overloaded)$/i;

const CREDIT = /insufficient[ _]quota|no credits?( remaining| left)?|out of credits?|credit balance|insufficient[ _](balance|credits?|funds)|exceeded your current quota|quota exceeded|payment required|no (resource package|balance)/i;
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

/** Which kind of no it was: its code first, else its status and words (above). */
export function chatErrorKind(i: Pick<ChatErrorInput, "status" | "code" | "message">): ChatErrorKind {
  const status = i.status ?? statusIn(i.message);
  const code = i.code?.trim() ?? "";
  if (code) {
    if (CREDIT_CODE.test(code)) return "credit";
    if (RATE_CODE.test(code)) return "rate";
    if (KEY_CODE.test(code)) return "key";
    if (MODEL_CODE.test(code)) return "model";
    if (DOWN_CODE.test(code)) return "down";
  }
  const words = i.message ?? "";
  if (status !== undefined && status >= 500) return "down";
  if (status === 402) return "credit";
  // A 429 is a rate limit unless its words say credit and not a rate (a quota used up, no credits left).
  if ((status === 429 || status === 403 || status === 400 || status === undefined) && CREDIT.test(words) && !(status === 429 && RATE.test(words))) return "credit";
  if (status === 429 || (status === undefined && RATE.test(words))) return "rate";
  if (status === 401 || ((status === 403 || status === undefined) && KEY.test(words))) return "key";
  if (status === 404 || ((status === 400 || status === undefined) && MODEL.test(words))) return "model";
  if (status === undefined && DOWN.test(words)) return "down";
  return "other";
}

/** "Settings → AI subscriptions" (the card's own place since #116): where the card's button goes, and what each line points to. */
export const AI_PLANS = "Settings → AI subscriptions";

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

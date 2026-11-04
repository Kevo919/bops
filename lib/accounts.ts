/**
 * More than one account (API key) for the same provider: a work and a personal OpenAI key, two OpenRouter keys,
 * several z.ai accounts. Keys stay in .env.local only. A provider's default account is its key as before
 * (OPENROUTER_API_KEY); another account is that name, "__", and its label (OPENROUTER_API_KEY__WORK), the label
 * A-Z, 0-9 and _ only, at most 24. An LLM in config/llms.yaml picks one with `account: work` (any case; written as
 * the label). Shared by the window and the server: nothing here is secret, and only labels and set-or-not go to
 * the window (lib/server/provider-accounts.ts finds them).
 */
export const ACCOUNT_LABEL = /^[A-Z0-9_]{1,24}$/;
/** An account label as written (`work`, `Work`, `WORK`) as Bops keeps it ("WORK"), or undefined when it isn't one. */
export const accountLabel = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return ACCOUNT_LABEL.test(s) ? s : undefined;
};
/** The key name of a provider's account: its base name for the default (no label), else BASE__LABEL. */
export const accountKeyName = (base: string, label?: string) => (label ? `${base}__${label}` : base);
/** How an account reads to people: "work" (its label, lower case), for "OpenRouter (work)". */
export const accountWord = (label: string) => label.toLowerCase().replace(/_/g, " ");
/** The chat-key flag for a provider's account (AppState.chatKeys): the provider for the default, else provider__LABEL. */
export const accountFlag = (provider: string, label?: string) => (label ? `${provider}__${label}` : provider);

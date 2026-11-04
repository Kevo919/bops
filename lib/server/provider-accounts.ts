import "server-only";
import { ACCOUNT_LABEL, accountFlag, accountKeyName } from "@/lib/accounts";
import { ROUTE_KEYS } from "@/lib/agents";

/**
 * A provider's accounts as this server has them: its default (BASE, when set) and each BASE__LABEL set in the
 * environment (.env.local), found by their names. Only labels leave here; a key is read only where it's sent
 * (lib/server/chat-providers.ts, key-check.ts).
 */
export function accountLabels(base: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const prefix = `${base}__`;
  return Object.keys(env)
    .filter((k) => k.startsWith(prefix) && ACCOUNT_LABEL.test(k.slice(prefix.length)) && !!env[k]?.trim())
    .map((k) => k.slice(prefix.length))
    .sort();
}

/** The key of a provider's account (`label`; none: the default), trimmed, and its name; "" when it isn't set. */
export function accountKey(base: string, label?: string): { keyName: string; key: string } {
  const keyName = accountKeyName(base, label);
  return { keyName, key: process.env[keyName]?.trim() ?? "" };
}

/**
 * Every provider's other accounts as the window gets them (AppState.chatKeys): "openrouter__WORK": true for each
 * NAME__LABEL set here. Only that: never a key, or any of it. Ollama has no key, so no accounts.
 */
export function accountFlags(env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [provider, name] of Object.entries(ROUTE_KEYS)) if (provider !== "ollama") for (const label of accountLabels(name, env)) out[accountFlag(provider, label)] = true;
  return out;
}

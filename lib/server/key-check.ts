import "server-only";
import { ROUTE_KEYS, ROUTE_NAMES, type AgentRoute } from "@/lib/agents";
import { checkZapier, zapierSet } from "./zapier";
import { checkComposioMcp, composioMcpSet, maskedComposioMcp } from "./composio-mcp";
import { ACCOUNT_LABEL, accountWord } from "@/lib/accounts";
import { accountLabels } from "./provider-accounts";

export type KeyCheckResult = {
  key: string;
  label: string;
  status: "not set" | "set" | "works" | "no credit" | "invalid" | "unavailable" | "rate limited";
  message?: string;
  /** What is set, masked (Composio, your account: its host, never the rest of the address or the key). */
  shown?: string;
};

type Probe = { key: string; label: string; url: string; kind: "openai" | "executor" | "anthropic" | "models" | "openrouter" | "orgo" | "ollama" | "composio" | "zapier" | "composio-mcp" };
const provider = (route: AgentRoute, url: string, kind: Probe["kind"]): Probe => ({ key: ROUTE_KEYS[route], label: ROUTE_NAMES[route], url, kind });
// Scope is intentionally these six providers plus the executor, Orgo, Ollama, Composio and Zapier, not every Vault service.
// Fixed HTTPS destinations: request data and environment overrides cannot redirect a secret. Ollama is the one
// exception: its address is the owner's own setting, and the only secret sent there is its own (OLLAMA_API_KEY).
const probes: Probe[] = [
  provider("openai", "https://api.openai.com/v1/chat/completions", "openai"),
  // Environment keys only connect executors; model-list/generation calls cannot validate them.
  { key: "OPENAI_EXECUTOR_API_KEY", label: "OpenAI executor", url: "", kind: "executor" },
  provider("anthropic", "https://api.anthropic.com/v1/models", "anthropic"),
  provider("zai", "https://api.z.ai/api/paas/v4/models", "models"),
  provider("zai-coding-cn", "https://open.bigmodel.cn/api/paas/v4/models", "models"),
  provider("deepseek", "https://api.deepseek.com/models", "models"),
  provider("openrouter", "https://openrouter.ai/api/v1/key", "openrouter"),
  { key: "ORGO_API_KEY", label: "Orgo", url: "https://www.orgo.ai/api/account/capacity", kind: "orgo" },
  // Ollama has no key: its row is its address (OLLAMA_BASE_URL), set only in this server's .env.local by its owner,
  // and the check lists its models there (GET {base}/models). OLLAMA_API_KEY, if set, goes with it as Bearer.
  { key: ROUTE_KEYS.ollama, label: ROUTE_NAMES.ollama, url: "", kind: "ollama" },
  // Connected apps (lib/server/composio.ts), self-hosted: one page of the project's sign-in setups, the key as x-api-key.
  { key: "COMPOSIO_API_KEY", label: "Composio (connected apps)", url: "https://backend.composio.dev/api/v3.1/auth_configs?limit=1", kind: "composio" },
  // Zapier (lib/server/zapier.ts): its address is the secret, so the check is zapier.ts's own (MCP initialize and tools/list).
  { key: "ZAPIER_MCP_URL", label: "Zapier", url: "", kind: "zapier" },
  // Composio, your account (lib/server/composio-mcp.ts): For You's MCP address and its key, checked by composio-mcp.ts (MCP initialize and tools/list).
  { key: "COMPOSIO_MCP_URL", label: "Composio (your account)", url: "", kind: "composio-mcp" },
];
const ollamaModels = () => `${(process.env.OLLAMA_BASE_URL?.trim() ?? "").replace(/\/+$/, "")}/models`;

/**
 * A provider's other accounts (lib/accounts.ts: NAME__LABEL in .env.local) are checked as its default is, at the
 * same fixed address: each a probe of its own, "OpenRouter (work)". Only a provider's key has accounts (not
 * Ollama's address, the executor's or Orgo's), and only names this server has set.
 */
const ACCOUNT_KINDS: ReadonlySet<Probe["kind"]> = new Set(["openai", "anthropic", "models", "openrouter"]);
const withAccounts = (p: Probe) => (ACCOUNT_KINDS.has(p.kind) && p.label !== "OpenAI executor" ? accountLabels(p.key).map((a) => ({ ...p, key: `${p.key}__${a}`, label: `${p.label} (${accountWord(a)})` })) : []);
function probeOf(key: string): Probe | undefined {
  const own = probes.find((entry) => entry.key === key);
  if (own) return own;
  const at = key.lastIndexOf("__");
  if (at < 0 || !ACCOUNT_LABEL.test(key.slice(at + 2))) return undefined;
  return probes.flatMap(withAccounts).find((entry) => entry.key === key);
}

export function keyCheckList(): KeyCheckResult[] {
  return probes.flatMap((p) => [p, ...withAccounts(p)]).map(({ key, label, kind }): KeyCheckResult => {
    if (kind === "composio-mcp") {
      const shown = maskedComposioMcp();
      return { key, label, status: composioMcpSet() ? "set" : "not set", ...(shown ? { shown } : {}) };
    }
    return { key, label, status: (kind === "zapier" ? zapierSet() : !!process.env[key]?.trim()) ? "set" : "not set" };
  });
}

/** Read only a bounded diagnostic payload; never return any upstream text or credentials. */
async function payload(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 64 * 1024) return null;
      chunks.push(next.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Provider checks run only on request. The executor check is presence-only: no network or task launch. No file writes. */
export async function checkKey(key: string): Promise<KeyCheckResult | null> {
  const probe = probeOf(key);
  if (!probe) return null;
  const { label, kind } = probe;
  const result = (status: KeyCheckResult["status"], message: string): KeyCheckResult => ({ key, label, status, message });
  if (kind === "zapier") {
    const z = await checkZapier();
    return result(z.status, z.message);
  }
  if (kind === "composio-mcp") {
    const z = await checkComposioMcp();
    const shown = maskedComposioMcp();
    return { ...result(z.status, z.message), ...(shown ? { shown } : {}) };
  }
  const secret = process.env[key]?.trim();
  if (!secret) return result("not set", "This key is not set in the running server's environment.");
  if (kind === "executor") return result("set", "A key is set for the executor, but its connection permission has not been verified. Use a dedicated OpenAI environment key. Run a task on this computer to verify it.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const ollamaKey = process.env.OLLAMA_API_KEY?.trim();
    const headers: Record<string, string> = kind === "anthropic"
      ? { "x-api-key": secret, "anthropic-version": "2023-06-01" }
      : kind === "composio" ? { "x-api-key": secret }
      : kind === "ollama" ? (ollamaKey ? { Authorization: `Bearer ${ollamaKey}` } : {})
      : { Authorization: `Bearer ${secret}` };
    if (kind === "openai") headers["Content-Type"] = "application/json";
    const response = await fetch(kind === "ollama" ? ollamaModels() : probe.url, {
      method: kind === "openai" ? "POST" : "GET", headers, redirect: "error", cache: "no-store", signal: controller.signal,
      // A tiny generation distinguishes exhausted credit from merely being allowed to list models.
      ...(kind === "openai" ? { body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }], max_tokens: 1, stream: false }) } : {}),
    });
    const data = await payload(response);
    const error = data?.error && typeof data.error === "object" ? data.error as Record<string, unknown> : null;
    if (kind === "ollama") {
      if (response.status === 401 || response.status === 403) return result("invalid", "Ollama's address answered but wants a key: set OLLAMA_API_KEY to the one its proxy expects.");
      if (!response.ok || !data || !Array.isArray(data.data)) return result("unavailable", "Something answered at OLLAMA_BASE_URL, but not as Ollama's model list. Check the address ends in /v1.");
      const n = data.data.length;
      return result("works", n ? `Ollama answered with ${n} model${n === 1 ? "" : "s"}. It's free: no key or credit needed.` : "Ollama answered, but has no models yet: pull one on the server (ollama pull qwen2.5:3b).");
    }
    if (response.status === 401 || (kind === "composio" && response.status === 403)) return result("invalid", "The provider rejected this key's authentication.");
    if (response.status === 402 || (kind === "openai" && [error?.code, error?.type].some((code) => code === "insufficient_quota" || code === "billing_hard_limit_reached")))
      return result("no credit", "The provider reports insufficient credit or an exhausted spending allowance.");
    if (response.status === 429) return result("rate limited", "The provider is rate limiting this check. Try again later.");
    if (!response.ok || !data || data.error != null) return result("unavailable", "The check could not confirm access. Check provider availability and permissions, then retry.");
    if (kind === "openai") {
      if (!Array.isArray(data.choices) || !data.choices.length) return result("unavailable", "The provider returned an unexpected response.");
      return result("works", "A one-token generation succeeded. This does not verify access to every model or executor feature.");
    }
    if (kind === "openrouter") {
      const info = data.data;
      if (!info || typeof info !== "object" || Array.isArray(info)) return result("unavailable", "The provider returned an unexpected response.");
      const remaining = (info as Record<string, unknown>).limit_remaining;
      if (typeof remaining === "number" && remaining <= 0) return result("no credit", "The provider reports that this key's spending allowance is exhausted. Free models (ids ending in :free) may still work.");
    } else if (kind === "composio") {
      if (!Array.isArray(data.items)) return result("unavailable", "The provider returned an unexpected response.");
      return result("works", "Composio accepted this key. Connect apps in Settings, Logins; each app's own sign-in was not tested.");
    } else if (kind !== "orgo" && !Array.isArray(data.data)) return result("unavailable", "The provider returned an unexpected response.");
    return result("works", "The authenticated check succeeded. Generation credit and access to individual models were not tested.");
  } catch {
    if (kind === "ollama") return result("unavailable", "Nothing answered at OLLAMA_BASE_URL, or it timed out. Check that Ollama is running and the address is right.");
    return result("unavailable", "The provider could not be reached or the check timed out. This does not mean the key is invalid.");
  } finally { clearTimeout(timer); }
}

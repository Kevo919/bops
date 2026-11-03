import "server-only";
import { ROUTE_KEYS, ROUTE_NAMES, type AgentRoute } from "@/lib/agents";

export type KeyCheckResult = {
  key: string;
  label: string;
  status: "not set" | "set" | "works" | "no credit" | "invalid" | "unavailable" | "rate limited";
  message?: string;
};

type Probe = { key: string; label: string; url: string; kind: "openai" | "anthropic" | "models" | "openrouter" | "orgo" };
const provider = (route: AgentRoute, url: string, kind: Probe["kind"]): Probe => ({ key: ROUTE_KEYS[route], label: ROUTE_NAMES[route], url, kind });
// Scope is intentionally these six providers plus the executor and Orgo, not every Vault service.
// Fixed HTTPS destinations: request data and environment overrides cannot redirect a secret.
const probes: Probe[] = [
  provider("openai", "https://api.openai.com/v1/chat/completions", "openai"),
  { key: "OPENAI_EXECUTOR_API_KEY", label: "OpenAI executor", url: "https://api.openai.com/v1/chat/completions", kind: "openai" },
  provider("anthropic", "https://api.anthropic.com/v1/models", "anthropic"),
  provider("zai", "https://api.z.ai/api/paas/v4/models", "models"),
  provider("zai-coding-cn", "https://open.bigmodel.cn/api/paas/v4/models", "models"),
  provider("deepseek", "https://api.deepseek.com/models", "models"),
  provider("openrouter", "https://openrouter.ai/api/v1/key", "openrouter"),
  { key: "ORGO_API_KEY", label: "Orgo", url: "https://www.orgo.ai/api/account/capacity", kind: "orgo" },
];

export function keyCheckList(): KeyCheckResult[] {
  return probes.map(({ key, label }) => ({ key, label, status: process.env[key]?.trim() ? "set" : "not set" }));
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

/** Exactly one outbound request, only after the owner explicitly presses Check. No file writes. */
export async function checkKey(key: string): Promise<KeyCheckResult | null> {
  const probe = probes.find((entry) => entry.key === key);
  if (!probe) return null;
  const { label, kind } = probe;
  const result = (status: KeyCheckResult["status"], message: string): KeyCheckResult => ({ key, label, status, message });
  const secret = process.env[key]?.trim();
  if (!secret) return result("not set", "This key is not set in the running server's environment.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const headers: Record<string, string> = kind === "anthropic"
      ? { "x-api-key": secret, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${secret}` };
    if (kind === "openai") headers["Content-Type"] = "application/json";
    const response = await fetch(probe.url, {
      method: kind === "openai" ? "POST" : "GET", headers, redirect: "error", cache: "no-store", signal: controller.signal,
      // A tiny generation distinguishes exhausted credit from merely being allowed to list models.
      ...(kind === "openai" ? { body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }], max_tokens: 1, stream: false }) } : {}),
    });
    const data = await payload(response);
    const error = data?.error && typeof data.error === "object" ? data.error as Record<string, unknown> : null;
    if (response.status === 401) return result("invalid", "The provider rejected this key's authentication.");
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
      if (typeof remaining === "number" && remaining <= 0) return result("no credit", "The provider reports that this key's spending allowance is exhausted.");
    } else if (kind !== "orgo" && !Array.isArray(data.data)) return result("unavailable", "The provider returned an unexpected response.");
    return result("works", "The authenticated check succeeded. Generation credit and access to individual models were not tested.");
  } catch {
    return result("unavailable", "The provider could not be reached or the check timed out. This does not mean the key is invalid.");
  } finally { clearTimeout(timer); }
}

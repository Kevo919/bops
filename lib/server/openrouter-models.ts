import "server-only";

/**
 * OpenRouter's public model list (https://openrouter.ai/api/v1/models, no key needed), for Settings, Models' Add a
 * model (app/api/models/openrouter): fetched by this server and kept a few hours. Only each model's id, name,
 * context and price per million tokens go to the window, and only ids Bops can write in config/llms.yaml.
 */
export type OpenRouterModel = { id: string; name: string; context?: number; inPerM?: number; outPerM?: number };

const URL_ = "https://openrouter.ai/api/v1/models";
const KEEP_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const MODEL = /^[A-Za-z0-9._:/-]{1,120}$/;
const g = globalThis as unknown as { __bopsOpenRouter?: { at: number; models: OpenRouterModel[] } };

const perM = (v: unknown) => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e9) / 1000 : undefined;
};

/** OpenRouter's answer, as the card needs it. */
export function trimModels(body: unknown): OpenRouterModel[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: OpenRouterModel[] = [];
  for (const x of data) {
    if (!x || typeof x !== "object") continue;
    const m = x as { id?: unknown; name?: unknown; context_length?: unknown; pricing?: { prompt?: unknown; completion?: unknown } };
    if (typeof m.id !== "string" || !MODEL.test(m.id)) continue;
    const name = typeof m.name === "string" && m.name.trim() ? m.name.replace(/[\r\n]/g, " ").trim().slice(0, 100) : m.id;
    const context = typeof m.context_length === "number" && m.context_length > 0 ? m.context_length : undefined;
    const inPerM = perM(m.pricing?.prompt);
    const outPerM = perM(m.pricing?.completion);
    out.push({ id: m.id, name, ...(context ? { context } : {}), ...(inPerM !== undefined ? { inPerM } : {}), ...(outPerM !== undefined ? { outPerM } : {}) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The list, kept KEEP_MS; `offline` when OpenRouter couldn't be reached (with the last list, when there is one). */
export async function openRouterModels(): Promise<{ models: OpenRouterModel[]; offline?: true }> {
  const kept = g.__bopsOpenRouter;
  if (kept && Date.now() - kept.at < KEEP_MS) return { models: kept.models };
  try {
    const res = await fetch(URL_, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const models = trimModels(await res.json());
    if (!models.length) throw new Error("no models");
    g.__bopsOpenRouter = { at: Date.now(), models };
    return { models };
  } catch {
    return { models: kept?.models ?? [], offline: true };
  }
}

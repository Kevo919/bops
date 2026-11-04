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
/** A failure is kept this long, so opening Add a model offline doesn't wait out the timeout every time. */
const FAILED_MS = 2 * 60 * 1000;
/** OpenRouter's answer is under 1 MB today; past this, it's cut off and taken as a failure. */
const MAX_BYTES = 5 * 1024 * 1024;
const MODEL = /^[A-Za-z0-9._:/-]{1,120}$/;
const g = globalThis as unknown as { __bopsOpenRouter?: { at: number; models: OpenRouterModel[] }; __bopsOpenRouterFailed?: number };

/** The body as JSON, read up to MAX_BYTES (more aborts the request and throws). */
async function readCapped(res: Response, abort: AbortController): Promise<unknown> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
    abort.abort();
    throw new Error("too big");
  }
  if (!res.body) return JSON.parse(await res.text());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      abort.abort();
      await reader.cancel().catch(() => {});
      throw new Error("too big");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

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

/**
 * The list, kept KEEP_MS; `offline` when OpenRouter couldn't be reached, answered too slowly or too much (with the
 * last list, when there is one). A failure is kept FAILED_MS before OpenRouter is asked again.
 */
export async function openRouterModels(): Promise<{ models: OpenRouterModel[]; offline?: true }> {
  const kept = g.__bopsOpenRouter;
  if (kept && Date.now() - kept.at < KEEP_MS) return { models: kept.models };
  if (g.__bopsOpenRouterFailed && Date.now() - g.__bopsOpenRouterFailed < FAILED_MS) return { models: kept?.models ?? [], offline: true };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_, { signal: abort.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const models = trimModels(await readCapped(res, abort));
    if (!models.length) throw new Error("no models");
    g.__bopsOpenRouter = { at: Date.now(), models };
    delete g.__bopsOpenRouterFailed;
    return { models };
  } catch {
    g.__bopsOpenRouterFailed = Date.now();
    return { models: kept?.models ?? [], offline: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The ids in the list as last fetched (openRouterModels), or undefined when there's none yet: what Settings, Models
 * checks a typed id against, without reaching OpenRouter (a warning, never a no: the list can be behind).
 */
export function knownOpenRouterIds(): ReadonlySet<string> | undefined {
  const kept = g.__bopsOpenRouter;
  return kept?.models.length ? new Set(kept.models.map((m) => m.id)) : undefined;
}

/* ---------------- Your presets (openrouter.ai/settings/presets) ---------------- */

/** One of the user's OpenRouter presets, as the card needs it: its slug ("@preset/<slug>" is how a request names it), name and description. */
export type OpenRouterPreset = { slug: string; name: string; description?: string };
export type PresetsAnswer = { presets: OpenRouterPreset[]; noKey?: true; refused?: true; offline?: true };

const PRESETS_URL = "https://openrouter.ai/api/v1/presets";
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
/** OpenRouter gives at most 100 a page; past 3 pages, the rest can be typed. */
const PAGE = 100;
const PAGES = 3;

/** OpenRouter's page of presets ({ data: [{ slug, name, description, status }] }), as the card needs it: active ones only. */
export function trimPresets(body: unknown): OpenRouterPreset[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: OpenRouterPreset[] = [];
  for (const x of data) {
    if (!x || typeof x !== "object") continue;
    const p = x as { slug?: unknown; name?: unknown; description?: unknown; status?: unknown };
    if (typeof p.slug !== "string" || !SLUG.test(p.slug)) continue;
    if (p.status !== undefined && p.status !== null && p.status !== "active") continue;
    const name = typeof p.name === "string" && p.name.trim() ? p.name.replace(/[\r\n]/g, " ").trim().slice(0, 60) : p.slug;
    const description = typeof p.description === "string" && p.description.trim() ? p.description.replace(/[\r\n]+/g, " ").trim().slice(0, 160) : undefined;
    out.push({ slug: p.slug, name, ...(description ? { description } : {}) });
  }
  return out;
}

/**
 * The user's presets, read by this server on OPENROUTER_API_KEY (GET /api/v1/presets, OpenRouter's "List presets"):
 * the key never goes to the window, and nothing of it is in the answer. `noKey`: there's no key here; `refused`:
 * OpenRouter turned the key down; `offline`: it couldn't be reached. Either way, the card takes a slug typed in.
 */
export async function openRouterPresets(): Promise<PresetsAnswer> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return { presets: [], noKey: true };
  const out: OpenRouterPreset[] = [];
  for (let page = 0; page < PAGES; page++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${PRESETS_URL}?limit=${PAGE}&offset=${page * PAGE}`, { signal: abort.signal, headers: { accept: "application/json", authorization: `Bearer ${key}`, "X-Title": "Bops" } });
      if (res.status === 401 || res.status === 403) return { presets: [], refused: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await readCapped(res, abort);
      const got = trimPresets(body);
      for (const p of got) if (!out.some((y) => y.slug === p.slug)) out.push(p);
      const raw = (body as { data?: unknown[] } | null)?.data;
      const total = Number((body as { total_count?: unknown } | null)?.total_count);
      if (!Array.isArray(raw) || raw.length < PAGE || (Number.isFinite(total) && (page + 1) * PAGE >= total)) break;
    } catch {
      return { presets: out, offline: true };
    } finally {
      clearTimeout(timer);
    }
  }
  return { presets: out };
}

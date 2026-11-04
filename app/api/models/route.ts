import { touchState } from "@/lib/server/store";
import "@/lib/server/llms";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import { isPreset, JOB_NAMES, JOB_HELP, ROUTE_KEYS, ROUTE_NAMES, setLlms, type AgentRoute, type Job } from "@/lib/agents";
import { knownOpenRouterIds } from "@/lib/server/openrouter-models";
import { accountLabels } from "@/lib/server/provider-accounts";

export const dynamic = "force-dynamic";

/*
 * Settings, Models: Your LLMs (config/llms.yaml) as a list to change in place. Each change (add, update, remove)
 * goes through config/llms.cjs: checked there (a known provider, a plain model id, an agent that runs that
 * provider, each job to one model), written to the file keeping its comments, and put in at once (setLlms), so new
 * threads and chats use it without a restart. Only the Bops window may (a paired phone, or a bot's Chrome, can't),
 * and only this machine when there is no window; on a server that only lets in the paired phone
 * (BOPS_REQUIRE_REMOTE=1), that phone: as app/api/modules. Keys are never read out: only whether each is set.
 */
type Entry = { name: string; provider: string; model: string; account?: string; starter?: boolean; useFor?: string[]; runBy?: string; chatDefault?: boolean; from?: string };
type Change = { list?: Entry[]; removed?: string[]; moved?: { job: string; from: string }[]; error?: string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const file = () => require(/* turbopackIgnore: true */ `${process.cwd()}/config/llms.cjs`) as {
  PROVIDERS: string[];
  CHAT_ONLY?: string[];
  RUN_BY: Record<string, { name: string; providers: string[] | null }>;
  NOT_RUN_BY: Record<string, { name: string; why: string }>;
  MAX: number;
  read: (root: string, log?: (line: string) => void, problems?: string[]) => Entry[];
  change: (list: Entry[], op: unknown) => Change;
  write: (root: string, list: Entry[], removed?: string[]) => void;
};

const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);
const headers = { "Cache-Control": "no-store" };
const no = () => Response.json({ error: "Models can only be changed in the Bops app." }, { status: 403, headers });

/** Friendlier names for the provider menu; any other provider shows by its ROUTE_NAMES name. */
const LABELS: Partial<Record<string, string>> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  openrouter: "OpenRouter (hundreds of models)",
  deepseek: "DeepSeek",
  "zai-coding": "Z.ai GLM, on your Coding Plan",
  zai: "Z.ai GLM, pay as you go",
  deepinfra: "DeepInfra",
  ollama: "Ollama (free, local; chats only)",
};

/** What the card shows: the list (each with its id, "provider/model"), the providers, the agents and the jobs. */
function described() {
  const f = file();
  const problems: string[] = [];
  const list = f.read(process.cwd(), () => {}, problems);
  const keyOf = (p: string) => (Object.hasOwn(ROUTE_KEYS, p) ? ROUTE_KEYS[p as AgentRoute] : undefined);
  // Each provider's other accounts (NAME__LABEL set in .env.local): labels only, never a key.
  const accounts = (p: string) => {
    const k = keyOf(p);
    return k && p !== "ollama" ? accountLabels(k) : [];
  };
  return {
    // An account this server hasn't got (taken out of .env.local, or a typo in the file): said, and kept.
    llms: list.map((l) => ({ ...l, id: `${l.provider}/${l.model}`, ...(l.account && !accounts(l.provider).includes(l.account) ? { accountMissing: true } : {}) })),
    max: f.MAX,
    providers: f.PROVIDERS.map((p) => {
      const keyName = keyOf(p);
      const name = Object.hasOwn(ROUTE_NAMES, p) ? ROUTE_NAMES[p as AgentRoute] : p;
      return { id: p, name, label: LABELS[p] ?? name, keyName: keyName ?? null, keySet: !!(keyName && process.env[keyName]?.trim()), accounts: accounts(p), ...(f.CHAT_ONLY?.includes(p) ? { chatOnly: true } : {}) };
    }),
    runBy: [
      ...Object.entries(f.RUN_BY).map(([kind, x]) => ({ kind, name: x.name, providers: x.providers })),
      ...Object.entries(f.NOT_RUN_BY).map(([kind, x]) => ({ kind, name: x.name, providers: [] as string[], why: x.why })),
    ],
    jobs: (Object.keys(JOB_NAMES) as Job[]).map((j) => ({ id: j, name: JOB_NAMES[j], help: JOB_HELP[j] })),
    problems,
  };
}

export async function GET(request: Request) {
  if (!allowed(request)) return no();
  return Response.json(described(), { headers });
}

/**
 * One change: { op: "add", name, provider, model, useFor?, runBy?, chatDefault?, starter? }, { op: "update", id,
 * ...what changes }, or { op: "remove", id }. Answers the card again, with `moved`: the jobs this took from others.
 */
export async function POST(request: Request) {
  if (!allowed(request)) return no();
  const op = (await request.json().catch(() => null)) as unknown;
  if (!op || typeof op !== "object" || Array.isArray(op)) return Response.json({ error: "Send a change: add, update or remove." }, { status: 400, headers });
  const f = file();
  const root = process.cwd();
  const done = f.change(f.read(root, () => {}), op);
  if (done.error || !done.list) return Response.json({ error: done.error ?? "That change couldn't be made." }, { status: 400, headers });
  try {
    f.write(root, done.list, done.removed);
  } catch (e) {
    return Response.json({ error: `Couldn't save config/llms.yaml: ${(e as Error).message}` }, { status: 500, headers });
  }
  // In at once: new threads, bots and chats use it from now on.
  setLlms(f.read(root, () => {}));
  touchState(); // The catalog is part of /api/state: invalidate version-only poll responses.
  return Response.json({ ok: true, moved: done.moved ?? [], ...warningFor(op as { op?: string; provider?: unknown; model?: unknown; id?: unknown }, done.list), ...described() }, { headers });
}

/**
 * An OpenRouter model id that isn't in OpenRouter's list as this server last read it (lib/server/openrouter-models.ts):
 * said, never refused (the list can be a few hours behind, and a new model works before it's there). Nothing is
 * said without a list, for a preset (the user's own, not in the list), or for another provider.
 */
function warningFor(op: { op?: string; provider?: unknown; model?: unknown; id?: unknown }, list: Entry[]): { warning?: string } {
  if (op.op !== "add" && op.op !== "update") return {};
  if (op.op === "update" && op.model === undefined && op.provider === undefined) return {};
  const l = op.op === "add" ? list[list.length - 1] : list.find((x) => x.from === op.id);
  if (!l || l.provider !== "openrouter" || isPreset(l.provider, l.model)) return {};
  const known = knownOpenRouterIds();
  if (!known || known.has(l.model)) return {};
  return { warning: `Saved, but OpenRouter's model list doesn't have "${l.model}". Check the id at openrouter.ai/models: a chat on it fails if OpenRouter doesn't know it.` };
}

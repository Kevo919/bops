import { BRAINS_ON, planName, signInOn, threadRunner, workBot, workspaceOf, type AgentKind, type AgentPays, type AppState, type Bot, type BotAgent, type BotAi, type Brain, type CliKind, type Session } from "@/lib/types";
import { ACCOUNT_LABEL } from "./accounts";

/**
 * A bot is a whole window, and each of its threads a tab: its AI profile (Bot.ai) lists the agents its threads
 * may run on, each with how it pays and the account it uses, and one is its Default. Each thread runs on the
 * agent picked for it as it starts (the owner's pick in the message box, an agent they named in chat, the
 * profile's New thread with, else the Default), fixed from its first turn, so one bot runs many threads at once,
 * each on its own agent. A bot with no profile has Bops agent only, on AI credit, exactly as before.
 *
 * Shared by the window and the server. Nothing here is secret: a key stays in the Vault and a plan's login in
 * its folder on the bot's computer (vm/bin/bops-brain), each bot's agents with their own settings there.
 */

export type AgentRoute = "anthropic" | "openai" | "deepinfra" | "zai" | "zai-coding" | "zai-coding-cn" | "deepseek" | "openrouter" | "ollama";
/**
 * Providers a chat can run on but a bot's agents can't: Ollama runs on this server (OLLAMA_BASE_URL), out of
 * reach of a bot's cloud computer, so its models aren't offered to OpenCode or DeepSeek Harness.
 */
export const CHAT_ONLY: ReadonlySet<AgentRoute> = new Set<AgentRoute>(["ollama"]);

/** What each kind of agent is. `soon`: shown, dimmed, with why it isn't in Bops yet. */
export const AGENTS: Record<AgentKind, { name: string; maker: string; pays: AgentPays[]; soon?: string }> = {
  bops: { name: "Bops agent", maker: "OpenAI", pays: ["credit"] },
  claude: { name: "Claude Code", maker: "Anthropic", pays: ["plan", "key"] },
  codex: { name: "Codex", maker: "OpenAI", pays: ["plan", "key"] },
  opencode: { name: "OpenCode", maker: "Any model", pays: ["key"] },
  dsh: { name: "DeepSeek Harness", maker: "Any model", pays: ["key"] },
  agy: { name: "agy", maker: "Google Antigravity", pays: [], soon: "agy signs in with a Google account, which Bops can't use for you yet." },
};

/** Ways to pay that show in an agent's Pays with, disabled, and why. */
export const PAYS_SOON: Partial<Record<AgentKind, Partial<Record<AgentPays, string>>>> = {
  claude: { credit: "Credit for Claude Code needs Bops Cloud to carry it first." },
  codex: { credit: "Credit for Codex needs Bops Cloud to carry it first." },
  opencode: { credit: "Credit for OpenCode needs Bops Cloud to carry it first." },
  dsh: { credit: "Credit for DeepSeek Harness needs Bops Cloud to carry it first." },
};
/** The ways to pay each kind shows in its editor, in order. */
export const PAYS_SHOWN: Record<AgentKind, AgentPays[]> = { bops: ["credit"], claude: ["credit", "plan", "key"], codex: ["credit", "plan", "key"], opencode: ["credit", "key"], dsh: ["credit", "key"], agy: [] };
export const PAYS_NAMES: Record<AgentPays, string> = { credit: "Credit", plan: "Plan", key: "Your key" };

/** The models an agent can be told to use, the kind's default first. OpenCode's and DeepSeek Harness's name their provider; any other `provider/model` of those providers works too (OPENCODE_OTHER). */
export const MODELS: { id: string; kind: AgentKind; label: string; short: string; note?: string }[] = [
  { id: "auto", kind: "bops", label: "Auto", short: "Auto", note: "Picks per task" },
  { id: "gpt-6.1-sol", kind: "bops", label: "GPT 6.1 Sol", short: "GPT 6.1 Sol" },
  { id: "gpt-6-astra", kind: "bops", label: "GPT 6 Astra", short: "GPT 6 Astra" },
  { id: "claude-opus-5-5", kind: "claude", label: "Claude Opus 5.5", short: "Opus 5.5" },
  { id: "claude-sonnet-5-5", kind: "claude", label: "Claude Sonnet 5.5", short: "Sonnet 5.5" },
  { id: "claude-haiku-5-5", kind: "claude", label: "Claude Haiku 5.5", short: "Haiku 5.5" },
  { id: "gpt-6.1-sol", kind: "codex", label: "GPT 6.1 Sol", short: "GPT 6.1 Sol" },
  { id: "gpt-6-astra", kind: "codex", label: "GPT 6 Astra", short: "GPT 6 Astra" },
  { id: "anthropic/claude-sonnet-5-5", kind: "opencode", label: "Claude Sonnet 5.5", short: "Sonnet 5.5" },
  { id: "anthropic/claude-opus-5-5", kind: "opencode", label: "Claude Opus 5.5", short: "Opus 5.5" },
  { id: "openai/gpt-6.1-sol", kind: "opencode", label: "GPT 6.1 Sol", short: "GPT 6.1 Sol" },
  { id: "zai-coding/glm-5.3", kind: "opencode", label: "GLM 5.3 (Z.ai Coding Plan)", short: "GLM 5.3", note: "Your Z.ai Coding Plan" },
  { id: "zai/glm-5.2", kind: "opencode", label: "GLM 5.2 (Z.ai)", short: "GLM 5.2", note: "Z.ai, pay as you go" },
  { id: "zai-coding-cn/glm-5.3", kind: "opencode", label: "GLM 5.3 (Z.ai Coding Plan, China)", short: "GLM 5.3", note: "Your Z.ai Coding Plan, China region" },
  { id: "zai-coding-cn/glm-5.2", kind: "opencode", label: "GLM 5.2 (Z.ai Coding Plan, China)", short: "GLM 5.2", note: "Your Z.ai Coding Plan, China region" },
  // DeepSeek Harness is DeepSeek's own agent, so it starts on DeepSeek; it runs the other providers' models too, on their keys.
  { id: "deepseek/deepseek-chat", kind: "dsh", label: "DeepSeek Chat", short: "DeepSeek Chat" },
  { id: "deepseek/deepseek-reasoner", kind: "dsh", label: "DeepSeek Reasoner", short: "DeepSeek Reasoner", note: "Thinks before it answers" },
  { id: "anthropic/claude-sonnet-5-5", kind: "dsh", label: "Claude Sonnet 5.5", short: "Sonnet 5.5" },
  { id: "openai/gpt-6.1-sol", kind: "dsh", label: "GPT 6.1 Sol", short: "GPT 6.1 Sol" },
  { id: "zai-coding/glm-5.3", kind: "dsh", label: "GLM 5.3 (Z.ai Coding Plan)", short: "GLM 5.3", note: "Your Z.ai Coding Plan" },
  { id: "zai-coding-cn/glm-5.3", kind: "dsh", label: "GLM 5.3 (Z.ai Coding Plan, China)", short: "GLM 5.3", note: "Your Z.ai Coding Plan, China region" },
];

/* ---------------- Jobs ---------------- */

/**
 * Kinds of work an agent can be set to take (BotAgent.jobs): "use Z.ai for coding and planning, Claude Code for
 * writing". A new thread nobody picked an agent for goes to the bot's agent for its job, else the Default. The job is
 * read from the task's words here, at once and the same way every time (jobOf), so the owner can see and predict it.
 */
export const JOBS = ["coding", "planning", "thinking", "research", "writing", "browsing"] as const;
export type Job = (typeof JOBS)[number];
export const JOB_NAMES: Record<Job, string> = { coding: "Coding", planning: "Planning", thinking: "Thinking", research: "Research", writing: "Writing", browsing: "Web tasks" };
export const JOB_HELP: Record<Job, string> = {
  coding: "Code, apps, websites, scripts, bugs",
  planning: "Plans, schedules, roadmaps, step-by-step",
  thinking: "Analysis, comparing options, hard questions",
  research: "Finding things out across sources",
  writing: "Emails, posts, documents, rewriting",
  browsing: "Forms, sign-ups, orders, clicking through sites",
};
const JOB_WORDS: Record<Job, RegExp> = {
  coding: /\b(code|coding|program|script|bug|debug|fix the (build|error|app|site)|function|repo(sitory)?|github|git|pull request|deploy|refactor|compile|api|endpoint|database|sql|python|javascript|typescript|react|next\.?js|node|html|css|kotlin|android app|website|web app|app|frontend|backend|unit tests?)\b/gi,
  planning: /\b(plan|planning|roadmap|schedule|itinerary|timeline|milestones?|strategy|outline|steps? to|break (it|this) down|organi[sz]e|prioriti[sz]e|agenda)\b/gi,
  thinking: /\b(analy[sz]e|analysis|compare|comparison|decide|decision|evaluate|reason|think (it )?through|pros and cons|trade-?offs?|figure out|why|should i|weigh|assess)\b/gi,
  research: /\b(research|find out|look up|look into|sources?|investigate|learn about|what is|who is|news|report on|survey|market)\b/gi,
  writing: /\b(write|draft|email|letter|essay|post|blog|article|rewrite|proofread|summari[sz]e|caption|copy|script for|reply to)\b/gi,
  browsing: /\b(fill (out|in)|form|sign (me )?up|register|book|reserve|order|buy|purchase|log ?in|click|download|upload|checkout|cancel my|unsubscribe)\b/gi,
};

/** The job a task's words are most about, or undefined when none stands out. Ties go to the earlier job in JOBS. */
export function jobOf(words: string | undefined): Job | undefined {
  if (!words?.trim()) return undefined;
  let best: Job | undefined;
  let most = 0;
  for (const j of JOBS) {
    const n = words.match(JOB_WORDS[j])?.length ?? 0;
    if (n > most) {
      best = j;
      most = n;
    }
  }
  return best;
}
export const cleanJobs = (jobs: unknown): Job[] | undefined => {
  if (!Array.isArray(jobs)) return undefined;
  const out = JOBS.filter((j) => jobs.includes(j));
  return out.length ? out : undefined;
};
/** Any other model OpenCode (or DeepSeek Harness) can run on a key of these providers ("Other model" in its editor). */
export const OPENCODE_OTHER = /^(anthropic|openai|deepinfra|zai|zai-coding|zai-coding-cn|deepseek|openrouter)\/[A-Za-z0-9._:/-]{1,120}$/;

/** The Vault key each provider's agents run on (lib/server/keys.ts KEY_PROVIDERS). */
// Z.ai: one key for both. "zai-coding" is its GLM Coding Plan (the plan's own address and allowance), "zai" pay as you go.
// "zai-coding-cn" is the GLM Coding Plan in the China region (open.bigmodel.cn): an account and key of its own.
// Ollama: no key, its address. OLLAMA_BASE_URL being set is what makes it show (OLLAMA_API_KEY, if any, is sent as Bearer).
export const ROUTE_KEYS: Record<AgentRoute, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", deepinfra: "DEEPINFRA_API_KEY", zai: "ZAI_API_KEY", "zai-coding": "ZAI_API_KEY", "zai-coding-cn": "ZAI_CODING_CN_API_KEY", deepseek: "DEEPSEEK_API_KEY", openrouter: "OPENROUTER_API_KEY", ollama: "OLLAMA_BASE_URL" };
export const ROUTE_NAMES: Record<AgentRoute, string> = { anthropic: "Anthropic", openai: "OpenAI", deepinfra: "DeepInfra", zai: "Z.ai", "zai-coding": "Z.ai Coding Plan", "zai-coding-cn": "Z.ai Coding Plan (China)", deepseek: "DeepSeek", openrouter: "OpenRouter", ollama: "Ollama (free, local)" };

/** Bops agent: every bot has it, always first, and it is every thread's fallback. */
export const BOPS_AGENT: BotAgent = { id: "bops", kind: "bops", pays: "credit" };
/** The profile of a bot with none: exactly as before. */
export const DEFAULT_AI: BotAi = { agents: [BOPS_AGENT], default: "bops" };
/** At most this many agents in a profile. */
export const MAX_AGENTS = 6;

const AGENT_ID = /^ag_[A-Za-z0-9]{10}$/;

/* ---------------- Your LLMs (config/llms.yaml) ---------------- */

/**
 * The LLMs in config/llms.yaml: each a provider and model, the one new bots start on (`starter`), and the jobs
 * it takes. The server reads the file as it starts (lib/server/llms.ts) and sends the list to the window with the
 * state (AppState.llms), and both keep it here. They run on OpenCode, on the provider's key from the Vault, and
 * show as DeepSeek Harness's models too.
 */
export type Llm = { name: string; provider: AgentRoute; model: string; account?: string; starter?: boolean; useFor?: Job[]; runBy?: RunBy; chatDefault?: boolean };
/**
 * The agents that may run an LLM for bots' tasks (config/llms.yaml run_by; config/llms.cjs RUN_BY says which
 * providers each runs). OpenCode when it says none. Claude Code and Codex run on an account connected to a bot.
 */
export const RUN_BY_KINDS = ["opencode", "dsh"] as const;
export type RunBy = (typeof RUN_BY_KINDS)[number];
const g = globalThis as unknown as { __bopsLlms?: Llm[] };
export const llms = (): Llm[] => g.__bopsLlms ?? [];
/** A plain model id ("deepseek/deepseek-chat", "qwen2.5:3b"), as config/llms.cjs MODEL. */
export const MODEL_ID = /^[A-Za-z0-9._:/-]{1,120}$/;
/** An OpenRouter preset, written as its model ("@preset/email-writer"), as config/llms.cjs PRESET. */
export const PRESET_ID = /^@preset\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
export const isPreset = (provider: string, model: string) => provider === "openrouter" && PRESET_ID.test(model);
/** An LLM only chats run on (and chat routines): Ollama's (on this server) and OpenRouter presets (bots' agents take a plain model id). */
export const chatOnlyLlm = (l: Pick<Llm, "provider" | "model">) => CHAT_ONLY.has(l.provider) || isPreset(l.provider, l.model);
const LLM_PROVIDERS = new Set<string>(Object.keys(ROUTE_KEYS));
/** Keep the list (from the file, or from the state the window got): only what Bops can run. */
export function setLlms(list: unknown) {
  const out: Llm[] = [];
  if (Array.isArray(list))
    for (const x of list.slice(0, 20)) {
      if (!x || typeof x !== "object") continue;
      const l = x as Partial<Llm>;
      if (typeof l.provider !== "string" || !LLM_PROVIDERS.has(l.provider) || typeof l.model !== "string" || !(MODEL_ID.test(l.model) || isPreset(l.provider, l.model))) continue;
      const preset = isPreset(l.provider, l.model);
      const jobs = preset ? undefined : cleanJobs(l.useFor);
      const runBy = !preset && (RUN_BY_KINDS as readonly string[]).includes(l.runBy as string) && l.runBy !== "opencode" ? l.runBy : undefined;
      out.push({
        name: typeof l.name === "string" && l.name.trim() ? l.name.trim().slice(0, 60) : l.model,
        provider: l.provider as AgentRoute,
        model: l.model,
        // Another account of its provider (lib/accounts.ts): its label only, never a key.
        ...(typeof l.account === "string" && ACCOUNT_LABEL.test(l.account) && l.provider !== "ollama" ? { account: l.account } : {}),
        ...(l.starter === true && !preset && !out.some((y) => y.starter) ? { starter: true } : {}),
        ...(jobs ? { useFor: jobs } : {}),
        ...(runBy ? { runBy } : {}),
        ...(l.chatDefault === true && !out.some((y) => y.chatDefault) ? { chatDefault: true } : {}),
      });
    }
  g.__bopsLlms = out;
}
const llmModel = (l: Llm) => `${l.provider}/${l.model}`;
/** The LLMs as models of OpenCode and DeepSeek Harness (and the Claude ones of Claude Code too), the starter first. */
const llmModels = (kind: AgentKind): (typeof MODELS)[number][] => {
  const list = llms().filter((l) => !chatOnlyLlm(l)).sort((a, b) => Number(!!b.starter) - Number(!!a.starter));
  if (anyModel(kind)) return list.map((l) => ({ id: llmModel(l), kind, label: l.name, short: l.name }));
  if (kind === "claude") return list.filter((l) => l.provider === "anthropic").map((l) => ({ id: l.model, kind, label: l.name, short: l.name }));
  return [];
};
/**
 * The agent an LLM is in a bot with no AI profile of its own: the same id on every bot, from its provider and model
 * (and the agent that runs it, its run_by: OpenCode unless it says DeepSeek Harness).
 */
export const llmAgent = (l: Llm): BotAgent => {
  const kind: AgentKind = l.runBy === "dsh" ? "dsh" : "opencode";
  return { id: agentIdFor("llm", kind === "opencode" ? llmModel(l) : `${kind}:${llmModel(l)}`), kind, pays: "key", model: llmModel(l), ...(l.useFor ? { jobs: l.useFor } : {}) };
};
/**
 * The AI a bot with no profile of its own starts on, from config/llms.yaml: Bops agent, the starter as its
 * Default, and each LLM set to take some jobs. Undefined without brains, or with no starter and none with jobs:
 * then Bops agent only, as before. Changing that bot's AI keeps these as its own from then on (bot-ai.ts).
 */
export function starterAi(): BotAi | undefined {
  if (!BRAINS_ON) return undefined;
  const list = llms().filter((l) => !chatOnlyLlm(l) && (l.starter || l.useFor?.length)).slice(0, MAX_AGENTS - 1);
  if (!list.length) return undefined;
  const starter = list.find((l) => l.starter);
  return { agents: [BOPS_AGENT, ...list.map(llmAgent)], default: starter ? llmAgent(starter).id : "bops" };
}

export const modelsFor = (kind: AgentKind) => {
  const mine = llmModels(kind);
  // DeepSeek Harness keeps DeepSeek's own models first (DeepSeek Chat is its default), then the LLMs, then the rest;
  // the others start on the LLMs' starter.
  if (kind === "dsh") {
    const own = MODELS.filter((m) => m.kind === kind);
    const first = own.filter((m) => m.id.startsWith("deepseek/"));
    const ids = (list: { id: string }[]) => new Set(list.map((m) => m.id));
    const lead = [...first, ...mine.filter((x) => !ids(first).has(x.id))];
    return [...lead, ...own.filter((m) => !ids(lead).has(m.id))];
  }
  return [...mine, ...MODELS.filter((m) => m.kind === kind && !mine.some((x) => x.id === m.id))];
};
/** The model a kind's threads start on when its agent names none. */
export const defaultModel = (kind: AgentKind) => modelsFor(kind)[0]?.id;
/** A model an agent of this kind may be told to use. */
export const modelOk = (kind: AgentKind, model: string | undefined) => !!model && (modelsFor(kind).some((m) => m.id === model) || (anyModel(kind) && OPENCODE_OTHER.test(model)));
/** A model's short name ("Opus 5.5"), or for another OpenCode or DeepSeek Harness model, its own name. */
export const modelShort = (kind: AgentKind, model: string | undefined) => {
  const m = model ?? defaultModel(kind);
  return modelsFor(kind).find((x) => x.id === m)?.short ?? (m ? (m.split("/").pop() ?? m) : "");
};

/** Where an agent's key goes (the gate's route on its computer): its provider. Bops agent and a plan have none. */
export function gateRoute(x: Pick<BotAgent, "kind" | "pays" | "model">): AgentRoute | undefined {
  if (x.pays !== "key") return undefined;
  if (x.kind === "claude") return "anthropic";
  if (x.kind === "codex") return "openai";
  if (anyModel(x.kind)) return (x.model ?? defaultModel(x.kind))?.split("/")[0] as AgentRoute;
  return undefined;
}
/** The Vault key an agent on a key runs on. */
export const agentKeyName = (x: Pick<BotAgent, "kind" | "pays" | "model">) => {
  const r = gateRoute(x);
  return r ? ROUTE_KEYS[r] : undefined;
};

/** The kinds this build runs: Bops agent always; the CLI agents with brains on (BRAINS_ON). */
export const agentOn = (kind: AgentKind) => kind === "bops" || (BRAINS_ON && !AGENTS[kind].soon);
export const isCli = (kind: AgentKind): kind is CliKind => kind === "claude" || kind === "codex" || kind === "opencode" || kind === "dsh";
/**
 * The kinds that run any provider's model on its key, named "provider/model" (OpenCode, DeepSeek Harness): a bot
 * may have several of one, each on its own model, and their key is their model's provider's.
 */
export const anyModel = (kind: AgentKind) => kind === "opencode" || kind === "dsh";
/**
 * The CLI agents whose session opens in a terminal for the user (Open in terminal, and the bot's own shell). Not
 * DeepSeek Harness: Bops runs it headless only (dsh --profile headless), and it ships no terminal app to resume a session in.
 */
export const hasTerminal = (kind: AgentKind): kind is CliKind => isCli(kind) && kind !== "dsh";

/** Which ways to pay an agent of this kind can use in this build. */
export const paysOk = (kind: AgentKind, pays: AgentPays) => AGENTS[kind].pays.includes(pays) && !PAYS_SOON[kind]?.[pays];

/**
 * A profile as it may be kept: Bops agent first, always; each agent once (by id, and by kind, pay and account);
 * only what Bops can run (the AGENTS table), on an account of the bot's workspace of the right kind; a model the
 * agent allows (else none: its kind's default); at most MAX_AGENTS; a Default that's in it, else Bops agent.
 * Undefined when that's just Bops agent with no model: the default, which is never stored.
 */
export function cleanAi(ai: unknown, brains: Brain[] = [], wsId?: string): BotAi | undefined {
  if (!ai || typeof ai !== "object" || !Array.isArray((ai as BotAi).agents)) return undefined;
  const raw = ai as { agents: unknown[]; default?: unknown };
  const out: BotAgent[] = [];
  const seen = new Set<string>();
  for (const a of raw.agents) {
    if (!a || typeof a !== "object") continue;
    const x = a as Partial<BotAgent>;
    if (typeof x.kind !== "string" || !(x.kind in AGENTS) || typeof x.pays !== "string" || typeof x.id !== "string") continue;
    const kind = x.kind as AgentKind;
    const pays = x.pays as AgentPays;
    if (!paysOk(kind, pays)) continue;
    if (kind === "bops" ? x.id !== "bops" : !AGENT_ID.test(x.id)) continue;
    let account: string | undefined;
    if (kind === "claude" || kind === "codex") {
      const acct = brains.find((y) => y.id === x.account && y.kind === kind && y.auth === pays && (!wsId || y.workspaceId === wsId));
      if (!acct) continue;
      account = acct.id;
    }
    const key = `${kind}:${pays}:${account ?? ""}`;
    if (seen.has(x.id) || (!anyModel(kind) && seen.has(key))) continue;
    seen.add(x.id);
    seen.add(key);
    const model = typeof x.model === "string" && modelOk(kind, x.model) && !(kind === "bops" && x.model === "auto") ? x.model : undefined;
    const jobs = cleanJobs(x.jobs);
    out.push({ id: x.id, kind, pays, ...(account ? { account } : {}), ...(model ? { model } : {}), ...(jobs ? { jobs } : {}) });
  }
  const bops = out.find((x) => x.kind === "bops") ?? BOPS_AGENT;
  const agents = [bops, ...out.filter((x) => x.kind !== "bops")].slice(0, MAX_AGENTS);
  const def = typeof raw.default === "string" && agents.some((x) => x.id === raw.default) ? raw.default : "bops";
  if (agents.length === 1 && !bops.model && !bops.jobs && def === "bops") return undefined;
  return { agents, default: def };
}

/** An agent's id made from what it came from (a bot and a brain), so every Mac that moves the same bot's brains over makes the same one. */
export function agentIdFor(botId: string, brainId: string) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const ch of `${botId}:${brainId}`) {
    h1 = Math.imul(h1 ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ch.charCodeAt(0), 0x5bd1e995) >>> 0;
  }
  let id = "";
  for (let i = 0; i < 10; i++) {
    const v = i % 2 ? h1 : h2;
    id += abc[(v >>> ((i * 3) % 24)) % abc.length];
    h1 = Math.imul(h1 ^ (h2 >>> 7), 0x85ebca6b) >>> 0;
    h2 = Math.imul(h2 ^ (h1 >>> 13), 0xc2b2ae35) >>> 0;
  }
  return `ag_${id}`;
}

/**
 * The profile a bot's brains said before profiles (Brain.bots: the brains it may use; Bot.brain: the one it
 * uses): Bops agent, then an agent on each of those brains, the one it used its Default. Undefined for a bot on
 * none: no profile, today's Bops agent. lib/server/store.ts botAgents keeps it as the bot's profile.
 */
export function legacyAi(b: Pick<Bot, "id" | "brain">, brains: Brain[] = []): BotAi | undefined {
  const on = brains.filter((x) => Array.isArray(x.bots) && x.bots.includes(b.id));
  if (!on.length) return undefined;
  const agents: BotAgent[] = on.map((x) => ({ id: agentIdFor(b.id, x.id), kind: x.kind, pays: x.auth, account: x.id }));
  return { agents: [BOPS_AGENT, ...agents], default: agents.find((a) => a.account === b.brain)?.id ?? "bops" };
}

/**
 * A bot's profile as it runs in this build: its own, cleaned, else the default. Without brains (a release build),
 * Bops agent only: CLI agents stay in the state for a build that has them, and nothing shows or runs on them.
 */
export function aiOf(b: Pick<Bot, "id" | "ai" | "brain" | "workspaceId">, state: Pick<AppState, "brains">): BotAi {
  const ai = cleanAi(b.ai ?? legacyAi(b, state.brains), state.brains ?? []) ?? starterAi() ?? DEFAULT_AI;
  const agents = ai.agents.filter((x) => agentOn(x.kind));
  return { agents, default: agents.some((x) => x.id === ai.default) ? ai.default : "bops" };
}
export const agentById = (b: Pick<Bot, "id" | "ai" | "brain" | "workspaceId">, state: Pick<AppState, "brains">, agentId: string | undefined) => (agentId ? aiOf(b, state).agents.find((x) => x.id === agentId) : undefined);
export const defaultAgent = (b: Pick<Bot, "id" | "ai" | "brain" | "workspaceId">, state: Pick<AppState, "brains">) => {
  const ai = aiOf(b, state);
  return ai.agents.find((x) => x.id === ai.default) ?? BOPS_AGENT;
};
/** A bot has a profile of its own (more than Bops agent on Auto). */
export const hasProfile = (b: Pick<Bot, "id" | "ai" | "brain" | "workspaceId">, state: Pick<AppState, "brains">) => !!cleanAi(b.ai ?? legacyAi(b, state.brains), state.brains ?? []);

/** The account an agent runs on, when it has one. */
export const accountOf = (x: Pick<BotAgent, "account">, state: Pick<AppState, "brains">) => (x.account ? state.brains?.find((y) => y.id === x.account) : undefined);

/* ---------------- Words ---------------- */

/** Whose provider an agent's key is. */
export const keyVendor = (x: Pick<BotAgent, "kind" | "pays" | "model">) => ROUTE_NAMES[gateRoute(x) ?? "anthropic"];

/** The plan an agent's account is signed in with ("max"), on `computerId` first. */
const planOf = (x: Pick<BotAgent, "account">, state: Pick<AppState, "brains">, computerId?: string) => {
  const acct = accountOf(x, state);
  return computerId ? acct && signInOn(acct, computerId)?.account?.plan : acct?.signIns?.[0]?.account?.plan;
};

/** How it pays, in a few words: "credit", "your Max plan", "your Anthropic key". `computerId`: where its plan is signed in. */
export function paysLabel(x: Pick<BotAgent, "kind" | "pays" | "model" | "account">, state: Pick<AppState, "brains">, computerId?: string) {
  if (x.pays === "credit") return "credit";
  if (x.pays === "key") return gateRoute(x) === "zai-coding" ? "your Z.ai Coding Plan" : `your ${keyVendor(x)} key`;
  const plan = planOf(x, state, computerId);
  return x.kind === "codex" ? "your ChatGPT plan" : `your ${plan ? `Claude ${planName(plan)}` : "Claude plan"}`;
}

/** Where an agent's words come from: the bot it belongs to, so two agents of one kind can be told apart. */
export type AgentIn = { bot: Bot; state: Pick<AppState, "bots" | "brains"> };

/**
 * What tells an agent from another of its kind in its bot's profile, when one would read the same: how it pays
 * ("Max plan", "Anthropic key"), and a number when that's the same too ("Max plan 2"). None when it's the only
 * one of its kind (or, for OpenCode and DeepSeek Harness, the only one on its model): its name says it.
 */
export function agentTag(x: Pick<BotAgent, "id" | "kind" | "pays" | "model" | "account">, at?: AgentIn): string | undefined {
  if (!at) return undefined;
  const agents = aiOf(at.bot, at.state).agents;
  const model = (y: Pick<BotAgent, "kind" | "model">) => y.model ?? defaultModel(y.kind);
  const same = agents.filter((y) => y.kind === x.kind && (!anyModel(x.kind) || model(y) === model(x)));
  if (same.length < 2 || !same.some((y) => y.id === x.id)) return undefined;
  const host = workBot(at.bot, at.state.bots).computerId;
  const word = (y: Pick<BotAgent, "kind" | "pays" | "model" | "account">) => y.pays === "credit" ? "Credit" : paysLabel(y, at.state, host).replace(/^your /, "");
  const mine = word(x);
  const before = same.slice(0, same.findIndex((y) => y.id === x.id)).filter((y) => word(y) === mine).length;
  return before ? `${mine} ${before + 1}` : mine;
}

/** An agent's name in its bot's profile: "Claude Code", or with what tells it from another ("Claude Code · Max plan 2"). */
export function agentName(x: Pick<BotAgent, "kind"> & Partial<Pick<BotAgent, "id" | "pays" | "model" | "account">>, at?: AgentIn) {
  const tag = x.id && x.pays ? agentTag(x as BotAgent, at) : undefined;
  return tag ? `${AGENTS[x.kind].name} · ${tag}` : AGENTS[x.kind].name;
}

/** "Claude Code · Opus 5.5"; "Bops agent" on Auto; "Claude Code · Max plan 2 · Opus 5.5" beside another like it (`at`: its bot). */
export function agentLabel(x: Pick<BotAgent, "kind" | "model"> & Partial<Pick<BotAgent, "id" | "pays" | "account">>, at?: AgentIn) {
  const name = agentName(x, at);
  if (x.kind === "bops" && !x.model) return name;
  const m = modelShort(x.kind, x.model);
  return m ? `${name} · ${m}` : name;
}

/** Capitalized, for a line of its own. */
export const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type AgentState = {
  /** It can run a thread now. */
  ready: boolean;
  /** Its tile's subline, or its editor's status line. */
  line: string;
  /** The one thing to do about it, when there is one. */
  button?: "sign_in" | "show" | "retry" | "own_computer" | "add_key";
  /** Not in Bops yet, and why. */
  soon?: string;
};

/**
 * What an agent of a bot's profile is like now, in words, for its tile and editor (and the tests): one source.
 * The Default is said by its tile, whatever its state. `keys`: the names of the keys the Vault has (both
 * scopes), when the window has read them: an agent on a key with none there isn't ready.
 */
export function agentState(
  x: BotAgent,
  b: Bot,
  state: Pick<AppState, "bots" | "brains" | "host">,
  keys?: ReadonlySet<string>,
  /** This computer's words (components/app/computer-words.ts useComputerWords), for the fixed words: names stay exact. */
  words: (text: TemplateStringsArray, ...values: unknown[]) => string = (text, ...values) => text.map((part, i) => part + (i < values.length ? String(values[i]) : "")).join(""),
): AgentState {
  const soon = AGENTS[x.kind].soon;
  if (soon) return { ready: false, line: AGENTS[x.kind].maker, soon };
  if (x.kind === "bops") return { ready: true, line: `${x.model ? modelShort("bops", x.model) : "OpenAI"} · Credit` };
  if (!BRAINS_ON) return { ready: false, line: "Not in this version of Bops" };
  const name = AGENTS[x.kind].name;
  if (state.host === "mac") return { ready: false, line: words`${name} runs on a cloud computer. Your bots work on this Mac.` };
  if (b.runsOn === "mac") return { ready: false, line: words`${b.name} works on your Mac, so its threads use Bops agent.` };
  if (x.pays === "key") {
    const want = anyModel(x.kind) ? agentKeyName(x) : (accountOf(x, state)?.keyName ?? agentKeyName(x));
    if (keys && want && !keys.has(want)) return { ready: false, line: `No ${keyVendor(x)} key in your Vault yet.`, button: "add_key" };
    const m = anyModel(x.kind) ? `${modelShort(x.kind, x.model)} · your ${keyVendor(x)} key` : `Your ${keyVendor(x)} key`;
    return { ready: true, line: upper(m) };
  }
  // A Claude plan: signed in on the computer this bot works on, or not yet.
  const acct = accountOf(x, state);
  const host = workBot(b, state.bots);
  if (!acct) return { ready: false, line: "Pick its account" };
  const going = acct.signingIn;
  if (going && going.computerId === host.computerId) {
    if (going.failed) return { ready: false, line: `Sign in didn't finish: ${going.failed.replace(/\.$/, "")}.`, button: "retry" };
    return { ready: false, line: "Sign in is open on its screen.", button: "show" };
  }
  const on = signInOn(acct, host.computerId);
  if (on) return { ready: true, line: `${x.kind === "codex" ? "ChatGPT plan" : planName(on.account?.plan)} · signed in here` };
  return { ready: false, line: `Not signed in on ${host.name}'s computer yet.`, button: "sign_in" };
}

/**
 * The bot shares a computer with others (it works on another bot's, or others work on its) and keeps a login
 * or key there: bots on one computer can reach each other's logins, so the profile says so.
 */
export function sharesComputerWithLogins(b: Bot, state: Pick<AppState, "bots" | "brains">): string | undefined {
  const ai = aiOf(b, state);
  if (!ai.agents.some((x) => x.pays === "plan" || x.pays === "key")) return undefined;
  const host = workBot(b, state.bots);
  const others = state.bots.filter((y) => y.id !== b.id && workspaceOf(y) === workspaceOf(b) && workBot(y, state.bots).id === host.id);
  if (!others.length) return undefined;
  return host.id === b.id
    ? `Other bots work on ${b.name}'s computer, so they can reach ${b.name}'s logins. Give ${b.name} its own computer to keep them apart.`
    : `${b.name} shares ${host.name}'s computer, so bots there can reach ${b.name}'s logins. Give ${b.name} its own computer to keep them apart.`;
}

/* ---------------- A thread's agent ---------------- */

/** The agent a thread runs on now, as its bot's profile has it (threadAgent). */
export type AgentRun = {
  agent: BotAgent;
  kind: AgentKind;
  model?: string;
  /** Its AI account (Claude Code and Codex). */
  account?: Brain;
  /** On a key: the Vault key, and the gate's route on the computer. */
  keyName?: string;
  route?: AgentRoute;
  /**
   * The agent it began on was removed from the bot's profile, or its account, pay or kind changed since: it
   * runs on Bops agent now (a running one stops first, with these words).
   */
  gone?: string;
  /** The same, said to a thread that starts on Bops agent for it (queued, or waiting on the user): it carries on there, on credit. */
  goneNote?: string;
};

const bopsRun = (b: Pick<Bot, "id" | "ai" | "brain" | "workspaceId">, state: Pick<AppState, "brains">, gone?: { what: string; why: string }): AgentRun => {
  const x = aiOf(b, state).agents.find((y) => y.kind === "bops") ?? BOPS_AGENT;
  return {
    agent: x,
    kind: "bops",
    ...(x.model ? { model: x.model } : {}),
    ...(gone ? { gone: `Stopped: ${gone.what} ${gone.why}. Reply and it carries on with Bops agent.`, goneNote: `${gone.what} ${gone.why}, so Bops agent does this, on your credit.` } : {}),
  };
};

/**
 * The agent a thread runs on, read again at every start, restart, resume and terminal: never trusted from the
 * thread alone (a computer may write its own threads whole), always the bot's current profile.
 * - Bops agent: in a build without brains; for a thread on the user's Mac (its bot works there, or this one
 *   does); once Bops agent ran any of it (it knows what was done, the CLI wouldn't).
 * - Else the agent the thread names, in the bot's profile now, with its account now, and the thread's model
 *   when that agent still allows it. A thread from before names none: the agent on its brain's account, else
 *   the Default. One whose agent went: Bops agent, with `gone`.
 */
export function threadAgent(s: Pick<Session, "agent" | "brainRun" | "onBopsAgent" | "agentSessionId" | "responseId" | "runsOn">, b: Bot, state: Pick<AppState, "bots" | "brains" | "host">): AgentRun {
  const ai = aiOf(b, state);
  if (!BRAINS_ON || state.host === "mac" || b.runsOn === "mac" || s.runsOn === "mac" || threadRunner(s) === "agent") return bopsRun(b, state);
  let id = s.agent?.id;
  if (!id && s.brainRun?.brainId) id = ai.agents.find((x) => x.account === s.brainRun!.brainId)?.id;
  id ??= ai.default;
  const x = ai.agents.find((y) => y.id === id);
  const name = (k: AgentKind | undefined) => AGENTS[k ?? "bops"].name;
  if (!x) return bopsRun(b, state, s.agent ? { what: b.name, why: `doesn't run ${name(s.agent.kind)} anymore` } : undefined);
  if (s.agent && s.agent.kind !== x.kind) return bopsRun(b, state, { what: b.name, why: `doesn't run ${name(s.agent.kind)} anymore` });
  // Begun on one account, and the agent is on another now (switched): nothing more runs on the old one.
  if (s.brainRun?.started && s.brainRun.agentId === x.id && s.brainRun.brainId !== (x.account ?? "-")) return bopsRun(b, state, { what: b.name, why: `doesn't run ${name(x.kind)} on that account anymore` });
  if (x.kind === "bops") {
    const m = s.agent?.model && modelOk("bops", s.agent.model) && s.agent.model !== "auto" ? s.agent.model : x.model;
    return { agent: x, kind: "bops", ...(m ? { model: m } : {}) };
  }
  if (!isCli(x.kind) || !agentOn(x.kind)) return bopsRun(b, state);
  const model = s.agent?.model && modelOk(x.kind, s.agent.model) ? s.agent.model : (x.model ?? defaultModel(x.kind));
  const account = accountOf(x, state);
  if ((x.kind === "claude" || x.kind === "codex") && !account) return bopsRun(b, state, { what: `${b.name}'s ${name(x.kind)} account`, why: "isn't there anymore" });
  const route = gateRoute({ ...x, model });
  return { agent: x, kind: x.kind, model, ...(account ? { account } : {}), ...(route ? { route, keyName: anyModel(x.kind) ? ROUTE_KEYS[route] : (account?.keyName ?? ROUTE_KEYS[route]) } : {}) };
}

/**
 * The agent a new thread starts on: the first of `picks` (agent ids, in the order 1.4 gives: the owner's pick in
 * the message box, the one named in chat, New thread with) that the bot's profile has and can run, else its
 * Default; with `model`, that model when the agent allows it. A CLI agent's thread keeps the model it starts on
 * (the agent's, else its kind's default), so changing the agent's model later changes new threads only; Bops
 * agent on Auto keeps none (its route picks one each task). Undefined for a bot with no profile: nothing new is
 * written on its threads.
 */
export function pickAgent(b: Bot, state: Pick<AppState, "brains">, picks: (string | undefined | null)[], model?: string, goal?: string): Session["agent"] | undefined {
  if (!hasProfile(b, state) && !starterAi()) return undefined;
  const ai = aiOf(b, state);
  const picked = picks.map((p) => (p ? ai.agents.find((y) => y.id === p) : undefined)).find(Boolean);
  // Nobody picked one: the agent set to take this kind of job (the Default first, when it's one of them).
  const job = picked ? undefined : jobOf(goal);
  const forJob = job ? (ai.agents.find((y) => y.id === ai.default && y.jobs?.includes(job)) ?? ai.agents.find((y) => y.jobs?.includes(job))) : undefined;
  const x = picked ?? forJob ?? ai.agents.find((y) => y.id === ai.default) ?? BOPS_AGENT;
  const m = (model && modelOk(x.kind, model) && !(x.kind === "bops" && model === "auto") ? model : x.model) ?? (isCli(x.kind) ? defaultModel(x.kind) : undefined);
  return { id: x.id, kind: x.kind, ...(m ? { model: m } : {}) };
}

/**
 * The bot's agents a thread may start on now, for the message box and chat's start_task: Bops agent, and every CLI
 * agent this build runs that's ready. `keys`: the Vault's key names, when known (the window).
 */
export const readyAgents = (b: Bot, state: Pick<AppState, "bots" | "brains" | "host">, keys?: ReadonlySet<string>) =>
  aiOf(b, state).agents.filter((x) => x.kind === "bops" || (agentOn(x.kind) && state.host !== "mac" && b.runsOn !== "mac" && agentState(x, b, state, keys).ready));

/** An agent the owner named in chat ("Claude Code", "codex", "Claude Code · Sonnet 5.5", "Claude Code · Max plan 2"), among a bot's agents. */
export function agentNamed(b: Bot, state: Pick<AppState, "bots" | "brains" | "host">, name: string | null | undefined): BotAgent | undefined {
  if (!name) return undefined;
  const want = name.toLowerCase().replace(/\s+/g, " ").trim();
  const agents = readyAgents(b, state);
  const at = { bot: b, state };
  return (
    agents.find((x) => agentLabel(x, at).toLowerCase() === want) ??
    agents.find((x) => agentName(x, at).toLowerCase() === want) ??
    agents.find((x) => AGENTS[x.kind].name.toLowerCase() === want) ??
    agents.find((x) => want.startsWith(AGENTS[x.kind].name.toLowerCase()))
  );
}

/** A new agent's id. */
export function newAgentId() {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `ag_${Array.from(bytes, (n) => abc[n % abc.length]).join("")}`;
}

/** A short word for a bot's shell prompt (bops-brain --label): its name, letters and digits only. */
export const shellLabel = (name: string) => name.toLowerCase().replace(/[^a-z0-9._-]+/g, "").slice(0, 30) || "bot";

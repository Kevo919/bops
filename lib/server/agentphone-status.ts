/**
 * How the user's own AgentPhone account stands for calls and texts Bops places for them (agentphone-outbound.ts), in
 * one small place both the chat tools and Settings, Services read. Nothing here reaches the network: it only keeps
 * what the last read-only probe (GET /v1/numbers and /v1/agents, on Check) and the last real call or text said.
 *
 * Kept in this server's memory only (a restart forgets it, and the next Check or call says again). Never a key.
 */

export type CallsReady = "ready" | "needs funds" | "working" | "unknown";
export type TextsReady = "enabled" | "activating" | "registration needed" | "working" | "unknown";

/** The plain words for each state, the same in the chat and in Settings. Never AgentPhone's own words. */
export const FUNDS_WORDS = "Add funds in AgentPhone → Billing to make calls.";
export const TEN_DLC_WORDS = "Texting needs AgentPhone's 10DLC registration: agentphone.ai/register";
export const TEN_DLC_LINK = "https://agentphone.ai/register";

export type AgentPhoneProbe = {
  /** When the probe ran. */
  at: number;
  /** The number Bops would call and text from, as +1 (555) 010-2000; null when none was found. */
  number: string | null;
  /** How many numbers and agents the account has. */
  numbers: number;
  agents: number;
  /** The agent the number is attached to (or the only one), by name. */
  agent: string | null;
  /** The number's `outboundSms`, as AgentPhone says it. */
  outboundSms: "enabled" | "activating" | "registration_required" | null;
  /** Why it couldn't be read, in Bops' own words. */
  problem?: string;
};

type Seen = { probe?: AgentPhoneProbe; calls?: { state: CallsReady; at: number }; texts?: { state: TextsReady; at: number } };
const g = globalThis as unknown as { bopsAgentPhoneStatus?: Seen };
const seen: Seen = (g.bopsAgentPhoneStatus ??= {});

export const noteProbe = (p: AgentPhoneProbe) => void (seen.probe = p);
export const noteCalls = (state: CallsReady) => void (seen.calls = { state, at: Date.now() });
export const noteTexts = (state: TextsReady) => void (seen.texts = { state, at: Date.now() });
export const lastProbe = () => seen.probe;

/** For tests: forget everything. */
export const forgetAgentPhoneStatus = () => {
  delete seen.probe;
  delete seen.calls;
  delete seen.texts;
};

export type AgentPhoneView = {
  /** The key as Settings shows it ("ends in P1a2"), never more. */
  key: string;
  number: string | null;
  agent: string | null;
  calls: CallsReady;
  callsWords: string;
  texts: TextsReady;
  textsWords: string;
  /** Whether a probe has run yet (else: press Check). */
  checked: boolean;
  problem?: string;
};

/**
 * What Settings, Services shows under AgentPhone: what the last probe found, with what the last real call or text
 * said on top (a 402 means calls need funds whatever the probe saw; a sent text means texting works).
 */
export function agentPhoneView(key: string): AgentPhoneView {
  const p = seen.probe;
  const found = !!p && !p.problem && !!p.number && !!p.agent;
  let calls: CallsReady = seen.calls?.state ?? (found ? "ready" : "unknown");
  // A probe newer than a refused call doesn't clear "needs funds": only a call that went does.
  if (seen.calls?.state !== "needs funds" && seen.calls?.state !== "working" && found) calls = "ready";
  const fromProbe: TextsReady = !p?.outboundSms ? "unknown" : p.outboundSms === "enabled" ? "enabled" : p.outboundSms === "activating" ? "activating" : "registration needed";
  // The newer of the probe and the last text says how texting stands.
  const texts: TextsReady = seen.texts && (!p || seen.texts.at >= p.at) ? seen.texts.state : fromProbe;
  const callsWords =
    calls === "needs funds"
      ? FUNDS_WORDS
      : calls === "working"
        ? "Calls work: the last one went through."
        : calls === "ready"
          ? "Ready to call: a number and an agent were found. Bops asks you before every call."
          : p?.problem
            ? p.problem
            : !p
              ? "Press Check to look up your number and agent."
              : "No number with an agent was found in your AgentPhone account.";
  const textsWords =
    texts === "registration needed"
      ? TEN_DLC_WORDS
      : texts === "activating"
        ? "Texting is being switched on for this number. Try again in a little while."
        : texts === "working"
          ? "Texts work: the last one was sent."
          : texts === "enabled"
            ? "Texting is on for this number. Bops asks you before every text."
            : !p
              ? "Press Check to see whether texting is on."
              : "Couldn't tell whether texting is on for this number.";
  return { key, number: p?.number ?? null, agent: p?.agent ?? null, calls, callsWords, texts, textsWords, checked: !!p, ...(p?.problem ? { problem: p.problem } : {}) };
}

/* ---------------- The read-only probe, and the API's plain words ---------------- */

/** "+15551234567" → "+1 (555) 123-4567" (as phone.ts prettyPhone). */
const pretty = (e164: string) => {
  const d = e164.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164;
};

const DEFAULT_BASE = "https://api.agentphone.ai";
/**
 * Where AgentPhone is: its own address, or BOPS_AGENTPHONE_BASE (for tests: a stub on this computer). Only https, or
 * http on loopback, so a setting can't send the key in the clear elsewhere.
 */
export function agentPhoneBase() {
  const v = process.env.BOPS_AGENTPHONE_BASE?.trim();
  if (!v) return DEFAULT_BASE;
  try {
    const u = new URL(v);
    const loop = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
    if (u.protocol === "https:" || (u.protocol === "http:" && loop)) return v.replace(/\/+$/, "");
  } catch {}
  return DEFAULT_BASE;
}

/* ---------------- The API ---------------- */

export type AgentPhoneAnswer<T> = { ok: boolean; status: number; json: T };
type Answer<T> = AgentPhoneAnswer<T>;
export async function agentPhoneReq<T>(method: string, path: string, body?: unknown, key = process.env.AGENTPHONE_API_KEY, fetcher: typeof fetch = fetch): Promise<Answer<T>> {
  const res = await fetcher(`${agentPhoneBase()}/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key ?? ""}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, json };
}

/** AgentPhone's own words in an error body (only matched against, never shown). */
const saidIn = (j: unknown) => {
  const o = (j ?? {}) as { detail?: unknown; error?: unknown; message?: unknown };
  const pick = (x: unknown): string => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { message?: unknown }).message === "string" ? String((x as { message: string }).message) : "");
  return [pick(o.detail), pick(o.error), pick(o.message)].join(" ");
};

/** A refusal in Bops' plain words, for a call or a text. Never AgentPhone's own text. */
export function refusalWords(kind: "call" | "text", status: number, body: unknown): string {
  const said = saidIn(body);
  if (status === 402) return FUNDS_WORDS;
  if (status === 403 && kind === "text" && /10\s*DLC|register/i.test(said)) return TEN_DLC_WORDS;
  if (status === 401 || (status === 403 && /key|auth|token/i.test(said))) return "AgentPhone turned the key down. Copy it again from AgentPhone and save it in Settings, Services.";
  if (status === 403) return kind === "text" ? "AgentPhone won't send texts to that number (some destinations are blocked)." : "AgentPhone won't call that number (some destinations are blocked).";
  if (status === 409 || status === 429) return `AgentPhone is busy with other ${kind === "call" ? "calls" : "texts"} right now. Try again in a minute.`;
  if (status === 404) return "AgentPhone couldn't find the agent or number to use. Press Check in Settings, Services to look again.";
  if (status === 400 || status === 422) return kind === "call" ? "AgentPhone didn't accept that call. Check the number is a full one, like +1 555 010 2000." : "AgentPhone didn't accept that text. Check the number is a full one, like +1 555 010 2000.";
  return `AgentPhone didn't take the ${kind} just now. Try again in a little while.`;
}

type ApAgent = { id: string; name?: string; description?: string | null };
type ApNumber = { id: string; phoneNumber: string; agentId?: string | null; outboundSms?: string | null; status?: string };
const list = <T>(j: unknown): T[] => {
  const o = j as { data?: unknown } | unknown[];
  return Array.isArray(o) ? (o as T[]) : Array.isArray((o as { data?: unknown })?.data) ? ((o as { data: T[] }).data) : [];
};

export type LinePick = { agent: ApAgent; number: ApNumber | null } | { problem: string };

/**
 * The agent and number to use: the only agent (or the only one with a number, else the only one not made by Bops),
 * and the number attached to it (or the only number). Two or more that fit equally: says so, never guesses.
 */
export function pickLine(agents: ApAgent[], numbers: ApNumber[]): LinePick {
  if (!agents.length) return { problem: "Your AgentPhone account has no agent yet. Make one on agentphone.ai, then try again." };
  let pool = agents;
  if (pool.length > 1) {
    const withNumber = pool.filter((a) => numbers.some((n) => n.agentId === a.id));
    if (withNumber.length >= 1) pool = withNumber;
  }
  if (pool.length > 1) {
    const notBops = pool.filter((a) => !/^bops-/.test(a.description ?? ""));
    if (notBops.length >= 1) pool = notBops;
  }
  if (pool.length > 1) return { problem: `Your AgentPhone account has ${pool.length} agents with numbers (${pool.map((a) => a.name ?? a.id).slice(0, 4).join(", ")}), so Bops can't pick one by itself yet. Keep one agent with a number for Bops to use.` };
  const agent = pool[0];
  const own = numbers.filter((n) => n.agentId === agent.id);
  const number = own[0] ?? (numbers.length === 1 ? numbers[0] : null);
  return { agent, number };
}

/** Read the account (two reads, nothing placed or sent), note how it stands for Settings, and pick the line. */
export async function probeAccount(key = process.env.AGENTPHONE_API_KEY, fetcher: typeof fetch = fetch): Promise<{ pick: LinePick; probe: AgentPhoneProbe }> {
  const at = Date.now();
  const fail = (problem: string) => {
    const probe: AgentPhoneProbe = { at, number: null, numbers: 0, agents: 0, agent: null, outboundSms: null, problem };
    noteProbe(probe);
    return { pick: { problem } as LinePick, probe };
  };
  let nums: Answer<unknown>, ags: Answer<unknown>;
  try {
    [nums, ags] = await Promise.all([agentPhoneReq("GET", "/numbers?limit=100", undefined, key, fetcher), agentPhoneReq("GET", "/agents?limit=100", undefined, key, fetcher)]);
  } catch {
    return fail("Couldn't reach AgentPhone just now. Check this PC is online, then try again.");
  }
  if (nums.status === 401 || ags.status === 401 || nums.status === 403 || ags.status === 403) return fail("AgentPhone turned the key down. Copy it again from AgentPhone and save it here.");
  if (!nums.ok || !ags.ok) return fail("AgentPhone didn't answer just now. Try Check again later.");
  const numbers = list<ApNumber>(nums.json).filter((n) => n && typeof n.id === "string" && typeof n.phoneNumber === "string");
  const agents = list<ApAgent>(ags.json).filter((a) => a && typeof a.id === "string");
  const pick = pickLine(agents, numbers);
  const n = "agent" in pick ? pick.number : null;
  const sms = n?.outboundSms;
  const probe: AgentPhoneProbe = {
    at,
    number: n ? pretty(n.phoneNumber) : null,
    numbers: numbers.length,
    agents: agents.length,
    agent: "agent" in pick ? (pick.agent.name ?? "Your agent") : null,
    outboundSms: sms === "enabled" || sms === "activating" || sms === "registration_required" ? sms : null,
    ...("problem" in pick ? { problem: pick.problem } : !n ? { problem: "Your AgentPhone agent has no number yet. Add one on agentphone.ai, then press Check." } : {}),
  };
  noteProbe(probe);
  return { pick, probe };
}


/**
 * How the user's own AgentPhone account stands for calls and texts Bops places for them (agentphone-outbound.ts), in
 * one small place both the chat tools and Settings, Services read. Nothing here places a call or sends a text: it only
 * keeps what the last read-only probe (GET /v1/numbers and /v1/agents, on Check) and the last real call or text said.
 *
 * Funds: AgentPhone has no read-only balance (its skills.md: "/v1/usage reports activity counts, not dollar costs";
 * the balance lives on its dashboard's Billing page), so a key that works says "funds not checked", never "ready".
 * The last real call's outcome is kept on disk (.data/agentphone-calls.json, with a hash of the key it was for, never
 * the key): after a 402, calls show "need funds" until a call goes through, across restarts. Probes and texts are in
 * this server's memory only (the next Check says again).
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BotNumber } from "../bot-number";
import { cloudOn } from "./cloud";
import { dataRoot } from "./user-paths";

export type CallsReady = "funds not checked" | "needs funds" | "working" | "unknown";
export type TextsReady = "enabled" | "activating" | "registration needed" | "working" | "unknown";

/** The plain words for each state, the same in the chat and in Settings. Never AgentPhone's own words. */
export const FUNDS_WORDS = "Add funds in AgentPhone → Billing to make calls.";
/** Settings, Services after a 402, until a call goes through. */
export const NEEDS_FUNDS_WORDS = "Calls need funds: add funds in AgentPhone → Billing.";
/** Settings, Services with a key that works: AgentPhone can't be asked about money without a call. */
export const FUNDS_NOT_CHECKED_WORDS = "Key works; funds not checked. If a call fails, add funds in AgentPhone → Billing.";
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

type CallsSeen = { state: CallsReady; at: number };
type Seen = { probe?: AgentPhoneProbe; calls?: CallsSeen; texts?: { state: TextsReady; at: number } };
const g = globalThis as unknown as { bopsAgentPhoneStatus?: Seen };
const seen: Seen = (g.bopsAgentPhoneStatus ??= {});

/** The last real call's outcome, on disk: { state, at, key: a hash of the key it was for }. */
const callsFile = () => join(dataRoot(), "agentphone-calls.json");
const keyHash = (key = process.env.AGENTPHONE_API_KEY) => (key ? createHash("sha256").update(key).digest("hex").slice(0, 16) : "");
function lastCall(): CallsSeen | undefined {
  // Read each time (a few bytes, only for Settings, Services): what the last call said, even from before a restart.
  try {
    const j = JSON.parse(readFileSync(callsFile(), "utf8")) as { state?: unknown; at?: unknown; key?: unknown };
    // Only for the key Bops runs with now: a new key (another account) starts again.
    return (j.state === "needs funds" || j.state === "working") && typeof j.at === "number" && j.key === keyHash() ? { state: j.state, at: j.at } : undefined;
  } catch {
    // No file (no call yet, or it couldn't be written): this server's memory.
    return seen.calls;
  }
}

export const noteProbe = (p: AgentPhoneProbe) => void (seen.probe = p);
/** A real call's outcome: a 402 ("needs funds") or one that went ("working"). Kept until the next real call. */
export const noteCalls = (state: CallsReady) => {
  seen.calls = { state, at: Date.now() };
  // Owner-only and whole (a temp file, then renamed over it), as the other .data files are written.
  const file = callsFile();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    mkdirSync(/*turbopackIgnore: true*/ dataRoot(), { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify({ state, at: seen.calls.at, key: keyHash() }), { mode: 0o600 });
    renameSync(/*turbopackIgnore: true*/ tmp, file);
  } catch {
  } finally {
    rmSync(/*turbopackIgnore: true*/ tmp, { force: true });
  }
};
export const noteTexts = (state: TextsReady) => void (seen.texts = { state, at: Date.now() });
export const lastProbe = () => seen.probe;

/** For tests: forget everything (the call outcome on disk too). */
export const forgetAgentPhoneStatus = () => {
  delete seen.probe;
  delete seen.calls;
  delete seen.texts;
  try {
    rmSync(callsFile(), { force: true });
  } catch {}
};

/**
 * The user's own AgentPhone number, found with the key Bops runs with (local mode only: Bops Cloud's numbers are its
 * own), as +1 (555) 010-2000; null when there's no key or the last probe found none. Reads nothing new.
 */
export function ownAgentPhoneNumber(): string | null {
  if (cloudOn() || !process.env.AGENTPHONE_API_KEY?.trim()) return null;
  const p = seen.probe;
  return p && !p.problem && p.number ? p.number : null;
}

/** The read-only probe again if it's older than five minutes (or never ran): GET /v1/numbers and /v1/agents only. */
export async function probeIfStale(key = process.env.AGENTPHONE_API_KEY?.trim(), fetcher: typeof fetch = fetch) {
  if (!key || cloudOn()) return;
  const p = seen.probe;
  if (!p || Date.now() - p.at > 5 * 60_000) await probeAccount(key, fetcher).catch(() => null);
}

export type AgentPhoneView = {
  /** The key as Settings shows it ("ends in P1a2"), never more. */
  key: string;
  /** The number the AgentPhone account calls and texts from (the probe's). */
  number: string | null;
  agent: string | null;
  /** The bot's number, as every other screen shows it (lib/bot-number.ts), when services.ts has it. */
  botNumber?: BotNumber | null;
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
 * said on top. A 402 means calls need funds whatever the probe saw, until a call goes through; a key that works with a
 * number and an agent says funds weren't checked (AgentPhone has no balance to read), never "ready".
 */
export function agentPhoneView(key: string): AgentPhoneView {
  const p = seen.probe;
  const found = !!p && !p.problem && !!p.number && !!p.agent;
  const call = lastCall();
  const calls: CallsReady = call?.state === "needs funds" || call?.state === "working" ? call.state : found ? "funds not checked" : "unknown";
  const fromProbe: TextsReady = !p?.outboundSms ? "unknown" : p.outboundSms === "enabled" ? "enabled" : p.outboundSms === "activating" ? "activating" : "registration needed";
  // The newer of the probe and the last text says how texting stands.
  const texts: TextsReady = seen.texts && (!p || seen.texts.at >= p.at) ? seen.texts.state : fromProbe;
  const callsWords =
    calls === "needs funds"
      ? NEEDS_FUNDS_WORDS
      : calls === "working"
        ? "Calls work: the last one went through. Bops asks you before every call."
        : calls === "funds not checked"
          ? FUNDS_NOT_CHECKED_WORDS
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
export function pickLine(agents: ApAgent[], numbers: ApNumber[], from?: string | null): LinePick {
  if (!agents.length) return { problem: "Your AgentPhone account has no agent yet. Make one on agentphone.ai, then try again." };
  // A number asked for by name: it, and the agent it's attached to.
  // Exactly one of theirs, whole (country code optional for a US number): never a partial match, never ignored.
  if (from != null && from.trim()) {
    const full = (x: string) => {
      const d = x.replace(/\D/g, "");
      return d.length === 10 ? `1${d}` : d;
    };
    const n = full(from).length >= 11 ? numbers.find((x) => full(x.phoneNumber) === full(from)) : undefined;
    if (!n) return { problem: `"${from.trim().slice(0, 30)}" isn't one of your AgentPhone numbers. Use one of these, in full: ${numbers.map((x) => pretty(x.phoneNumber)).slice(0, 6).join(", ") || "none yet"}.` };
    const agent = agents.find((a) => a.id === n.agentId) ?? (agents.length === 1 ? agents[0] : undefined);
    return agent ? { agent, number: n } : { problem: `${pretty(n.phoneNumber)} isn't attached to an agent yet. Attach it to one on agentphone.ai, then try again.` };
  }
  const withNumber = agents.filter((a) => numbers.some((n) => n.agentId === a.id));
  let pool = agents;
  if (withNumber.length) pool = withNumber;
  else if (agents.length > 1)
    return { problem: `None of your ${agents.length} AgentPhone agents has a number yet. Attach a number to the one Bops should use on agentphone.ai, then try again.` };
  if (pool.length > 1) {
    const notBops = pool.filter((a) => !/^bops-/.test(a.description ?? ""));
    if (notBops.length >= 1) pool = notBops;
  }
  if (pool.length > 1) return { problem: `Your AgentPhone account has ${pool.length} agents with numbers (${pool.map((a) => a.name ?? a.id).slice(0, 4).join(", ")}). Say which number to use: ${numbers.filter((n) => pool.some((a) => a.id === n.agentId)).map((n) => pretty(n.phoneNumber)).slice(0, 6).join(", ")}.` };
  const agent = pool[0];
  const own = numbers.filter((n) => n.agentId === agent.id);
  if (own.length > 1) return { problem: `Your AgentPhone agent "${agent.name ?? agent.id}" has ${own.length} numbers. Say which one to use: ${own.map((n) => pretty(n.phoneNumber)).slice(0, 6).join(", ")}.` };
  const number = own[0] ?? (numbers.length === 1 ? numbers[0] : null);
  return { agent, number };
}

/** Read the account (two reads, nothing placed or sent), note how it stands for Settings, and pick the line. */
export async function probeAccount(key = process.env.AGENTPHONE_API_KEY, fetcher: typeof fetch = fetch, from?: string | null): Promise<{ pick: LinePick; probe: AgentPhoneProbe }> {
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
  const pick = pickLine(agents, numbers, from);
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


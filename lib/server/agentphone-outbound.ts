import "server-only";
import { cloudOn } from "./cloud";
import { NeedsOk, type AskSpec } from "./permission";
import { ownerPhone, prettyPhone } from "./phone";
import { addMessage, bot, ownerName } from "./store";
import { toE164 } from "./verify";
import { botChatId } from "@/lib/types";
import { agentPhoneReq as req, noteCalls, noteTexts, probeAccount, refusalWords, TEN_DLC_WORDS, type AgentPhoneAnswer as Answer } from "./agentphone-status";

/**
 * Calls and texts a bot places for the user through their OWN AgentPhone account (AGENTPHONE_API_KEY in .env.local,
 * no Bops Cloud): "call me at +1… and tell me X", "text Dana that I'm late". Two chat tools, place_call and send_text,
 * on the owner's own turns in the Bops app only (never a member's, a channel's, a text's, an email's, a routine's or a
 * call's). Each asks the owner first, every time (NeedsOk, onceOnly: no Always allow), showing who, from which number
 * and exactly what is said or sent. Nothing goes out without that yes.
 *
 * The account's agent and number are found by a read (GET /v1/agents, GET /v1/numbers) and picked by themselves when
 * there's only one. A call: POST /v1/calls (camelCase: agentId, toNumber, fromNumberId, systemPrompt, initialGreeting),
 * so AgentPhone's hosted model runs it with the purpose as its prompt; Bops then polls GET /v1/calls/{id} and posts
 * how it ended, with the transcript, in the chat. A text: POST /v1/messages (snake_case: to_number, body, agent_id,
 * number_id). AgentPhone's refusals become plain words (402: funds; 403 with 10DLC: registration), never its own.
 */

/** Whether this Bops places calls and texts through the user's own key: self-hosted with it set, not on Bops Cloud. */
export const outboundOn = () => !cloudOn() && !!process.env.AGENTPHONE_API_KEY?.trim();

/** Whether a turn gets the tools: the owner's own, in the app; never someone else's, a routine's or a phone call's. */
export const outboundForTurn = (t: { outside?: boolean; member?: unknown; relayed?: boolean; background?: unknown; call?: boolean }) =>
  outboundOn() && !t.outside && !t.member && !t.relayed && !t.background && !t.call;

export const CALL_TOOL = "place_call";
export const TEXT_TOOL = "send_text";
export const isOutboundTool = (name: string) => name === CALL_TOOL || name === TEXT_TOOL;
const MAX_TEXT = 1500;
const MAX_PURPOSE = 2000;

/* ---------------- The tools ---------------- */

const toArg = (a: Record<string, unknown>) => (typeof a.to === "string" ? a.to.trim() : "");
/** Who to reach: a full number, or (none given, "me") the owner's own verified number. */
function whom(a: Record<string, unknown>): { to: string } | { problem: string } {
  const raw = toArg(a);
  if (!raw || /^(me|myself|my phone|my number)$/i.test(raw)) {
    const mine = ownerPhone();
    return mine ? { to: mine } : { problem: `Say the number to use, like +1 555 010 2000: ${ownerName()} has no verified mobile number in Settings yet.` };
  }
  const e164 = toE164(raw);
  return e164 ? { to: e164 } : { problem: `"${raw.slice(0, 30)}" isn't a full phone number. Use one like +1 555 010 2000.` };
}

export function outboundChatTools() {
  if (!outboundOn()) return [];
  const owner = ownerName();
  return [
    {
      type: "function" as const,
      name: CALL_TOOL,
      description: `Place a phone call for ${owner} from their own AgentPhone number. An AI voice on the call says what you put in purpose, then talks with whoever answers. ${owner} is asked first, every time, and sees the number and the script. Use it when ${owner} asks you to call someone ("call me at +1… and tell me X"). It only starts the call: how it went comes back in the chat when it ends. Never say a call happened unless this tool said it started.`,
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          to: { type: ["string", "null"], description: `The number to call, in full (+15550102000). Null for ${owner}'s own mobile number.` },
          purpose: { type: "string", maxLength: MAX_PURPOSE, description: "What the call is for and what to say, in full: the caller follows it. Plain words." },
          from: { type: ["string", "null"], description: `Which of ${owner}'s AgentPhone numbers to use, in full. Null to let Bops pick (it does when there's one, and says which there are when there are more).` },
          greeting: { type: ["string", "null"], description: `The first words said when they answer, short ("Hi, this is Boppy calling for ${owner}."). Null for a default.` },
        },
        required: ["to", "purpose", "from", "greeting"],
      },
    },
    {
      type: "function" as const,
      name: TEXT_TOOL,
      description: `Send a text message (SMS) from ${owner}'s own AgentPhone number to any number. ${owner} is asked first, every time, and sees the number and the text. Use it when ${owner} asks you to text someone, or to text them at a number they give. Never say a text was sent unless this tool said it was.`,
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          to: { type: ["string", "null"], description: `The number to text, in full (+15550102000). Null for ${owner}'s own mobile number.` },
          text: { type: "string", maxLength: MAX_TEXT, description: "The text, short and plain: no markdown." },
          from: { type: ["string", "null"], description: `Which of ${owner}'s AgentPhone numbers to use, in full. Null to let Bops pick (it does when there's one, and says which there are when there are more).` },
        },
        required: ["to", "text", "from"],
      },
    },
  ];
}

/** The script the hosted model runs the call with. */
function systemPromptFor(botName: string, owner: string, purpose: string) {
  return [
    `You are ${botName}, an assistant placing a phone call on behalf of ${owner}.`,
    `What this call is for, and what to say: ${purpose}`,
    "Speak naturally and briefly. Say who you are and who you're calling for. Deliver the message, answer simple questions about it, and don't make promises or share anything beyond it. When it's done, say a short goodbye and end the call.",
  ].join("\n\n");
}

/** What each tool's yes card shows: exactly what goes. */
function askOf(kind: "call" | "text", to: string, from: string | null, words: string, greeting?: string): AskSpec {
  const via = from ? ` from ${prettyPhone(from)}` : "";
  return kind === "call"
    ? { action: `Call ${prettyPhone(to)}${via}`, resources: [prettyPhone(to)], preview: `${greeting ? `First words: ${greeting}\n\n` : ""}What the call is for: ${words}`, kind: "app", onceOnly: true }
    : { action: `Text ${prettyPhone(to)}${via}`, resources: [prettyPhone(to)], preview: words, kind: "app", onceOnly: true };
}

/** `said`: the line the chat shows once it went (never the model's words). */
export type OutboundResult = { ok: boolean; text: string; said?: string; callId?: string };

/**
 * Run place_call or send_text. Asks first (NeedsOk) unless `approved`: the owner said yes to this very call. What it
 * returns starts "Failed:" unless AgentPhone said it took it.
 */
export async function runOutboundTool(botId: string, name: string, args: Record<string, unknown>, opts: { approved?: boolean; chatId?: string } = {}): Promise<OutboundResult> {
  const b = bot(botId);
  if (!b) return { ok: false, text: "Failed: no such bot." };
  if (!outboundOn()) return { ok: false, text: "Failed: AgentPhone isn't set up on this PC. Add the key in Settings, Services." };
  const who = whom(args);
  if ("problem" in who) return { ok: false, text: `Failed: ${who.problem}` };
  const kind = name === CALL_TOOL ? "call" : "text";
  const words = String((kind === "call" ? args.purpose : args.text) ?? "").trim();
  if (!words) return { ok: false, text: kind === "call" ? "Failed: say what the call is for (purpose)." : "Failed: give the text to send." };
  if (words.length > (kind === "call" ? MAX_PURPOSE : MAX_TEXT)) return { ok: false, text: `Failed: that's too long. Keep it under ${kind === "call" ? MAX_PURPOSE : MAX_TEXT} characters.` };
  const owner = ownerName();
  const greeting = kind === "call" ? (typeof args.greeting === "string" && args.greeting.trim() ? args.greeting.trim().slice(0, 300) : `Hi, this is ${b.name}, calling for ${owner}.`) : undefined;
  // Ask before anything else reaches AgentPhone (the read that picks the line comes after the yes).
  const asked = typeof args.from === "string" && args.from.trim() ? args.from.trim() : null;
  if (!opts.approved) throw new NeedsOk(askOf(kind, who.to, asked, words, greeting));
  const { pick } = await probeAccount(undefined, fetch, asked);
  if ("problem" in pick) return { ok: false, text: `Failed: ${pick.problem}` };
  if (!pick.number) return { ok: false, text: "Failed: your AgentPhone agent has no number yet. Add one on agentphone.ai, then try again." };
  const fromPretty = prettyPhone(pick.number.phoneNumber);
  let r: Answer<{ id?: string; status?: string }>;
  try {
    r =
      kind === "call"
        ? await req("POST", "/calls", { agentId: pick.agent.id, toNumber: who.to, fromNumberId: pick.number.id, systemPrompt: systemPromptFor(b.name, owner, words), initialGreeting: greeting })
        : await req("POST", "/messages", { to_number: who.to, body: words, agent_id: pick.agent.id, number_id: pick.number.id });
  } catch {
    return { ok: false, text: `Failed: couldn't reach AgentPhone, so nothing was ${kind === "call" ? "called" : "sent"}. Check this PC is online, then try again.` };
  }
  if (!r.ok) {
    const why = refusalWords(kind, r.status, r.json);
    if (r.status === 402 && kind === "call") noteCalls("needs funds");
    if (why === TEN_DLC_WORDS) noteTexts("registration needed");
    return { ok: false, text: `Failed: nothing was ${kind === "call" ? "called" : "sent"}. ${why}` };
  }
  if (kind === "text") {
    noteTexts("working");
    return { ok: true, said: `Texted ${prettyPhone(who.to)} from ${fromPretty}`, text: `Sent the text to ${prettyPhone(who.to)} from ${fromPretty}.` };
  }
  noteCalls("working");
  const callId = typeof r.json.id === "string" ? r.json.id : undefined;
  if (callId && opts.chatId) void followCall(botId, opts.chatId, callId, who.to);
  return {
    ok: true,
    callId,
    said: `Started a call to ${prettyPhone(who.to)} from ${fromPretty}`,
    text: `The call to ${prettyPhone(who.to)} from ${fromPretty} has started (it's ringing now). It hasn't been answered yet: don't say what was said or that it went well. How it ends, with what was said, shows in this chat when it's over.`,
  };
}

/* ---------------- After a call starts ---------------- */

type Turn = { role?: string; content?: string; text?: string };
const g = globalThis as unknown as { bopsCallPoll?: { everyMs: number; forMs: number } };
/** How often and how long a call is looked at (tests make it quick). */
const poll = () => g.bopsCallPoll ?? { everyMs: 5000, forMs: 15 * 60_000 };

/** The transcript, as lines a person reads ("Them: …", "Boppy: …"), at most 40 turns. */
export function transcriptLines(t: unknown, botName: string): string[] {
  if (typeof t === "string") return t.trim() ? [t.trim().slice(0, 4000)] : [];
  if (!Array.isArray(t)) return [];
  return (t as Turn[])
    .map((x) => ({ who: x.role === "agent" || x.role === "assistant" ? botName : "Them", text: String(x.content ?? x.text ?? "").trim() }))
    .filter((x) => x.text)
    .slice(-40)
    .map((x) => `${x.who}: ${x.text.slice(0, 500)}`);
}

/** Look at a started call until it ends, then say in the chat how it went: completed with the transcript, or failed. */
export async function followCall(botId: string, chatId: string, callId: string, to: string) {
  const b = bot(botId);
  const name = b?.name ?? "The bot";
  const { everyMs, forMs } = poll();
  const until = Date.now() + forMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, everyMs));
    let r: Answer<{ status?: string; transcript?: unknown; endedReason?: string }>;
    try {
      r = await req("GET", `/calls/${encodeURIComponent(callId)}`);
    } catch {
      continue;
    }
    if (!r.ok) continue;
    // "no_answer", "no-answer" and "No Answer" alike.
    const status = String(r.json.status ?? "").toLowerCase().replace(/[\s_]+/g, "-");
    if (status === "completed" || status === "ended") {
      let lines = transcriptLines(r.json.transcript, name);
      if (!lines.length) {
        const t = await req<{ transcript?: unknown }>("GET", `/calls/${encodeURIComponent(callId)}/transcript`).catch(() => null);
        if (t?.ok) lines = transcriptLines(t.json.transcript, name);
      }
      addMessage({ chatId, role: "system", text: `Call to ${prettyPhone(to)} completed.${lines.length ? `\n\nWhat was said:\n${lines.join("\n")}` : " No transcript came back."}` });
      return;
    }
    if (["failed", "no-answer", "busy", "canceled", "cancelled", "rejected", "voicemail"].includes(status)) {
      addMessage({ chatId, role: "system", text: `Call to ${prettyPhone(to)} didn't go through (${status === "failed" ? "it failed" : status.replace(/-/g, " ")}).` });
      return;
    }
  }
  addMessage({ chatId: chatId || botChatId(botId), role: "system", text: `Call to ${prettyPhone(to)}: Bops stopped watching it before it ended. See how it went in AgentPhone.` });
}

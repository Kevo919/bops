"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { MAX_BOT_DOC_CHARS, waitsForOk, workspaceOf, type AppState, type Bot, type Session } from "@/lib/types";
import { entryOf, teamIn } from "@/lib/chain";
import { MEMORY_FILE, renderMemoryDoc, renderSoul, SOUL_FILE } from "@/lib/bot-docs";
import { MemorySheet } from "./memory-sheet";
import { ago, memberAnswers, post, quietNothing, StatusIcon, useSelfHosted } from "./ui";
import { OpenSettings } from "./open-settings";
import { you } from "@/lib/shared";

type Fact = { id: string; text: string; private: boolean; at?: number; source?: string };
type Data = { workspace: string; ws: string; own?: boolean; card: Fact[]; facts: Fact[]; error?: string; unreachable?: boolean; off?: boolean };
/** The bot whose own memory the tab shows (it keeps its memory to itself: lib/chain.ts), so a change goes to its own bank. */
const OwnMemoryOf = createContext<string | undefined>(undefined);
/** Each bot's Memory tab as last loaded, so opening it again is instant (then it refreshes). */
const seen = new Map<string, Data>();

type Answer = { answer: string; based: { id: string; text: string; source: string }[] };

/**
 * A bot's Memory tab, as one quiet page: a box to search or ask, then what it knows about the user
 * (their card, as a contact card), what it learned lately, and its recent work. Click anything to fix,
 * pin or delete it. Memory belongs to the workspace, so the whole team shares it (Manage, at the end).
 */
export function BotMemory({ state, bot: b, onOpenThread }: { state: AppState; bot: Bot; onOpenThread: (s: Session) => void }) {
  const selfHosted = useSelfHosted();
  const openSettings = useContext(OpenSettings);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  // What the tab showed last time for this bot shows at once; the fresh copy replaces it when it lands.
  const [data, setData] = useState<Data | null>(() => seen.get(b.id) ?? null);
  // Another bot's profile: its own last copy (or nothing), never the previous bot's.
  const [dataFor, setDataFor] = useState(b.id);
  if (dataFor !== b.id) {
    setDataFor(b.id);
    setData(seen.get(b.id) ?? null);
  }
  const [results, setResults] = useState<Fact[] | null>(null);
  const [mine, setMine] = useState(false);
  const [tick, setTick] = useState(0);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<(Answer & { question: string }) | null>(null);
  const [manage, setManage] = useState(false);
  // Edit: the bot's SOUL.md and MEMORY.md (the owner's own: not with someone else's workspace open).
  const [view, setView] = useState<"memory" | "edit">("memory");
  const editing = view === "edit" && !state.shared;
  const [allLearned, setAllLearned] = useState(false);
  const [allWork, setAllWork] = useState(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  // The page: the card and the newest facts (or just what this bot learned).
  useEffect(() => {
    let gone = false;
    void fetch(`/api/memory?${new URLSearchParams({ bot: b.id, ...(mine ? { mine: "1" } : {}) })}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Data) => {
        if (!mine && !j.error) seen.set(b.id, j);
        if (!gone) setData(j);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [b.id, mine, tick]);
  // A search: facts that match.
  useEffect(() => {
    if (!query) return;
    let gone = false;
    void fetch(`/api/memory?${new URLSearchParams({ bot: b.id, q: query })}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Data) => !gone && setResults(j.facts ?? []))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [b.id, query, tick]);

  const ask = async () => {
    const question = q.trim();
    if (!question || asking) return;
    setAsking(true);
    setAnswer(null);
    const r = (await (await post("/api/memory", { action: "ask", bot: b.id, question })).json()) as Answer;
    setAsking(false);
    setAnswer({ ...r, question });
  };

  const searching = !!q.trim();
  const done = state.sessions.filter((s) => s.botId === b.id && (s.answer || s.status === "done") && !quietNothing(s)).reverse();
  const learned = data?.facts ?? [];

  return (
    <OwnMemoryOf.Provider value={data?.own ? b.id : undefined}>
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 pb-6">
      {!state.shared && (
        <div role="tablist" aria-label="Memory views" className="flex gap-0.5 self-start rounded-full bg-[#F2F2F0] p-0.5 text-[12.5px] leading-4">
          {(["memory", "edit"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? "bg-white font-medium text-ink shadow-[0_0_0_1px_#0000000F]" : "text-[#6B6B6B] hover:text-ink"}`}>
              {v === "memory" ? "Memory" : "Edit"}
            </button>
          ))}
        </div>
      )}
      {editing ? (
        <BotDocs state={state} bot={b} pinned={(data?.card ?? []).map((l) => l.text)} />
      ) : data?.off ? (
        <div data-memory-off className="flex flex-col gap-1.5 rounded-[18px] bg-[#F7F7F6] px-5 py-4 text-[13.5px] leading-5">
          <span className="font-medium">Memory isn&apos;t set up on this computer yet.</span>
          <span className="text-[#6B6B6B]">
            So {b.name} doesn&apos;t learn about you from your chats on its own.{" "}
            {state.shared
              ? "The workspace's owner can turn it on."
              : selfHosted
                ? "To turn it on, paste a Honcho key in Settings, Services, then restart Bops. Until then, use Edit to write down what it should remember."
                : "Bops Cloud runs memory for you while you're signed in with Orgo, and it isn't on for your account right now. Until then, use Edit to write down what it should remember."}
          </span>
          {selfHosted && !state.shared && openSettings && (
            <button data-open-service="memory" onClick={() => openSettings("services", { service: "memory" })} className="self-start rounded-full bg-paper px-3 py-1.5 text-[12.5px] font-medium leading-4 shadow-[0_0_0_1px_var(--color-rule)] hover:bg-desk">
              Add a Honcho key
            </button>
          )}
        </div>
      ) : (
      <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
        className="flex items-center gap-2 rounded-full bg-[#F7F7F6] py-1 pl-3.5 pr-1 focus-within:bg-white focus-within:shadow-[inset_0_0_0_1.5px_#0A0A0A]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0 text-[#9A9A98]" aria-hidden>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) {
              setAnswer(null);
              setResults(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Esc empties the search first; once it's empty, Esc leaves the profile.
            if (q || answer || results) e.preventDefault();
            setQ("");
            setAnswer(null);
            setResults(null);
          }}
          placeholder={`Ask ${b.name} what it knows about ${you(state)}`}
          className="h-8 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#9A9A98]"
        />
        {searching && (
          <button disabled={asking} className="h-7 shrink-0 rounded-full bg-[#0A0A0A] px-3 text-[12.5px] font-medium text-white disabled:opacity-50">
            {asking ? "Thinking…" : "Ask"}
          </button>
        )}
      </form>

      {searching ? (
        <div className="-mt-3 flex flex-col gap-6">
          {(asking || answer) && (
            <div className="flex flex-col gap-3 rounded-[18px] bg-[#F7F7F6] px-5 py-4">
              {asking ? (
                <div className="text-[13.5px] text-[#9A9A98]">Thinking back…</div>
              ) : (
                answer && (
                  <>
                    <div className="whitespace-pre-wrap text-[14.5px] leading-[22px]">
                      <Bold text={answer.answer} />
                    </div>
                    {answer.based.length > 0 && (
                      <div className="flex flex-col gap-1.5 border-t border-black/[0.06] pt-3">
                        {answer.based.map((f) => (
                          <div key={f.id} className="flex items-baseline gap-3 text-[12.5px] leading-[18px] text-[#6B6B6B]">
                            <span className="min-w-0 flex-1">{sentence(f.text)}</span>
                            <span className="shrink-0 text-[#9A9A98]">{f.source}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          )}
          <Section title="Matches">
            {!results ? (
              <Quiet>Looking…</Quiet>
            ) : results.length ? (
              <FactList ws={data?.ws ?? ""} facts={results} onChange={reload} />
            ) : (
              <Quiet>Nothing learned matches. Press Ask to have {b.name} think it through.</Quiet>
            )}
          </Section>
        </div>
      ) : !data ? (
        <Quiet>Loading…</Quiet>
      ) : data.unreachable ? (
        <Quiet>Can&rsquo;t reach the memory service right now. It&rsquo;s set up, but it didn&rsquo;t answer &mdash; try again in a moment.</Quiet>
      ) : data.error ? (
        <Quiet>{data.error}</Quiet>
      ) : (
        <>
          <Section title="About you">{data.card.length ? <ContactCard ws={data.ws} lines={data.card} onChange={reload} /> : <Quiet>Nothing yet. Tell {b.name} about yourself, or pin what it learns.</Quiet>}</Section>

          <Section
            title="Recently learned"
            right={
              <div className="flex gap-0.5 rounded-full bg-[#F2F2F0] p-0.5 text-[12px] leading-4">
                {[false, true].map((m) => (
                  <button key={String(m)} onClick={() => setMine(m)} className={`rounded-full px-2.5 py-1 ${mine === m ? "bg-white font-medium text-ink shadow-[0_0_0_1px_#0000000F]" : "text-[#6B6B6B] hover:text-ink"}`}>
                    {m ? `From ${b.name}` : "All"}
                  </button>
                ))}
              </div>
            }
          >
            {learned.length ? (
              <>
                <FactList ws={data.ws} facts={allLearned ? learned : learned.slice(0, 5)} onChange={reload} pinnable />
                {learned.length > 5 && <More open={allLearned} onClick={() => setAllLearned((x) => !x)} count={learned.length} />}
              </>
            ) : (
              <Quiet>{mine ? `${b.name} hasn't learned anything about you yet.` : "Nothing yet. It fills in as you talk."}</Quiet>
            )}
          </Section>

          <Section title="Recent work">
            {done.length ? (
              <>
                <div className="flex flex-col">
                  {(allWork ? done : done.slice(0, 3)).map((s) => (
                    <button key={s.id} onClick={() => onOpenThread(s)} className="-mx-2.5 flex items-start gap-2.5 rounded-[12px] px-2.5 py-2 text-left hover:bg-[#F7F7F6]">
                      <span className="mt-0.5">
                        <StatusIcon session={s} owner={!!state.shared && !memberAnswers(state, s)} member={memberAnswers(state, s)} okWait={waitsForOk(s, state)} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-5">{s.title}</span>
                          <span className="shrink-0 text-[12px] text-[#9A9A98]">{ago(s.endedAt ?? s.createdAt)}</span>
                        </span>
                        {s.answer && <span className="line-clamp-1 text-[13px] leading-[18px] text-[#6B6B6B]">{s.answer.replace(/\*\*|\[|\]\([^)]*\)/g, "")}</span>}
                      </span>
                    </button>
                  ))}
                </div>
                {done.length > 3 && <More open={allWork} onClick={() => setAllWork((x) => !x)} count={done.length} />}
              </>
            ) : (
              <Quiet>What {b.name} finds and makes will collect here.</Quiet>
            )}
          </Section>

          {data.own ? (
            <div className="text-center text-[12px] leading-4 text-[#9A9A98]">{b.name} keeps its memory to itself: only it reads this.</div>
          ) : (
            <div className="text-center text-[12px] leading-4 text-[#9A9A98]">
              Everyone on the {data.workspace} team shares this memory.{" "}
              {!manage && (
                <button onClick={() => setManage(true)} aria-expanded={manage} className="font-medium text-[#6B6B6B] underline decoration-[#D9D9D6] underline-offset-2 hover:text-ink">
                  Manage
                </button>
              )}
            </div>
          )}
          {/* Manage: the workspace's memory, here in place under it. */}
          {manage && !data.own && <MemorySheet state={state} onClose={() => setManage(false)} />}
          {/* What it kept to itself before, kept apart on the team chart: brought into the team's, or let go. */}
          {!data.own && !state.shared && entryOf(teamIn(state, workspaceOf(b)), b.id).kept && <KeptApart bot={b} onDone={reload} />}
        </>
      )}
      </>
      )}

    </div>
    </OwnMemoryOf.Provider>
  );
}

/* ---------------- Edit: SOUL.md and MEMORY.md ---------------- */

type DocView = { text: string | null; generated: string };
type Docs = { soul: DocView; memory: DocView; max: number; dir: string | null; error?: string };

/**
 * The bot's two documents, each in a text area: SOUL.md (who it is, its tone, its rules) and MEMORY.md (long-lived
 * facts). Until the owner writes one, the generated text shows (from How I work, and what's pinned in memory), and
 * that's what the bot reads too; Save keeps what they wrote in the state (the files under .data mirror it), Reset
 * goes back to the generated one. Owner only: the server refuses anyone else (app/api/bots/docs).
 */
function BotDocs({ state, bot: b, pinned }: { state: AppState; bot: Bot; pinned: string[] }) {
  const owner = state.owner?.name.trim() || "you";
  const [docs, setDocs] = useState<Docs | null>(null);
  useEffect(() => {
    let gone = false;
    void fetch(`/api/bots/docs?${new URLSearchParams({ bot: b.id })}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Docs) => !gone && setDocs(j))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [b.id]);
  // Until the server answers (or when it can't), the generated ones from what the page has: the same text.
  const soul: DocView = docs?.soul ?? { text: b.soul ?? null, generated: renderSoul(b, owner) };
  const memory: DocView = docs?.memory ?? { text: b.memoryDoc ?? null, generated: renderMemoryDoc(b, owner, pinned) };
  return (
    <div data-bot-docs className="flex flex-col gap-7">
      <div className="rounded-[18px] bg-[#F7F7F6] px-5 py-4 text-[13px] leading-5 text-[#6B6B6B]">
        {b.name} reads both at the start of every chat turn, task and call. <b className="font-medium text-ink">{SOUL_FILE}</b> is who it is: its tone and its rules; saved, it takes the place of How I work on its profile. <b className="font-medium text-ink">{MEMORY_FILE}</b> is what you want it to keep in mind for good, next to what it learns on its own. What you say in a chat still wins, and Bops&apos; own rules (approvals) still apply.
        {docs?.dir ? <span className="block pt-1 text-[12px] text-[#9A9A98]">Copies are kept at {docs.dir}; edits there do nothing, edit here.</span> : null}
      </div>
      {docs?.error && <div role="alert" className="text-[13px] text-[#B42318]">{docs.error}</div>}
      <DocEditor bot={b} field="soul" file={SOUL_FILE} doc={soul} max={docs?.max ?? MAX_BOT_DOC_CHARS} onSaved={setDocs} />
      <DocEditor bot={b} field="memoryDoc" file={MEMORY_FILE} doc={memory} max={docs?.max ?? MAX_BOT_DOC_CHARS} onSaved={setDocs} />
    </div>
  );
}

function DocEditor({ bot: b, field, file, doc, max, onSaved }: { bot: Bot; field: "soul" | "memoryDoc"; file: string; doc: DocView; max: number; onSaved: (d: Docs) => void }) {
  const shown = doc.text ?? doc.generated;
  const [text, setText] = useState(shown);
  // Another bot, or a fresh copy from the server: start from what it shows (never over an edit in progress).
  const [was, setWas] = useState({ bot: b.id, shown });
  if (was.bot !== b.id || (was.shown !== shown && text === was.shown)) {
    setWas({ bot: b.id, shown });
    setText(shown);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = text !== shown;
  const left = max - text.length;
  const send = async (value: string | null) => {
    setBusy(true);
    setError(null);
    const r = (await (await post("/api/bots/docs", { botId: b.id, [field]: value }, "PATCH")).json().catch(() => ({ error: "Couldn't save. Try again." }))) as Docs;
    setBusy(false);
    if (r.error) return setError(r.error);
    onSaved(r);
    const next = (field === "soul" ? r.soul : r.memory);
    setWas({ bot: b.id, shown: next.text ?? next.generated });
    setText(next.text ?? next.generated);
  };
  return (
    <section data-doc={file} className="flex flex-col gap-2.5">
      <div className="flex h-6 items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{file}</h3>
        <span className="text-[12px] leading-4 text-[#9A9A98]">{doc.text === null ? "Generated" : "Yours"}</span>
      </div>
      <textarea
        aria-label={file}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={max}
        spellCheck={false}
        rows={12}
        className="min-h-[200px] w-full resize-y rounded-[14px] bg-[#F7F7F6] px-4 py-3 font-mono text-[12.5px] leading-[19px] outline-none focus:bg-white focus:shadow-[inset_0_0_0_1.5px_#0A0A0A]"
      />
      <div className="flex items-center gap-2">
        <button disabled={busy || !changed} onClick={() => void send(text)} className="h-7 rounded-full bg-[#0A0A0A] px-3 text-[12.5px] font-medium text-white disabled:opacity-40">
          Save
        </button>
        {(doc.text !== null || changed) && (
          <button disabled={busy} onClick={() => void send(null)} className="h-7 rounded-full bg-[#F2F2F0] px-3 text-[12.5px] font-medium text-ink hover:bg-[#EAEAE7] disabled:opacity-50">
            Reset to generated
          </button>
        )}
        {error && <span role="alert" className="text-[12px] text-[#B42318]">{error}</span>}
        <span className="ml-auto shrink-0 text-[12px] tabular-nums leading-4 text-[#9A9A98]">{left === 1 ? "1 character left" : `${left.toLocaleString("en-US")} characters left`}</span>
      </div>
    </section>
  );
}

/** What a bot kept to itself before, kept apart (the team chart's Keep it apart): brought into the team's memory, or deleted. */
function KeptApart({ bot: b, onDone }: { bot: Bot; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: "bring-in" | "drop-own") => {
    setBusy(true);
    setError(null);
    const r = (await (await post("/api/memory", { action, bot: b.id })).json().catch(() => ({ error: "x" }))) as { error?: string };
    setBusy(false);
    if (r.error) setError("Couldn't do that. Try again.");
    onDone();
  };
  return (
    <div data-kept-apart className="flex flex-col items-center gap-2 text-center text-[12px] leading-4 text-[#6B6B6B]">
      <span>What {b.name} kept to itself is kept apart: nothing reads it.</span>
      <span className="flex gap-2">
        <button disabled={busy} onClick={() => void act("bring-in")} className="rounded-full bg-[#F2F2F0] px-3 py-1 font-medium text-ink hover:bg-[#EAEAE7] disabled:opacity-50">
          Bring it in
        </button>
        <button disabled={busy} onClick={() => void act("drop-own")} className="rounded-full bg-[#F2F2F0] px-3 py-1 font-medium text-[#B42318] hover:bg-[#EAEAE7] disabled:opacity-50">
          Delete it
        </button>
      </span>
      {error && <span role="alert" className="text-[#B42318]">{error}</span>}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex h-6 items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

const Quiet = ({ children }: { children: React.ReactNode }) => <div className="py-2 text-[13.5px] leading-5 text-[#9A9A98]">{children}</div>;

function More({ open, onClick, count }: { open: boolean; onClick: () => void; count: number }) {
  return (
    <button onClick={onClick} className="self-start text-[13px] font-medium text-[#6B6B6B] hover:text-ink">
      {open ? "Show less" : `Show all ${count}`}
    </button>
  );
}

/** **Bold** in an answer, shown bold. */
function Bold({ text }: { text: string }) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i} className="font-semibold">{part}</b> : part));
}

/** Facts come lowercase ("alex is…"): start them with a capital. */
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/* ---------------- About you: the card, as a contact card ---------------- */

/** A card line: "ATTRIBUTE: Project: Atlas (Mobile App)" is kind ATTRIBUTE, label Project, value "Atlas", note "Mobile App". */
type Line = Fact & { kind: string; label: string; value: string; note?: string; head: string };

function parse(f: Fact): Line {
  const m = f.text.match(/^(?:([A-Z][A-Z_ ]+):\s*)?([A-Z][\w ()/'-]{1,30}):\s+(.+)$/);
  if (!m) return { ...f, kind: "", label: "", value: f.text, head: "" };
  const [, kind = "", label, rest] = m;
  const p = rest.match(/^(.+?)\s+\(([^)]+)\)$/);
  return { ...f, kind, label, value: p ? p[1] : rest, note: p?.[2], head: f.text.slice(0, f.text.length - rest.length) };
}

const LABEL: Record<string, string> = {
  Alias: "Also known as",
  Location: "Lives in",
  Project: "Projects",
  Tool: "Tools",
  "Primary Agent": "Agents",
  "Agent fleet": "Agents",
  "Co-founder": "Cofounders",
  "YC Batch": "YC",
  Education: "Studied",
};
const WORK = /role|project|focus|tool|agent|website|batch|company|team|customer|co-?founder/i;
const groupOf = (l: Line) => (!l.label ? "Notes" : /co-?founder|agent fleet/i.test(l.label) ? "Work" : l.kind === "RELATIONSHIP" ? "People" : WORK.test(l.label) ? "Work" : "You");

/** Short values sit on one line ("alex · @alex"); long lists go one per line. */
const stacked = (items: Line[]) => items.length > 3 || items.some((x) => x.value.length > 26) || items.filter((x) => x.note).length > 1;

function ContactCard({ ws, lines, onChange }: { ws: string; lines: Fact[]; onChange: () => void }) {
  const parsed = lines.map(parse);
  const open = parsed.filter((l) => !l.private);
  const hidden = parsed.filter((l) => l.private);
  const [showPrivate, setShowPrivate] = useState(false);
  const groups = (["You", "Work", "People", "Notes"] as const)
    .map((g) => {
      const rows = new Map<string, Line[]>();
      for (const l of open.filter((x) => groupOf(x) === g)) {
        const k = g === "Notes" ? l.id : (LABEL[l.label] ?? l.label);
        rows.set(k, [...(rows.get(k) ?? []), l]);
      }
      return { g, rows: [...rows.entries()] };
    })
    .filter((x) => x.rows.length);
  return (
    <div className="flex flex-col rounded-[18px] px-5 py-1 shadow-[0_0_0_1px_#ECECEA]">
      {groups.map(({ g, rows }) => (
        <div key={g} className="flex flex-col gap-2 border-b border-[#F0F0EE] py-4 last:border-b-0">
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#B0B0AD]">{g}</div>
          {rows.map(([label, items]) => (
            <div key={label} className="flex gap-4 text-[13.5px] leading-[21px]">
              {g !== "Notes" && <span className="w-[116px] shrink-0 truncate text-[#9A9A98]" title={label}>{label}</span>}
              <span className="min-w-0 flex-1">
                {items.map((l, i) => (
                  <span key={l.id}>
                    {i > 0 && (stacked(items) ? <br /> : <span className="text-[#C9C9C6]"> · </span>)}
                    <Editable ws={ws} item={l} onChange={onChange}>
                      {l.value}
                      {l.note && <span className="text-[#9A9A98]"> {l.note}</span>}
                    </Editable>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
      {hidden.length > 0 && (
        <div className="border-t border-[#F0F0EE] py-3.5 first:border-t-0">
          <button onClick={() => setShowPrivate((x) => !x)} className="flex w-full items-center gap-2.5 text-left">
            <LockIcon />
            <span className="flex-1 text-[13.5px] leading-5">
              {hidden.length} private details <span className="text-[#9A9A98]">· hidden from bots while they work</span>
            </span>
            <svg width="10" height="10" viewBox="0 0 12 12" className={`shrink-0 transition-transform ${showPrivate ? "rotate-90" : ""}`}>
              <path d="M4.5 3l3 3-3 3" fill="none" stroke="#9A9A98" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showPrivate && (
            <div className="mt-2.5 flex flex-col gap-1.5 pl-[22px]">
              {hidden.map((l) => (
                <div key={l.id} className="flex gap-4 text-[13.5px] leading-[21px]">
                  <span className="w-[116px] shrink-0 truncate text-[#9A9A98]" title={l.label}>{/ Address$/.test(l.label) ? "Address" : l.label || "Note"}</span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <Editable ws={ws} item={l} onChange={onChange}>
                      {l.value}
                      {l.note && <span className="text-[#9A9A98]"> {l.note}</span>}
                      {/ Address$/.test(l.label) && <span className="text-[#9A9A98]"> · {l.label.replace(/ Address$/, "")}</span>}
                    </Editable>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Learned facts ---------------- */

function FactList({ ws, facts, onChange, pinnable }: { ws: string; facts: Fact[]; onChange: () => void; pinnable?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      {facts.map((f) => (
        <div key={f.id} className="flex flex-col py-1.5">
          <span className="text-[14px] leading-[21px] [overflow-wrap:anywhere]">
            <Editable ws={ws} item={{ ...f, value: f.text, head: "" }} onChange={onChange} pinnable={pinnable}>
              {f.private && <LockIcon inline />}
              {sentence(f.text)}
            </Editable>
          </span>
          {f.source && (
            <span className="text-[12px] leading-4 text-[#9A9A98]">
              {f.source}
              {f.at ? ` · ${ago(f.at)}` : ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Fix, pin, delete ---------------- */

/**
 * Something memory knows. Click it for Fix · Pin · Delete. Fixing a card line edits just its value;
 * a learned fact is rewritten whole.
 */
function Editable({ ws, item, onChange, pinnable, children }: { ws: string; item: Fact & { value: string; head: string }; onChange: () => void; pinnable?: boolean; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menu]);
  const ownOf = useContext(OwnMemoryOf);
  const act = async (body: Record<string, unknown>) => {
    setMenu(false);
    const r = (await (await post("/api/memory", { ws, ...(ownOf ? { bot: ownOf } : {}), ...body })).json()) as { error?: string };
    if (r.error) setError(r.error);
    onChange();
  };
  if (gone) return null;
  if (editing !== null)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(null);
          if (editing.trim() && editing.trim() !== item.value) void act({ action: "fix", id: item.id, text: item.head + editing.trim() });
        }}
        className="inline-flex w-full items-center gap-1.5 align-middle"
      >
        <input
          autoFocus
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), setEditing(null))}
          onBlur={() => setEditing(null)}
          className="h-7 min-w-0 flex-1 rounded-[8px] px-2 text-[13.5px] shadow-[inset_0_0_0_1.5px_#0A0A0A] outline-none"
        />
      </form>
    );
  const pill = "rounded-full px-2.5 py-1 text-[12.5px] font-medium leading-4 hover:bg-[#F2F2F0]";
  return (
    <span ref={box} className="relative">
      <span
        role="button"
        tabIndex={0}
        onClick={() => setMenu((m) => !m)}
        onKeyDown={(e) => e.key === "Enter" && setMenu((m) => !m)}
        className={`-mx-1 rounded-[6px] px-1 transition-colors ${menu ? "bg-[#F2F2F0]" : "hover:bg-[#F7F7F6]"}`}
      >
        {children}
      </span>
      {error && <span className="ml-2 text-[12px] text-[#B42318]">{error}</span>}
      {menu && (
        <span className="absolute left-0 top-[calc(100%+4px)] z-20 flex items-center gap-0.5 rounded-full bg-white p-1 shadow-[0_0_0_1px_#0000000F,0_10px_24px_-10px_#00000059]">
          <button
            onClick={() => {
              setMenu(false);
              setEditing(item.value);
            }}
            className={pill}
          >
            Fix
          </button>
          {pinnable && (
            <button onClick={() => void act({ action: "pin", text: item.text })} className={pill} title="Add to About you, which every bot sees">
              Pin
            </button>
          )}
          <button
            onClick={() => {
              setGone(true);
              void act({ action: "forget", id: item.id });
            }}
            className={`${pill} text-[#B42318] hover:bg-[#FBEAEA]`}
          >
            Delete
          </button>
        </span>
      )}
    </span>
  );
}

function LockIcon({ inline }: { inline?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-label="Private" className={inline ? "mr-1.5 inline-block align-[-1px]" : "shrink-0"}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="#9A9A98" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="#9A9A98" strokeWidth="1.4" />
    </svg>
  );
}

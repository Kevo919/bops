"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BUILTIN_CHAT_MODELS } from "@/lib/chat-models";

/*
 * Settings, Models: Your LLMs (config/llms.yaml) as a list, in plain words. Each model has what it's for (its jobs:
 * a new thread about that kind of work goes to it), the agent that runs it for bots' tasks, whether chats start on
 * it, and whether its provider's key is set (only whether: never a key). Add a model picks a provider, then a model
 * (OpenRouter's from its list, searchable), then its jobs. Each job belongs to one model, so picking one another
 * model has moves it, and the card says so. Every change saves at once (app/api/models) and applies without a
 * restart; the file keeps its comments.
 */

type Row = {
  id: string;
  name: string;
  provider: string;
  model: string;
  starter?: boolean;
  useFor?: string[];
  runBy?: string;
  chatDefault?: boolean;
};
type Provider = {
  id: string;
  name: string;
  label: string;
  keyName: string | null;
  keySet: boolean;
  chatOnly?: boolean;
};
type RunBy = {
  kind: string;
  name: string;
  providers: string[] | null;
  why?: string;
};
type JobInfo = { id: string; name: string; help: string };
type Info = {
  llms: Row[];
  max: number;
  providers: Provider[];
  runBy: RunBy[];
  jobs: JobInfo[];
  problems: string[];
};
type Moved = { job: string; from: string };
type OrModel = {
  id: string;
  name: string;
  context?: number;
  inPerM?: number;
  outPerM?: number;
};

const MODEL = /^[A-Za-z0-9._:/-]{1,120}$/;
const pill =
  "shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-4 disabled:opacity-50";
const dark = `${pill} bg-ink text-white`;
const light = `${pill} bg-[#F2F2F0] hover:bg-[#EAEAE7]`;
const chip =
  "rounded-full px-2.5 py-1 text-[12px] leading-4 disabled:opacity-50";
const field =
  "rounded border border-[#E6E6E3] bg-white px-1.5 py-1 text-[12px]";

const ICON = (
  <svg
    width="17"
    height="17"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2M3.4 3.4l1.6 1.6M11 11l1.6 1.6M3.4 12.6L5 11M11 5l1.6-1.6" />
  </svg>
);

/** "DeepSeek: DeepSeek V4 Pro" is OpenRouter's name; the maker's prefix goes, so it reads "DeepSeek V4 Pro". */
export const nameFromOpenRouter = (name: string) =>
  name.replace(/^[^:]{1,40}:\s*/, "").trim() || name;
/** A name for a model id someone typed: its last part ("deepseek/deepseek-chat" is "deepseek-chat"). */
const nameFromId = (id: string) => id.split("/").pop() || id;
const CHAT_ONLY_NOTE =
  "Chats only: it runs on this server, out of reach of your bots' computers, so it takes no bot jobs.";
const price = (m: OrModel) =>
  m.inPerM === undefined
    ? ""
    : m.inPerM === 0 && m.outPerM === 0
      ? "Free"
      : `$${m.inPerM} in / $${m.outPerM ?? "?"} out per million tokens`;

/** The words for jobs that would move: "Coding (now Claude Opus 5.5's)". */
const moveWords = (moved: Moved[], jobs: JobInfo[], to: string) =>
  moved.length
    ? `${moved.map((m) => `${jobs.find((j) => j.id === m.job)?.name ?? m.job} moved from ${m.from}`).join(", ")} to ${to}.`
    : "";

export function ModelsCard() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/models", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .then((b) => live && b && setInfo(b as Info))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const send = useCallback(
    async (
      op: Record<string, unknown>,
      said: (moved: Moved[], next: Info) => string,
    ) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const res = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(op),
        });
        const body = (await res.json().catch(() => null)) as
          (Info & { moved?: Moved[]; error?: string }) | null;
        if (!res.ok || !body?.llms) {
          setError(body?.error ?? "Couldn't save that change.");
          return false;
        }
        setInfo(body);
        setNote(said(body.moved ?? [], body));
        return true;
      } catch {
        setError("Couldn't reach Bops to save that change.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  if (!info) return null;
  const chat = info.llms.find((l) => l.chatDefault);
  return (
    <div
      data-models-card
      className="flex flex-col rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_#E6E6E3]"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-ink text-highlighter">
          {ICON}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13.5px] font-semibold leading-[18px]">
            Models
          </span>
          <span className="text-[12px] leading-4 text-pencil">
            The AI models your bots and chats use, and what each one is for.
            Changes save and apply right away.
          </span>
          <span className="flex items-center gap-1.5 pt-0.5 text-[12px] leading-4 text-[#3A3A38]">
            <span
              className={`size-[7px] shrink-0 rounded-full ${info.llms.length ? "bg-[#2BB673]" : "bg-[#C9C9C6]"}`}
            />
            {info.llms.length
              ? `${info.llms.length} model${info.llms.length === 1 ? "" : "s"} · Chats start on ${chat ? chat.name : "Auto (OpenAI)"}`
              : "No models yet"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className={adding ? light : dark}
            disabled={busy || (!adding && info.llms.length >= info.max)}
            onClick={() => setAdding((a) => !a)}
          >
            {adding ? "Close" : "Add a model"}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2 pl-12 pt-3" aria-live="polite">
        {error && (
          <p role="alert" className="text-[12px] text-[#B00020]">
            {error}
          </p>
        )}
        {note && (
          <p data-models-note className="text-[12px] text-[#3A3A38]">
            {note}
          </p>
        )}
        {adding && (
          <AddModel
            info={info}
            busy={busy}
            onSave={async (op) => {
              const ok = await send({ op: "add", ...op }, (moved) =>
                `Added ${op.name}. ${moveWords(moved, info.jobs, op.name)}`.trim(),
              );
              if (ok) setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {info.llms.map((l) => (
          <ModelRow key={l.id} row={l} info={info} busy={busy} send={send} />
        ))}
        {!info.llms.length && !adding && (
          <p className="text-[12px] text-pencil">
            No models yet. Add one to pick what your bots use for each kind of
            work.
          </p>
        )}
        {info.problems.length > 0 && (
          <details className="text-[12px] text-pencil">
            <summary className="cursor-pointer">
              config/llms.yaml has {info.problems.length} line
              {info.problems.length === 1 ? "" : "s"} Bops left out
            </summary>
            <ul className="list-disc pl-4">
              {info.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-[12px] text-pencil">
          A job (Coding, Planning and the rest) goes to one model: a new thread
          about that kind of work starts on it. Bots you set up in their own AI
          section keep their own setup.
        </p>
      </div>
    </div>
  );
}

function KeyDot({ provider }: { provider?: Provider }) {
  if (!provider) return null;
  if (!provider.keyName) return null;
  return provider.keySet ? (
    <span
      data-key="set"
      className="flex items-center gap-1 text-[12px] text-[#3A3A38]"
      title={`${provider.keyName} is set on this server`}
    >
      <span className="size-[7px] rounded-full bg-[#2BB673]" />
      Key set
    </span>
  ) : (
    <span
      data-key="missing"
      className="flex items-center gap-1 text-[12px] text-[#3A3A38]"
    >
      <span className="size-[7px] rounded-full bg-[#E59A0B]" />
      {provider.keyName.endsWith("_KEY")
        ? "No key yet:"
        : "Not set up yet:"}{" "}
      <a href="#settings-keys" className="underline">
        add {provider.keyName}
      </a>
    </span>
  );
}

/** The jobs as chips: on is this model's; one another model has is dimmed, and picking it moves it here. */
function Jobs({
  info,
  mine,
  self,
  disabled,
  onPick,
}: {
  info: Info;
  mine: string[];
  self?: string;
  disabled?: boolean;
  onPick: (jobs: string[]) => void;
}) {
  return (
    <div role="group" aria-label="Use for" className="flex flex-wrap gap-1">
      {info.jobs.map((j) => {
        const on = mine.includes(j.id);
        const other = on
          ? undefined
          : info.llms.find((y) => y.id !== self && y.useFor?.includes(j.id));
        return (
          <button
            key={j.id}
            type="button"
            aria-pressed={on}
            data-job={j.id}
            disabled={disabled}
            title={`${j.help}${other ? `. ${other.name} has it now: picking it moves it here.` : ""}`}
            onClick={() =>
              onPick(on ? mine.filter((k) => k !== j.id) : [...mine, j.id])
            }
            className={`${chip} ${on ? "bg-ink text-white" : "bg-black/[0.05] text-[#6B6B6B] hover:text-ink"} ${other ? "opacity-60" : ""}`}
          >
            {j.name}
          </button>
        );
      })}
    </div>
  );
}

/** The agents that may run this provider's models for bots' tasks; the rest shown dimmed, with why. */
function RunBySelect({
  info,
  provider,
  value,
  disabled,
  onChange,
}: {
  info: Info;
  provider: string;
  value: string;
  disabled?: boolean;
  onChange: (kind: string) => void;
}) {
  return (
    <select
      aria-label="Run by"
      className={field}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {info.runBy.map((r) => {
        const ok = r.providers === null || r.providers.includes(provider);
        return (
          <option key={r.kind} value={r.kind} disabled={!ok} title={r.why}>
            {r.name}
            {r.kind === "opencode" ? " (default)" : ""}
            {ok
              ? ""
              : r.why
                ? " (set up in a bot's AI section)"
                : " (can't run this provider)"}
          </option>
        );
      })}
    </select>
  );
}

function ModelRow({
  row: l,
  info,
  busy,
  send,
}: {
  row: Row;
  info: Info;
  busy: boolean;
  send: (
    op: Record<string, unknown>,
    said: (moved: Moved[], next: Info) => string,
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState(l.name);
  const [provider, setProvider] = useState(l.provider);
  const [model, setModel] = useState(l.model);
  const p = info.providers.find((x) => x.id === l.provider);
  const update = (
    patch: Record<string, unknown>,
    said: (moved: Moved[]) => string,
  ) => send({ op: "update", id: l.id, ...patch }, (moved) => said(moved));
  return (
    <div
      data-model={l.id}
      className="flex flex-col gap-1.5 rounded-md px-2 py-2 shadow-[0_0_0_1px_#E6E6E3]"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-medium leading-4">{l.name}</span>
        <span className="text-[12px] text-pencil">{p?.name ?? l.provider}</span>
        <span className="break-all font-mono text-[11px] text-pencil">
          {l.model}
        </span>
        <span className="flex-1" />
        <KeyDot provider={p} />
      </div>
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-0.5 text-[12px]">
            <span className="text-pencil">Name</span>
            <input
              type="text"
              aria-label="Name"
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[12px]">
            <span className="text-pencil">Provider</span>
            <select
              aria-label="Provider"
              className={field}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {info.providers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[12px]">
            <span className="text-pencil">Model id</span>
            <input
              type="text"
              aria-label="Model id"
              className={`${field} font-mono`}
              value={model}
              onChange={(e) => setModel(e.target.value.trim())}
            />
          </label>
          <div className="flex gap-1.5">
            <button
              className={dark}
              disabled={busy || !name.trim() || !MODEL.test(model)}
              onClick={async () => {
                if (
                  await update(
                    { name, provider, model },
                    () => `Saved ${name.trim()}.`,
                  )
                )
                  setEditing(false);
              }}
            >
              Save
            </button>
            <button
              className={light}
              onClick={() => (
                setEditing(false),
                setName(l.name),
                setProvider(l.provider),
                setModel(l.model)
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {p?.chatOnly ? (
            <span data-chat-only className="text-[12px] text-pencil">
              {CHAT_ONLY_NOTE}
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="min-w-[60px] text-pencil">Use for</span>
              <Jobs
                info={info}
                mine={l.useFor ?? []}
                self={l.id}
                disabled={busy}
                onPick={(jobs) =>
                  void update({ useFor: jobs }, (moved) =>
                    `Saved. ${moveWords(moved, info.jobs, l.name)}`.trim(),
                  )
                }
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
            {!p?.chatOnly && (
              <label className="flex items-center gap-1.5">
                <span
                  className="text-pencil"
                  title="The agent that runs this model when a bot does a task on its computer"
                >
                  Run by
                </span>
                <RunBySelect
                  info={info}
                  provider={l.provider}
                  value={l.runBy ?? "opencode"}
                  disabled={busy}
                  onChange={(kind) =>
                    void update(
                      { runBy: kind },
                      () =>
                        `${l.name} now runs on ${info.runBy.find((r) => r.kind === kind)?.name ?? kind} for bots' tasks.`,
                    )
                  }
                />
              </label>
            )}
            <label
              className="flex items-center gap-1.5"
              title="New chats, and chats you haven't picked a model for, answer on this one"
            >
              <input
                type="radio"
                name="models-chat-default"
                checked={!!l.chatDefault}
                disabled={busy}
                onChange={() =>
                  void update(
                    { chatDefault: true },
                    () => `Chats now start on ${l.name}.`,
                  )
                }
              />
              Default for chat
            </label>
            {!p?.chatOnly && (
              <label
                className="flex items-center gap-1.5"
                title="New bots start on this one for tasks no other model is set to take"
              >
                <input
                  type="radio"
                  name="models-starter"
                  checked={!!l.starter}
                  disabled={busy}
                  onChange={() =>
                    void update(
                      { starter: true },
                      () => `New bots now start on ${l.name}.`,
                    )
                  }
                />
                Default for bot tasks
              </label>
            )}
            <span className="flex-1" />
            {removing ? (
              <span className="flex items-center gap-1.5">
                Remove {l.name}?
                <button
                  className={dark}
                  disabled={busy}
                  onClick={() =>
                    void send(
                      { op: "remove", id: l.id },
                      () => `Removed ${l.name}.`,
                    )
                  }
                >
                  Remove
                </button>
                <button className={light} onClick={() => setRemoving(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <button
                  className={light}
                  disabled={busy}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
                <button
                  className={light}
                  disabled={busy}
                  onClick={() => setRemoving(true)}
                >
                  Remove
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type NewModel = {
  name: string;
  provider: string;
  model: string;
  useFor: string[];
  runBy?: string;
  chatDefault?: boolean;
};

/** Add a model: a provider, then its model (OpenRouter's list, searchable), its name, its jobs; then Save. */
function AddModel({
  info,
  busy,
  onSave,
  onCancel,
}: {
  info: Info;
  busy: boolean;
  onSave: (op: NewModel) => void;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const [jobs, setJobs] = useState<string[]>([]);
  const [runBy, setRunBy] = useState("opencode");
  const [chatDefault, setChatDefault] = useState(false);
  const [list, setList] = useState<OrModel[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (provider !== "openrouter" || list) return;
    let live = true;
    fetch("/api/models/openrouter", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : { models: [], offline: true }))
      .then((b: { models?: OrModel[]; offline?: boolean }) => {
        if (!live) return;
        setList(b.models ?? []);
        setOffline(!!b.offline || !b.models?.length);
      })
      .catch(() => live && (setList([]), setOffline(true)));
    return () => {
      live = false;
    };
  }, [provider, list]);
  const found = useMemo(() => {
    if (!list) return [];
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return list
      .filter((m) =>
        words.every(
          (w) =>
            m.id.toLowerCase().includes(w) || m.name.toLowerCase().includes(w),
        ),
      )
      .slice(0, 30);
  }, [list, search]);
  const suggestions = BUILTIN_CHAT_MODELS.filter(
    (m) => m.provider === provider,
  ).map((m) => m.id.slice(provider.length + 1));
  const p = info.providers.find((x) => x.id === provider);
  const pickModel = (id: string, label?: string) => {
    setModel(id);
    if (!named) setName(label ?? nameFromId(id));
  };
  const moving = (p?.chatOnly ? [] : jobs)
    .map((j) => ({
      job: j,
      owner: info.llms.find((y) => y.useFor?.includes(j)),
    }))
    .filter((x) => x.owner);
  const dup = info.llms.some(
    (l) => l.provider === provider && l.model === model,
  );
  const ready = !!provider && MODEL.test(model) && !!name.trim() && !dup;
  return (
    <div
      data-add-model
      className="flex flex-col gap-2 rounded-md bg-[#FAFAF9] px-2.5 py-2.5 shadow-[0_0_0_1px_#E6E6E3]"
    >
      <label className="flex flex-col gap-0.5 text-[12px]">
        <span className="font-medium">1. Provider</span>
        <select
          aria-label="Provider"
          className={field}
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setModel("");
            if (!named) setName("");
            setRunBy("opencode");
          }}
        >
          <option value="">Pick a provider</option>
          {info.providers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        {p && <KeyDot provider={p} />}
      </label>
      {provider && (
        <div className="flex flex-col gap-1 text-[12px]">
          <span className="font-medium">2. Model</span>
          {provider === "openrouter" && (
            <>
              {!list && (
                <span className="text-pencil">
                  Getting OpenRouter&apos;s models…
                </span>
              )}
              {list && offline && (
                <span data-offline className="text-pencil">
                  Couldn&apos;t reach OpenRouter&apos;s list. Type the model id
                  instead (like deepseek/deepseek-v4-pro), from
                  openrouter.ai/models.
                </span>
              )}
              {list && list.length > 0 && (
                <>
                  <input
                    type="search"
                    aria-label="Search OpenRouter models"
                    className={field}
                    placeholder={`Search ${list.length} models: deepseek, qwen coder, claude…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div
                    role="listbox"
                    aria-label="OpenRouter models"
                    className="flex max-h-[220px] flex-col overflow-y-auto rounded border border-[#E6E6E3] bg-white"
                  >
                    {found.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={model === m.id}
                        data-or-model={m.id}
                        onClick={() =>
                          pickModel(m.id, nameFromOpenRouter(m.name))
                        }
                        className={`flex flex-col px-2 py-1 text-left ${model === m.id ? "bg-ink text-white" : "hover:bg-[#F2F2F0]"}`}
                      >
                        <span className="text-[12px] font-medium">
                          {m.name}
                        </span>
                        <span
                          className={`font-mono text-[11px] ${model === m.id ? "text-white/80" : "text-pencil"}`}
                        >
                          {m.id}
                          {price(m) ? ` · ${price(m)}` : ""}
                        </span>
                      </button>
                    ))}
                    {!found.length && (
                      <span className="px-2 py-1 text-pencil">
                        None match. Type the id below if you know it.
                      </span>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          <span className="text-pencil">Model id</span>
          <input
            type="text"
            aria-label="Model id"
            list={suggestions.length ? "models-card-suggestions" : undefined}
            className={`${field} font-mono`}
            placeholder={
              provider === "openrouter"
                ? "maker/model, like qwen/qwen3-coder-next"
                : "model id"
            }
            value={model}
            onChange={(e) => pickModel(e.target.value.trim())}
          />
          {suggestions.length > 0 && (
            <datalist id="models-card-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
          {model && !MODEL.test(model) && (
            <span className="text-[#B00020]">
              A model id is letters, numbers and . _ : / - only, with no spaces.
            </span>
          )}
          {dup && (
            <span className="text-[#B00020]">
              That model is in the list already.
            </span>
          )}
          <label className="flex flex-col gap-0.5">
            <span className="text-pencil">Name (how it shows in Bops)</span>
            <input
              type="text"
              aria-label="Name"
              className={field}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNamed(true);
              }}
            />
          </label>
        </div>
      )}
      {provider && (
        <div className="flex flex-col gap-1 text-[12px]">
          <span className="font-medium">3. What it&apos;s for</span>
          {p?.chatOnly ? (
            <span data-chat-only className="text-pencil">
              {CHAT_ONLY_NOTE}
            </span>
          ) : (
            <>
              <Jobs info={info} mine={jobs} onPick={setJobs} />
              {moving.length > 0 && (
                <span data-moves className="text-[#3A3A38]">
                  {moving
                    .map(
                      (x) =>
                        `${info.jobs.find((j) => j.id === x.job)?.name} is ${x.owner!.name}'s now`,
                    )
                    .join(", ")}
                  : saving moves {moving.length === 1 ? "it" : "them"} to this
                  model.
                </span>
              )}
              <label className="flex items-center gap-1.5">
                <span className="text-pencil">Run by</span>
                <RunBySelect
                  info={info}
                  provider={provider}
                  value={runBy}
                  onChange={setRunBy}
                />
              </label>
            </>
          )}
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={chatDefault}
              onChange={(e) => setChatDefault(e.target.checked)}
            />
            Make it the default for chats
          </label>
        </div>
      )}
      <div className="flex gap-1.5">
        <button
          className={ready ? dark : light}
          disabled={!ready || busy}
          onClick={() =>
            onSave({
              name: name.trim(),
              provider,
              model,
              useFor: p?.chatOnly ? [] : jobs,
              ...(runBy !== "opencode" && !p?.chatOnly ? { runBy } : {}),
              ...(chatDefault ? { chatDefault: true } : {}),
            })
          }
        >
          Save
        </button>
        <button className={light} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

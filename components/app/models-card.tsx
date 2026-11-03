"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BUILTIN_CHAT_MODELS } from "@/lib/chat-models";
import { isPreset, MODEL_ID, PRESET_ID } from "@/lib/agents";

/*
 * Settings, Models: Your LLMs (config/llms.yaml) as a list, in plain words. Each model has what it's for (its jobs:
 * a new thread about that kind of work goes to it), the agent that runs it for bots' tasks, whether chats start on
 * it, and whether its provider's key is set (only whether: never a key). Add a model picks a provider, then a model
 * (OpenRouter's from its list, searchable), then its jobs. Each job belongs to one model, so picking one another
 * model has moves it, and the card says so. Every change saves at once (app/api/models) and applies without a
 * restart; the file keeps its comments. For OpenRouter, Add a model also takes one of your presets (the server reads
 * them on your key: app/api/models/openrouter/presets; a slug typed in only when that list can't be read), any
 * model id typed in, or the Auto Router in one click.
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
  /** Another account of its provider (NAME__LABEL in .env.local); `accountMissing`: this server hasn't got it. */
  account?: string;
  accountMissing?: boolean;
};
type Provider = {
  id: string;
  name: string;
  label: string;
  keyName: string | null;
  keySet: boolean;
  /** Its other accounts' labels (NAME__LABEL set in .env.local), never a key. */
  accounts?: string[];
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

/** A model id Bops can write for this provider: a plain one, or for OpenRouter a preset ("@preset/<slug>"). */
const modelOk = (provider: string, model: string) =>
  MODEL_ID.test(model) || isPreset(provider, model);
/** OpenRouter's Auto Router: it picks a model for each message (openrouter.ai/docs, Auto Router). */
export const AUTO_ROUTER = "openrouter/auto";
const PRESETS_PAGE = "https://openrouter.ai/settings/presets";
type OrPreset = { slug: string; name: string; description?: string };
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
const PRESET_NOTE =
  "An OpenRouter preset: chats and chat routines run on it. Bots' tasks need a plain model id, so it takes no bot jobs.";
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
  const [warning, setWarning] = useState<string | null>(null);
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
      setWarning(null);
      try {
        const res = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(op),
        });
        const body = (await res.json().catch(() => null)) as
          (Info & { moved?: Moved[]; error?: string; warning?: string }) | null;
        if (!res.ok || !body?.llms) {
          setError(body?.error ?? "Couldn't save that change.");
          return false;
        }
        setInfo(body);
        setNote(said(body.moved ?? [], body));
        if (body.warning) setWarning(body.warning);
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
              ? `${info.llms.length} model${info.llms.length === 1 ? "" : "s"} · New chats start on ${chat ? chat.name : "Auto (OpenAI)"}`
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
        {warning && (
          <p data-models-warning className="text-[12px] text-[#9A5B00]">
            {warning}
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

const ACCOUNT_NOTE =
  "Chats use this account. Bots' tasks on their computers use the default account.";

/**
 * Which of the provider's accounts a model's chats use: the default (its key name) or another (NAME__LABEL in
 * .env.local). Only when the provider has more than one, or the model names one this server hasn't got.
 */
function AccountSelect({
  provider,
  value,
  missing,
  disabled,
  onChange,
}: {
  provider?: Provider;
  value: string;
  missing?: boolean;
  disabled?: boolean;
  onChange: (label: string) => void;
}) {
  const labels = provider?.accounts ?? [];
  if (!provider?.keyName || (!labels.length && !value)) return null;
  return (
    <label
      className="flex items-center gap-1.5 text-[12px]"
      title={ACCOUNT_NOTE}
    >
      <span className="text-pencil">Account</span>
      <select
        aria-label="Account"
        className={field}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Default ({provider.keyName})</option>
        {labels.map((a) => (
          <option key={a} value={a}>
            {a.toLowerCase()} ({provider.keyName}__{a})
          </option>
        ))}
        {value && !labels.includes(value) && (
          <option value={value}>
            {value.toLowerCase()} (account not found)
          </option>
        )}
      </select>
      {missing && (
        <span data-account-missing className="text-[#9A5B00]">
          Account not found: add {provider.keyName}__{value} to .env.local, then
          restart Bops.
        </span>
      )}
    </label>
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
  // Chats only: its provider is (Ollama), or it's an OpenRouter preset.
  const chatOnly = !!p?.chatOnly || isPreset(l.provider, l.model);
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
        {isPreset(l.provider, l.model) && (
          <span
            data-preset-tag
            className="rounded-full bg-black/[0.05] px-1.5 text-[11px] text-[#3A3A38]"
          >
            Preset
          </span>
        )}
        <span className="break-all font-mono text-[11px] text-pencil">
          {l.model}
        </span>
        {l.account && (
          <span data-account-tag className="text-[12px] text-pencil">
            {l.account.toLowerCase()} account
          </span>
        )}
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
              disabled={busy || !name.trim() || !modelOk(provider, model)}
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
          {chatOnly ? (
            <span data-chat-only className="text-[12px] text-pencil">
              {isPreset(l.provider, l.model) ? PRESET_NOTE : CHAT_ONLY_NOTE}
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
            <AccountSelect
              provider={p}
              value={l.account ?? ""}
              missing={l.accountMissing}
              disabled={busy}
              onChange={(a) =>
                void update(
                  { account: a || null },
                  () =>
                    `${l.name} now uses ${a ? `the ${a.toLowerCase()} account` : "the default account"}.`,
                )
              }
            />
            {!chatOnly && (
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
              title="Chats you make from now on start on this one (when its key is set). Chats you have already keep their model, and Auto can always be picked in a chat."
            >
              <input
                type="radio"
                name="models-chat-default"
                checked={!!l.chatDefault}
                disabled={busy}
                onChange={() =>
                  void update(
                    { chatDefault: true },
                    () => `New chats now start on ${l.name}.`,
                  )
                }
              />
              Default for new chats
            </label>
            {!chatOnly && (
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
  account?: string;
};

/**
 * Add a model: a provider, then its model, its name, its jobs; then Save. For OpenRouter the model is one of four:
 * from its list (searchable), one of your presets, any model id typed in, or the Auto Router.
 */
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
  const [account, setAccount] = useState("");
  const [list, setList] = useState<OrModel[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [search, setSearch] = useState("");
  // OpenRouter: from its list, a preset of yours, or any id typed in.
  const [mode, setMode] = useState<"list" | "preset" | "custom">("list");
  const [presets, setPresets] = useState<{
    presets: OrPreset[];
    noKey?: boolean;
    refused?: boolean;
    offline?: boolean;
  } | null>(null);
  const [slug, setSlug] = useState("");
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
  useEffect(() => {
    if (provider !== "openrouter" || mode !== "preset" || presets) return;
    let live = true;
    fetch("/api/models/openrouter/presets", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : { presets: [], offline: true }))
      .then(
        (b: {
          presets?: OrPreset[];
          noKey?: boolean;
          refused?: boolean;
          offline?: boolean;
        }) => {
          if (live) setPresets({ ...b, presets: b.presets ?? [] });
        },
      )
      .catch(() => live && setPresets({ presets: [], offline: true }));
    return () => {
      live = false;
    };
  }, [provider, mode, presets]);
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
  const pickPreset = (s: string, label?: string) => {
    setSlug(s);
    setModel(s ? `@preset/${s}` : "");
    if (!named) setName(label ?? s);
  };
  const or = provider === "openrouter";
  const preset = isPreset(provider, model);
  // Chats only: Ollama, or a preset (bots' agents take a plain model id).
  const chatOnly = !!p?.chatOnly || preset;
  const moving = (chatOnly ? [] : jobs)
    .map((j) => ({
      job: j,
      owner: info.llms.find((y) => y.useFor?.includes(j)),
    }))
    .filter((x) => x.owner);
  const dup = info.llms.some(
    (l) => l.provider === provider && l.model === model,
  );
  // A typed id OpenRouter's list (when there is one) doesn't have: said, not refused (the server says so again).
  const unknown =
    or &&
    !preset &&
    !!model &&
    MODEL_ID.test(model) &&
    !!list?.length &&
    !list.some((m) => m.id === model);
  const ready = !!provider && modelOk(provider, model) && !!name.trim() && !dup;
  const tab = (m: typeof mode, label: string) => (
    <button
      type="button"
      data-or-mode={m}
      aria-pressed={mode === m}
      onClick={() => {
        setMode(m);
        setModel("");
        setSlug("");
        if (!named) setName("");
      }}
      className={`${chip} ${mode === m ? "bg-ink text-white" : "bg-black/[0.05] text-[#3A3A38] hover:text-ink"}`}
    >
      {label}
    </button>
  );
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
            setSlug("");
            setMode("list");
            if (!named) setName("");
            setRunBy("opencode");
            setAccount("");
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
      <AccountSelect provider={p} value={account} onChange={setAccount} />
      {provider && (
        <div className="flex flex-col gap-1 text-[12px]">
          <span className="font-medium">2. Model</span>
          {or && (
            <div
              className="flex flex-wrap items-center gap-1"
              role="group"
              aria-label="Kind of OpenRouter model"
            >
              {tab("list", "From OpenRouter's list")}
              {tab("preset", "One of your presets")}
              {tab("custom", "Any model id")}
              <button
                type="button"
                data-or-auto
                aria-pressed={model === AUTO_ROUTER}
                title="OpenRouter picks a model for each message, by what it asks"
                onClick={() => {
                  setMode("custom");
                  setSlug("");
                  pickModel(AUTO_ROUTER, "Auto Router");
                }}
                className={`${chip} ${model === AUTO_ROUTER ? "bg-ink text-white" : "bg-black/[0.05] text-[#3A3A38] hover:text-ink"}`}
              >
                Auto Router
              </button>
            </div>
          )}
          {or && mode === "list" && (
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
                        None match. Pick &ldquo;Any model id&rdquo; to type it.
                      </span>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          {or && mode === "preset" && (
            <div data-presets className="flex flex-col gap-1">
              <span className="text-pencil">
                A preset is a model with your own instructions and settings,
                made on OpenRouter at{" "}
                <a
                  href={PRESETS_PAGE}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  openrouter.ai/settings/presets
                </a>
                . Chats and chat routines can run on it.
              </span>
              {!presets && (
                <span className="text-pencil">Getting your presets…</span>
              )}
              {presets?.noKey && (
                <span data-presets-nokey className="text-pencil">
                  Add OPENROUTER_API_KEY in Keys to see your presets here, or
                  type a preset&apos;s slug below.
                </span>
              )}
              {presets?.refused && (
                <span data-presets-refused className="text-pencil">
                  OpenRouter turned down your key for the list of presets. Type
                  a preset&apos;s slug below.
                </span>
              )}
              {presets?.offline && (
                <span data-presets-offline className="text-pencil">
                  Couldn&apos;t reach OpenRouter for your presets. Type a
                  preset&apos;s slug below.
                </span>
              )}
              {presets &&
                !presets.noKey &&
                !presets.refused &&
                !presets.offline &&
                !presets.presets.length && (
                  <span data-presets-none className="text-pencil">
                    You have no presets on OpenRouter yet. Make one at
                    openrouter.ai/settings/presets, then pick it here.
                  </span>
                )}
              {!!presets?.presets.length && (
                <div
                  role="listbox"
                  aria-label="Your OpenRouter presets"
                  className="flex max-h-[180px] flex-col overflow-y-auto rounded border border-[#E6E6E3] bg-white"
                >
                  {presets.presets.map((x) => (
                    <button
                      key={x.slug}
                      type="button"
                      role="option"
                      aria-selected={slug === x.slug}
                      data-or-preset={x.slug}
                      onClick={() => pickPreset(x.slug, x.name)}
                      className={`flex flex-col px-2 py-1 text-left ${slug === x.slug ? "bg-ink text-white" : "hover:bg-[#F2F2F0]"}`}
                    >
                      <span className="text-[12px] font-medium">{x.name}</span>
                      <span
                        className={`font-mono text-[11px] ${slug === x.slug ? "text-white/80" : "text-pencil"}`}
                      >
                        @preset/{x.slug}
                        {x.description ? ` · ${x.description}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {/* Typed in only when the list can't be read (no key, the key turned down, OpenRouter down). */}
              {(presets?.noKey || presets?.refused || presets?.offline) && (
                <>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-pencil">Preset slug</span>
                    <input
                      type="text"
                      aria-label="Preset slug"
                      className={`${field} font-mono`}
                      placeholder="like email-writer"
                      value={slug}
                      onChange={(e) =>
                        pickPreset(
                          e.target.value.trim().replace(/^@preset\//, ""),
                        )
                      }
                    />
                  </label>
                  {slug && !PRESET_ID.test(`@preset/${slug}`) && (
                    <span className="text-[#B00020]">
                      A preset&apos;s slug is letters, numbers, - and _ only.
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {/* Typed in: under the list too (as before), and on its own for "Any model id". */}
          {(!or || mode !== "preset") && (
            <>
              <span className="text-pencil">
                {or
                  ? "Any OpenRouter model id, e.g. vendor/model or vendor/model:free"
                  : "Model id"}
              </span>
              <input
                type="text"
                aria-label="Model id"
                list={
                  suggestions.length ? "models-card-suggestions" : undefined
                }
                className={`${field} font-mono`}
                placeholder={
                  or
                    ? "vendor/model, like qwen/qwen3-coder-next or meta-llama/llama-5:free"
                    : "model id"
                }
                value={model}
                onChange={(e) => pickModel(e.target.value.trim())}
              />
              {or && (
                <span className="text-pencil">
                  Find ids at{" "}
                  <a
                    href="https://openrouter.ai/models"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    openrouter.ai/models
                  </a>
                  .
                </span>
              )}
            </>
          )}
          {suggestions.length > 0 && (
            <datalist id="models-card-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
          {model && !preset && !modelOk(provider, model) && (
            <span className="text-[#B00020]">
              A model id is letters, numbers and . _ : / - only, with no spaces.
            </span>
          )}
          {unknown && (
            <span data-unknown-id className="text-[#9A5B00]">
              OpenRouter&apos;s list doesn&apos;t have {model}. You can still
              save it: check the id if chats on it fail.
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
          {chatOnly ? (
            <span data-chat-only className="text-pencil">
              {preset ? PRESET_NOTE : CHAT_ONLY_NOTE}
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
            Make it the default for new chats
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
              useFor: chatOnly ? [] : jobs,
              ...(runBy !== "opencode" && !chatOnly ? { runBy } : {}),
              ...(chatDefault ? { chatDefault: true } : {}),
              ...(account ? { account } : {}),
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

"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { AgentKind, AgentReach, AgentView } from "@/lib/server/agent-instances";
import { InProgress } from "./in-progress";

/*
 * Settings, Agents you run: the owner's own DeepSeek Harness and Hermes Agent instances, as many as they like. Each has
 * a name a bot uses to hand it a task, what it is, how Bops reaches it (a program on this PC with a folder of its own,
 * or an address on the server) and its key, in a masked box. Add, change, Check and remove each one here. Only the
 * owner's desktop window gets this (/api/agent-instances); a key is never sent back, only "ends in" its last four.
 */

const KIND: Record<AgentKind, string> = { dsh: "DeepSeek Harness", hermes: "Hermes Agent" };
/** Colors from the palette (globals.css), and a green and red for a Check's answer that hold up in light and dark. */
const TONES = { "--ok": "light-dark(#067647, #75E0A7)", "--bad": "light-dark(#B42318, #FF9A90)" } as CSSProperties;
const card = "flex flex-col gap-2 rounded-[14px] bg-card p-3.5 shadow-[0_0_0_1px_var(--border)]";
const pill = "rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-4 disabled:opacity-40";
const dark = `${pill} bg-primary text-primary-foreground`;
const light = `${pill} bg-muted text-foreground hover:bg-accent`;
const box = "h-9 w-full min-w-0 rounded-lg bg-background px-2.5 text-[13px] text-foreground shadow-[0_0_0_1px_var(--border)] outline-none placeholder:text-muted-foreground focus:shadow-[0_0_0_1.5px_var(--ring)]";
const label = "flex flex-col gap-1 text-[12px] font-medium text-muted-foreground";

type Draft = { id?: string; name: string; kind: AgentKind; reach: AgentReach; command: string; home: string; address: string; key: string };
const blank = (kind: AgentKind = "hermes"): Draft => ({ name: "", kind, reach: kind === "hermes" ? "address" : "command", command: "", home: "", address: "", key: "" });

async function send(body: Record<string, unknown>) {
  const r = await fetch("/api/agent-instances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { agents?: AgentView[]; error?: string };
  return { ok: r.ok, agents: j.agents, error: j.error };
}

export function AgentInstancesSettings() {
  const [agents, setAgents] = useState<AgentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-instances", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { agents?: AgentView[]; error?: string };
      if (!r.ok) throw new Error(j.error || "Couldn't read your agents. Check that Bops is running, then open this again.");
      setAgents(j.agents ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (what: string, body: Record<string, unknown>, after?: () => void) => {
    setBusy(what);
    setError(null);
    const r = await send(body).catch(() => ({ ok: false, agents: undefined, error: "Bops didn't answer. Check that it's running, then try again." }));
    setBusy(null);
    if (r.agents) setAgents(r.agents);
    if (!r.ok) setError(r.error ?? "That didn't work. Try again.");
    else after?.();
  };

  if (!agents && error) return <p role="alert" className="px-[22px] pt-4 text-[12.5px] text-destructive">{error}</p>;
  if (!agents) return <p className="px-[22px] pt-4 text-[12.5px] text-muted-foreground">Reading your agents…</p>;
  return (
    <div data-agent-instances style={TONES} className="flex flex-col gap-2.5 px-[22px] pt-4 pb-8">
      <InProgress id="agents-you-run">
        <div className="flex flex-col gap-2.5">
          {error && (
            <p role="alert" className="text-[12.5px] text-destructive">
              {error}
            </p>
          )}
          {agents.length === 0 && !draft && <div className={`${card} text-[12.5px] text-muted-foreground`}>No agents yet. Add your first one below.</div>}
          {agents.map((a) =>
            draft?.id === a.id ? (
              <AgentForm key={a.id} draft={draft} onDraft={setDraft} busy={busy === "save"} onCancel={() => setDraft(null)} onSave={() => act("save", { action: "edit", ...draft }, () => setDraft(null))} />
            ) : (
              <AgentCard
                key={a.id}
                a={a}
                busy={busy}
                onCheck={() => act(`check:${a.id}`, { action: "check", id: a.id })}
                onEdit={() => setDraft({ id: a.id, name: a.name, kind: a.kind, reach: a.reach, command: a.command ?? "", home: a.home ?? "", address: a.address ?? "", key: "" })}
                onRemove={() => act(`remove:${a.id}`, { action: "remove", id: a.id })}
              />
            ),
          )}
          {draft && !draft.id ? (
            <AgentForm draft={draft} onDraft={setDraft} busy={busy === "save"} onCancel={() => setDraft(null)} onSave={() => act("save", { action: "add", ...draft }, () => setDraft(null))} />
          ) : (
            !draft && (
              <div className="flex flex-wrap gap-1.5">
                <button data-add-agent="hermes" className={dark} onClick={() => setDraft(blank("hermes"))}>
                  Add Hermes Agent
                </button>
                <button data-add-agent="dsh" className={light} onClick={() => setDraft(blank("dsh"))}>
                  Add DeepSeek Harness
                </button>
              </div>
            )
          )}
        </div>
      </InProgress>
      <InProgress id="agents-dsh-remote">
        <div className={card}>
          <span className="text-[13px] font-medium">DeepSeek Harness on another computer</span>
          <span className="text-[12.5px] text-muted-foreground">Hand tasks to dsh running on your server.</span>
        </div>
      </InProgress>
      <InProgress id="agents-dsh-desktop">
        <div className={card}>
          <span className="text-[13px] font-medium">Drive the DeepSeek Harness app</span>
          <span className="text-[12.5px] text-muted-foreground">Send tasks into the app&apos;s own window and sessions.</span>
        </div>
      </InProgress>
    </div>
  );
}

function AgentCard({ a, busy, onCheck, onEdit, onRemove }: { a: AgentView; busy: string | null; onCheck: () => void; onEdit: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div data-agent={a.id} className={card}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-[13.5px] font-semibold text-foreground">{a.name}</span>
        <span className="rounded-full bg-muted px-2 py-px text-[11px] font-medium text-muted-foreground">{KIND[a.kind]}</span>
        <span className="rounded-full bg-muted px-2 py-px text-[11px] font-medium text-muted-foreground">{a.reach === "address" ? "On a server" : "On this PC"}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 text-[12px] leading-4 text-muted-foreground">
        {a.reach === "address" ? (
          <span className="break-all">Address: {a.address}</span>
        ) : (
          <>
            <span className="break-all">Program: {a.command}</span>
            <span className="break-all">Its own folder: {a.home}</span>
          </>
        )}
        <span data-agent-key>{a.key.needed || a.key.set ? (a.key.set ? (a.key.ends === "saved" ? "Key saved" : `Key saved, ${a.key.ends}`) : "No key saved yet") : a.key.label}</span>
      </div>
      {a.check && (
        <span data-agent-check={a.check.ok ? "ok" : "bad"} role="status" className="text-[12.5px] leading-[18px]" style={{ color: a.check.ok ? "var(--ok)" : "var(--bad)" }}>
          {a.check.words}
        </span>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button className={dark} disabled={!!busy} onClick={onCheck}>
          {busy === `check:${a.id}` ? "Checking…" : "Check"}
        </button>
        <button className={light} disabled={!!busy} onClick={onEdit}>
          Change
        </button>
        {confirm ? (
          <>
            <button className={`${pill} bg-destructive text-primary-foreground`} disabled={!!busy} onClick={onRemove}>
              Remove {a.name}
            </button>
            <button className={light} onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button className={light} disabled={!!busy} onClick={() => setConfirm(true)}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function AgentForm({ draft, onDraft, onSave, onCancel, busy }: { draft: Draft; onDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const set = (more: Partial<Draft>) => onDraft({ ...draft, ...more });
  const editing = !!draft.id;
  const server = draft.reach === "address";
  return (
    <form
      data-agent-form
      className={card}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <span className="text-[13.5px] font-semibold">{editing ? `Change ${draft.name}` : `Add ${KIND[draft.kind]}`}</span>
      <label className={label}>
        Name
        <input className={box} value={draft.name} maxLength={40} placeholder={draft.kind === "hermes" ? "Hermes on server" : "dsh research"} onChange={(e) => set({ name: e.target.value })} />
      </label>
      {draft.kind === "hermes" && !editing && (
        <div role="radiogroup" aria-label="Where it runs" className="flex flex-wrap gap-1.5">
          {(["address", "command"] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={draft.reach === r} className={draft.reach === r ? dark : light} onClick={() => set({ reach: r })}>
              {r === "address" ? "On a server" : "On this PC"}
            </button>
          ))}
        </div>
      )}
      {server ? (
        <>
          <label className={label}>
            Address of its API server
            <input className={box} value={draft.address} inputMode="url" placeholder="http://100.101.102.103:8642" onChange={(e) => set({ address: e.target.value })} />
          </label>
          <span className="text-[11.5px] leading-4 text-muted-foreground">On your server over Tailscale: its tailnet address and the port of Hermes&apos; API server (API_SERVER_ENABLED=true in its settings).</span>
        </>
      ) : (
        <>
          <label className={label}>
            Program
            <input
              className={box}
              value={draft.command}
              placeholder={draft.kind === "dsh" ? "C:\\Users\\you\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd" : "hermes"}
              onChange={(e) => set({ command: e.target.value })}
            />
          </label>
          <label className={label}>
            Its own folder (leave empty and Bops makes one)
            <input className={box} value={draft.home} placeholder="A folder no other agent uses" onChange={(e) => set({ home: e.target.value })} />
          </label>
        </>
      )}
      {(server || draft.kind === "dsh") && (
        <label className={label}>
          {server ? "API server key (API_SERVER_KEY)" : "DeepSeek key (optional, else the one in its folder)"}
          <input className={box} type="password" autoComplete="off" spellCheck={false} value={draft.key} placeholder={editing ? "Leave empty to keep the saved key" : "Paste the whole key"} onChange={(e) => set({ key: e.target.value })} />
        </label>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" className={dark} disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add it"}
        </button>
        <button type="button" className={light} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

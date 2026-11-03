"use client";

import { useCallback, useEffect, useState } from "react";
import { repoStatusOf, RUN_ACTIVE, type RepoCard, type RepoPlan, type RepoRun, type ReposAnswer, type RepoStatusWord } from "@/lib/repos";

/*
 * Settings, Repos (lib/server/repos.ts, app/api/repos): ready-to-run GitHub repos, each with what it is, its license
 * and its status on the picked bot's computer, Open (its README, files and link) and Run. Run first shows the plan:
 * the commit, the Linux user it runs as, every command and the ports; it runs only on Approve and run, and only that
 * plan (when anything changed since, the new plan is shown instead). "Run a GitHub repo" takes any GitHub address:
 * one with no recipe gets commands guessed from its files, shown the same way, and nothing runs until Approve. A web
 * app's port is on that bot's computer only: it isn't forwarded here, and the section says how to reach it.
 */

const pill = "shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-4 disabled:opacity-50";
const dark = `${pill} bg-ink text-white`;
const light = `${pill} bg-[#F2F2F0] text-ink`;

const WORDS: Record<RepoStatusWord, string> = {
  running: "Running",
  installed: "Installed",
  failed: "Failed",
  working: "Setting up",
  "not installed": "Not installed",
};
const DOT: Record<RepoStatusWord, string> = {
  running: "bg-[#2BB673]",
  installed: "bg-[#3B82F6]",
  failed: "bg-[#D93025]",
  working: "bg-[#E59A0B]",
  "not installed": "bg-[#C9C9C6]",
};

type Shown = { kind: "plan"; plan: RepoPlan; text: string; target: Target; changed?: boolean } | { kind: "open"; text: string; title: string } | null;
type Target = { repoId?: string; url?: string };

const ago = (t: number) => {
  const m = Math.max(1, Math.round((Date.now() - t) / 60_000));
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/repos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, status: r.status, j };
}

export function ReposSection() {
  const [data, setData] = useState<ReposAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [botId, setBotId] = useState<string>("");
  const [shown, setShown] = useState<Shown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  // Each tick reads the list again (after a change, and every few seconds while a run is under way).
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    fetch("/api/repos", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as ReposAnswer & { error?: string };
        if (!r.ok) throw new Error(j.error ?? "Bops didn't answer.");
        return j;
      })
      .then((j) => {
        if (!live) return;
        setData(j);
        setBotId((b) => b || j.bots[0]?.id || "");
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [tick]);
  const active = !!data?.runs.some((r) => RUN_ACTIVE.has(r.state));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active, load]);

  const state = { runs: data?.runs ?? [] };
  const statusOf = (repoId: string) => repoStatusOf(state, botId, repoId);

  const plan = async (target: Target, key: string) => {
    setBusy(key);
    setNote(null);
    const r = await post({ action: "plan", bot: botId, ...target });
    setBusy(null);
    if (!r.ok) return setNote(String(r.j.error ?? "Couldn't make a plan."));
    setShown({ kind: "plan", plan: r.j.plan as RepoPlan, text: String(r.j.text ?? ""), target });
  };
  const approve = async () => {
    if (shown?.kind !== "plan") return;
    setBusy("approve");
    const r = await post({ action: "run", bot: botId, ...shown.target, planId: shown.plan.id });
    setBusy(null);
    if (r.status === 409 && r.j.changed) return setShown({ ...shown, plan: r.j.plan as RepoPlan, text: String(r.j.text ?? ""), changed: true });
    if (!r.ok) return setNote(String(r.j.error ?? "It didn't start."));
    setShown(null);
    setNote(`Started ${shown.plan.name}. Its result is also said in the bot's chat.`);
    load();
  };
  const open = async (target: Target, title: string, key: string) => {
    setBusy(key);
    setNote(null);
    const r = await post({ action: "open", bot: botId, ...target });
    setBusy(null);
    if (!r.ok) return setNote(String(r.j.error ?? "Couldn't open it."));
    setShown({ kind: "open", text: String(r.j.text ?? ""), title });
  };
  const stop = async (repoId: string) => {
    setBusy(`stop:${repoId}`);
    const r = await post({ action: "stop", bot: botId, repoId });
    setBusy(null);
    setNote(String(r.j.text ?? r.j.error ?? ""));
    load();
  };

  if (error && !data)
    return (
      <p role="alert" className="text-[12.5px] text-[#B00020]">
        {error}
      </p>
    );
  if (!data) return <p className="text-[12.5px] text-pencil">Loading the repos…</p>;

  return (
    <div data-repos className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <label className="flex items-center gap-2">
          <span className="text-pencil">Runs on</span>
          <select aria-label="Bot" value={botId} onChange={(e) => setBotId(e.target.value)} className="rounded-md bg-[#F2F2F0] px-2 py-1">
            {data.bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}&apos;s computer
              </option>
            ))}
          </select>
        </label>
        <span className="text-pencil">Each repo runs as a locked down user of its own, with no keys. Bops shows you every command before the first run.</span>
      </div>

      <form
        data-run-url
        className="flex flex-col gap-2 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_#E6E6E3]"
        onSubmit={(e) => {
          e.preventDefault();
          void plan({ url: url.trim() }, "url");
        }}
      >
        <span className="text-[13.5px] font-semibold">Run a GitHub repo</span>
        <span className="text-[12px] text-pencil">Paste its address. Bops reads its files and shows you the commands it would run; nothing runs until you approve.</span>
        <div className="flex gap-2">
          <input type="url" aria-label="GitHub address" placeholder="https://github.com/owner/name" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-0 flex-1 rounded-md bg-[#F2F2F0] px-2.5 py-1.5 text-[12.5px] outline-none" />
          <button type="submit" className={dark} disabled={!url.trim() || !botId || busy === "url"}>
            {busy === "url" ? "Checking…" : "Check"}
          </button>
          <button type="button" className={light} disabled={!url.trim() || !botId || busy === "url-open"} onClick={() => void open({ url: url.trim() }, url.trim(), "url-open")}>
            Open
          </button>
        </div>
      </form>

      {note && (
        <p data-repos-note aria-live="polite" className="text-[12.5px] text-[#3A3A38]">
          {note}
        </p>
      )}

      {shown?.kind === "plan" && (
        <div data-repo-plan role="dialog" aria-label="Run plan" className="flex flex-col gap-2 rounded-[14px] bg-[#FFFBEA] p-3.5 shadow-[0_0_0_1px_#F0E3A6]">
          <span className="text-[13.5px] font-semibold">{shown.changed ? `${shown.plan.name} changed since you looked: here's the new plan` : `Run ${shown.plan.name}?`}</span>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[17px] text-[#3A3A38]">{shown.text}</pre>
          {shown.plan.kind === "web" && shown.plan.ports[0] ? (
            <span className="text-[12px] text-pencil">
              Once it runs it&apos;s at http://localhost:{shown.plan.ports[0]} on that bot&apos;s computer, not on the web and not on this computer. Open it in a browser on that computer&apos;s screen (the Computer panel).
            </span>
          ) : null}
          {!shown.plan.run.length && !shown.plan.install.length ? (
            <span className="text-[12px] text-[#8A5A00]">Bops can&apos;t tell how to run it. Open it and read its README.</span>
          ) : (
            <div className="flex gap-2">
              <button className={dark} disabled={busy === "approve"} onClick={() => void approve()}>
                {busy === "approve" ? "Starting…" : "Approve and run"}
              </button>
              <button className={light} onClick={() => setShown(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {shown?.kind === "open" && (
        <div data-repo-open className="flex flex-col gap-2 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_#E6E6E3]">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[13.5px] font-semibold">{shown.title}</span>
            <button className={light} onClick={() => setShown(null)}>
              Close
            </button>
          </div>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[17px] text-[#3A3A38]">{shown.text}</pre>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {data.recipes.map((r) => (
          <RepoRow key={r.id} r={r} status={statusOf(r.id)} busy={busy} onOpen={() => void open({ repoId: r.id }, r.name, `open:${r.id}`)} onRun={() => void plan({ repoId: r.id }, `run:${r.id}`)} onStop={() => void stop(r.id)} />
        ))}
      </ul>
      {data.problems.length > 0 && (
        <details className="text-[12px] text-pencil">
          <summary className="cursor-pointer">{data.problems.length} recipe problem(s): left out</summary>
          <ul className="list-disc pl-4">
            {data.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RepoRow({ r, status, busy, onOpen, onRun, onStop }: { r: RepoCard; status: { word: RepoStatusWord; run?: RepoRun }; busy: string | null; onOpen: () => void; onRun: () => void; onStop: () => void }) {
  const run = status.run;
  const up = status.word === "running" || status.word === "working";
  return (
    <li data-repo={r.id} className="flex flex-col gap-1.5 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_#E6E6E3]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13.5px] font-semibold leading-[18px]">{r.name}</span>
        <a href={r.url} target="_blank" rel="noreferrer" className="text-[12px] text-pencil underline">
          {r.repo}
        </a>
        {r.private && <span className="rounded-full bg-[#F2F2F0] px-2 py-0.5 text-[11px]">Private</span>}
        <span className="flex-1" />
        <span data-status={status.word} className="flex items-center gap-1 text-[12px] text-[#3A3A38]">
          <span className={`size-[7px] rounded-full ${DOT[status.word]}`} />
          {WORDS[status.word]}
        </span>
      </div>
      <span className="text-[12.5px] leading-[18px] text-[#3A3A38]">{r.what}</span>
      <span className="text-[12px] text-pencil">
        License: {r.license}
        {r.licenseNote ? `. ${r.licenseNote}` : ""}
      </span>
      {run && (
        <span data-repo-run className="text-[12px] text-pencil">
          {RUN_ACTIVE.has(run.state) && run.step ? run.step : ""}
          {run.state === "failed" && run.error ? `Failed: ${run.error}` : ""}
          {run.health ? ` Last health check: ${run.health.ok ? "ok" : "failing"} (${run.health.detail}), ${ago(run.health.at)}.` : ""}
          {status.word === "running" && run.ports[0] ? ` At http://localhost:${run.ports[0]} on that bot's computer (open it in a browser on its screen).` : ""}
        </span>
      )}
      {r.blocked ? (
        <span className="text-[12px] text-[#8A5A00]">{r.blocked}</span>
      ) : (
        !r.fits && <span className="text-[12px] text-[#8A5A00]">Not a good fit for a bot&apos;s computer: {r.fitsReason}</span>
      )}
      <div className="flex gap-1.5 pt-0.5">
        <button className={light} disabled={busy === `open:${r.id}`} onClick={onOpen}>
          Open
        </button>
        {up ? (
          <button className={light} disabled={busy === `stop:${r.id}`} onClick={onStop}>
            Stop
          </button>
        ) : (
          <button className={dark} disabled={!!r.blocked || busy === `run:${r.id}`} onClick={onRun}>
            {busy === `run:${r.id}` ? "Checking…" : "Run"}
          </button>
        )}
      </div>
    </li>
  );
}

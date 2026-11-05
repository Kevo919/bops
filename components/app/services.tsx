"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ServicesView, ServiceView } from "@/lib/server/services";
import { InProgress } from "./in-progress";
import { RestartButton, RestartIcon, useCanRestart } from "./restart";

/*
 * Settings, Services: where the keys for Bops' outside services go, so nobody has to edit .env.local. One row each:
 * Texting and calls (AgentPhone), Email (AgentMail), Memory (Honcho) and Connected apps (Composio). Each says what it
 * does, how it stands, takes its key in a masked box with Save, links to where the key is made, and has a Check. The
 * "not set up yet" notes elsewhere (How bots reach you, Email and phone, a bot's Memory tab, Connect an app) open this
 * pane at their row (`focus`). Only the owner's desktop window gets the boxes (/api/services); a phone or a team's
 * workspace sees how each stands. A key is never sent back here: only "ends in" its last four characters.
 */

export type ServiceRow = ServiceView["id"];
/** Each row's id on the page, for a note that links to it. */
export const serviceAnchor = (id: ServiceRow) => `service-${id}`;

/**
 * The pane's status colors, each a pair for light and dark picked by the window's color-scheme (light-dark(), as #84's
 * in-progress.tsx does), set once on the pane as variables. Everything else uses the theme's own tokens (ink, pencil,
 * desk, rule, paper, destructive).
 */
const COLORS = {
  "--svc-ok": "light-dark(#067647, #75E0A7)",
  "--svc-ok-dot": "light-dark(#12B76A, #47CD89)",
  "--svc-wait-dot": "light-dark(#F5B83D, #FDB022)",
  "--svc-wait-bg": "light-dark(#FFF8E6, #3A2A0A)",
} as CSSProperties;
const DOT: Record<ServiceView["status"], string> = { on: "bg-[var(--svc-ok-dot)]", restart: "bg-[var(--svc-wait-dot)]", broken: "bg-destructive", off: "bg-pencil/40" };
const STATUS: Record<ServiceView["status"], string> = { on: "Set up", restart: "Saved, not in use yet", broken: "Key saved but not working", off: "Not set up" };
const pill = "rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-4 disabled:opacity-40";
const dark = `${pill} bg-[color:var(--hb-0a0a0a)] text-[color:var(--bops-on-fill)]`;
const light = `${pill} bg-desk hover:bg-rule`;

/** The pane: every service, then what isn't built yet. `focus`: the row a note asked for (scrolled to, its box focused). */
export function ServicesSettings({ focus }: { focus?: { id: ServiceRow; at: number } }) {
  const [view, setView] = useState<ServicesView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/services", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setView((await r.json()) as ServicesView);
      setError(null);
    } catch {
      setError("Couldn't read how your services stand. Check that Bops is running, then open this again.");
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  // A note's link: scroll its row into view and put the cursor in its first box, once the rows are there.
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!view || !focus || seen.current === focus.at) return;
    seen.current = focus.at;
    const row = document.getElementById(serviceAnchor(focus.id));
    row?.scrollIntoView({ block: "start", behavior: "smooth" });
    row?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [view, focus]);
  if (error && !view) return <p role="alert" className="px-[22px] pt-4 text-[12.5px] text-destructive">{error}</p>;
  if (!view) return <p className="px-[22px] pt-4 text-[12.5px] text-pencil">Checking your services…</p>;
  const on = view.services.filter((s) => s.status === "on").length;
  return (
    <div data-services style={COLORS} className="flex flex-col gap-2 px-[22px] pt-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold">
          {on} of {view.services.length} set up
        </span>
        <span className="text-[12px] leading-4 text-pencil">
          {view.mode === "cloud"
            ? "Signed in with Orgo, Bops Cloud runs these for you: there are no keys to add."
            : view.editable
              ? "Paste a key, press Save, and Bops keeps it on this PC. Keys are never shown again: only their last four characters."
              : "Keys are added by the owner, in the Bops app on the PC it runs on. Here you can see how each one stands."}
        </span>
      </div>
      {view.services.map((s) =>
        // Composio (your account) is in lib/feature-status.ts as being tested: usable, with #84's red label.
        s.id === "composio-account" ? (
          <InProgress key={s.id} id="composio-for-you">
            <ServiceCard s={s} editable={view.editable} focused={focus?.id === s.id} onView={setView} />
          </InProgress>
        ) : (
          <ServiceCard key={s.id} s={s} editable={view.editable} focused={focus?.id === s.id} onView={setView} />
        ),
      )}
      {view.mode === "self" && (
        // Not built yet (lib/feature-status.ts, "phone-verify-codes"): grayed, red "Not set up yet", its percent.
        <InProgress id="phone-verify-codes">
          <div className="flex flex-col gap-1 rounded-[14px] p-3.5 shadow-[0_0_0_1px_var(--color-rule)]">
            <span className="text-[13.5px] font-semibold leading-[18px]">Proving your mobile number</span>
            <span className="text-[12.5px] leading-[18px] text-ink/80">So a text from your phone counts as you, Bops texts you a code through Twilio Verify. Its keys can&apos;t be pasted here yet.</span>
          </div>
        </InProgress>
      )}
    </div>
  );
}

/** One service: what it does, how it stands, its boxes (the owner's), where to get the key, Check, and Restart when needed. */
function ServiceCard({ s, editable, focused, onView }: { s: ServiceView; editable: boolean; focused: boolean; onView: (v: ServicesView) => void }) {
  const canRestart = useCanRestart();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = async (body: object, what: string) => {
    setBusy(what);
    setError(null);
    try {
      const r = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => null)) as (ServicesView & { error?: string }) | null;
      if (!r.ok || !j?.services) throw new Error(j?.error ?? "Couldn't do that just now. Try again.");
      onView(j);
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't do that just now. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };
  const save = async (name: string) => {
    const value = drafts[name] ?? "";
    // The key leaves this box as soon as it's sent: it isn't kept in the page, whatever the answer.
    setDrafts((d) => ({ ...d, [name]: "" }));
    await send({ service: s.id, name, value }, `save:${name}`);
  };
  const saved = !!s.fields?.[0]?.set;
  return (
    <div
      id={serviceAnchor(s.id)}
      data-service={s.id}
      data-status={s.status}
      className={`flex scroll-mt-4 flex-col gap-2 rounded-[14px] p-3.5 ${focused ? "shadow-[0_0_0_2px_var(--color-ink)]" : "shadow-[0_0_0_1px_var(--color-rule)]"}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`size-[8px] shrink-0 rounded-full ${DOT[s.status]}`} />
        <span className="text-[13.5px] font-semibold leading-[18px]">{s.name}</span>
        <span className="text-[12px] leading-4 text-pencil/80">{s.provider}</span>
        <span data-service-status className={`ml-auto text-[12px] font-medium leading-4 ${s.status === "broken" ? "text-destructive" : s.status === "on" ? "text-[var(--svc-ok)]" : "text-ink/80"}`}>
          {STATUS[s.status]}
        </span>
      </div>
      <span className="text-[12.5px] leading-[18px] text-ink/80">{s.what}</span>
      {/* (Plain "Not set up." would only repeat the status on the right.) */}
      {s.words !== "Not set up." && (
        <span data-service-words className="text-[12px] leading-4 text-pencil">
          {s.words}
        </span>
      )}
      {editable &&
        s.fields?.map((f) => {
          const draft = drafts[f.name] ?? "";
          const id = `${serviceAnchor(s.id)}-${f.name}`;
          return (
            <form
              key={f.name}
              className="flex flex-col gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) void save(f.name);
              }}
            >
              <label htmlFor={id} className="text-[12px] font-medium leading-4 text-ink/80">
                {f.label}
                {f.set && <span className="font-normal text-pencil">{f.secret ? ` · saved, ${f.shown}` : " · saved"}</span>}
              </label>
              <div className="flex min-w-0 gap-1.5">
                <input
                  id={id}
                  data-service-box={f.name}
                  type={f.secret ? "password" : "url"}
                  inputMode={/address/i.test(f.label) ? "url" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.name]: e.target.value }))}
                  placeholder={f.set ? (f.secret ? `Saved (${f.shown}). Paste a new key to replace it` : f.shown) : f.secret && !/address/i.test(f.label) ? "Paste the key here" : f.hint}
                  className="min-w-0 flex-1 rounded-lg bg-paper px-2.5 py-1.5 font-mono text-[12.5px] shadow-[0_0_0_1px_var(--color-rule)] outline-none placeholder:font-sans placeholder:text-pencil/70 focus:shadow-[0_0_0_1.5px_var(--color-ink)]"
                />
                <button type="submit" disabled={!draft.trim() || busy !== null} title={draft.trim() ? undefined : f.secret ? "Paste a key first" : "Type the address first"} className={dark}>
                  {busy === `save:${f.name}` ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          );
        })}
      {error && (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      )}
      {s.check && <span className={`text-[12px] leading-4 ${s.check.ok ? "text-[var(--svc-ok)]" : "text-destructive"}`}>{s.check.words}</span>}
      {editable && s.status === "restart" && (
        <div data-service-restart className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--svc-wait-bg)] px-2.5 py-2">
          <span className="text-[12.5px] font-medium leading-4">Restart Bops to use it.</span>
          {canRestart ? (
            <RestartButton compact className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-[12.5px] font-medium leading-4 shadow-[0_0_0_1px_var(--color-rule)] hover:bg-desk">
              <RestartIcon />
              Restart Bops
            </RestartButton>
          ) : (
            <span className="text-[12px] text-pencil">Quit Bops and open it again.</span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <a className="text-[12px] underline" href={s.getKey.href} target="_blank" rel="noopener noreferrer">
          {s.getKey.label}
        </a>
        {editable && s.canCheck && (
          <button
            type="button"
            className={`${light} ml-auto`}
            disabled={!saved || busy !== null}
            title={saved ? `Asks ${s.provider} whether it accepts this key. Nothing is sent or bought.` : "Save a key first"}
            aria-label={`Check ${s.name}`}
            onClick={() => void send({ check: s.id }, "check")}
          >
            {busy === "check" ? "Checking…" : "Check"}
          </button>
        )}
      </div>
    </div>
  );
}

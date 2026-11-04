"use client";

import { useComputerWords } from "./computer-words";

import { useCallback, useEffect, useRef, useState } from "react";
import { BRAINS_ON, signInOn, workBot, workspaceOf, type AppState, type Bot, type BotAi } from "@/lib/types";
import { aiOf, accountOf, paysLabel } from "@/lib/agents";
import { brainSignIn } from "./brains";
import { useVaultKeyNames } from "./keys";
import { Spinner } from "./mascot";
import { useMacApp } from "./mac-screens";
import { RestartAsk } from "./restart";
import { post, teamOf, useSelfHosted } from "./ui";
import { UpdateSettings } from "./update-notice";
import type { KeyCheckResult } from "@/lib/server/key-check";
import { ModelsCard } from "./models-card";
import { HandyCard } from "./handy-card";

/*
 * Everything Bops needs on this Mac, in one place: Settings → This Mac. It never stands in the way: signing in
 * goes straight to the app, and the account menu (sidebar.tsx) shows a badge while something here still
 * needs the user and they haven't skipped it, and opens Settings there (a page, never a sheet over the app).
 *
 * - Screen recording, the microphone and notifications are this app's own macOS permissions, asked
 *   through the Mac app (desktop/main.cjs, window.bopsMac.permissions). In a browser they can't be.
 * - Routing through this Mac: bots' computers reach the internet through this Mac (app/api/relay).
 *   It's on by default wherever Orgo offers it, so the card shows it on; turning it off sticks.
 *
 * When something's off, the account menu offers Restart Bops (restart.tsx), as the Screen recording card does.
 *
 * - Full access (Settings → This Mac only): bots' tasks on this Mac run outside Bops'
 *   sandbox, with a shell, the user's files and apps (MacState.fullAccess). Off until the user turns it on.
 *
 * The user's mobile isn't asked for here: it becomes theirs when they call or text their bot's number
 * (the bot's profile and Settings say how), or with a texted code in Settings (owner-phone.tsx).
 */

/** The local official CLIs keep their own logins; cloud accounts remain computer-specific. */
export function AiSubscriptionsCard({ state, onShowScreen, onOpenVault }: { state: AppState; onShowScreen: (botId: string, display: number) => void; onOpenVault: () => void }) {
  const computerWords = useComputerWords();
  const selfHosted = useSelfHosted();
  const desktop = useMacApp();
  const localAvailable = selfHosted && desktop;
  const [target, setTarget] = useState<"pc" | "cloud">("pc");
  const localSelected = localAvailable && target === "pc";
  const bots = teamOf(state).filter((b) => state.host !== "mac" && b.runsOn !== "mac");
  const [selected, setSelected] = useState("");
  const b = bots.find((x) => x.id === selected) ?? bots[0];
  const keys = useVaultKeyNames(b ? workspaceOf(b) : "", !localSelected && BRAINS_ON && !!b && !state.shared);
  if (state.shared) return null;
  return (
    <section aria-label="AI subscriptions" className="mx-[22px] mt-4 flex shrink-0 flex-col gap-3 rounded-2xl bg-[#FAFAF9] p-4 shadow-[0_0_0_1px_#E6E6E3]">
      <h2 className="text-[15px] font-semibold">AI subscriptions</h2>
      <div role="group" aria-label="Where to connect subscriptions" className="flex flex-wrap gap-2">
        {localAvailable && <button type="button" aria-pressed={localSelected} onClick={() => setTarget("pc")} className={localSelected ? dark : light}>This PC</button>}
        <button type="button" aria-pressed={!localSelected} onClick={() => setTarget("cloud")} className={!localSelected ? dark : light}>Bot cloud computer</button>
      </div>
      {localSelected ? <>
        <p className="text-[12px] leading-5 text-[#6B6B6B]">Sign in through the official CLI in your normal browser. Its login stays on this PC across restarts. No bot computer or AI profile is needed to connect. Tasks with your plan run on a bot&apos;s cloud computer; tasks on this PC are coming later.</p>
        <LocalSubscriptions />
        <div className="rounded-xl bg-white p-3 text-[12px] shadow-[0_0_0_1px_#E6E6E3]"><h3 className="font-semibold">z.ai GLM Coding Plan</h3><p className="my-2">Connect with a key from your Coding Plan account in Keys. This is not a browser sign-in; a saved Z.ai key alone does not verify a subscription.</p><button type="button" onClick={onOpenVault} className={light}>Manage Coding Plan key</button></div>
      </> : <>
        <p className="text-[12px] leading-5 text-[#6B6B6B]">Cloud subscriptions power tasks on the selected bot&apos;s computer. Sign-in opens on that computer&apos;s screen. This does not connect the subscription on your PC.</p>
        {!BRAINS_ON ? <p role="status" className="text-[12px]">{computerWords("Cloud agent harnesses are off in this build. Enable Agent harnesses in Settings → This Mac → Modules, then rebuild Bops.")} {localAvailable ? "Local subscription sign-in is available on the This PC tab." : "Local subscription sign-in is available in the self-hosted desktop app."}</p> : <>
          <label className="flex flex-wrap items-center gap-2 text-[12px]">Connect on
            <select aria-label="Subscription bot and computer" value={b?.id ?? ""} disabled={!b} onChange={(e) => setSelected(e.target.value)} className="min-w-0 max-w-full rounded-lg border border-[#E6E6E3] bg-white p-2">
              {!b && <option value="">No cloud bot available</option>}
              {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name} · {workBot(bot, state.bots).computerId ? `${workBot(bot, state.bots).name}'s computer` : "computer will be set up when you sign in"}</option>)}
            </select>
          </label>
          {!b && <p className="text-[12px]">No bot is set to work on a cloud computer. {localAvailable ? "Connect on This PC, or change where your bot works first." : "Change where your bot works first."}</p>}
          {(["claude", "codex", "zai"] as const).map((kind) => <SubscriptionRow key={`${b?.id}:${kind}`} kind={kind} state={state} bot={b} keys={keys} selfHosted={selfHosted} onShowScreen={onShowScreen} onOpenVault={onOpenVault} />)}
        </>}
      </>}
    </section>
  );
}

export type LocalSubscription = { kind: "codex" | "claude"; available: boolean; connected: boolean; state: "missing" | "signed-out" | "connecting" | "connected" | "error"; error?: string; loginUrl?: string; account?: string; plan?: string; checkedAt?: number };
const localSnapshot = (value: unknown): LocalSubscription => {
  const s = value as LocalSubscription | null;
  if (!s || !["codex", "claude"].includes(s.kind) || typeof s.available !== "boolean" || typeof s.connected !== "boolean" || !["missing", "signed-out", "connecting", "connected", "error"].includes(s.state)) throw new Error("Bops returned an unreadable subscription status. Try Check connection.");
  return s;
};
const loginLink = (value?: string) => {
  try { const u = new URL(value ?? ""); return u.protocol === "https:" && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
};

/** Only non-secret CLI metadata is read; the server opens and supervises official login. */
export function LocalSubscriptions() {
  const [rows, setRows] = useState<LocalSubscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logout, setLogout] = useState<LocalSubscription["kind"] | null>(null);
  const pending = useRef<AbortController | null>(null);
  const active = useRef(true);
  const refresh = useCallback(async (kind?: LocalSubscription["kind"]) => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/local-subscriptions${kind ? `?kind=${kind}` : ""}`, { cache: "no-store", signal: controller.signal });
      const j = await response.json();
      if (!response.ok) throw new Error(j.error ?? "Couldn't check local subscriptions.");
      if (!Array.isArray(j.subscriptions)) throw new Error("Bops returned no subscription status. Try Check connection.");
      const next = j.subscriptions.map(localSnapshot);
      if (kind && (next.length !== 1 || next[0].kind !== kind)) throw new Error("Bops returned a different subscription status.");
      if (active.current && pending.current === controller) { setRows((old) => kind ? [...(old ?? []).filter((r) => r.kind !== kind), ...next] : next); setError(null); }
    } catch (e) { if (active.current && pending.current === controller) setError(controller.signal.aborted ? "Checking local subscriptions timed out. Try Check connection." : e instanceof Error ? e.message : "Couldn't reach Bops."); }
    finally { clearTimeout(timer); if (pending.current === controller) pending.current = null; }
  }, []);
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; active.current = false; pending.current?.abort(); };
  }, [refresh]);
  const connecting = rows?.filter((r) => r.state === "connecting").map((r) => r.kind).sort().join(",");
  useEffect(() => {
    if (!connecting || busy) return;
    const kinds = connecting.split(",") as LocalSubscription["kind"][];
    let next = 0;
    const timer = setInterval(() => { if (!pending.current) void refresh(kinds[next++ % kinds.length]); }, 2000);
    return () => clearInterval(timer);
  }, [connecting, busy, refresh]);
  const action = async (kind: LocalSubscription["kind"], operation: "login" | "cancel" | "logout") => {
    if (busy) return;
    pending.current?.abort(); pending.current = null;
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 30000);
    setBusy(kind); setError(null);
    try {
      const response = await fetch("/api/local-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, action: operation }), signal: controller.signal });
      const j = await response.json();
      if (!response.ok) throw new Error(j.error ?? `Could not ${operation} the local subscription.`);
      const subscription = localSnapshot(j.subscription);
      if (subscription.kind !== kind) throw new Error("Bops returned a different subscription. Check the connection before trying again.");
      if (active.current && pending.current === controller) { setRows((old) => [...(old ?? []).filter((r) => r.kind !== kind), subscription]); setLogout(null); }
    } catch (e) { if (active.current && pending.current === controller) setError(controller.signal.aborted ? "The subscription action timed out. Check connection before retrying." : e instanceof Error ? e.message : "Couldn't reach Bops."); }
    finally { clearTimeout(timer); if (pending.current === controller) pending.current = null; if (active.current) setBusy(null); }
  };
  return <div className="flex flex-col gap-3">
    {!rows && !error && <p role="status" className="text-[12px]">Checking official CLI subscriptions on this PC…</p>}
    {(["codex", "claude"] as const).map((kind) => {
      const s = rows?.find((r) => r.kind === kind);
      const provider = kind === "codex" ? "ChatGPT" : "Claude";
      const rawPlan = typeof s?.plan === "string" ? s.plan.trim() : "";
      const knownPlan = rawPlan ? rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1) : "";
      const link = kind === "codex" && s?.state === "connecting" ? loginLink(s.loginUrl) : undefined;
      return <div key={kind} className="flex flex-col gap-2 rounded-xl bg-white p-3 text-[12px] shadow-[0_0_0_1px_#E6E6E3]">
        <h3 className="text-[13px] font-semibold">{kind === "codex" ? "ChatGPT Plus/Pro" : "Claude Pro/Max"} · This PC</h3>
        <p>{kind === "codex" ? "Connect the official Codex account on this PC. ChatGPT subscription chat and local subscription tasks are not enabled yet." : "Connect Claude Code's own subscription on this PC. Local subscription tasks are not enabled yet. Claude subscriptions do not power Bops chat."}</p>
        <p role="status">{!s ? "Status not checked yet." : s.state === "missing" ? `${kind === "codex" ? "Codex" : "Claude Code"} CLI was not found on this PC.` : s.state === "connecting" ? "Finish signing in in your normal browser. Bops will check automatically." : s.state === "error" ? "The subscription could not be confirmed." : s.connected ? `Connected: your ${provider}${knownPlan ? ` ${knownPlan}` : ""} subscription` : "Not signed in on this PC."}</p>
        {s?.error && <p role="alert" className="text-[#B00020]">{s.error}</p>}
        {s?.state === "missing" && <p>{kind === "codex" ? "Install the official Codex CLI on this PC" : "Install Claude Code using its official native installer (the npm claude.cmd launcher is not used)"}, then check the connection again.</p>}
        {kind === "claude" && <p>Complete sign-in only in the browser opened automatically by Claude Code. Bops cannot accept a pasted authorization code. If no browser opens, cancel and try the native CLI directly.</p>}
        {s?.connected && <p className="text-[#6B6B6B]">{typeof s.account === "string" && s.account ? s.account : "Account details unavailable"}{!knownPlan ? ". The CLI did not report the plan tier." : ""}</p>}
        {typeof s?.checkedAt === "number" && Number.isFinite(s.checkedAt) && <p className="text-[#6B6B6B]">Last checked: {new Date(s.checkedAt).toLocaleString()}</p>}
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="underline">Open official sign-in page</a>}
        <div className="flex flex-wrap gap-2">
          {s?.state === "connecting" ? <button type="button" disabled={!!busy} onClick={() => void action(kind, "cancel")} className={light}>Cancel {provider} sign-in</button> : s?.connected ? <button type="button" disabled={!!busy} onClick={() => setLogout(kind)} className={light}>Sign out of {provider} on this PC</button> : <button type="button" disabled={!s?.available || !!busy} onClick={() => void action(kind, "login")} className={dark}>{busy === kind ? "Opening sign-in…" : `Sign in with your ${provider} subscription`}</button>}
          <button type="button" disabled={!!busy} onClick={() => void refresh(kind)} className={light}>Check {provider} connection</button>
        </div>
        {logout === kind && <div role="alertdialog" aria-label={`Sign out of ${provider}`} className="rounded-lg bg-[#FFF8EB] p-3"><p>This signs the official {kind === "codex" ? "Codex" : "Claude Code"} CLI out on this PC, including its use outside Bops. Existing tasks may lose access.</p><div className="mt-2 flex gap-2"><button type="button" disabled={!!busy} onClick={() => void action(kind, "logout")} className={dark}>Confirm sign out</button><button type="button" disabled={!!busy} onClick={() => setLogout(null)} className={light}>Keep signed in</button></div></div>}
      </div>;
    })}
    {error && <p role="alert" className="text-[12px] text-[#B00020]">{error}</p>}
  </div>;
}

export function SubscriptionRow({ kind, state, bot: b, keys, selfHosted, onShowScreen, onOpenVault }: { kind: "claude" | "codex" | "zai"; state: AppState; bot?: Bot; keys?: ReadonlySet<string>; selfHosted: boolean; onShowScreen: (botId: string, display: number) => void; onOpenVault: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const candidates = b ? aiOf(b, state).agents.filter((a) => kind === "zai" ? (a.kind === "opencode" || a.kind === "dsh") && a.pays === "key" && a.model?.startsWith("zai-coding/") : a.kind === kind && a.pays === "plan") : [];
  const agent = candidates.find((a) => a.id === chosen) ?? candidates[0];
  const account = agent && accountOf(agent, state);
  const computer = b && workBot(b, state.bots).computerId;
  const signing = computer && account?.signingIn?.computerId === computer ? account.signingIn : undefined;
  const signed = !signing?.failed && account && computer ? signInOn(account, computer) : undefined;
  const pending = signing && !signing.failed;
  const allowed = !!b && !state.shared && (kind !== "codex" || selfHosted);
  const name = kind === "claude" ? "Claude Pro/Max" : kind === "codex" ? "ChatGPT Plus/Pro" : "z.ai GLM Coding Plan";
  const connected = signed && agent ? paysLabel(agent, state, computer).replace(/ plan$/, " subscription") : undefined;
  const perform = async (action: "connect" | "out" | "refresh") => {
    if (!allowed || !b || busy) return;
    setBusy(true); setError(null);
    try {
      if (action === "out" || action === "refresh") {
        if (kind === "zai" ? !agent : !account) throw new Error("Choose a connected account first.");
        const res = kind === "zai" ? await post("/api/bots/ai", { botId: b.id, op: "remove", agentId: agent!.id }) : action === "out" ? await post("/api/brains/sign-out", { brainId: account!.id, botId: b.id }) : await fetch(`/api/brains/sign-in?brain=${encodeURIComponent(account!.id)}&bot=${encodeURIComponent(b.id)}`, { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "The connection could not be updated.");
        setDisconnecting(false);
      } else {
        let next: (typeof candidates)[number] | undefined = agent;
        if (!next) {
          const res = await post("/api/bots/ai", { botId: b.id, op: "add", kind: kind === "zai" ? "opencode" : kind, pays: kind === "zai" ? "key" : "plan", ...(kind === "zai" ? { model: "zai-coding/glm-5.3" } : {}) });
          const j = await res.json() as { error?: string; added?: string; ai?: BotAi };
          if (!active.current) return;
          if (!res.ok) throw new Error(j.error ?? "The subscription agent could not be added.");
          next = j.ai?.agents.find((a) => a.id === j.added);
          if (!next) throw new Error("The agent was not returned. Refresh Settings before retrying.");
          setChosen(next.id);
        }
        if (!active.current) return;
        if (kind === "zai") onOpenVault();
        else {
          if (!next.account) throw new Error("This agent has no subscription account.");
          const problem = await brainSignIn(next.account, b.id, (botId, display) => { if (active.current) onShowScreen(botId, display); });
          if (problem) throw new Error(problem);
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't reach Bops. Try again."); }
    finally { setBusy(false); }
  };
  return <div className="flex flex-col gap-2 rounded-xl bg-white p-3 text-[12px] shadow-[0_0_0_1px_#E6E6E3]">
    <h3 className="text-[13px] font-semibold">{name}</h3>
    {candidates.length > 1 && <label>Account <select aria-label={`${name} account`} value={agent?.id} disabled={busy} onChange={(e) => { setChosen(e.target.value); setError(null); }}>{candidates.map((a) => <option key={a.id} value={a.id}>{accountOf(a, state)?.name ?? a.model}</option>)}</select></label>}
    {kind === "zai" ? <>
      <p>The Coding Plan uses a key from your z.ai plan account, saved in Keys as ZAI_API_KEY. This is not a browser sign-in.</p>
      <p role="status">{agent ? keys === undefined ? "Coding Plan route configured; key status unavailable." : keys.has("ZAI_API_KEY") ? "Coding Plan route configured; key saved. Subscription entitlement is not verified." : "Coding Plan route configured; add your plan account's key." : "Not configured. A regular Z.ai API key alone does not confirm a Coding Plan subscription."}</p>
    </> : <>
      <p role="status">{pending ? "Signing in on this computer…" : signing?.failed ? `Sign-in failed: ${signing.failed}` : connected ? `Connected: ${connected}` : "Not signed in on this computer."}</p>
      {signed && <p className="text-[#6B6B6B]">{signed.account?.email ?? "Account email unavailable"}{signed.account?.orgName ? ` · ${signed.account.orgName}` : ""} · Last confirmed: {new Date(signed.at).toLocaleString()}{kind === "codex" && !signed.account?.plan ? ". ChatGPT did not report the subscription tier." : ""}</p>}
      {kind === "codex" && !selfHosted && <p>ChatGPT subscriptions are available only to the self-hosted owner.</p>}
    </>}
    <div className="flex flex-wrap gap-2">
      {pending && signing ? <button type="button" disabled={!allowed || busy} onClick={() => onShowScreen(signing.botId, signing.display)} className={dark}>Show sign-in screen</button> : !signed && <button type="button" disabled={!allowed || busy} onClick={() => void perform("connect")} className={dark}>{busy ? "Connecting…" : kind === "zai" ? "Connect your Coding Plan key" : "Sign in with your subscription"}</button>}
      {signed && <><button type="button" disabled={!allowed || busy} onClick={() => void perform("refresh")} className={light}>Check connection</button><button type="button" disabled={!allowed || busy} onClick={() => void perform("out")} className={light}>Sign out on this computer</button></>}
      {kind === "zai" && agent && <button type="button" disabled={!allowed || busy} onClick={() => setDisconnecting(true)} className={light}>Disconnect Coding Plan tasks</button>}
    </div>
    {disconnecting && <div role="alertdialog" aria-label="Disconnect Coding Plan tasks" className="rounded-lg bg-[#FFF8EB] p-3"><p>This removes the selected Coding Plan agent and stops its running tasks. Your saved Z.ai key stays available to other agents.</p><div className="mt-2 flex gap-2"><button type="button" disabled={busy} className={dark} onClick={() => void perform("out")}>Disconnect</button><button type="button" disabled={busy} className={light} onClick={() => setDisconnecting(false)}>Cancel</button></div></div>}
    {error && <p role="alert" className="text-[#B00020]">{error}</p>}
  </div>;
}

export type PermId = "screen" | "microphone" | "notifications" | "accessibility" | "fullDisk" | "automation";
export type PermStatus = "granted" | "denied" | "not-determined" | "restricted" | "unknown";

type ScriptedApp = { id: string; name: string; status: PermStatus };
type Permissions = {
  /** These permissions (all of them unless some are named). Automation's runs osascript. */
  status(ids?: PermId[]): Promise<Partial<Record<PermId, PermStatus>>>;
  request(id: PermId): Promise<PermStatus>;
  openSettings(id: PermId): Promise<void>;
  /** Full access's apps, each with its Automation answer (null until Bops can read them). Older Mac apps don't have it. */
  automationApps?(): Promise<ScriptedApp[] | null>;
};
type Bridge = { permissions?: Permissions; screenNeedsRestart?: () => Promise<boolean> };
const bridge = () => (window as unknown as { bopsMac?: Bridge }).bopsMac;

export type RelayInfo = { available: boolean; on: boolean; reason?: string; device?: { id: string; name: string }; running: boolean; online?: boolean; routedComputers: string[] };

/** The items on the setup screen, which it can record as skipped (app/api/setup keeps the same list). */
export type SetupItem = "screen" | "microphone" | "notifications" | "relay";
type Item = SetupItem;
const ITEMS: Item[] = ["screen", "microphone", "notifications", "relay"];

/** The OS permissions setup asks for. Accessibility isn't one: Bops itself never drives other apps. */
const ASKED: PermId[] = ["microphone", "notifications", "screen"];

/**
 * Runs `fn` now, whenever the window comes back (from System Settings, say), and every `every` ms while
 * it's in front (0: only then). A grant made in System Settings means leaving Bops, so coming back covers it.
 */
function useWhileOpen(fn: () => void, every = 3000) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const run = () => ref.current();
    const onVisible = () => document.visibilityState === "visible" && run();
    run();
    const t = every ? setInterval(() => document.visibilityState === "visible" && document.hasFocus() && run(), every) : undefined;
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [every]);
}

/** This Mac's permissions for Bops (`ids`, else all of them), read live, and whether Screen Recording waits on a restart. */
function usePermissions(every: number, ids?: PermId[]) {
  const inApp = useMacApp();
  const [status, setStatus] = useState<Partial<Record<PermId, PermStatus>> | null>(null);
  const [restart, setRestart] = useState(false);
  const refresh = useCallback(async () => {
    const b = bridge();
    if (!b?.permissions) return;
    try {
      setStatus(await b.permissions.status(ids));
      setRestart(!!(await b.screenNeedsRestart?.()));
    } catch {
      /* the next look tries again */
    }
  }, [ids]);
  useWhileOpen(() => void refresh(), every);
  return { inApp: inApp && !!bridge()?.permissions, status, restart, refresh };
}

/** Routing through this Mac (GET/POST /api/relay). A server without the route reads as not available. */
function useRelay(every: number) {
  const [info, setInfo] = useState<RelayInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = async (res: Response) => {
    const j = (await res.json().catch(() => ({}))) as Partial<RelayInfo> & { error?: string };
    if (res.status === 404) return { available: false, on: false, running: false, routedComputers: [] } satisfies RelayInfo;
    if (!res.ok && j.available === undefined) throw new Error(j.error || j.reason || "Couldn't reach routing on this computer.");
    return { available: !!j.available, on: !!j.on, reason: j.reason, device: j.device, running: !!j.running, online: j.online, routedComputers: j.routedComputers ?? [] } satisfies RelayInfo;
  };
  const load = useCallback(async () => {
    try {
      setInfo(await read(await fetch("/api/relay", { cache: "no-store" })));
    } catch {
      setInfo((was) => was ?? { available: false, on: false, running: false, routedComputers: [] });
    }
  }, []);
  useWhileOpen(() => void (!busy && load()), every);
  const turn = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
      const j = (await res.clone().json().catch(() => ({}))) as { error?: string };
      if (!res.ok && j.error) setError(j.error);
      setInfo(await read(res));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  return { info, busy, error, turn };
}

/**
 * Everything the cards need, shared by the setup screen, Settings and the account menu's badge. The badge,
 * always there, reads the permissions only when the window comes back, and like the setup screen only the
 * ones it counts (ASKED): Settings' Full access needs Automation's too, which runs osascript each time.
 */
function useSetupItems(state: AppState, use: "badge" | "setup" | "settings") {
  const perms = usePermissions(use === "badge" ? 0 : 3000, use === "settings" ? undefined : ASKED);
  const relay = useRelay(use === "badge" ? 30_000 : 5000);
  // Grants made in System Settings show up through the polling; this is what was opened there.
  const [sentToSettings, setSent] = useState<Set<PermId>>(new Set());
  const [asking, setAsking] = useState<PermId | null>(null);
  const ask = async (id: PermId) => {
    const p = bridge()?.permissions;
    if (!p) return;
    setAsking(id);
    try {
      const now = await p.request(id);
      // macOS answers Screen Recording in System Settings (its prompt offers to open it), and a grant
      // there only applies after a restart: offer one from here on.
      if (id === "screen" && now !== "granted") setSent((s) => new Set(s).add("screen"));
    } finally {
      setAsking(null);
      await perms.refresh();
    }
  };
  const openSettings = async (id: PermId) => {
    setSent((s) => new Set(s).add(id));
    await bridge()?.permissions?.openSettings(id);
  };
  const done = (item: Item) => (item === "relay" ? !!relay.info?.on || !!state.relay?.on : perms.status?.[item] === "granted");
  // What the user can do something about here: a permission in the Mac app (once read), routing where Orgo offers it.
  const offered = (item: Item) => (item === "relay" ? !!relay.info?.available : perms.inApp && !!perms.status?.[item]);
  /** What still needs the user: what the setup screen's Continue records as skipped, and what the badge counts. */
  const waiting = ITEMS.filter((i) => !done(i) && offered(i));
  return { state, perms, relay, ask, asking, openSettings, sentToSettings, done, waiting };
}
type Items = ReturnType<typeof useSetupItems>;

/* ---------------- The cards ---------------- */

type Tone = "ok" | "todo" | "off" | "none";
const DOT: Record<Tone, string> = { ok: "bg-[#2BB673]", todo: "bg-[#E59A0B]", off: "bg-[#C9C9C6]", none: "bg-[#C9C9C6]" };
const pill = "shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-4 disabled:opacity-50";
const dark = `${pill} bg-ink text-white`;
const light = `${pill} bg-[#F2F2F0] hover:bg-[#EAEAE7]`;

/** One thing to set up: what it is, where it stands, its buttons (`children`), and anything that goes under it (`below`, lined up with the title). */
function Card({
  icon,
  title,
  chip,
  line,
  tone,
  status,
  children,
  below,
}: {
  icon: React.ReactNode;
  title: string;
  chip?: string;
  line: string;
  tone: Tone;
  status: string;
  children?: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_#E6E6E3]">
      <div className="flex items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-[11px] ${tone === "ok" ? "bg-ink text-highlighter" : "bg-[#F2F2F0] text-ink"}`}>{icon}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="text-[13.5px] font-semibold leading-[18px]">{title}</span>
            {chip && <span className="rounded-full bg-[#F2F2F0] px-2 py-px text-[11px] font-medium leading-4 text-[#3A3A38]">{chip}</span>}
          </span>
          <span className="text-[12px] leading-4 text-pencil">{line}</span>
          <span className="flex items-center gap-1.5 pt-0.5 text-[12px] leading-4 text-[#3A3A38]">
            <span className={`size-[7px] shrink-0 rounded-full ${DOT[tone]}`} />
            {status}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">{children}</div>
      </div>
      {below && <div className="pl-12 pt-3">{below}</div>}
    </div>
  );
}

const ICONS = {
  screen: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5.5 14h5M8 11.5V14" strokeLinecap="round" />
      <circle cx="8" cy="7" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  microphone: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
      <path d="M3 7.5a5 5 0 0010 0M8 12.5v2" />
    </svg>
  ),
  notifications: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M4 11.5V7a4 4 0 018 0v4.5l1 1.2H3z" />
      <path d="M6.6 14.2a1.5 1.5 0 002.8 0" strokeLinecap="round" />
    </svg>
  ),
  fullAccess: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="7" width="11" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 015.8-1.1" />
    </svg>
  ),
  modules: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" />
    </svg>
  ),
  phone: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
      <path d="M7 12.2h2" />
    </svg>
  ),
  relay: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c1.8 1.7 2.6 3.8 2.6 6.2S9.8 12.5 8 14.2C6.2 12.5 5.4 10.4 5.4 8S6.2 3.5 8 1.8z" />
    </svg>
  ),
};

const COPY: Record<"screen" | "microphone" | "notifications", { title: string; line: string }> = {
  screen: { title: "Screen recording", line: "See your Mac live in Bops, and watch bots work on it." },
  microphone: { title: "Microphone", line: "Talk to your bots on a call." },
  notifications: { title: "Notifications", line: "Hear from bots when something needs you." },
};

function PermissionCard({ id, items }: { id: "screen" | "microphone" | "notifications"; items: Items }) {
  const computerWords = useComputerWords();
  const { perms, ask, asking, openSettings, sentToSettings } = items;
  const [restarting, setRestarting] = useState(false);
  const s = perms.status?.[id];
  const copy = COPY[id];
  if (!perms.inApp)
    return <Card icon={ICONS[id]} title={copy.title} line={computerWords(copy.line)} tone="none" status={computerWords("Needs the Bops app for Mac")} />;
  if (!s) return <Card icon={ICONS[id]} title={copy.title} line={computerWords(copy.line)} tone="none" status="Checking" />;
  // Screen Recording turned on while Bops was open: macOS applies it on the next launch.
  const restart = id === "screen" && (perms.restart || (s !== "granted" && sentToSettings.has("screen")));
  const status =
    s === "granted"
      ? id === "screen" && perms.restart
        ? "Allowed. Restart Bops to use it"
        : "Allowed"
      : s === "restricted"
        ? id === "notifications"
          ? computerWords("Not available on this Mac")
          : computerWords("Blocked by your Mac's settings or admin")
        : s === "denied"
          ? restart
            ? "Turn on Bops in System Settings, then restart Bops"
            : "Off. Turn it on in System Settings"
          : id === "notifications" && s === "unknown"
            ? "Asked. Check System Settings if none showed"
            : "Not asked yet";
  const tone: Tone = s === "granted" && !(id === "screen" && perms.restart) ? "ok" : s === "not-determined" || s === "unknown" ? "off" : "todo";
  return (
    <Card icon={ICONS[id]} title={copy.title} line={computerWords(copy.line)} tone={tone} status={status} below={restarting ? <RestartAsk compact onCancel={() => setRestarting(false)} /> : undefined}>
      {restart && !restarting && (
        <button onClick={() => setRestarting(true)} className={s === "granted" ? dark : light}>
          Restart Bops
        </button>
      )}
      {s === "not-determined" || (id === "notifications" && s === "unknown") ? (
        <button disabled={!!asking} onClick={() => void ask(id)} className={dark}>
          {asking === id ? <Spinner size={11} color="#FFFFFF" /> : "Allow"}
        </button>
      ) : s === "denied" || (s === "unknown" && id !== "notifications") ? (
        <button onClick={() => void openSettings(id)} className={restart ? light : dark}>
          Open System Settings
        </button>
      ) : null}
    </Card>
  );
}

function RelayCard({ items }: { items: Items }) {
  const computerWords = useComputerWords();
  const { info, busy, error, turn } = items.relay;
  const line = computerWords("Your bots' computers go online through this Mac, so websites see your home internet.");
  if (!info) return <Card icon={ICONS.relay} title={computerWords("Route through this Mac")} line={line} tone="none" status="Checking" />;
  if (!info.available) return <Card icon={ICONS.relay} title={computerWords("Route through this Mac")} line={line} tone="none" status={info.reason ? `Not available yet. ${info.reason}` : "Not available yet"} />;
  const n = info.routedComputers.length;
  // On by default: the relay may still be starting (or reconnecting) while it's on.
  const connecting = !info.running || info.online === false;
  const status = error
    ? error
    : info.on
      ? `On${info.device ? ` as ${info.device.name}` : ""}${connecting ? ", connecting" : ""}. ${n ? `${n} computer${n === 1 ? "" : "s"} routed` : "No computers routed yet"}`
      : "Off. Bots' computers use Orgo's connection";
  return (
    <Card icon={ICONS.relay} title={computerWords("Route through this Mac")} line={line} tone={error ? "todo" : info.on ? (connecting ? "todo" : "ok") : "off"} status={status}>
      <button disabled={busy} onClick={() => void turn(!info.on)} className={info.on ? light : dark}>
        {busy ? <Spinner size={11} color={info.on ? "#0A0A0A" : "#FFFFFF"} /> : info.on ? "Turn off" : "Turn on"}
      </button>
    </Card>
  );
}

function Cards({ items }: { items: Items }) {
  return (
    <div className="flex flex-col gap-2">
      <PermissionCard id="screen" items={items} />
      <PermissionCard id="microphone" items={items} />
      <PermissionCard id="notifications" items={items} />
      <RelayCard items={items} />
    </div>
  );
}

/** Ask macOS for each permission still unasked, one after another (the microphone and notifications first: their prompts stay in Bops). */
async function allowAll(items: Items) {
  for (const id of ASKED) {
    const s = items.perms.status?.[id];
    if (s === "not-determined" || (id === "notifications" && s === "unknown")) await items.ask(id);
  }
}

/* ---------------- What still waits ---------------- */

/**
 * What on the setup screen still needs the user and they haven't skipped there, in the screen's order:
 * the sidebar's Needs you (one row each) and the account menu's badge (sidebar.tsx). The same items and
 * the same "done" as the screen's own.
 */
export function useSetupWaiting(state: AppState): SetupItem[] {
  const items = useSetupItems(state, "badge");
  const skipped = new Set(state.setup?.skipped ?? []);
  return items.waiting.filter((i) => !skipped.has(i));
}

/** Whether something on the setup screen still needs the user (useSetupWaiting has anything). */
export function useSetupNeedsYou(state: AppState) {
  return useSetupWaiting(state).length > 0;
}

/** What a setup item that still needs the user is called in the sidebar's Needs you. */
export const SETUP_NEEDS: Record<SetupItem, string> = {
  screen: "Screen recording is off",
  microphone: "Microphone is off",
  notifications: "Notifications are off",
  relay: "Routing through this Mac is off",
};

/* ---------------- In Settings ---------------- */

/**
 * Settings → This Mac: the cards, to come back to any time, and where the account menu's Permissions on this Mac and the
 * badge on your initials open. While something still needs you and you haven't skipped it, Skip for now records it as
 * skipped (what the setup screen's Continue did), which puts the badge away for it.
 */
export function ThisMacSettings({ state }: { state: AppState }) {
  const computerWords = useComputerWords();
  const items = useSetupItems(state, "settings");
  const [busy, setBusy] = useState(false);
  const skipped = new Set(state.setup?.skipped ?? []);
  const waiting = items.waiting.filter((i) => !skipped.has(i));
  const skip = async () => {
    setBusy(true);
    await post("/api/setup", { skipped: items.waiting }).catch(() => undefined);
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2 px-[22px] pt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">{computerWords("This Mac")}</span>
        <span className="flex items-center gap-1.5">
          {items.perms.inApp && ASKED.some((id) => items.perms.status?.[id] === "not-determined") && (
            <button onClick={() => void allowAll(items)} className={light}>
              Allow all
            </button>
          )}
          {waiting.length > 0 && (
            <button data-setup-skip disabled={busy} onClick={() => void skip()} className={light} title="Anything you skip stays here">
              Skip for now
            </button>
          )}
        </span>
      </div>
      <Cards items={items} />
      <FullAccessCard items={items} />
      <PhoneCard />
      <ModulesCard />
      <div id="settings-keys" className="scroll-mt-4">
        <KeysCard />
      </div>
      <ModelsCard />
      <HandyCard />
      <UpdateSettings />
    </div>
  );
}

/**
 * What Full access needs from macOS, asked for here up front rather than mid-task: Full Disk Access
 * (files in protected places, and Messages' history), which only System Settings can give, then
 * Automation for each app bots script, which Bops asks for all at once (desktop/main.cjs askAutomation:
 * apps it opens for that stay hidden).
 */
function FullAccessSetup({ items }: { items: Items }) {
  const [apps, setApps] = useState<ScriptedApp[] | null>(null);
  useWhileOpen(() => void bridge()?.permissions?.automationApps?.().then(setApps).catch(() => {}), 5000);
  const disk = items.perms.status?.fullDisk === "granted";
  const auto = items.perms.status?.automation;
  const asking = items.asking === "automation";
  const off = (apps ?? []).filter((a) => a.status === "denied").map((a) => a.name);
  const names = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : (list[0] ?? ""));
  const row = (done: boolean, title: string, text: string, button?: React.ReactNode) => (
    <div className="flex items-center gap-2.5">
      <span className={`size-[7px] shrink-0 rounded-full ${done ? DOT.ok : DOT.todo}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] font-medium leading-4">{title}</span>
        <span className="text-[12px] leading-4 text-pencil">{text}</span>
      </div>
      {button}
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      {row(
        disk,
        "Your files",
        disk ? "Bops has Full Disk Access." : "Give Bops Full Disk Access in System Settings, then come back.",
        !disk && (
          <button onClick={() => void items.openSettings("fullDisk")} className={dark}>
            Open Settings
          </button>
        ),
      )}
      {row(
        auto === "granted",
        "Your apps",
        auto === "granted"
          ? `Bots can use ${names((apps ?? []).map((a) => a.name)) || "your apps"}.`
          : asking
            ? "macOS asks once for each app: allow each one. Apps open hidden and close after."
            : off.length
              ? `Turned off for ${names(off)}. Turn them on under Automation in System Settings.`
              : "Allow the apps bots use (Messages, Notes, Mail and the rest) now, so macOS doesn't ask mid-task.",
        auto !== "granted" &&
          (off.length && !asking ? (
            <button onClick={() => void items.openSettings("automation")} className={light}>
              Open Settings
            </button>
          ) : (
            <button onClick={() => void items.ask("automation")} disabled={asking || !disk} title={disk ? undefined : "Full Disk Access first"} className={dark}>
              {asking ? "Asking…" : "Allow apps"}
            </button>
          )),
      )}
    </div>
  );
}

/** Full access for bots on this Mac (MacState.fullAccess): off by default, and only here, with what it means. */
function FullAccessCard({ items }: { items: Items }) {
  const computerWords = useComputerWords();
  const on = !!items.state.mac?.fullAccess;
  // Windows has no Full Disk Access or Automation to grant: Full access needs nothing more there.
  const windows = computerWords("Mac") === "PC";
  const here = windows ? "this PC" : computerWords("this Mac");
  const set = windows || (items.perms.status?.fullDisk === "granted" && items.perms.status?.automation === "granted");
  if (!items.state.mac?.ready && !on) return null;
  return (
    <Card
      icon={ICONS.fullAccess}
      title="Full access for bots"
      chip={on ? "On" : undefined}
      line={`Bots' tasks on ${here} get a shell, your files and your apps, outside ${windows ? "Codex's sandbox" : "Bops' sandbox"}. Anything you could do here, they can.`}
      tone={on ? (set || !items.perms.inApp ? "ok" : "todo") : "off"}
      status={on ? (set || !items.perms.inApp ? "Bots can use your files and apps" : "Two steps left, so macOS never stops a bot mid-task") : windows ? "Off: bots browse in a Chrome of their own. On Windows, Codex's sandbox limits what they write, not what they can read" : `Off: bots on ${here} only browse, in a Chrome of their own`}
      below={on && items.perms.inApp && !windows ? <FullAccessSetup items={items} /> : undefined}
    >
      <button onClick={() => void post("/api/mac", { fullAccess: !on }, "PATCH")} className={on ? light : dark}>
        {on ? "Turn off" : "Turn on"}
      </button>
    </Card>
  );
}

type Remote = { paired: boolean; created: number | null; code?: string; qr?: string | null; addresses: { tailnet: string[]; home: string[]; public: string | null } };

/**
 * The Bops Android app (lib/server/remote.ts): pair it here, and it reaches this Bops from the phone over
 * Tailscale (or the home wifi, or a public address). The code is shown once, right after pairing; pairing
 * again makes a new one and the phone paired before stops working, and so does Unpair.
 */
function PhoneCard() {
  const [r, setR] = useState<Remote | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const load = useCallback(() => void fetch("/api/remote").then((x) => (x.ok ? x.json() : null)).then(setR).catch(() => {}), []);
  useEffect(load, [load]);
  if (!r) return null;
  // Never a home-network (plain http) address: the code would cross the wifi unencrypted.
  const where = r.addresses.public ?? r.addresses.tailnet[0] ?? null;
  const pairNow = async () => {
    const res = await post("/api/remote", {});
    const body = (await res.json().catch(() => null)) as Remote | null;
    if (body?.code) setCode(body.code);
    setQr(body?.qr ?? null);
    load();
  };
  const unpairNow = async () => {
    await post("/api/remote", {}, "DELETE");
    setCode(null);
    setQr(null);
    load();
  };
  return (
    <Card
      icon={ICONS.phone}
      title="Your phone"
      chip={r.paired ? "Paired" : undefined}
      line="Chat with your bots and answer their questions from the Bops app on your phone."
      tone={r.paired ? "ok" : "off"}
      status={
        r.paired
          ? `Paired ${r.created ? new Date(r.created).toLocaleDateString() : ""}`.trim()
          : r.addresses.tailnet.length || r.addresses.public
            ? "Not paired"
            : "Not paired. Install Tailscale on this computer and your phone so the phone can reach Bops away from home."
      }
      below={
        code ? (
          <div className="flex flex-col gap-1.5 text-[12.5px] leading-5">
            {qr && (
              <>
                <span className="text-pencil">Scan this with your phone&apos;s camera (with the Bops app installed):</span>
                {/* The QR code is an SVG this server made itself (qrcode), never anything from outside. */}
                <div className="size-40 rounded bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} />
              </>
            )}
            <span className="text-pencil">{qr ? "Or" : "In the Bops app on your phone,"} enter:</span>
            <span>
              Address: <code className="select-all font-mono">{where ?? "none yet: turn on Tailscale on this computer"}</code>
            </span>
            <span>
              Pairing code: <code className="select-all break-all font-mono">{code}</code>
            </span>
            <span className="text-pencil">This code is shown only now. Anyone with it can use your bots, so keep it to yourself.</span>
          </div>
        ) : undefined
      }
    >
      <div className="flex gap-1.5">
        <button onClick={() => void pairNow()} className={r.paired ? light : dark}>
          {r.paired ? "Pair again" : "Pair a phone"}
        </button>
        {r.paired && (
          <button onClick={() => void unpairNow()} className={light}>
            Unpair
          </button>
        )}
      </div>
    </Card>
  );
}

/** Presence is local. Provider requests only happen when the owner presses a row's Check button. */
export function KeysCard() {
  const [keys, setKeys] = useState<KeyCheckResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>("refresh");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/key-check", { signal: controller.signal, cache: "no-store" });
      if (response.status === 403) throw new Error("Open Settings in the Bops desktop app to check its server keys.");
      if (!response.ok) throw new Error("Couldn't read key status. Try Refresh.");
      const body = (await response.json()) as { keys?: KeyCheckResult[] };
      if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("No key status was returned. Try Refresh.");
      if (pending.current === controller) setKeys(body.keys);
    } catch (e) {
      if (pending.current === controller) setError(controller.signal.aborted ? "Reading key status timed out. Try Refresh." : e instanceof Error && e.message.startsWith("Open Settings") ? e.message : "Couldn't read key status. Check that Bops is running, then try Refresh.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) setBusy(null);
    }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(start);
      pending.current?.abort();
      pending.current = null;
    };
  }, [load]);
  const check = async (key: string) => {
    if (busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(key);
    setError(null);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/key-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }), signal: controller.signal });
      if (!response.ok) throw new Error("Couldn't check this key. Open the desktop app and try again.");
      const body = (await response.json()) as { result?: KeyCheckResult };
      if (!body.result || body.result.key !== key) throw new Error("The check returned no result. Try again.");
      if (pending.current === controller) setKeys((rows) => rows?.map((row) => row.key === key ? body.result! : row) ?? null);
    } catch {
      if (pending.current === controller) setError("Couldn't complete the check. Try again when the server is reachable.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) setBusy(null);
    }
  };
  const set = keys?.filter((key) => key.status !== "not set").length ?? 0;
  return (
    <Card
      icon={ICONS.modules}
      title="Keys"
      line="Server API keys from your environment. Values are never shown. Check sends one request to that provider; OpenAI checks generate up to one token and may cost a tiny amount."
      tone={error ? "todo" : set ? "ok" : "none"}
      status={busy === "refresh" ? "Reading key status…" : keys ? `${set} of ${keys.length} set` : "Key status unavailable"}
      below={
        <div className="flex flex-col gap-2" aria-live="polite">
          {error && <p role="alert" className="text-[12px] text-[#B00020]">{error}</p>}
          {keys?.map((row) => (
            <div key={row.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 shadow-[0_0_0_1px_#E6E6E3]">
              <div className="min-w-0 flex-1 text-[12px]">
                <div className="font-medium">{row.label}: {busy === row.key ? "Checking…" : row.status}</div>
                <div className="break-all font-mono text-[11px] text-pencil">{row.key}</div>
                {row.message && <p className="text-pencil">{row.message}</p>}
              </div>
              <button className={light} disabled={busy !== null || row.status === "not set"} aria-label={`Check ${row.label}`} onClick={() => void check(row.key)}>Check</button>
            </div>
          ))}
          <a className="text-[12px] underline" href="https://github.com/Kevo919/bops/blob/windows-port/docs/keys.md" target="_blank" rel="noopener noreferrer">How to get keys and set spending limits</a>
          <p className="text-[12px] text-pencil">A successful authentication check does not guarantee credits or access to every model. After changing .env.local, restart Bops and refresh this list.</p>
          <p data-accounts-help className="text-[12px] text-pencil">More than one account for a provider (a work and a personal key): to add another account, put a line like <span className="font-mono">OPENROUTER_API_KEY__WORK=...</span> in .env.local (the provider&apos;s key name, two underscores, then a label of A to Z, 0 to 9 and _), and restart Bops. Each account gets its own row and Check here, and you pick it for a model in Models. Bots&apos; tasks on their computers still use the default account.</p>
        </div>
      }
    >
      <button className={light} disabled={busy !== null} onClick={() => { setBusy("refresh"); setError(null); void load(); }}>Refresh</button>
    </Card>
  );
}

type ModuleSetting = { key: string; label: string; help: string | null; type: "text" | "toggle" | string[]; placeholder: string | null; value: unknown };
type ModuleInfo = { id: string; name: string; help: string; required: boolean; enabled: boolean; keysSet: boolean; keys: string[]; settings: ModuleSetting[] };

/**
 * Bops' modules (config/modules.cjs): each part that can be swapped or switched off, like DeepSeek
 * Harness's plugins: the AI provider and models, the bots' computers, memory, apps, email, phone and
 * the rest. Saved to config/bops.yaml; Bops restarts to use them. Keys stay in .env.local.
 */
function ModulesCard() {
  const [mods, setMods] = useState<ModuleInfo[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void fetch("/api/modules").then((x) => (x.ok ? x.json() : null)).then((b) => b && setMods(b.modules)).catch(() => {}), []);
  if (!mods) return null;
  const value = (m: ModuleInfo, key: string, fallback: unknown) => (draft[m.id] && key in draft[m.id] ? draft[m.id][key] : fallback);
  const change = (id: string, key: string, v: unknown) => setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: v } }));
  const dirty = Object.keys(draft).length > 0;
  const save = async () => {
    setError(null);
    const res = await fetch("/api/modules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modules: draft }) });
    const body = (await res.json().catch(() => null)) as { modules?: ModuleInfo[]; error?: string } | null;
    if (!res.ok || !body?.modules) return setError(body?.error ?? "Couldn't save.");
    setMods(body.modules);
    setDraft({});
    setSaved(true);
  };
  const on = mods.filter((m) => m.enabled && m.keysSet).length;
  return (
    <Card
      icon={ICONS.modules}
      title="Modules"
      line="Every part of Bops you can swap or switch off: the AI provider and models, computers, memory, apps, email, phone and more. Saved in config/bops.yaml; keys stay in .env.local."
      tone="ok"
      status={`${on} of ${mods.length} on and set up`}
      below={
        <div className="flex flex-col gap-1.5">
          {mods.map((m) => {
            const enabled = Boolean(value(m, "enabled", m.enabled));
            return (
              <div key={m.id} className="rounded-md px-2 py-1.5 shadow-[0_0_0_1px_#E6E6E3]">
                <div className="flex items-center gap-2">
                  <button onClick={() => setOpen(open === m.id ? null : m.id)} className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="text-[12.5px] font-medium leading-4">{m.name}</span>
                    <span className="truncate text-[12px] leading-4 text-pencil">{!enabled ? "Off" : m.keysSet ? m.help : `Needs ${m.keys.join(", ")} in .env.local`}</span>
                  </button>
                  {!m.required && (
                    <label className="flex items-center gap-1 text-[12px]">
                      <input type="checkbox" checked={enabled} onChange={(e) => change(m.id, "enabled", e.target.checked)} />
                      On
                    </label>
                  )}
                </div>
                {open === m.id && m.settings.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1.5 border-t border-[#EEEEEC] pt-1.5">
                    {m.settings
                      .filter((st) => st.key !== "enabled")
                      .map((st) => (
                        <label key={st.key} className="flex flex-col gap-0.5 text-[12px]">
                          <span className="text-pencil">{st.label}</span>
                          {st.type === "toggle" ? (
                            <input type="checkbox" className="self-start" checked={Boolean(value(m, st.key, st.value))} onChange={(e) => change(m.id, st.key, e.target.checked)} />
                          ) : Array.isArray(st.type) ? (
                            <select className="rounded border border-[#E6E6E3] px-1.5 py-1" value={String(value(m, st.key, st.value) ?? "")} onChange={(e) => change(m.id, st.key, e.target.value)}>
                              <option value="">Default</option>
                              {st.type.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input className="rounded border border-[#E6E6E3] px-1.5 py-1 font-mono" placeholder={st.placeholder ?? "Default"} value={String(value(m, st.key, st.value) ?? "")} onChange={(e) => change(m.id, st.key, e.target.value)} />
                          )}
                          {st.help && <span className="text-pencil">{st.help}</span>}
                        </label>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
          {error && <span className="text-[12px] text-[#B00020]">{error}</span>}
          {saved && <RestartAsk compact onCancel={() => setSaved(false)} />}
        </div>
      }
    >
      <button onClick={() => void save()} disabled={!dirty} className={dirty ? dark : light}>
        Save
      </button>
    </Card>
  );
}

"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OpenSettings } from "./open-settings";
import type { AppState } from "@/lib/types";
import type { KeyCheckResult } from "@/lib/server/key-check";
import { InProgress } from "./in-progress";

/*
 * Settings → This Mac → Connections: the outside accounts Bops can use, one row each, in plain words. Composio (your
 * connected apps: Gmail, Slack, Notion, Google Sheets…), Composio (your account: the apps connected in Composio's
 * For You, over its MCP address; shown only masked), Zapier (the actions on your Zapier MCP server) and
 * OpenRouter (hundreds of AI models, some free). Each row says whether its key is set, and after Check whether it
 * works; where to get the key, and what to paste where. Keys are added by hand in .env.local, as on the Keys card:
 * nothing here reads, shows or saves one. The status comes from /api/key-check (the same as Keys): only whether a
 * key is set, and the check's own words, never a key or an address.
 */

type Row = {
  key: string;
  name: string;
  what: string;
  getKey: { label: string; href: string };
  paste: string;
  more?: string;
};

export const CONNECTIONS: Row[] = [
  {
    key: "COMPOSIO_API_KEY",
    name: "Composio (connected apps)",
    what: "Lets your bots use Gmail, Slack, Notion, Google Sheets and about 1,000 more apps. You sign in to each app on its own page; Composio keeps the login, Bops never sees your password.",
    getKey: { label: "Get a key at composio.dev", href: "https://composio.dev" },
    paste: "Sign in at composio.dev, open Settings, Project Settings, and copy the project key under API Keys (it starts with ak_). Put it in .env.local as COMPOSIO_API_KEY=your_key, then restart Bops.",
  },
  {
    key: "COMPOSIO_MCP_URL",
    name: "Composio (your account)",
    what: "Lets your bots use the apps you already connected yourself in Composio's For You area (like Gmail and Google Drive), in your own chats in Bops. Reading runs right away; anything that sends, changes, deletes or pays asks you first.",
    getKey: { label: "Open Composio", href: "https://composio.dev" },
    paste: "In Composio, open For You, then Connect my agent, copy the address, paste it here: in .env.local, add a line COMPOSIO_MCP_URL= followed by the address. If that page shows a key too (it starts with ck_), add a line COMPOSIO_MCP_KEY= followed by the key. Then restart Bops and press Check.",
    more: "Only in your own chats in the Bops app: not for team members, Telegram, Discord, Slack, texts, emails, routines, or the bots' cloud computers.",
  },
  {
    key: "ZAPIER_MCP_URL",
    name: "Zapier",
    what: "Lets your bots run the Zapier actions you pick, in your own chats in Bops. Anything that could change something asks you first.",
    getKey: { label: "Make a server at mcp.zapier.com", href: "https://mcp.zapier.com" },
    paste: "At mcp.zapier.com make a server for \"Other\" MCP clients, add the actions you want, then copy its server URL (it has your token in it, so keep it private). Put it in .env.local as ZAPIER_MCP_URL=that_url, then restart Bops.",
    more: "Only in your own chats in the Bops app: not for team members, Telegram, Discord, Slack, texts, emails, routines, or the bots' cloud computers.",
  },
  {
    key: "OPENROUTER_API_KEY",
    name: "OpenRouter",
    what: "Hundreds of AI models for chats and bots, some of them free (their ids end in :free). Pick one in Models below, or in a chat's model box.",
    getKey: { label: "Get a key at openrouter.ai/keys", href: "https://openrouter.ai/keys" },
    paste: "Create a key at openrouter.ai/keys (give it a credit limit). Put it in .env.local as OPENROUTER_API_KEY=your_key, then restart Bops.",
  },
];

/** The row in Settings, Services where each one's key is pasted (services.tsx), so nobody edits .env.local by hand. */
const SERVICE_ROW: Record<string, "apps" | "composio-account" | "zapier"> = { COMPOSIO_API_KEY: "apps", COMPOSIO_MCP_URL: "composio-account", ZAPIER_MCP_URL: "zapier" };

const DOT: Record<string, string> = { ok: "bg-[#12B76A]", set: "bg-[#F5B83D]", error: "bg-[#D92D20]", off: "bg-[#C9C9C6]" };

/** A row's status, in plain words, and its dot. */
export function statusOf(r: KeyCheckResult | undefined, checking: boolean): { tone: keyof typeof DOT; words: string } {
  if (checking) return { tone: "set", words: "Checking…" };
  if (!r || r.status === "not set") return { tone: "off", words: "Not set up yet" };
  if (r.status === "set") return { tone: "set", words: "Set. Press Check to see that it works." };
  if (r.status === "works") return { tone: "ok", words: "Working" };
  const why: Record<string, string> = { invalid: "Not working: the key or address was turned down", "no credit": "Not working: no credit left", "rate limited": "Busy right now: try again later", unavailable: "Couldn't check it right now" };
  return { tone: "error", words: why[r.status] ?? "Not working" };
}

const light = "rounded-full px-3 py-1 text-[12px] font-medium leading-4 shadow-[0_0_0_1px_#E6E6E3] hover:bg-[#F2F2F0] disabled:opacity-40";

/** Settings, Logins, where connected apps are added (bops-app.tsx's Settings nav). */
const openLogins = () => document.querySelector<HTMLButtonElement>('[data-settings-nav="logins"]')?.click();

export function ConnectionsCard({ state }: { state?: Pick<AppState, "accounts"> }) {
  const openSettings = useContext(OpenSettings);
  const [rows, setRows] = useState<KeyCheckResult[] | null>(null);
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
      if (response.status === 403) throw new Error("Open Settings in the Bops desktop app to see your connections.");
      if (!response.ok) throw new Error("Couldn't read your connections. Try Refresh.");
      const body = (await response.json()) as { keys?: KeyCheckResult[] };
      if (pending.current === controller) setRows(Array.isArray(body.keys) ? body.keys : []);
    } catch (e) {
      if (pending.current === controller) setError(e instanceof Error && e.message.startsWith("Open Settings") ? e.message : "Couldn't read your connections. Check that Bops is running, then try Refresh.");
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
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch("/api/key-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }), signal: controller.signal });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { result?: KeyCheckResult };
      if (!body.result || body.result.key !== key) throw new Error();
      if (pending.current === controller) setRows((now) => [...(now ?? []).filter((r) => r.key !== key), body.result!]);
    } catch {
      if (pending.current === controller) setError("Couldn't complete the check. Try again when Bops is running.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) setBusy(null);
    }
  };
  const apps = (state?.accounts ?? []).length;
  const on = CONNECTIONS.filter((c) => {
    const s = rows?.find((r) => r.key === c.key)?.status;
    return s && s !== "not set";
  }).length;
  return (
    <div data-connections className="flex flex-col rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_#E6E6E3]">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13.5px] font-semibold leading-[18px]">Connections</span>
          <span className="text-[12px] leading-4 text-pencil">Outside accounts your bots can use. Keys go in .env.local on the computer running Bops, like the ones on the Keys card; they are never shown here.</span>
          <span className="pt-0.5 text-[12px] leading-4 text-[#3A3A38]">{busy === "refresh" ? "Reading…" : rows ? `${on} of ${CONNECTIONS.length} set up` : "Status unavailable"}</span>
        </div>
        <button className={light} disabled={busy !== null} onClick={() => { setBusy("refresh"); setError(null); void load(); }}>Refresh</button>
      </div>
      <div className="flex flex-col gap-2 pt-3" aria-live="polite">
        {error && <p role="alert" className="text-[12px] text-[#B00020]">{error}</p>}
        {CONNECTIONS.map((c) => {
          const r = rows?.find((x) => x.key === c.key);
          const s = statusOf(r, busy === c.key);
          const checked = r && r.status !== "set" && r.status !== "not set";
          const row = (
            <div key={c.key} data-connection={c.key} className="flex flex-col gap-1 rounded-md px-2.5 py-2 shadow-[0_0_0_1px_#E6E6E3]">
              <div className="flex items-center gap-2">
                <span data-dot={s.tone} className={`size-[8px] shrink-0 rounded-full ${DOT[s.tone]}`} />
                <span className="min-w-0 flex-1 text-[12.5px] font-medium">{c.name}</span>
                <button className={light} disabled={busy !== null || !r || r.status === "not set"} aria-label={`Check ${c.name}`} onClick={() => void check(c.key)}>Check</button>
              </div>
              <div data-status className="text-[12px] text-[#3A3A38]">{s.words}</div>
              {checked && r.message && <div data-message className="text-[12px] text-pencil">{r.message}</div>}
              {r?.shown && <div data-shown className="text-[12px] text-pencil">Saved: {r.shown}</div>}
              <p className="text-[12px] text-pencil">{c.what}</p>
              <p className="text-[12px] text-pencil">{c.paste}</p>
              {c.more && <p className="text-[12px] text-pencil">{c.more}</p>}
              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                <a className="underline" href={c.getKey.href} target="_blank" rel="noopener noreferrer">{c.getKey.label}</a>
                {SERVICE_ROW[c.key] && openSettings && (
                  <button data-open-service={SERVICE_ROW[c.key]} className="underline" onClick={() => openSettings("services", { service: SERVICE_ROW[c.key] })}>
                    Paste it in Settings, Services
                  </button>
                )}
                {c.key === "COMPOSIO_API_KEY" && (
                  <button data-open-apps className="underline" onClick={openLogins}>
                    Connected apps{apps ? ` (${apps})` : ""}: add Gmail, Slack, Notion… in Logins
                  </button>
                )}
              </div>
            </div>
          );
          // Being tested (lib/feature-status.ts): usable, marked with its percent until its live check passes.
          return c.key === "COMPOSIO_MCP_URL" ? (
            <InProgress key={c.key} id="composio-for-you">
              {row}
            </InProgress>
          ) : (
            row
          );
        })}
        <a className="text-[12px] underline" href="https://github.com/Kevo919/bops/blob/windows-port/docs/connections.md" target="_blank" rel="noopener noreferrer">Step by step: connecting Composio, Zapier and OpenRouter</a>
      </div>
    </div>
  );
}

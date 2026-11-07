"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { HOME, KIND_LIST, MAX_PAGES, MAX_TABS, MAX_WIDGETS, normalizeLayout, PAGE_NAME_MAX, SIZES, TITLE_MAX, WIDGET_KINDS, type LayoutOp, type Widget, type WidgetLayout, type WidgetPage, type WidgetSize } from "@/lib/widgets";
import { normalizeLook } from "@/lib/look-theme";
import { botChatId, live, type AppState, type Bot } from "@/lib/types";
import { Mascot } from "./mascot";
import { attentionOf, needsByBot } from "./sidebar-sections";
import { post, teamOf, useNow } from "./ui";
import { OpenLink } from "./panel-tabs";

/*
 * The owner's widgets (Look.layout, lib/widgets.ts): Home and the pages they made, each a grid of widgets,
 * opened from the sidebar's Pages over the chat (like Settings), and tabs pinned to the side panel that show
 * a page or one widget. Every widget is one of a fixed list of kinds, drawn here from its settings alone:
 * nothing in a layout ever runs, and a link opens only http, https or mailto (checked on the server, and
 * again by normalizeLayout as the layout is read). Changes go through /api/widgets, which checks them like
 * the chat's (change_widgets) and puts them on the look's history, so Settings' Undo and a chat card's take
 * them back. Using a widget (typing in a note, ticking a box, pressing a counter) is `quiet`: kept, but not
 * something to undo.
 */

/** The layout in the state: the owner's own, never a shared workspace's (that has none). */
export const layoutOf = (state: AppState): WidgetLayout => normalizeLayout(normalizeLook(state.look?.current).layout);

/** Send changes; the error, in plain words, when one wasn't kept. */
async function change(changes: LayoutOp[], quiet = false): Promise<string | null> {
  const res = await post("/api/widgets", { changes, quiet });
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That change wasn't kept.";
}

/** Four squares: widgets, a page of them. */
export function WidgetsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1.4" />
      <rect x="9" y="2" width="5" height="5" rx="1.4" />
      <rect x="2" y="9" width="5" height="5" rx="1.4" />
      <rect x="9" y="9" width="5" height="5" rx="1.4" />
    </svg>
  );
}
function HomeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M2.5 7.2 8 2.5l5.5 4.7V13a.8.8 0 0 1-.8.8H9.8V10H6.2v3.8H3.3a.8.8 0 0 1-.8-.8z" />
    </svg>
  );
}

/* ---------------- The sidebar's Pages ---------------- */

/**
 * Home and the owner's pages, at the top of the sidebar: one opens it over the chat; + makes a new one.
 * Not in a workspace shared with the owner (bops-app.tsx doesn't pass it there): the widgets are their own.
 */
export function PagesNav({ state, open, onOpen }: { state: AppState; open: string | null; onOpen: (pageId: string) => void }) {
  const layout = layoutOf(state);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const make = async () => {
    const n = name.trim();
    if (!n) return setNaming(false);
    const err = await change([{ action: "add_page", name: n }]);
    if (err) return setError(err);
    setNaming(false);
    setName("");
    setError("");
  };
  // A page just made opens: the newest one with that name, once the state has it.
  const wanted = useRef<string | null>(null);
  useEffect(() => {
    if (!wanted.current) return;
    const p = layout.pages.find((x) => x.name.toLowerCase() === wanted.current);
    if (p) {
      wanted.current = null;
      onOpen(p.id);
    }
  }, [layout.pages, onOpen]);
  const row = (p: WidgetPage) => (
    <button
      key={p.id}
      onClick={() => onOpen(p.id)}
      data-page-row={p.id}
      aria-current={open === p.id ? "page" : undefined}
      className={`group/page flex h-[34px] items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] leading-[18px] max-md:h-11 ${open === p.id ? "bg-[color:var(--bops-tint)]/[0.05] font-medium text-ink" : "text-ink hover:bg-[color:var(--bops-tint)]/[0.03]"}`}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-pencil">{p.id === HOME ? <HomeIcon /> : <WidgetsIcon size={13} />}</span>
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      {p.widgets.length > 0 && (
        <span data-page-count className="shrink-0 text-[12px] leading-4 text-pencil">
          {p.widgets.length}
        </span>
      )}
    </button>
  );
  return (
    <div className="flex flex-col pb-2" data-pages-nav>
      <div className="flex items-center justify-between px-2.5 pb-1">
        <span className="text-[13px] font-medium leading-4 text-pencil">Pages</span>
        {layout.pages.length - 1 < MAX_PAGES && (
          <button
            onClick={() => {
              setNaming(true);
              setError("");
            }}
            title="New page"
            aria-label="New page"
            className="flex size-6 items-center justify-center rounded-full text-pencil hover:bg-[color:var(--bops-tint)]/[0.05] hover:text-ink max-md:size-10"
          >
            <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden>
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {layout.pages.map(row)}
      {naming && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            wanted.current = name.trim().toLowerCase();
            void make();
          }}
          className="flex flex-col gap-1 px-1 pt-1"
        >
          <input
            autoFocus
            value={name}
            maxLength={PAGE_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
            onBlur={() => !name.trim() && setNaming(false)}
            placeholder="Name the page, like Rentals"
            aria-label="New page's name"
            className="h-[34px] rounded-full bg-white px-3.5 text-[13px] text-ink shadow-[0_0_0_1px_var(--color-rule)] outline-none placeholder:text-pencil"
          />
          {error && <span className="px-2 text-[12px] leading-4 text-[color:var(--ht-b42318)]">{error}</span>}
        </form>
      )}
    </div>
  );
}

/* ---------------- A page, over the chat ---------------- */

export type WidgetLinks = {
  /** A bot's chat (leaving the page). */
  onOpenChat: (chatId: string) => void;
  /** A link, as a tab on the right (leaving the page). */
  onOpenLink?: (url: string) => void;
};

/**
 * A page of widgets in the main area (Home or one of the owner's): its name, Edit (add, move, resize,
 * remove, set each one up), Pin as a tab, and for a page of theirs Rename and Remove.
 */
export function WidgetPageView({ state, pageId, onClose, onGone, links, covered = false }: { state: AppState; pageId: string; onClose: () => void; onGone: () => void; links: WidgetLinks; covered?: boolean }) {
  const layout = layoutOf(state);
  const page = layout.pages.find((p) => p.id === pageId);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!page) onGone();
  }, [page, onGone]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not while a page over it (Settings, a bot's page) has the key: Esc closes that one only.
      if (e.key !== "Escape" || e.defaultPrevented || covered) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, covered]);
  if (!page) return null;
  const pinned = layout.tabs.find((t) => t.page === page.id && !t.widget);
  const act = async (ops: LayoutOp[]) => setError((await change(ops)) ?? "");
  // The words' color is part of each look (task 84): an outlined pill reads in ink, a filled one (Done, Remove for sure)
  // in the fill's own words, never both classes at once, where whichever Tailwind wrote last won (black on black).
  const shape = "rounded-full px-3 py-1 text-[12px] font-semibold leading-4 disabled:opacity-40 max-md:min-h-10";
  const pill = `${shape} text-ink shadow-[0_0_0_1px_var(--color-rule)] hover:bg-[color:var(--bops-tint)]/[0.04]`;
  return (
    <div className="motion-fade-in flex min-h-0 w-full flex-1 flex-col bg-desk" data-widget-page={page.id}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-3 pt-5 max-md:px-4">
        <span className="flex size-8 items-center justify-center rounded-full bg-[color:var(--hb-0a0a0a)] text-highlighter">{page.id === HOME ? <HomeIcon size={15} /> : <WidgetsIcon size={14} />}</span>
        {renaming !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act([{ action: "rename_page", page: page.id, name: renaming }]).then(() => setRenaming(null));
            }}
          >
            <input autoFocus value={renaming} maxLength={PAGE_NAME_MAX} onChange={(e) => setRenaming(e.target.value)} onBlur={() => setRenaming(null)} aria-label="Page's name" className="h-8 rounded-full bg-white px-3 text-[16px] font-semibold text-ink shadow-[0_0_0_1px_var(--color-rule)] outline-none" />
          </form>
        ) : (
          <h1 className="min-w-0 truncate text-[20px] font-semibold leading-7 text-ink">{page.name}</h1>
        )}
        <span className="min-w-0 flex-1" />
        <button onClick={() => setEditing(!editing)} className={editing ? `${shape} bg-[color:var(--hb-0a0a0a)] text-[color:var(--bops-on-fill)] shadow-[0_0_0_1px_var(--h-0a0a0a)]` : pill} data-edit-widgets>
          {editing ? "Done" : "Edit"}
        </button>
        {pinned ? (
          <button onClick={() => void act([{ action: "unpin_tab", tab: pinned.id }])} className={pill}>
            Unpin tab
          </button>
        ) : (
          <button disabled={layout.tabs.length >= MAX_TABS} title={layout.tabs.length >= MAX_TABS ? `At most ${MAX_TABS} pinned tabs` : "Show this page in a tab on the right"} onClick={() => void act([{ action: "pin_tab", page: page.id }])} className={pill}>
            Pin as a tab
          </button>
        )}
        {page.id !== HOME && editing && (
          <>
            <button onClick={() => setRenaming(page.name)} className={pill}>
              Rename
            </button>
            <button
              onClick={() => {
                if (!confirmRemove) return setConfirmRemove(true);
                void act([{ action: "remove_page", page: page.id }]);
              }}
              onBlur={() => setConfirmRemove(false)}
              className={confirmRemove ? `${shape} bg-[color:var(--hb-b42318)] text-[color:var(--bops-on-fill)]` : pill}
            >
              {confirmRemove ? "Remove for sure?" : "Remove page"}
            </button>
          </>
        )}
        <button onClick={onClose} aria-label="Close the page" title="Close" className="flex size-8 items-center justify-center rounded-full text-ink hover:bg-[color:var(--bops-tint)]/[0.05] max-md:size-10">
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {error && <div className="px-6 pb-2 text-[12px] leading-4 text-[color:var(--ht-b42318)] max-md:px-4">{error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 max-md:px-4">
        {page.widgets.length === 0 && !editing && (
          <div className="mb-4 rounded-[16px] bg-white px-4 py-3.5 text-[13px] leading-5 text-pencil shadow-[0_0_0_1px_var(--color-rule)]" data-widgets-empty>
            Nothing here yet. Pick a widget below, or ask in the chat: <span className="font-medium text-ink">&ldquo;add a clock widget to my {page.id === HOME ? "home" : `${page.name} page`}&rdquo;</span>.
          </div>
        )}
        <WidgetGrid state={state} page={page} editing={editing} links={links} />
        {(editing || page.widgets.length === 0) && <Gallery page={page} onError={setError} />}
      </div>
    </div>
  );
}

/** Each kind there is, to add one to the page (at most MAX_WIDGETS on it). */
function Gallery({ page, onError }: { page: WidgetPage; onError: (e: string) => void }) {
  const full = page.widgets.length >= MAX_WIDGETS;
  return (
    <div className="mt-6 flex flex-col gap-2" data-widget-gallery>
      <span className="text-[13px] font-medium leading-4 text-pencil">{full ? `This page has ${MAX_WIDGETS} widgets, the most it holds.` : "Add a widget"}</span>
      <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-3 max-md:grid-cols-2">
        {KIND_LIST.map((kind) => (
          <button
            key={kind}
            disabled={full}
            data-add-widget={kind}
            onClick={() => void change([{ action: "add_widget", page: page.id, kind }]).then((e) => onError(e ?? ""))}
            className="flex flex-col items-start gap-0.5 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-[0_0_0_1px_var(--color-rule)] hover:bg-[color:var(--bops-tint)]/[0.02] disabled:opacity-40"
          >
            <span className="text-[13px] font-semibold leading-4 text-ink">{WIDGET_KINDS[kind].name}</span>
            <span className="text-[12px] leading-4 text-pencil">{WIDGET_KINDS[kind].about}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** How many columns a size takes: of four on a page, of two in the side panel. */
const SPAN: Record<WidgetSize, string> = { small: "col-span-1", medium: "col-span-2", wide: "col-span-4 max-md:col-span-2" };
const SPAN_NARROW: Record<WidgetSize, string> = { small: "col-span-1", medium: "col-span-2", wide: "col-span-2" };

/** A page's widgets as a grid; `narrow`: two columns (the side panel). */
function WidgetGrid({ state, page, editing, links, narrow = false }: { state: AppState; page: WidgetPage; editing: boolean; links: WidgetLinks; narrow?: boolean }) {
  return (
    <div className={`grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-4 max-md:grid-cols-2"}`} data-widget-grid>
      {page.widgets.map((w, i) => (
        <div key={w.id} className={(narrow ? SPAN_NARROW : SPAN)[w.size]}>
          <WidgetCard state={state} page={page} widget={w} index={i} editing={editing} links={links} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- One widget ---------------- */

const SIZE_WORD: Record<WidgetSize, string> = { small: "Small", medium: "Medium", wide: "Wide" };

function WidgetCard({ state, page, widget: w, index, editing, links }: { state: AppState; page: WidgetPage; widget: Widget; index: number; editing: boolean; links: WidgetLinks }) {
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const act = async (ops: LayoutOp[], quiet = false) => {
    const e = await change(ops, quiet);
    setError(e ?? "");
    return !e;
  };
  const edit = (more: Omit<LayoutOp, "action" | "page" | "widget">, quiet = false) => act([{ action: "update_widget", page: page.id, widget: w.id, ...more }], quiet);
  const icon = "flex size-7 items-center justify-center rounded-full text-ink hover:bg-[color:var(--bops-tint)]/[0.06] disabled:opacity-30 max-md:size-10";
  // Its name in each tool's, so a page of widgets doesn't have ten buttons all called Remove (task 86).
  const name = w.title ?? WIDGET_KINDS[w.kind].name;
  return (
    <section className="motion-widget-in flex h-full min-h-[132px] flex-col rounded-[16px] bg-white p-3.5 shadow-[0_0_0_1px_var(--color-rule)]" data-widget={w.kind} data-widget-id={w.id} aria-label={w.title ?? WIDGET_KINDS[w.kind].name}>
      {/* In Edit the title takes a line of its own, in full, with the tools under it: a small card's name isn't cut short. */}
      <div className={`flex min-h-6 items-center gap-1.5 pb-1.5 ${editing ? "flex-wrap" : ""}`}>
        <span className={`min-w-0 flex-1 text-[12px] font-semibold uppercase leading-4 tracking-[0.04em] text-pencil ${editing ? "basis-full break-words" : "truncate"}`} data-widget-title>
          {w.title ?? WIDGET_KINDS[w.kind].name}
        </span>
        {editing && (
          <div className="flex shrink-0 items-center gap-0.5" data-widget-tools>
            <button className={icon} disabled={index === 0} onClick={() => void act([{ action: "move_widget", page: page.id, widget: w.id, position: index }])} aria-label={`Move ${name} earlier`} title="Move earlier">
              <svg width="10" height="10" viewBox="0 0 8 12" aria-hidden>
                <path d="M6 1.5L1.5 6 6 10.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className={icon} disabled={index === page.widgets.length - 1} onClick={() => void act([{ action: "move_widget", page: page.id, widget: w.id, position: index + 2 }])} aria-label={`Move ${name} later`} title="Move later">
              <svg width="10" height="10" viewBox="0 0 8 12" aria-hidden>
                <path d="M2 1.5L6.5 6 2 10.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className={`${icon} ${setup ? "bg-[color:var(--bops-tint)]/[0.06]" : ""}`} onClick={() => setSetup(!setup)} aria-label={`Set up ${name}`} aria-expanded={setup} title="Set it up">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M3 4.5h10M3 8h10M3 11.5h10" strokeLinecap="round" />
                <circle cx="6" cy="4.5" r="1.4" fill="var(--color-white)" />
                <circle cx="10.5" cy="8" r="1.4" fill="var(--color-white)" />
                <circle cx="5" cy="11.5" r="1.4" fill="var(--color-white)" />
              </svg>
            </button>
            <button
              className={`${icon} ${confirm ? "bg-[color:var(--hb-b42318)] text-[color:var(--bops-on-fill)] hover:bg-[color:var(--hb-b42318)]" : ""}`}
              onClick={() => (confirm ? void act([{ action: "remove_widget", page: page.id, widget: w.id }]) : setConfirm(true))}
              onBlur={() => setConfirm(false)}
              aria-label={confirm ? `Remove ${name} for sure` : `Remove ${name}`}
              title={confirm ? "Press again to remove" : "Remove"}
            >
              <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {editing && (
        // Buttons that say whether they're pressed (task 86): an accessibility client presses a button (its Invoke), which
        // an ARIA radio drawn on a button didn't take; each named for its widget, as a page has several.
        <div role="group" aria-label={`${name}'s size`} className="mb-2 flex w-fit gap-0.5 rounded-full bg-[color:var(--bops-tint)]/[0.05] p-[3px]">
          {SIZES.map((s, i) => (
            <button
              key={s}
              type="button"
              aria-pressed={w.size === s}
              aria-label={`${SIZE_WORD[s]} size for ${name}`}
              onClick={() => w.size !== s && void edit({ size: s })}
              // The arrow keys move along the sizes and pick, as Look's choices do (segmented.tsx).
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next = (i + step + SIZES.length) % SIZES.length;
                e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
                if (SIZES[next] !== w.size) void edit({ size: SIZES[next] });
              }}
              className={`rounded-full px-2.5 py-0.5 text-[12px] leading-4 outline-none focus-visible:shadow-[0_0_0_1.5px_var(--h-0a0a0a)] ${w.size === s ? "bg-white text-ink shadow-[0_0_0_1px_var(--h-0000000f)]" : "text-pencil hover:text-ink"}`}
            >
              {SIZE_WORD[s]}
            </button>
          ))}
        </div>
      )}
      {editing && setup && <WidgetSetup state={state} widget={w} edit={edit} />}
      <div className="flex min-h-0 flex-1 flex-col">
        <WidgetBody state={state} widget={w} edit={edit} links={links} />
      </div>
      {error && <div className="pt-1.5 text-[12px] leading-4 text-[color:var(--ht-b42318)]">{error}</div>}
    </section>
  );
}

type Edit = (more: Omit<LayoutOp, "action" | "page" | "widget">, quiet?: boolean) => Promise<boolean>;

/** The time zones offered for a clock, besides this computer's. */
const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "UTC"];
const zoneName = (z: string) => z.split("/").pop()!.replace(/_/g, " ");

/** A widget's own settings, in Edit: its title and what its kind has. */
function WidgetSetup({ state, widget: w, edit }: { state: AppState; widget: Widget; edit: Edit }) {
  const field = "h-8 w-full rounded-[10px] bg-desk px-2.5 text-[13px] text-ink outline-none";
  const label = "text-[12px] font-medium leading-4 text-pencil";
  const team = teamOf(state);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-[12px] bg-[color:var(--bops-tint)]/[0.03] p-2.5" data-widget-setup>
      <label className="flex flex-col gap-1">
        <span className={label}>Title</span>
        <input defaultValue={w.title ?? ""} maxLength={TITLE_MAX} placeholder={WIDGET_KINDS[w.kind].name} onBlur={(e) => e.target.value.trim() !== (w.title ?? "") && void edit({ title: e.target.value.trim() })} className={field} />
      </label>
      {w.kind === "clock" && (
        <label className="flex flex-col gap-1">
          <span className={label}>Time zone</span>
          <select value={w.timeZone ?? ""} onChange={(e) => void edit({ time_zone: e.target.value })} className={field}>
            <option value="">This computer&apos;s</option>
            {[...new Set([...(w.timeZone ? [w.timeZone] : []), ...ZONES])].map((z) => (
              <option key={z} value={z}>
                {zoneName(z)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(w.kind === "routines" || w.kind === "bot-status" || w.kind === "quick-ask") && (
        <label className="flex flex-col gap-1">
          <span className={label}>Bot</span>
          <select value={w.botId ?? ""} onChange={(e) => void edit({ bot: e.target.value })} className={field}>
            <option value="">{w.kind === "routines" ? "Every bot" : "Your main bot"}</option>
            {team.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {w.kind === "countdown" && (
        <label className="flex flex-col gap-1">
          <span className={label}>Count down to</span>
          <input type="date" defaultValue={w.date ?? ""} onChange={(e) => e.target.value && void edit({ date: e.target.value })} className={field} />
        </label>
      )}
      {w.kind === "counter" && (
        <label className="flex flex-col gap-1">
          <span className={label}>Each press adds</span>
          <input type="number" min={1} max={1000} defaultValue={w.step ?? 1} onBlur={(e) => Number(e.target.value) !== (w.step ?? 1) && void edit({ step: Math.round(Number(e.target.value)) })} className={field} />
        </label>
      )}
      {w.kind === "links" && (
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!linkUrl.trim()) return;
            void edit({ links: [...(w.links ?? []), { label: linkLabel.trim(), url: linkUrl.trim() }] }).then((ok) => {
              if (!ok) return;
              setLinkLabel("");
              setLinkUrl("");
            });
          }}
        >
          <span className={label}>Add a link</span>
          <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={TITLE_MAX} placeholder="Name, like Zillow" aria-label="Link's name" className={field} />
          <div className="flex gap-1">
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="zillow.com" aria-label="Link's address" className={field} />
            <button type="submit" className="shrink-0 rounded-full bg-[color:var(--hb-0a0a0a)] px-3 text-[12px] font-semibold text-[color:var(--bops-on-fill)]">
              Add
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** What a widget shows, by its kind. */
function WidgetBody({ state, widget: w, edit, links }: { state: AppState; widget: Widget; edit: Edit; links: WidgetLinks }) {
  switch (w.kind) {
    case "clock":
      return <Clock zone={w.timeZone} wide={w.size !== "small"} />;
    case "note":
      return <Note widget={w} edit={edit} />;
    case "routines":
      return <Routines state={state} widget={w} />;
    case "needs-you":
      return <NeedsYou state={state} onOpenChat={links.onOpenChat} />;
    case "bot-status":
      return <BotStatus state={state} widget={w} onOpenChat={links.onOpenChat} />;
    case "quick-ask":
      return <QuickAsk state={state} widget={w} onOpenChat={links.onOpenChat} />;
    case "links":
      return <Links widget={w} edit={edit} onOpenLink={links.onOpenLink} />;
    case "counter":
      return <Counter widget={w} edit={edit} />;
    case "checklist":
      return <Checklist widget={w} edit={edit} />;
    case "countdown":
      return <Countdown widget={w} />;
  }
}

const quiet = "text-[13px] leading-5 text-pencil";

function Clock({ zone, wide }: { zone?: string; wide: boolean }) {
  useNow(1000);
  const now = new Date();
  const opt = zone ? { timeZone: zone } : {};
  const time = now.toLocaleTimeString("en-US", { ...opt, hour: "numeric", minute: "2-digit" });
  const date = now.toLocaleDateString("en-US", { ...opt, weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex flex-1 flex-col justify-center" data-clock>
      <span className={`font-semibold tabular-nums leading-none text-ink ${wide ? "text-[40px]" : "text-[30px]"}`}>{time}</span>
      <span className="pt-1.5 text-[13px] leading-4 text-ink">{date}</span>
      {zone && <span className="pt-0.5 text-[12px] leading-4 text-pencil">{zoneName(zone)}</span>}
    </div>
  );
}

function Note({ widget: w, edit }: { widget: Widget; edit: Edit }) {
  const [text, setText] = useState(w.text ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  // Changed elsewhere (a bot, another window): shown, unless it's being typed in here.
  useEffect(() => {
    if (document.activeElement !== box.current) setText(w.text ?? "");
  }, [w.text]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = (t: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => t !== (w.text ?? "") && void edit({ text: t }, true), 600);
  };
  return (
    <textarea
      ref={box}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        save(e.target.value);
      }}
      maxLength={1000}
      placeholder="Write something to remember"
      aria-label="Note"
      className="min-h-[72px] w-full flex-1 resize-none rounded-[10px] bg-[color:var(--hb-fff9c4)] p-2.5 text-[13.5px] leading-5 text-[color:var(--ht-3a3320)] outline-none placeholder:text-[color:var(--ht-8a8060)]"
    />
  );
}

/** When a routine runs next, in plain words ("Today 9:00 AM", "Tue 9:00 AM", "Dec 3"). */
function whenNext(t: number) {
  const d = new Date(t);
  const today = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 864e5);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Routines({ state, widget: w }: { state: AppState; widget: Widget }) {
  const team = teamOf(state);
  const list = state.routines
    .filter((r) => r.enabled && team.some((b) => b.id === r.botId) && (!w.botId || r.botId === w.botId))
    .sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity))
    .slice(0, w.size === "small" ? 3 : 5);
  if (w.botId && !team.some((b) => b.id === w.botId)) return <span className={quiet} data-bot-elsewhere>{ELSEWHERE}</span>;
  if (!list.length) return <span className={quiet}>{w.botId ? `${team.find((b) => b.id === w.botId)?.name ?? "This bot"} has no routines on yet.` : "No routines on yet. Ask a bot to do something every day, and it shows here."}</span>;
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((r) => (
        <li key={r.id} className="flex items-baseline gap-2 text-[13px] leading-5">
          <span className="min-w-0 flex-1 truncate text-ink">{r.title}</span>
          <span className="shrink-0 text-[12px] text-pencil">{r.nextRunAt ? whenNext(r.nextRunAt) : "Not scheduled"}</span>
        </li>
      ))}
    </ul>
  );
}

function NeedsYou({ state, onOpenChat }: { state: AppState; onOpenChat: (chatId: string) => void }) {
  const needs = needsByBot(state, null, []);
  const { count, bots } = attentionOf(state, needs);
  const team = teamOf(state);
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="text-[30px] font-semibold leading-none tabular-nums text-ink">{count}</span>
        <span className="text-[13px] leading-4 text-pencil">{count === 1 ? "thing needs you" : "things need you"}</span>
      </span>
      {count === 0 ? (
        <span className={quiet}>All clear for now.</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {[...bots].flatMap((id) => {
            const b = team.find((x) => x.id === id);
            return b ? [b] : [];
          }).map((b) => (
            <button key={b.id} onClick={() => onOpenChat(botChatId(b.id))} className="flex items-center gap-1.5 rounded-full bg-highlighter px-2 py-0.5 text-[12px] font-medium leading-4 text-[color:var(--ht-0a0a0a)]">
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The bot a widget is about: the one it names, or with none named, the main bot. One it names that isn't in this
 * workspace is "elsewhere", said plainly, never swapped for another bot without a word.
 */
const botFor = (state: AppState, id?: string): Bot | "elsewhere" | undefined => {
  const team = teamOf(state);
  if (id) return team.find((b) => b.id === id) ?? "elsewhere";
  return team.find((b) => b.isMain) ?? team[0];
};
const ELSEWHERE = "That bot isn't in this workspace. Press Edit, then set it up to pick one that is.";

function BotStatus({ state, widget: w, onOpenChat }: { state: AppState; widget: Widget; onOpenChat: (chatId: string) => void }) {
  const b = botFor(state, w.botId);
  if (b === "elsewhere") return <span className={quiet} data-bot-elsewhere>{ELSEWHERE}</span>;
  if (!b) return <span className={quiet}>No bot to show yet.</span>;
  const working = state.sessions.filter((s) => s.botId === b.id && live(s));
  const waiting = state.sessions.some((s) => s.botId === b.id && live(s) && s.blocker);
  return (
    <button onClick={() => onOpenChat(botChatId(b.id))} className="flex flex-1 items-center gap-2.5 rounded-[12px] text-left hover:bg-[color:var(--bops-tint)]/[0.02]">
      <Mascot botId={b.id} color={b.color} size={36} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] font-semibold leading-[18px] text-ink">{b.name}</span>
        <span className="truncate text-[12.5px] leading-4 text-pencil">{waiting ? "Waiting on you" : working.length ? `Working on ${working.at(-1)!.title}` : "Free right now"}</span>
      </span>
    </button>
  );
}

function QuickAsk({ state, widget: w, onOpenChat }: { state: AppState; widget: Widget; onOpenChat: (chatId: string) => void }) {
  const b = botFor(state, w.botId);
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  if (b === "elsewhere") return <span className={quiet} data-bot-elsewhere>{ELSEWHERE}</span>;
  if (!b) return <span className={quiet}>No bot to ask yet.</span>;
  const chatId = botChatId(b.id);
  return (
    <form
      className="flex flex-1 flex-col justify-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t || busy) return;
        setBusy(true);
        void post(`/api/chats/${encodeURIComponent(chatId)}/messages`, { text: t })
          .then((res) => {
            setSent(res.ok ? `Sent to ${b.name}.` : `That didn't reach ${b.name}. Try again.`);
            if (res.ok) setText("");
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center gap-1.5 rounded-full bg-desk py-1 pl-3.5 pr-1 focus-within:shadow-[0_0_0_1.5px_var(--color-ink)]">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask ${b.name} something`} aria-label={`Ask ${b.name}`} className="min-w-0 flex-1 bg-transparent py-1 text-[13.5px] text-ink outline-none placeholder:text-pencil" />
        <button type="submit" disabled={!text.trim() || busy} className="shrink-0 rounded-full bg-[color:var(--hb-0a0a0a)] px-3 py-1.5 text-[12px] font-semibold leading-4 text-[color:var(--bops-on-fill)] disabled:opacity-40">
          Ask
        </button>
      </div>
      {sent && (
        <span className="text-[12px] leading-4 text-pencil">
          {sent}{" "}
          <button type="button" onClick={() => onOpenChat(chatId)} className="font-medium text-ink underline underline-offset-2">
            Open the chat
          </button>
        </span>
      )}
    </form>
  );
}

function Links({ widget: w, edit, onOpenLink }: { widget: Widget; edit: Edit; onOpenLink?: (url: string) => void }) {
  const inPanel = useContext(OpenLink);
  const open = onOpenLink ?? inPanel;
  const list = w.links ?? [];
  if (!list.length) return <span className={quiet}>No links yet. Press Edit, then set it up to add some.</span>;
  return (
    <ul className="flex flex-col gap-0.5">
      {list.map((l, i) => (
        <li key={`${l.url}:${i}`} className="group/link flex items-center gap-1">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              // Web pages open as a tab on the right; an email address goes to the mail app.
              if (!open || l.url.startsWith("mailto:")) return;
              e.preventDefault();
              open(l.url);
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-1.5 py-1 text-[13.5px] leading-5 text-ink hover:bg-[color:var(--bops-tint)]/[0.04]"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-highlighter shadow-[0_0_0_1px_var(--color-ink)]" />
            <span className="truncate">{l.label}</span>
          </a>
          <button onClick={() => void edit({ links: list.filter((_, j) => j !== i) })} aria-label={`Remove ${l.label}`} className="flex size-6 shrink-0 items-center justify-center rounded-full text-pencil opacity-0 hover:bg-[color:var(--bops-tint)]/[0.05] group-hover/link:opacity-100">
            <svg width="8" height="8" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Counter({ widget: w, edit }: { widget: Widget; edit: Edit }) {
  const value = w.value ?? 0;
  const step = w.step ?? 1;
  const round = "flex size-9 items-center justify-center rounded-full text-[18px] font-semibold text-ink shadow-[0_0_0_1px_var(--color-rule)] hover:bg-[color:var(--bops-tint)]/[0.04]";
  return (
    <div className="flex flex-1 items-center justify-between gap-2">
      <button className={round} onClick={() => void edit({ value: value - step }, true)} aria-label={`Take away ${step}`}>
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
          <path d="M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <span key={value} className="motion-tick text-[32px] font-semibold tabular-nums leading-none text-ink" data-count>
        {value.toLocaleString("en-US")}
      </span>
      <button className={round} onClick={() => void edit({ value: value + step }, true)} aria-label={`Add ${step}`}>
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Checklist({ widget: w, edit }: { widget: Widget; edit: Edit }) {
  const items = w.items ?? [];
  const [adding, setAdding] = useState("");
  const done = items.filter((i) => i.done).length;
  const put = (next: { text: string; done: boolean }[]) => edit({ items: next.map((i) => ({ text: i.text, done: i.done })) }, true);
  return (
    <div className="flex flex-1 flex-col gap-1">
      {items.length > 0 && <span className="text-[12px] leading-4 text-pencil">{done} of {items.length} done</span>}
      <ul className="flex flex-col">
        {items.map((it, i) => (
          <li key={`${i}:${it.text}`} className="group/item flex items-center gap-2 rounded-[8px] px-1 py-0.5 hover:bg-[color:var(--bops-tint)]/[0.03]">
            <input type="checkbox" checked={it.done} onChange={() => void put(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} aria-label={it.text} className="size-4 shrink-0 accent-[var(--color-ink)]" />
            <span className={`min-w-0 flex-1 truncate text-[13.5px] leading-5 ${it.done ? "text-pencil line-through" : "text-ink"}`}>{it.text}</span>
            <button onClick={() => void put(items.filter((_, j) => j !== i))} aria-label={`Remove ${it.text}`} className="flex size-6 shrink-0 items-center justify-center rounded-full text-pencil opacity-0 hover:bg-[color:var(--bops-tint)]/[0.05] group-hover/item:opacity-100">
              <svg width="8" height="8" viewBox="0 0 12 12" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {items.length < 30 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = adding.trim();
            if (!t) return;
            void put([...items, { text: t, done: false }]).then((ok) => ok && setAdding(""));
          }}
        >
          <input value={adding} onChange={(e) => setAdding(e.target.value)} maxLength={120} placeholder="Add an item" aria-label="Add an item" className="h-8 w-full rounded-[8px] bg-transparent px-1 text-[13.5px] text-ink outline-none placeholder:text-pencil focus:bg-desk" />
        </form>
      )}
    </div>
  );
}

function Countdown({ widget: w }: { widget: Widget }) {
  useNow(60_000);
  if (!w.date) return <span className={quiet}>No date yet. Press Edit, then set it up to pick one.</span>;
  const [y, m, d] = w.date.split("-").map(Number);
  const today = new Date();
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 864e5);
  const on = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="flex flex-1 flex-col justify-center">
      <span className="text-[32px] font-semibold tabular-nums leading-none text-ink">{days === 0 ? "Today" : Math.abs(days).toLocaleString("en-US")}</span>
      <span className="pt-1.5 text-[13px] leading-4 text-pencil">{days === 0 ? on : days > 0 ? `${days === 1 ? "day" : "days"} until ${on}` : `${days === -1 ? "day" : "days"} since ${on}`}</span>
    </div>
  );
}

/* ---------------- A pinned tab, in the side panel ---------------- */

/** A tab pinned to the side panel: its page's widgets in two columns, or the one widget it's for. */
export function WidgetTab({ state, pageId, widgetId, links, onOpenPage, onUnpin }: { state: AppState; pageId: string; widgetId?: string; links: WidgetLinks; onOpenPage: (pageId: string) => void; onUnpin: () => void }) {
  const layout = layoutOf(state);
  const page = layout.pages.find((p) => p.id === pageId);
  if (!page) return <div className={`p-6 ${quiet}`}>This page is gone.</div>;
  const shown: WidgetPage = widgetId ? { ...page, widgets: page.widgets.filter((w) => w.id === widgetId).map((w) => ({ ...w, size: "medium" as const })) } : page;
  return (
    <div className="motion-fade-in flex min-h-0 flex-1 flex-col bg-desk" data-widget-tab={pageId}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 text-ink">{widgetId ? (shown.widgets[0]?.title ?? (shown.widgets[0] ? WIDGET_KINDS[shown.widgets[0].kind].name : page.name)) : page.name}</span>
        <button onClick={() => onOpenPage(page.id)} className="rounded-full px-2.5 py-1 text-[12px] font-semibold leading-4 text-ink shadow-[0_0_0_1px_var(--color-rule)] hover:bg-[color:var(--bops-tint)]/[0.04]">
          Open page
        </button>
        <button onClick={onUnpin} className="rounded-full px-2.5 py-1 text-[12px] font-semibold leading-4 text-ink shadow-[0_0_0_1px_var(--color-rule)] hover:bg-[color:var(--bops-tint)]/[0.04]">
          Unpin
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {shown.widgets.length ? <WidgetGrid state={state} page={shown} editing={false} links={links} narrow /> : <span className={quiet}>{widgetId ? "This widget is gone." : "Nothing on this page yet."}</span>}
      </div>
    </div>
  );
}

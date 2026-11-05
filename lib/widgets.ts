import type { PinnedTab, Widget, WidgetKind, WidgetLayout, WidgetPage, WidgetSize } from "./types";

export type { PinnedTab, Widget, WidgetKind, WidgetLayout, WidgetPage, WidgetSize };

/**
 * The owner's widgets: pages of them (Home, and pages they made, in the sidebar) and tabs pinned to the
 * side panel that open one (Look.layout). Data only: a widget is one of a fixed list of kinds, drawn by
 * Bops' own code (components/app/widgets.tsx) from its settings, and nothing in it ever runs. Pure, so the
 * server checks every change here before it keeps it (lib/server/widgets.ts), the window reads what it's
 * given through normalizeLayout again, and the tests run it with no server at all (scripts/test-widgets.mjs).
 */

/** The page every layout has, first: it can be filled and emptied but never removed or renamed. */
export const HOME = "home";
/** The most pages the owner can make, besides Home. */
export const MAX_PAGES = 8;
/** The most widgets on one page. */
export const MAX_WIDGETS = 16;
/** The most tabs pinned to the side panel. */
export const MAX_TABS = 6;
/** The most changes one ask can make at once. */
export const MAX_CHANGES = 20;
export const TITLE_MAX = 40;
export const PAGE_NAME_MAX = 30;
export const NOTE_MAX = 1000;
export const ITEM_MAX = 120;
export const ITEMS_MAX = 30;
export const LINKS_MAX = 12;
export const URL_MAX = 500;
const COUNT_MAX = 1_000_000_000;

/** Each kind, its plain name, what it's for, and the room it takes unless asked otherwise. */
export const WIDGET_KINDS: Record<WidgetKind, { name: string; about: string; size: WidgetSize }> = {
  clock: { name: "Clock", about: "The time and date, here or in another time zone.", size: "small" },
  note: { name: "Note", about: "A sticky note you can type in.", size: "medium" },
  routines: { name: "Upcoming routines", about: "What your bots will do next on their own.", size: "medium" },
  "needs-you": { name: "Needs you", about: "What is waiting on you right now.", size: "small" },
  "bot-status": { name: "Bot status", about: "What one bot is doing.", size: "small" },
  "quick-ask": { name: "Quick ask", about: "Ask a bot something without leaving the page.", size: "medium" },
  links: { name: "Links", about: "Your bookmarks, a click away.", size: "medium" },
  counter: { name: "Counter", about: "Count anything up or down.", size: "small" },
  checklist: { name: "Checklist", about: "A short list to tick off.", size: "medium" },
  countdown: { name: "Countdown", about: "Days left until a date.", size: "small" },
};
export const KIND_LIST = Object.keys(WIDGET_KINDS) as WidgetKind[];
export const SIZES: readonly WidgetSize[] = ["small", "medium", "wide"];

/** A change couldn't be kept: `message` says why in plain words, for the owner and for the bot that asked. */
export class WidgetError extends Error {}

/** The bots a change may name (by id or name): the owner's own. */
export type LayoutContext = { bots: { id: string; name: string }[] };

/** One change, as the chat's change_widgets and the window both send it. Every field but `action` may be missing or null. */
export type LayoutOp = {
  action: "add_widget" | "update_widget" | "remove_widget" | "move_widget" | "add_page" | "rename_page" | "remove_page" | "pin_tab" | "unpin_tab";
  page?: string | null;
  widget?: string | null;
  kind?: string | null;
  size?: string | null;
  title?: string | null;
  name?: string | null;
  position?: number | null;
  to_page?: string | null;
  time_zone?: string | null;
  text?: string | null;
  bot?: string | null;
  links?: { label?: unknown; url?: unknown }[] | null;
  value?: number | null;
  step?: number | null;
  items?: (string | { text?: unknown; done?: unknown })[] | null;
  date?: string | null;
  tab?: string | null;
};
export const ACTIONS: readonly LayoutOp["action"][] = ["add_widget", "update_widget", "remove_widget", "move_widget", "add_page", "rename_page", "remove_page", "pin_tab", "unpin_tab"];

/* ---------------- Checking one value ---------------- */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/;
const SCHEME = /\b(?:javascript|vbscript|data|file)\s*:/i;

/**
 * A short name (a title, a page's name, a tab's label, a link's label, a checklist item): one line, no
 * control characters, no "<" or ">" (nothing that reads as HTML), and no javascript:, data:, vbscript: or
 * file: (nothing that reads as a script address), at most `max` characters. Refused, not trimmed, so the
 * bot can say why.
 */
export function labelOf(v: unknown, max: number, what: string): string {
  if (typeof v !== "string") throw new WidgetError(`The ${what} must be text.`);
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) throw new WidgetError(`The ${what} can't be empty.`);
  if (t.length > max) throw new WidgetError(`The ${what} is over ${max} characters; keep it shorter.`);
  if (CONTROL.test(v) || /[<>]/.test(t)) throw new WidgetError(`The ${what} has a character that isn't allowed ("<", ">" or a control character).`);
  if (SCHEME.test(t)) throw new WidgetError(`The ${what} can't hold a script or file address.`);
  return t;
}

/** A note's text: several lines are fine, no control characters, at most NOTE_MAX. It's only ever shown as text. */
function noteOf(v: unknown): string {
  if (typeof v !== "string") throw new WidgetError("The note must be text.");
  const t = v.replace(/\r\n?/g, "\n");
  if (t.length > NOTE_MAX) throw new WidgetError(`The note is over ${NOTE_MAX} characters; keep it shorter.`);
  if (CONTROL.test(t)) throw new WidgetError("The note has a control character, which isn't allowed.");
  return t;
}

/**
 * A link's address: http, https or mailto, nothing else (no javascript:, data:, file:), no name and
 * password in it, at most URL_MAX. A bare "example.com" becomes https://example.com.
 */
export function urlOf(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) throw new WidgetError("A link needs an address.");
  const raw = v.trim();
  if (raw.length > URL_MAX) throw new WidgetError(`A link's address is over ${URL_MAX} characters.`);
  if (CONTROL.test(raw) || /[\s<>"'`\\]/.test(raw)) throw new WidgetError("A link's address has a character that isn't allowed.");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new WidgetError(`"${raw.slice(0, 60)}" isn't a web address.`);
  }
  if (!["http:", "https:", "mailto:"].includes(u.protocol)) throw new WidgetError("A link may only open a web page (http or https) or an email (mailto). That one was refused.");
  if (u.username || u.password) throw new WidgetError("A link can't carry a name and password in it.");
  if (u.protocol !== "mailto:" && !u.hostname) throw new WidgetError(`"${raw.slice(0, 60)}" has no site in it.`);
  return u.href;
}

/** An IANA time zone this computer knows ("America/Chicago", "UTC"). */
function zoneOf(v: unknown): string {
  if (typeof v !== "string" || !/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(v.trim()) || v.length > 64) throw new WidgetError(`"${String(v).slice(0, 60)}" isn't a time zone (like America/Chicago).`);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v.trim() });
  } catch {
    throw new WidgetError(`"${v.trim()}" isn't a time zone this computer knows (like America/Chicago).`);
  }
  return v.trim();
}

function dateOf(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) throw new WidgetError("The date must be written like 2026-12-25.");
  const d = new Date(`${v.trim()}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v.trim()) throw new WidgetError(`"${v.trim()}" isn't a real date.`);
  return v.trim();
}

function intOf(v: unknown, min: number, max: number, what: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new WidgetError(`The ${what} must be a whole number.`);
  if (n < min || n > max) throw new WidgetError(`The ${what} must be between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}.`);
  return n;
}

const given = (v: unknown) => v !== undefined && v !== null;

/** A bot by its id or its name (any case), among the owner's. */
function botOf(v: unknown, ctx: LayoutContext): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  const b = ctx.bots.find((x) => x.id.toLowerCase() === s) ?? ctx.bots.find((x) => x.name.toLowerCase() === s);
  if (!b) throw new WidgetError(`There's no bot called "${String(v).slice(0, 40)}".${ctx.bots.length ? ` Yours are ${ctx.bots.map((x) => x.name).join(", ")}.` : ""}`);
  return b.id;
}

/** A widget's settings from a change, onto `w`, only those its kind has; one that's wrong refuses the change. */
function settingsOnto(w: Widget, op: LayoutOp, ctx: LayoutContext): void {
  if (given(op.size)) {
    if (!SIZES.includes(op.size as WidgetSize)) throw new WidgetError(`The size must be small, medium or wide, not "${String(op.size)}".`);
    w.size = op.size as WidgetSize;
  }
  if (given(op.title)) {
    if (op.title === "") delete w.title;
    else w.title = labelOf(op.title, TITLE_MAX, "title");
  }
  switch (w.kind) {
    case "clock":
      if (given(op.time_zone)) {
        if (op.time_zone === "") delete w.timeZone;
        else w.timeZone = zoneOf(op.time_zone);
      }
      break;
    case "note":
      if (given(op.text)) w.text = noteOf(op.text);
      break;
    case "routines":
    case "bot-status":
    case "quick-ask":
      if (given(op.bot)) {
        if (op.bot === "") delete w.botId;
        else w.botId = botOf(op.bot, ctx);
      }
      break;
    case "links":
      if (given(op.links)) {
        if (!Array.isArray(op.links)) throw new WidgetError("The links must be a list.");
        if (op.links.length > LINKS_MAX) throw new WidgetError(`A links widget holds at most ${LINKS_MAX} links.`);
        w.links = op.links.map((l) => {
          const url = urlOf(l?.url);
          return { label: given(l?.label) && String(l.label).trim() ? labelOf(l.label, TITLE_MAX, "link's label") : new URL(url).hostname.replace(/^www\./, "") || url.slice(0, TITLE_MAX), url };
        });
      }
      break;
    case "counter":
      if (given(op.value)) w.value = intOf(op.value, -COUNT_MAX, COUNT_MAX, "count");
      if (given(op.step)) w.step = intOf(op.step, 1, 1000, "step");
      break;
    case "checklist":
      if (given(op.items)) {
        if (!Array.isArray(op.items)) throw new WidgetError("The checklist's items must be a list.");
        if (op.items.length > ITEMS_MAX) throw new WidgetError(`A checklist holds at most ${ITEMS_MAX} items.`);
        w.items = op.items.map((i) => (typeof i === "string" ? { text: labelOf(i, ITEM_MAX, "checklist item"), done: false } : { text: labelOf(i?.text, ITEM_MAX, "checklist item"), done: i?.done === true }));
      }
      break;
    case "countdown":
      if (given(op.date)) w.date = dateOf(op.date);
      break;
  }
}

/* ---------------- Reading a layout ---------------- */

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const newId = (prefix: string) => `${prefix}_${(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 12)}`;

/** The same check as a change, but forgiving: what doesn't pass is left out, never thrown. */
function quietly<T>(f: () => T): T | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}

/** One widget as kept, made safe to draw: the wrong kind is dropped whole, a wrong setting just that setting. */
function normalizeWidget(input: unknown): Widget | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== "string" || !ID.test(raw.id) || !KIND_LIST.includes(raw.kind as WidgetKind)) return undefined;
  const kind = raw.kind as WidgetKind;
  const w: Widget = { id: raw.id, kind, size: SIZES.includes(raw.size as WidgetSize) ? (raw.size as WidgetSize) : WIDGET_KINDS[kind].size };
  const title = quietly(() => labelOf(raw.title, TITLE_MAX, "title"));
  if (title) w.title = title;
  if (kind === "clock") {
    const z = quietly(() => zoneOf(raw.timeZone));
    if (z) w.timeZone = z;
  }
  if (kind === "note") w.text = quietly(() => noteOf(raw.text)) ?? "";
  if ((kind === "routines" || kind === "bot-status" || kind === "quick-ask") && typeof raw.botId === "string" && ID.test(raw.botId)) w.botId = raw.botId;
  if (kind === "links") w.links = (Array.isArray(raw.links) ? raw.links : []).slice(0, LINKS_MAX).flatMap((l) => quietly(() => [{ label: labelOf((l as { label?: unknown })?.label, TITLE_MAX, "label"), url: urlOf((l as { url?: unknown })?.url) }]) ?? []);
  if (kind === "counter") {
    w.value = quietly(() => intOf(raw.value, -COUNT_MAX, COUNT_MAX, "count")) ?? 0;
    w.step = quietly(() => intOf(raw.step, 1, 1000, "step")) ?? 1;
  }
  if (kind === "checklist") w.items = (Array.isArray(raw.items) ? raw.items : []).slice(0, ITEMS_MAX).flatMap((i) => quietly(() => [{ text: labelOf((i as { text?: unknown })?.text, ITEM_MAX, "item"), done: (i as { done?: unknown })?.done === true }]) ?? []);
  if (kind === "countdown") {
    const d = quietly(() => dateOf(raw.date));
    if (d) w.date = d;
  }
  return w;
}

/**
 * Any layout, however it came (the state file, the cloud's copy, the window's state, an old look in the
 * history), made safe: Home first, at most MAX_PAGES more, MAX_WIDGETS on each and MAX_TABS tabs, every
 * widget through normalizeWidget, ids unique, and a tab whose page is gone dropped.
 */
export function normalizeLayout(input: unknown): WidgetLayout {
  const raw = (input && typeof input === "object" ? input : {}) as { pages?: unknown; tabs?: unknown };
  const seen = new Set<string>();
  const pages: WidgetPage[] = [];
  for (const p of Array.isArray(raw.pages) ? raw.pages : []) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    if (typeof r.id !== "string" || !ID.test(r.id) || seen.has(r.id)) continue;
    const home = r.id === HOME;
    const name = home ? "Home" : quietly(() => labelOf(r.name, PAGE_NAME_MAX, "name"));
    if (!name) continue;
    if (!home && pages.filter((x) => x.id !== HOME).length >= MAX_PAGES) continue;
    seen.add(r.id);
    const widgets: Widget[] = [];
    for (const w of Array.isArray(r.widgets) ? r.widgets : []) {
      const clean = normalizeWidget(w);
      if (!clean || seen.has(clean.id) || widgets.length >= MAX_WIDGETS) continue;
      seen.add(clean.id);
      widgets.push(clean);
    }
    pages.push({ id: r.id, name, widgets });
  }
  const home = pages.find((p) => p.id === HOME) ?? { id: HOME, name: "Home", widgets: [] };
  const all = [home, ...pages.filter((p) => p.id !== HOME)];
  const tabs: PinnedTab[] = [];
  for (const t of Array.isArray(raw.tabs) ? raw.tabs : []) {
    if (!t || typeof t !== "object" || tabs.length >= MAX_TABS) continue;
    const r = t as Record<string, unknown>;
    if (typeof r.id !== "string" || !ID.test(r.id) || seen.has(r.id)) continue;
    const page = all.find((p) => p.id === r.page);
    if (!page) continue;
    const label = quietly(() => labelOf(r.label, TITLE_MAX, "label"));
    if (!label) continue;
    const widget = typeof r.widget === "string" && page.widgets.some((w) => w.id === r.widget) ? r.widget : undefined;
    if (r.widget !== undefined && !widget) continue;
    seen.add(r.id);
    tabs.push({ id: r.id, label, page: page.id, ...(widget ? { widget } : {}) });
  }
  return { pages: all, tabs };
}

/** Whether a layout has anything in it worth keeping (a widget, a page of the owner's, a tab). */
export const layoutUsed = (l: WidgetLayout) => l.tabs.length > 0 || l.pages.length > 1 || l.pages.some((p) => p.widgets.length > 0);

/* ---------------- Changing a layout ---------------- */

/** A page by its id or name (any case); "home" and "Home" are Home. */
function findPage(l: WidgetLayout, ref: unknown): WidgetPage | undefined {
  const s = typeof ref === "string" ? ref.replace(/\s+/g, " ").trim().toLowerCase() : "";
  if (!s) return undefined;
  return l.pages.find((p) => p.id.toLowerCase() === s) ?? l.pages.find((p) => p.name.toLowerCase() === s) ?? l.pages.find((p) => p.name.toLowerCase().replace(/\s+page$/, "") === s.replace(/\s+page$/, ""));
}
function pageOf(l: WidgetLayout, ref: unknown): WidgetPage {
  if (!given(ref) || ref === "") return l.pages[0];
  const p = findPage(l, ref);
  if (!p) throw new WidgetError(`There's no page called "${String(ref).slice(0, 40)}". The pages are ${l.pages.map((x) => x.name).join(", ")}.`);
  return p;
}

/** How a widget is called in what the bot says: its title, or its kind's name. */
export const widgetName = (w: Widget) => w.title ?? WIDGET_KINDS[w.kind].name.toLowerCase();

/** The widgets on a page a reference names: by id, by title, or by kind ("notes", "the clock"). */
function matches(p: WidgetPage, ref: string): Widget[] {
  const s = ref.replace(/\s+/g, " ").trim().toLowerCase().replace(/^(?:the|my)\s+/, "").replace(/\s+widget$/, "");
  const byId = p.widgets.filter((w) => w.id.toLowerCase() === s);
  if (byId.length) return byId;
  const byTitle = p.widgets.filter((w) => w.title?.toLowerCase() === s);
  if (byTitle.length) return byTitle;
  const singular = s.replace(/(?<=[a-z])s$/, "");
  return p.widgets.filter((w) => w.kind === s || w.kind === singular || WIDGET_KINDS[w.kind].name.toLowerCase() === s || WIDGET_KINDS[w.kind].name.toLowerCase() === singular || (w.kind === "note" && /^(?:sticky|sticky note|notes?)$/.test(s)) || (w.kind === "routines" && /^(?:routines?|upcoming)$/.test(s)));
}

/** The widget a change is about: on its page when it names one, else wherever there's exactly one that fits. */
function widgetOf(l: WidgetLayout, op: LayoutOp): { page: WidgetPage; widget: Widget } {
  if (!given(op.widget) || typeof op.widget !== "string" || !op.widget.trim()) throw new WidgetError("Say which widget (its title or its kind).");
  const pages = given(op.page) && op.page !== "" ? [pageOf(l, op.page)] : l.pages;
  const found = pages.flatMap((page) => matches(page, op.widget as string).map((widget) => ({ page, widget })));
  if (!found.length) throw new WidgetError(`There's no widget "${op.widget.slice(0, 40)}"${pages.length === 1 ? ` on ${pages[0].name}` : ""}.`);
  if (found.length > 1) throw new WidgetError(`More than one widget fits "${op.widget.slice(0, 40)}" (${found.map((f) => `${widgetName(f.widget)} on ${f.page.name}`).join(", ")}). Name it by its title or its page.`);
  return found[0];
}

/** Where a widget goes on its page, from a place counted from 1 (held inside the page). */
const placeAt = (n: unknown, len: number) => Math.max(0, Math.min(len, Math.round(Number(n)) - 1));

/**
 * Make the changes, in order, on a copy of the layout: one that's wrong refuses them all with why, so
 * nothing half done is ever kept. Gives back the new layout and a line for each change, for the bot to say.
 */
export function applyLayoutOps(layoutIn: unknown, opsIn: unknown, ctx: LayoutContext): { layout: WidgetLayout; said: string[] } {
  const ops = Array.isArray(opsIn) ? opsIn : [opsIn];
  if (!ops.length || !opsIn) throw new WidgetError("Say what to change: add, update, move or remove a widget, add, rename or remove a page, or pin or unpin a tab.");
  if (ops.length > MAX_CHANGES) throw new WidgetError(`At most ${MAX_CHANGES} changes at once.`);
  const l = normalizeLayout(structuredClone(layoutIn ?? {}));
  const said: string[] = [];
  for (const raw of ops) {
    if (!raw || typeof raw !== "object") throw new WidgetError("A change must say what to do.");
    const op = raw as LayoutOp;
    switch (op.action) {
      case "add_widget": {
        if (!KIND_LIST.includes(op.kind as WidgetKind)) throw new WidgetError(`There's no widget kind "${String(op.kind ?? "").slice(0, 30)}". The kinds are ${KIND_LIST.join(", ")}.`);
        const page = pageOf(l, op.page);
        if (page.widgets.length >= MAX_WIDGETS) throw new WidgetError(`${page.name} already has ${MAX_WIDGETS} widgets, the most a page holds. Remove one first.`);
        const kind = op.kind as WidgetKind;
        const w: Widget = { id: newId("w"), kind, size: WIDGET_KINDS[kind].size };
        if (kind === "note") w.text = "";
        if (kind === "counter") Object.assign(w, { value: 0, step: 1 });
        if (kind === "checklist") w.items = [];
        if (kind === "links") w.links = [];
        settingsOnto(w, op, ctx);
        page.widgets.splice(given(op.position) ? placeAt(op.position, page.widgets.length) : page.widgets.length, 0, w);
        const kindName = WIDGET_KINDS[kind].name.toLowerCase();
        said.push(`added ${/^[aeiou]/.test(kindName) ? "an" : "a"} ${kindName} widget${w.title ? ` called "${w.title}"` : ""} to ${page.name}`);
        break;
      }
      case "update_widget": {
        const { page, widget } = widgetOf(l, op);
        settingsOnto(widget, op, ctx);
        if (given(op.position)) {
          page.widgets.splice(page.widgets.indexOf(widget), 1);
          page.widgets.splice(placeAt(op.position, page.widgets.length), 0, widget);
        }
        said.push(`changed the ${widgetName(widget)} on ${page.name}`);
        break;
      }
      case "move_widget": {
        const { page, widget } = widgetOf(l, op);
        const to = given(op.to_page) && op.to_page !== "" ? pageOf(l, op.to_page) : page;
        if (to !== page && to.widgets.length >= MAX_WIDGETS) throw new WidgetError(`${to.name} already has ${MAX_WIDGETS} widgets, the most a page holds.`);
        page.widgets.splice(page.widgets.indexOf(widget), 1);
        to.widgets.splice(given(op.position) ? placeAt(op.position, to.widgets.length) : to === page ? page.widgets.length : to.widgets.length, 0, widget);
        // A tab pinned to it follows it to its new page.
        for (const t of l.tabs) if (t.widget === widget.id) t.page = to.id;
        said.push(to === page ? `moved the ${widgetName(widget)} to place ${to.widgets.indexOf(widget) + 1} on ${to.name}` : `moved the ${widgetName(widget)} to ${to.name}`);
        break;
      }
      case "remove_widget": {
        const { page, widget } = widgetOf(l, op);
        page.widgets.splice(page.widgets.indexOf(widget), 1);
        l.tabs = l.tabs.filter((t) => t.widget !== widget.id);
        said.push(`removed the ${widgetName(widget)} from ${page.name}`);
        break;
      }
      case "add_page": {
        const name = labelOf(op.name ?? op.page, PAGE_NAME_MAX, "page's name");
        if (findPage(l, name)) throw new WidgetError(`There's already a page called ${name}.`);
        if (l.pages.length - 1 >= MAX_PAGES) throw new WidgetError(`You have ${MAX_PAGES} pages, the most there can be. Remove one first.`);
        l.pages.push({ id: newId("p"), name, widgets: [] });
        said.push(`made the page ${name}`);
        break;
      }
      case "rename_page": {
        const page = pageOf(l, op.page);
        if (page.id === HOME) throw new WidgetError("Home keeps its name.");
        const name = labelOf(op.name, PAGE_NAME_MAX, "page's name");
        const other = findPage(l, name);
        if (other && other !== page) throw new WidgetError(`There's already a page called ${name}.`);
        said.push(`renamed ${page.name} to ${name}`);
        for (const t of l.tabs) if (t.page === page.id && !t.widget && t.label === page.name) t.label = name.slice(0, TITLE_MAX);
        page.name = name;
        break;
      }
      case "remove_page": {
        if (!given(op.page) || op.page === "") throw new WidgetError("Say which page to remove.");
        const page = pageOf(l, op.page);
        if (page.id === HOME) throw new WidgetError("Home can't be removed. Its widgets can.");
        l.pages = l.pages.filter((p) => p !== page);
        l.tabs = l.tabs.filter((t) => t.page !== page.id);
        said.push(`removed the page ${page.name}${page.widgets.length ? ` and its ${page.widgets.length} widget${page.widgets.length === 1 ? "" : "s"}` : ""}`);
        break;
      }
      case "pin_tab": {
        const page = pageOf(l, op.page);
        const widget = given(op.widget) && op.widget !== "" ? widgetOf(l, { ...op, page: page.id }).widget : undefined;
        if (l.tabs.some((t) => t.page === page.id && t.widget === widget?.id)) throw new WidgetError(`There's already a tab for ${widget ? `the ${widgetName(widget)}` : page.name}.`);
        if (l.tabs.length >= MAX_TABS) throw new WidgetError(`You have ${MAX_TABS} pinned tabs, the most there can be. Unpin one first.`);
        const label = given(op.name) && op.name !== "" ? labelOf(op.name, TITLE_MAX, "tab's name") : widget ? (widget.title ?? WIDGET_KINDS[widget.kind].name) : page.name;
        l.tabs.push({ id: newId("t"), label, page: page.id, ...(widget ? { widget: widget.id } : {}) });
        said.push(`pinned a tab for ${widget ? `the ${widgetName(widget)}` : page.name}`);
        break;
      }
      case "unpin_tab": {
        const ref = String(op.tab ?? op.name ?? op.page ?? "").trim().toLowerCase();
        const t = l.tabs.find((x) => x.id.toLowerCase() === ref) ?? l.tabs.find((x) => x.label.toLowerCase() === ref) ?? l.tabs.find((x) => !x.widget && l.pages.find((p) => p.id === x.page)?.name.toLowerCase() === ref);
        if (!t) throw new WidgetError(`There's no pinned tab "${ref.slice(0, 40)}".${l.tabs.length ? ` The tabs are ${l.tabs.map((x) => x.label).join(", ")}.` : ""}`);
        l.tabs = l.tabs.filter((x) => x !== t);
        said.push(`unpinned the tab ${t.label}`);
        break;
      }
      default:
        throw new WidgetError(`"${String((op as { action?: unknown }).action ?? "").slice(0, 30)}" isn't a change there is. The changes are ${ACTIONS.join(", ")}.`);
    }
  }
  return { layout: normalizeLayout(l), said };
}

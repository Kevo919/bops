import "server-only";
import { createHash } from "node:crypto";
import { cloudOn, cloudSession } from "./cloud";
import { composioOn } from "./composio";
import { envLocalFile, EnvLocalError, looksLikeHttpsUrl, looksLikeKey, maskKey, readEnvLocalValue, setEnvLocal } from "./env-local";
import { mailOn } from "./mail";
import { memoryOn } from "./memory";
import { fromThisMac } from "./owner-email";
import { phoneOn } from "./phone";
import { getState } from "./store";
import { fromBopsWindow } from "./ui-token";
import { checkZapier, zapierOn } from "./zapier";

/*
 * Settings, Services: the four outside services a self-hosted Bops needs a key for, set from the app so nobody edits
 * .env.local by hand. Texting and calls (AgentPhone), Email (AgentMail), Memory (Honcho) and Connected apps
 * (Composio). Each says whether it's set up, takes its key in a masked box (owner only, in the desktop window), and
 * has a Check: one small read at the provider's own fixed address, with the key, whose answer is put in Bops' own
 * words. A key is never sent back, logged or kept in the state: only that it's there and its last four characters.
 * Keys are read as Bops starts, so a saved key says "Restart Bops to use it" until it has.
 * Signed in with Orgo (not self-hosted), Bops Cloud runs these: the screen says how each stands, and takes no key.
 */

export type ServiceId = "phone" | "mail" | "memory" | "apps" | "composio-account" | "zapier";
/**
 * One box. `valid`: what a value may look like; `problem`: why one is refused, in words for the page (a key of the
 * wrong kind); `optional`: the service is set up without it.
 */
type Field = { name: string; label: string; secret: boolean; hint: string; valid: (v: string) => boolean; problem?: (v: string) => string | null; optional?: boolean };
type Probe = { url: string; method: "GET" | "POST"; auth: "bearer" | "x-api-key"; body?: string };
type Service = {
  id: ServiceId;
  name: string;
  provider: string;
  what: string;
  fields: Field[];
  getKey: { href: string; label: string };
  /** A fixed-address read with the saved key; or `check`, the service's own (it reads what this server started with). */
  probe?: Probe;
  check?: () => Promise<CheckWords>;
  on: () => boolean;
  /** Only on a self-hosted Bops (Bops Cloud doesn't run it): not listed when signed in with Orgo. */
  selfOnly?: boolean;
  /** Not finished in this build: shown in the in-progress style, its boxes not offered (services.tsx). */
  pending?: { percent: number; why: string };
};

/*
 * Composio (your account) and Zapier: MCP addresses, validated as PR #83 (composio-mcp.ts) and zapier.ts do, copied
 * here so this screen doesn't depend on #83's code: https only, on the service's own host, no user or other port.
 */
const onHost = (v: string, ok: (host: string) => boolean) => {
  if (/[\s=]/.test(v) || v.length > 1000) return false;
  try {
    const u = new URL(v);
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443") && ok(host);
  } catch {
    return false;
  }
};
export const looksLikeComposioMcpUrl = (v: string) => onHost(v, (h) => h === "connect.composio.dev");
export const looksLikeZapierMcpUrl = (v: string) => onHost(v, (h) => h === "zapier.com" || h.endsWith(".zapier.com"));
/** A For You consumer key (ck_…), never a Platform project key (ak_…: that's COMPOSIO_API_KEY's). */
export const composioMcpKeyProblem = (v: string) =>
  /^ak_/i.test(v) ? "That's a Platform project key (it starts with ak_): it goes in Connected apps above. For You has its own key: in Composio, open For You, then Settings, Sessions & API Key, and copy the key that starts with ck_." : null;
/**
 * Whether Bops in this build uses COMPOSIO_MCP_URL (PR #83). Until #83 is in windows-port, the row shows in the
 * in-progress style; when it lands, set this to true (one line) and the boxes appear.
 */
export const COMPOSIO_ACCOUNT_IN_THIS_BUILD = false;

const key = (name: string, provider: string): Field => ({ name, label: `${provider} key`, secret: true, hint: "Paste the whole key", valid: looksLikeKey });

/** The services, in the screen's order. Each probe is a fixed https address: nothing a page sends can point a key elsewhere. */
export const SERVICES: Service[] = [
  {
    id: "phone",
    name: "Texting and calls",
    provider: "AgentPhone",
    what: "Lets you text and call your bots from your own phone.",
    fields: [
      key("AGENTPHONE_API_KEY", "AgentPhone"),
      { name: "BOPS_AGENTPHONE_HOOK_URL", label: "Public address texts arrive at", secret: false, hint: "https://your-address/hooks/agentphone", valid: looksLikeHttpsUrl },
    ],
    getKey: { href: "https://agentphone.ai/dashboard", label: "Where to get this key (AgentPhone, Settings, API Keys)" },
    // Bops' own numbers list (phone.ts lists them the same way): a read, nothing is bought or sent.
    probe: { url: "https://api.agentphone.ai/v1/numbers?limit=1", method: "GET", auth: "bearer" },
    on: phoneOn,
  },
  {
    id: "mail",
    name: "Email",
    provider: "AgentMail",
    what: "Gives every bot its own email address, so people can email them and they can email you.",
    fields: [key("AGENTMAIL_API_KEY", "AgentMail")],
    getKey: { href: "https://console.agentmail.to", label: "Where to get this key (AgentMail console, API Keys)" },
    probe: { url: "https://api.agentmail.to/v0/inboxes?limit=1", method: "GET", auth: "bearer" },
    on: mailOn,
  },
  {
    id: "memory",
    name: "Memory",
    provider: "Honcho",
    what: "Lets your bots remember what they learn about you from your chats.",
    fields: [key("HONCHO_API_KEY", "Honcho")],
    getKey: { href: "https://app.honcho.dev/api-keys", label: "Where to get this key (Honcho, API Keys)" },
    // The SDK's own list call (POST /v3/workspaces/list): a read of one page, nothing is made.
    probe: { url: "https://api.honcho.dev/v3/workspaces/list?size=1", method: "POST", auth: "bearer", body: "{}" },
    on: memoryOn,
  },
  {
    id: "apps",
    name: "Connected apps",
    provider: "Composio",
    what: "Lets your bots use Gmail, Slack, Notion and about 1,000 more apps you sign in to.",
    fields: [key("COMPOSIO_API_KEY", "Composio")],
    getKey: { href: "https://platform.composio.dev", label: "Where to get this key (Composio, Project Settings, API Keys)" },
    // The same read as the Keys card's check (key-check.ts): one page of the project's sign-in setups.
    probe: { url: "https://backend.composio.dev/api/v3.1/auth_configs?limit=1", method: "GET", auth: "x-api-key" },
    on: composioOn,
  },
  {
    id: "composio-account",
    name: "Composio (your account)",
    provider: "Composio For You",
    what: "Lets your bots use the apps you connected in your own Composio account (For You), in your own chats.",
    fields: [
      { name: "COMPOSIO_MCP_URL", label: "Composio address", secret: true, hint: "https://connect.composio.dev/mcp", valid: looksLikeComposioMcpUrl },
      { name: "COMPOSIO_MCP_KEY", label: "Composio key (starts with ck_)", secret: true, hint: "Paste the key that starts with ck_", valid: looksLikeKey, problem: composioMcpKeyProblem, optional: true },
    ],
    getKey: { href: "https://composio.dev", label: "Where to get these (Composio, For You, Connect my agent)" },
    on: () => !!process.env.COMPOSIO_MCP_URL?.trim() && looksLikeComposioMcpUrl(process.env.COMPOSIO_MCP_URL.trim()),
    selfOnly: true,
    ...(COMPOSIO_ACCOUNT_IN_THIS_BUILD ? {} : { pending: { percent: 70, why: "The boxes are built; Bops starts using this address once its Composio (your account) update (PR #83) is in." } }),
  },
  {
    id: "zapier",
    name: "Zapier",
    provider: "Zapier",
    what: "Lets your bots run the Zapier actions you pick, in your own chats. Anything that could change something asks you first.",
    // The address has the server's token in it: a secret, shown masked like a key.
    fields: [{ name: "ZAPIER_MCP_URL", label: "Zapier MCP server address", secret: true, hint: "https://mcp.zapier.com/api/mcp/s/…/mcp", valid: looksLikeZapierMcpUrl }],
    getKey: { href: "https://mcp.zapier.com", label: "Where to get this (mcp.zapier.com, Other clients, server URL)" },
    // zapier.ts's own check (MCP initialize and tools/list), on the address this server started with.
    check: async () => {
      const z = await checkZapier();
      const status = z.status === "rate limited" ? "busy" : z.status;
      return { ok: z.status === "works", status, words: z.status === "works" ? "Zapier answered." : z.status === "invalid" ? "Zapier turned this address down. Copy the server URL again from mcp.zapier.com and save it here." : z.status === "not set" ? "Restart Bops first, then press Check." : "Couldn't reach Zapier just now. Try Check again later." };
    },
    on: zapierOn,
    selfOnly: true,
  },
];
export const serviceOf = (id: unknown) => SERVICES.find((s) => s.id === id);

/* ---------------- Who may change them ---------------- */

const fromPhone = (request: Request) => request.headers.has("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");

/**
 * Whether this request may save or check a key: the owner of a self-hosted Bops, in its desktop window on this PC.
 * Never a paired phone, a workspace shared with a team, a browser elsewhere or a page a bot's Chrome reached.
 * As Bot tasks on this PC's route (PR #80) decides. Anything malformed is a no.
 */
export function ownerHere(request: Request): boolean {
  try {
    return process.env.BOPS_SELF_HOSTED === "1" && !!process.env.BOPS_UI_TOKEN && !fromPhone(request) && !getState().shared && fromThisMac(request) && fromBopsWindow(request);
  } catch {
    return false;
  }
}

/* ---------------- How each stands ---------------- */

export type CheckWords = { ok: boolean; status: "works" | "invalid" | "no credit" | "busy" | "unavailable" | "not set"; words: string };
/** The last Check of each service, in this server only: its words and which saved value it was (a hash, never the value). */
const checks = new Map<ServiceId, CheckWords & { of: string }>();
const fingerprint = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 16);

export type ServiceStatus = "on" | "off" | "restart" | "broken";
export type ServiceView = {
  id: ServiceId;
  name: string;
  provider: string;
  what: string;
  getKey: { href: string; label: string };
  status: ServiceStatus;
  words: string;
  /** The owner's view only: each box, whether it's saved, and how a saved one shows (a key masked, an address as it is). */
  fields?: { name: string; label: string; secret: boolean; hint: string; set: boolean; shown: string }[];
  check?: CheckWords;
  /** Whether a Check exists for it (a safe read at the provider). */
  canCheck: boolean;
  /** Not finished in this build: how far along, and why (shown grayed out, "Not set up yet"). */
  pending?: { percent: number; why: string };
};
export type ServicesView = { mode: "self" | "cloud"; editable: boolean; services: ServiceView[] };

/** A field's value now: what .env.local has (saved, maybe not in use yet), else what this server started with. */
const savedValue = (name: string) => readEnvLocalValue(envLocalFile(), name) ?? (process.env[name]?.trim() || undefined);
const running = (name: string) => process.env[name]?.trim() || undefined;
/** How a saved secret shows: a key by its last four characters, an address (its token inside) by its host only. */
const shownSecret = (v: string | undefined) => {
  if (!v) return "";
  if (/^https:\/\//.test(v))
    try {
      return `${new URL(v).host}/•••`;
    } catch {
      return "an address";
    }
  return maskKey(v);
};

function viewOf(s: Service, owner: boolean, cloud: boolean): ServiceView {
  const base = { id: s.id, name: s.name, provider: s.provider, what: s.what, getKey: s.getKey, canCheck: !!(s.probe || s.check), ...(s.pending ? { pending: s.pending } : {}) };
  if (s.pending) return { ...base, status: "off", words: "Not set up yet." };
  if (cloud) {
    const on = s.on();
    return { ...base, status: on ? "on" : "off", words: on ? "Set up. Bops Cloud runs it for you." : "Not on for your account right now. Bops Cloud runs it for you while you're signed in with Orgo." };
  }
  const saved = s.fields.map((f) => savedValue(f.name));
  const live = s.fields.map((f) => running(f.name));
  const waiting = s.fields.some((_, i) => saved[i] !== live[i]);
  const last = checks.get(s.id);
  const current = last && last.of === fingerprint(saved[0] ?? "") ? last : undefined;
  const missing = s.fields.filter((f, i) => !saved[i] && !f.optional);
  let status: ServiceStatus;
  let words: string;
  if (current && (current.status === "invalid" || current.status === "no credit")) [status, words] = ["broken", `Key saved but not working. ${current.words}`];
  else if (!missing.length && waiting) [status, words] = ["restart", "Saved. Restart Bops to use it."];
  else if (!missing.length) [status, words] = ["on", "Set up."];
  else if (missing.length < s.fields.filter((f) => !f.optional).length) [status, words] = ["off", `Not set up: add the ${missing.map((f) => f.label.toLowerCase()).join(" and ")} too.`];
  else [status, words] = ["off", "Not set up."];
  return {
    ...base,
    status,
    words,
    ...(owner ? { fields: s.fields.map((f, i) => ({ name: f.name, label: f.label, secret: f.secret, hint: f.hint, set: !!saved[i], shown: f.secret ? shownSecret(saved[i]) : (saved[i] ?? "") })) } : {}),
    ...(owner && current ? { check: { ok: current.ok, status: current.status, words: current.words } } : {}),
  };
}

/** How every service stands, for this request: the owner's view has the boxes; everyone else (a phone, a team) sees status only. */
export async function servicesView(request: Request): Promise<ServicesView> {
  const cloud = cloudOn();
  // Signed in with Orgo, whether each is on is the cloud session's: read it first, or a fresh start says "off".
  if (cloud) await cloudSession().catch(() => null);
  const owner = !cloud && ownerHere(request);
  return { mode: cloud ? "cloud" : "self", editable: owner, services: SERVICES.filter((s) => !cloud || !s.selfOnly).map((s) => viewOf(s, owner, cloud)) };
}

/** Save one of a service's settings to .env.local. Throws EnvLocalError, in words a page may show. */
export function saveServiceSetting(id: unknown, name: unknown, value: unknown) {
  const s = serviceOf(id);
  const f = s?.fields.find((x) => x.name === name);
  if (!s || !f || s.pending) throw new EnvLocalError("Choose one of the services on this screen.");
  if (typeof value !== "string") throw new EnvLocalError("Paste the key as text.");
  const v = value.trim();
  if (!v) throw new EnvLocalError(f.secret ? "Paste the key first." : "Type the address first.");
  const why = f.problem?.(v);
  if (why) throw new EnvLocalError(why);
  const address = /address/i.test(f.label);
  if (!f.valid(v)) throw new EnvLocalError(address ? `That doesn't look like the right address. It starts with https://${f.hint.startsWith("https://") ? ` (like ${f.hint})` : ""} and has no spaces.` : "That doesn't look like a key. Paste the whole key, with no spaces.");
  setEnvLocal(envLocalFile(), f.name, v, f.valid);
  checks.delete(s.id);
}

/** Read only a little of an answer, and never any of its words: whether it is JSON is all a check needs. */
async function drain(response: Response) {
  await response.body?.cancel().catch(() => {});
}

/**
 * Check a service's key: one small read at its provider's fixed address, with the saved key (so a key just pasted can
 * be checked before Bops restarts). Only on the owner's press. The answer is Bops' own words, never the provider's.
 */
export async function checkService(id: unknown, fetcher: typeof fetch = fetch): Promise<CheckWords | null> {
  const s = serviceOf(id);
  if (!s || s.pending || !(s.probe || s.check)) return null;
  const value = savedValue(s.fields[0].name);
  const done = (c: CheckWords) => (checks.set(s.id, { ...c, of: fingerprint(value ?? "") }), c);
  if (!value) return done({ ok: false, status: "not set", words: "No key is saved yet." });
  if (s.check) {
    // Its own check reads what this server started with: a value saved since is checked after a restart.
    if (value !== running(s.fields[0].name)) return { ok: false, status: "not set", words: "Restart Bops first, then press Check." };
    return done(await s.check().catch((): CheckWords => ({ ok: false, status: "unavailable", words: `Couldn't reach ${s.provider} just now. Try Check again later.` })));
  }
  const probe = s.probe!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const headers: Record<string, string> = probe.auth === "bearer" ? { Authorization: `Bearer ${value}` } : { "x-api-key": value };
    if (probe.body) headers["Content-Type"] = "application/json";
    const response = await fetcher(probe.url, { method: probe.method, headers, body: probe.body, redirect: "error", cache: "no-store", signal: controller.signal });
    await drain(response);
    if (response.ok) return done({ ok: true, status: "works", words: `${s.provider} accepted this key.` });
    if (response.status === 401 || response.status === 403) return done({ ok: false, status: "invalid", words: `${s.provider} turned this key down. Copy it again from ${s.provider} and save it here.` });
    if (response.status === 402) return done({ ok: false, status: "no credit", words: `${s.provider} says the account has no credit left.` });
    if (response.status === 429) return done({ ok: false, status: "busy", words: `${s.provider} is busy right now. Try Check again in a minute.` });
    return done({ ok: false, status: "unavailable", words: `${s.provider} didn't confirm the key just now. That doesn't mean it's wrong: try Check again later.` });
  } catch {
    return done({ ok: false, status: "unavailable", words: `Couldn't reach ${s.provider}, or it took too long. Check this PC is online, then try again.` });
  } finally {
    clearTimeout(timer);
  }
}

/** For tests: forget the last checks. */
export const forgetChecks = () => checks.clear();

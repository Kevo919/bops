import { createRequire } from "node:module";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import { checkVoiceAddress } from "@/lib/voice-address";

export const dynamic = "force-dynamic";

/*
 * Bops' modules (config/modules.cjs, config/bops.yaml): what each one is, whether it's on and set up,
 * and its settings. Settings, Modules reads and changes them here; they take effect when Bops restarts.
 * Only the Bops window may (a paired phone, or a bot's Chrome, can't), and only this machine when there
 * is no window; on a server that only lets in the paired phone (BOPS_REQUIRE_REMOTE=1), that phone. No key or secret is ever read or written here: those stay in .env.local.
 */
// Its own require (node:module), so this also loads as plain ESM, where there is no global require.
const load = createRequire(import.meta.url);
const mods = () => load(/* turbopackIgnore: true */ `${process.cwd()}/config/modules.cjs`) as {
  describe: (root: string) => Module[];
  modules: (root: string) => { id: string; required?: boolean; settings?: { key: string; type: unknown; check?: string }[] }[];
  write: (root: string, config: Record<string, Record<string, unknown>>) => void;
};
type Module = { id: string; enabled: boolean; settings: { key: string; value: unknown }[] };

const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
// On a server (BOPS_REQUIRE_REMOTE=1, no window) proxy.ts lets in only the paired phone, which is the owner there.
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);
const no = () => Response.json({ error: "Modules can only be changed in the Bops app." }, { status: 403 });

export async function GET(request: Request) {
  if (!allowed(request)) return no();
  return Response.json({ modules: mods().describe(process.cwd()) });
}

/** { modules: { <id>: { enabled?, <setting>: value } } }: only known modules and settings are kept, as plain values. */
export async function PUT(request: Request) {
  if (!allowed(request)) return no();
  const body = (await request.json().catch(() => null)) as { modules?: Record<string, Record<string, unknown>> } | null;
  if (!body?.modules || typeof body.modules !== "object") return Response.json({ error: "Send { modules }." }, { status: 400 });
  const known = new Map(mods().modules(process.cwd()).map((m) => [m.id, m]));
  const clean: Record<string, Record<string, unknown>> = {};
  for (const [id, values] of Object.entries(body.modules)) {
    const m = known.get(id);
    if (!m || !values || typeof values !== "object") continue;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const s = m.settings?.find((x) => x.key === key);
      if (key === "enabled" && !m.required && typeof value === "boolean") out.enabled = value;
      else if (s?.type === "toggle" && typeof value === "boolean") out[key] = value;
      else if (Array.isArray(s?.type) && (value === "" || (s.type as string[]).includes(String(value)))) out[key] = value;
      else if (s?.type === "text" && typeof value === "string" && value.length <= 500 && !/[\r\n]/.test(value)) {
        // An address that can't work (not http or https) is refused here; one off this machine is only warned about (Settings shows it).
        const checked = s.check === "local-address" ? checkVoiceAddress(value) : null;
        if (checked && !checked.ok) return Response.json({ error: checked.error }, { status: 400 });
        out[key] = value.trim();
      }
    }
    clean[id] = out;
  }
  try {
    mods().write(process.cwd(), clean);
  } catch (e) {
    return Response.json({ error: `Couldn't save config/bops.yaml: ${(e as Error).message}` }, { status: 500 });
  }
  return Response.json({ ok: true, modules: mods().describe(process.cwd()), restart: true });
}

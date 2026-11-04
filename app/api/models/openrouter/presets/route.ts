import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import { openRouterPresets } from "@/lib/server/openrouter-models";

export const dynamic = "force-dynamic";

/*
 * Your OpenRouter presets, for Settings, Models' Add a model (lib/server/openrouter-models.ts openRouterPresets): this
 * server asks OpenRouter on OPENROUTER_API_KEY, so the key stays here; the window gets each preset's slug, name and
 * description only. Only the Bops window, as app/api/models.
 */
const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Only in the Bops app." }, { status: 403, headers });
  return Response.json(await openRouterPresets(), { headers });
}

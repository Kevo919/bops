import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import { openRouterModels } from "@/lib/server/openrouter-models";

export const dynamic = "force-dynamic";

/*
 * OpenRouter's models, for Settings, Models' Add a model (lib/server/openrouter-models.ts): its public list, so the
 * window needn't reach OpenRouter. `offline`: it couldn't be reached, and the card asks for the model id instead.
 * Only the Bops window, as app/api/models.
 */
const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Only in the Bops app." }, { status: 403, headers });
  return Response.json(await openRouterModels(), { headers });
}

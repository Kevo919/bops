import { EnvLocalError } from "@/lib/server/env-local";
import { checkService, ownerHere, saveServiceSetting, servicesView } from "@/lib/server/services";
import { notReady } from "@/lib/server/ready";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/**
 * Settings, Services (lib/server/services.ts). GET: how each service stands, to anyone who can open Settings (a paired
 * phone or a team's workspace sees status only; the owner's desktop window gets the boxes, keys masked). POST: save a
 * setting ({service, name, value}) or Check one ({check}), the owner's, in the desktop window, only. A key goes in and
 * never comes back: the answer is the same view as GET.
 */
export async function GET(request: Request) {
  return Response.json(await servicesView(request), { headers });
}

export async function POST(request: Request) {
  if (!ownerHere(request)) return Response.json({ error: "Only the owner can add keys, in the Bops app on this PC." }, { status: 403, headers });
  const unready = notReady();
  if (unready) return unready;
  const body = (await request.json().catch(() => null)) as { service?: unknown; name?: unknown; value?: unknown; check?: unknown } | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Paste a key, or press Check." }, { status: 400, headers });
  if (body.check !== undefined) {
    const result = await checkService(body.check);
    if (!result) return Response.json({ error: "Choose one of the services on this screen." }, { status: 400, headers });
    return Response.json({ ...(await servicesView(request)), result }, { headers });
  }
  try {
    saveServiceSetting(body.service, body.name, body.value);
  } catch (e) {
    // Only this screen's own words: never the key, nor a file system error that could name a path.
    const words = e instanceof EnvLocalError ? e.message : "Bops couldn't save the key on this PC. Try again.";
    return Response.json({ error: words }, { status: 400, headers });
  }
  return Response.json(await servicesView(request), { headers });
}

import { checkKey, keyCheckList } from "@/lib/server/key-check";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const allowed = (request: Request) => {
  // Phone credentials never authorize key checks, including on hosted paired-phone servers.
  if (request.headers.has("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "")) return false;
  if (process.env.BOPS_UI_TOKEN) {
    try { return fromBopsWindow(request); } catch { return false; }
  }
  return process.env.BOPS_REQUIRE_REMOTE !== "1" && fromThisMac(request);
};
const denied = () => Response.json({ error: "Key checks are only available in the Bops app." }, { status: 403, headers });

export async function GET(request: Request) {
  if (!allowed(request)) return denied();
  return Response.json({ keys: keyCheckList() }, { headers });
}

export async function POST(request: Request) {
  if (!allowed(request)) return denied();
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || !("key" in body) || typeof body.key !== "string")
    return Response.json({ error: "Choose a supported key to check." }, { status: 400, headers });
  const result = await checkKey(body.key);
  if (!result) return Response.json({ error: "Choose a supported key to check." }, { status: 400, headers });
  return Response.json({ result }, { headers });
}

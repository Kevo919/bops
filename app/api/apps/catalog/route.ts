import { catalog, composioOn } from "@/lib/server/composio";

/** Every app the user can connect (Composio's catalog), most used first, for the app picker. */
export async function GET() {
  try {
    const apps = await catalog();
    // No Composio here (no key on a self-hosted Bops): `off`, so the picker says what it takes instead of an empty list.
    if (!composioOn()) return Response.json({ apps, off: true }, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ apps }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return Response.json({ apps: [], error: (e as Error).message }, { status: 502 });
  }
}

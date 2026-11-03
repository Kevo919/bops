import { duePings } from "@/lib/pings";
import { notReady } from "@/lib/server/ready";
import { getState } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * What's worth a notification right now (lib/pings.ts: news judged "now", finished tasks the user is
 * waiting on, a bot waiting for their OK), each with the key it's told once by. The Bops Android app asks
 * this every little while in the background and shows the new ones; the window chimes for the same list.
 * proxy.ts lets only the Bops window and the paired phone read it.
 */
export async function GET() {
  const unready = notReady();
  if (unready) return Response.json({ pings: [] });
  return Response.json({ pings: duePings(getState()) });
}

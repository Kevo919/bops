import "@/lib/server/llms";
import { llms } from "@/lib/agents";

export const dynamic = "force-dynamic";

// Uses the same proxy authentication as /api/state, without starting its background services.
export async function GET() {
  return Response.json({ llms: llms() }, { headers: { "Cache-Control": "no-store" } });
}

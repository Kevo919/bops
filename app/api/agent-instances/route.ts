import { addAgent, AgentInstanceError, agentsOwnerHere, checkAgent, editAgent, listAgents, removeAgent } from "@/lib/server/agent-instances";
import { notReady } from "@/lib/server/ready";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const NOT_OWNER = "Only the owner can see and change the agents you run, in the Bops app on this PC.";

/**
 * Settings, Agents you run (lib/server/agent-instances.ts): the owner's own DeepSeek Harness and Hermes Agent
 * instances. Every method is the owner's alone, in the desktop window on this PC (proxy.ts asks too): a paired phone
 * or a shared workspace sees nothing, not even the names. GET: the list, keys masked. POST {action}: "add", "edit"
 * ({id, …}), "remove" ({id}) or "check" ({id}). A key goes in and never comes back: the answer is the list again.
 */
export async function GET(request: Request) {
  if (!agentsOwnerHere(request)) return Response.json({ error: NOT_OWNER, agents: [] }, { status: 403, headers });
  return Response.json({ agents: listAgents() }, { headers });
}

export async function POST(request: Request) {
  if (!agentsOwnerHere(request)) return Response.json({ error: NOT_OWNER }, { status: 403, headers });
  const unready = notReady();
  if (unready) return unready;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Add an agent, or choose one to change." }, { status: 400, headers });
  try {
    if (body.action === "add") addAgent(body);
    else if (body.action === "edit") editAgent(body.id, body);
    else if (body.action === "remove") removeAgent(body.id);
    else if (body.action === "check") {
      // The Check first, then the list (which carries its answer).
      const result = await checkAgent(body.id);
      return Response.json({ agents: listAgents(), result }, { headers });
    }
    else return Response.json({ error: "Add an agent, or choose one to change." }, { status: 400, headers });
  } catch (e) {
    // Only this screen's own words: never a key, nor a file system error that could name a path.
    const words = e instanceof AgentInstanceError ? e.message : "Bops couldn't save that on this PC. Try again.";
    return Response.json({ error: words, agents: listAgents() }, { status: 400, headers });
  }
  return Response.json({ agents: listAgents() }, { headers });
}

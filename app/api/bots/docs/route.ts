import { botDocs, saveBotDocs, type DocsPatch } from "@/lib/server/bot-docs";
import { notReady } from "@/lib/server/ready";
import { sharedOpen } from "@/lib/server/shared";
import { bot } from "@/lib/server/store";
import { fromBopsWindow } from "@/lib/server/ui-token";

/**
 * A bot's SOUL.md and MEMORY.md (lib/bot-docs.ts), for the Memory tab's Edit. The owner's own, from the Bops window
 * alone: proxy.ts lets the paired phone through to every route, so the window's token is asked for again here
 * (ui-token.ts), as PATCH /api/bots asks for a bot's settings; a page a bot's Chrome reached this server with has no
 * token either. With someone else's workspace open (sharedOpen) there's nothing of the owner's to change. A bot has no
 * tool that reaches this, and a computer's write of Bot.soul or Bot.memoryDoc is refused by Bops Cloud
 * (cloud/computer-scope.ts keeps a computer to BOT_RUN on a bot), so a bot never rewrites its own soul.
 */
const notOwner = (request: Request) =>
  !fromBopsWindow(request)
    ? Response.json({ error: "A bot's SOUL.md and MEMORY.md can only be changed in the Bops app." }, { status: 403 })
    : sharedOpen()
      ? Response.json({ error: "Only the owner can change this." }, { status: 403 })
      : null;

/** ?bot=<id>: both documents as kept (text, null while the generated one is read), the generated ones, the cap and the mirror folder. */
export async function GET(request: Request) {
  const unready = notReady() ?? notOwner(request);
  if (unready) return unready;
  const botId = new URL(request.url).searchParams.get("bot") ?? "";
  if (!bot(botId)) return Response.json({ error: "no such bot" }, { status: 404 });
  try {
    return Response.json(await botDocs(botId));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** { botId, soul?, memoryDoc? }: a string saves that document (empty resets it), null resets it to the generated one. Over the cap is refused. */
export async function PATCH(request: Request) {
  const unready = notReady() ?? notOwner(request);
  if (unready) return unready;
  const body = (await request.json().catch(() => ({}))) as { botId?: string; soul?: unknown; memoryDoc?: unknown };
  if (typeof body.botId !== "string" || !bot(body.botId)) return Response.json({ error: "no such bot" }, { status: 404 });
  const patch: DocsPatch = {};
  for (const k of ["soul", "memoryDoc"] as const) {
    const v = body[k];
    if (v === undefined) continue;
    if (v !== null && typeof v !== "string") return Response.json({ error: `${k} must be text or null.` }, { status: 400 });
    patch[k] = v;
  }
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change." }, { status: 400 });
  const r = await saveBotDocs(body.botId, patch);
  if ("error" in r) return Response.json(r, { status: 400 });
  return Response.json(await botDocs(body.botId));
}

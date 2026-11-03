import { chat, update } from "@/lib/server/store";
import { notReady } from "@/lib/server/ready";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import { chatModelOk } from "@/lib/chat-models";
import "@/lib/server/llms";

export const dynamic = "force-dynamic";

/*
 * The model a chat's replies run on (Chat.model), picked in its message box: one of Your LLMs or the few built
 * in (lib/chat-models.ts chatModels), or Auto (null) for OpenAI as before. It applies to the chat's next message.
 * Only the Bops window may (a paired phone, or a bot's Chrome, can't), and only this machine when there is no
 * window; on a server that only lets in the paired phone (BOPS_REQUIRE_REMOTE=1), that phone. As app/api/modules.
 */
const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);

/** { chatId, model }: model is "provider/model", or null (or "auto") for Auto. */
export async function POST(request: Request) {
  const unready = notReady();
  if (unready) return unready;
  if (!allowed(request)) return Response.json({ error: "A chat's model can only be changed in the Bops app." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { chatId?: unknown; model?: unknown } | null;
  const chatId = typeof body?.chatId === "string" ? body.chatId : "";
  if (!chatId || !chat(chatId)) return Response.json({ error: "No such chat." }, { status: 404 });
  const model = body?.model === null || body?.model === undefined || body?.model === "" || body?.model === "auto" ? null : body.model;
  if (model !== null && !chatModelOk(model)) return Response.json({ error: "That isn't one of the models a chat can use: pick one from the list, or add it to config/llms.yaml." }, { status: 400 });
  update(() => {
    const c = chat(chatId);
    if (!c) return;
    if (model) c.model = model;
    else delete c.model;
  });
  return Response.json({ ok: true, model });
}

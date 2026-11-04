import type { AskReply } from "@/lib/types";
import { REPO_ASK_ACTION } from "@/lib/repos";
import { replyToAsk } from "@/lib/server/permission";
import { notReady } from "@/lib/server/ready";
import { fromThisMac } from "@/lib/server/owner-email";
import { getState } from "@/lib/server/store";
import { fromBopsWindow } from "@/lib/server/ui-token";

const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
// A repo's first run (lib/server/repos.ts) is approved in the Bops window only, or by the paired phone on a server
// that only lets it in (BOPS_REQUIRE_REMOTE=1): the same rule as app/api/modules/route.ts.
const fromWindow = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);

/**
 * The user's reply to a request for their OK, from this Bops (permission.ts replyToAsk): Allow once, Allow for
 * this thread (the action allowed on that thread alone), Always allow (a rule saved for the bot), or Deny with
 * what to do instead (`message`, which the bot is told). Written into the shared state, so the Bops whose run
 * asked carries it on from where it paused, wherever it runs. Refused (409) when it's already answered, or this
 * is a bot's computer.
 */
export async function POST(request: Request) {
  const unready = notReady();
  if (unready) return unready;
  const { id, reply, message } = (await request.json().catch(() => ({}))) as { id?: string; reply?: AskReply; message?: unknown };
  if (!id) return Response.json({ ok: false, error: "Which request?" }, { status: 400 });
  if (reply !== "once" && reply !== "session" && reply !== "always" && reply !== "reject") return Response.json({ ok: false, error: "reply: once, session, always or reject" }, { status: 400 });
  const ask = getState().appApprovals?.find((x) => x.id === id);
  if (ask?.action === REPO_ASK_ACTION && reply !== "reject" && !fromWindow(request)) return Response.json({ ok: false, error: "Running a repo is approved in the Bops app on your computer." }, { status: 403 });
  const refused = replyToAsk(id, reply, typeof message === "string" ? message : undefined);
  if (refused) return Response.json({ ok: false, error: refused }, { status: 409 });
  return Response.json({ ok: true });
}

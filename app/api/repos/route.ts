import { notReady } from "@/lib/server/ready";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import { getState } from "@/lib/server/store";
import { MAIN_WORKSPACE } from "@/lib/types";
import { openForWindow, planForWindow, planText, RepoError, reposAnswer, runFromWindow, statusText, stopRepo, type RepoTarget } from "@/lib/server/repos";

export const dynamic = "force-dynamic";

/*
 * Settings, Repos (lib/server/repos.ts): the ready-to-run GitHub repos, their status on each bot's computer, Open,
 * and Run. Running one is the owner's, from the Bops window (a paired phone, or a bot's Chrome, can't), and only
 * this machine when there is no window; on a server that only lets in the paired phone (BOPS_REQUIRE_REMOTE=1), that
 * phone: the same rule as app/api/modules/route.ts. The phone may still list, open, check and stop. Run takes the
 * plan the owner saw (planId): when anything changed since (a new commit), it's shown again instead of run.
 */
const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
// On a server (BOPS_REQUIRE_REMOTE=1, no window) proxy.ts lets in only the paired phone, which is the owner there.
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);

const wsNow = () => getState().workspace ?? MAIN_WORKSPACE;

export async function GET() {
  const unready = notReady();
  if (unready) return unready;
  return Response.json(reposAnswer(wsNow()));
}

type Body = { action?: unknown; bot?: unknown; repoId?: unknown; url?: unknown; planId?: unknown };

export async function POST(request: Request) {
  const unready = notReady();
  if (unready) return unready;
  // A shared workspace's bots are its owner's: nothing of theirs is run from here.
  if (getState().shared) return Response.json({ error: "Repos are the workspace owner's." }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as Body;
  const botId = typeof b.bot === "string" ? b.bot : "";
  const bot = getState().bots.find((x) => x.id === botId && (x.workspaceId ?? MAIN_WORKSPACE) === wsNow());
  if (!bot) return Response.json({ error: "Pick one of this workspace's bots." }, { status: 400 });
  const target: RepoTarget = { repoId: typeof b.repoId === "string" ? b.repoId : null, url: typeof b.url === "string" ? b.url : null };
  try {
    switch (b.action) {
      case "open":
        return Response.json({ text: await openForWindow(botId, target) });
      case "status":
        return Response.json({ text: await statusText(botId, target.repoId) });
      case "stop":
        return Response.json({ text: await stopRepo(botId, String(target.repoId ?? "")) });
      case "plan": {
        if (!allowed(request)) return Response.json({ error: "Repos can only be run from the Bops app." }, { status: 403 });
        const plan = await planForWindow(botId, target);
        return Response.json({ plan, text: planText(plan) });
      }
      case "run": {
        if (!allowed(request)) return Response.json({ error: "Repos can only be run from the Bops app." }, { status: 403 });
        if (typeof b.planId !== "string" || !b.planId) return Response.json({ error: "Show the plan first." }, { status: 400 });
        const r = await runFromWindow(botId, target, b.planId);
        if (r.changed) return Response.json({ changed: true, plan: r.plan, text: planText(r.plan) }, { status: 409 });
        return Response.json({ run: r.run });
      }
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof RepoError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

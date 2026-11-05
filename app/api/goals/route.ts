import { notReady } from "@/lib/server/ready";
import { saveIdea, setGoal, settleGoal, takeIdea } from "@/lib/server/goals";
import { bot } from "@/lib/server/store";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import type { Schedule } from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * The owner's goals and ideas (lib/server/goals.ts): what the Ideas tab reads and acts on. The whole
 * list rides with the state (GET /api/state), so this only changes it. The Bops window alone may (a
 * paired phone or a bot's Chrome can't); on a REQUIRE_REMOTE server, the paired phone. Every action is
 * the owner's own: a goal made from an idea uses the steps the tab sends, and the bot's set_goal in
 * the chat is the same code path.
 */
const fromPhone = (request: Request) => !!request.headers.get("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
const allowed = (request: Request) =>
  process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) && !fromPhone(request) : process.env.BOPS_REQUIRE_REMOTE === "1" ? fromPhone(request) : fromThisMac(request) && !fromPhone(request);
const no = () => Response.json({ error: "Goals can only be changed in the Bops app." }, { status: 403 });

type Body = {
  action: "goal-done" | "goal-drop" | "idea-add" | "idea-take" | "idea-to-goal";
  goalId?: string;
  ideaId?: string;
  text?: string;
  botId?: string;
  steps?: { what?: unknown; title?: unknown; schedule?: Schedule }[];
};

export async function POST(request: Request) {
  if (!allowed(request)) return no();
  const unready = notReady();
  if (unready) return unready;
  const b = (await request.json().catch(() => ({}))) as Body;
  switch (b.action) {
    // Retire a goal: the record alone; its routines keep running, on purpose.
    case "goal-done":
    case "goal-drop":
      if (!b.goalId) return Response.json({ error: "Say which goal." }, { status: 400 });
      return Response.json({ ok: settleGoal(b.goalId, b.action === "goal-done" ? "done" : "dropped") });
    case "idea-add": {
      const text = (b.text ?? "").trim();
      if (!text) return Response.json({ error: "Say the idea." }, { status: 400 });
      return Response.json({ idea: saveIdea(text, "panel") });
    }
    // An idea taken up (made a goal) or dismissed: out of the parking lot either way.
    case "idea-take":
      return Response.json({ ok: takeIdea(b.ideaId ?? "") });
    // An idea becomes a goal: the steps come with it, the same shape the chat's set_goal takes; with
    // none it becomes a goal to keep in view (no routines).
    case "idea-to-goal": {
      const steps = (b.steps ?? []).map((s) => ({ what: String(s.what ?? ""), schedule: s.schedule, ...(typeof s.title === "string" && s.title.trim() ? { title: s.title } : {}) })).filter((s) => s.what.trim() && s.schedule) as { what: string; schedule: Schedule; title?: string }[];
      if (!b.botId) return Response.json({ error: "Say which bot's goal it is." }, { status: 400 });
      // Never a goal for a bot that isn't there (an orphan record nobody sees).
      if (!bot(b.botId)) return Response.json({ error: "No such bot." }, { status: 404 });
      const made = setGoal(b.botId, (b.text ?? "").trim().slice(0, 160), steps.slice(0, 12));
      // A step that couldn't be set up: nothing made, the idea kept, and which steps and why said back.
      if ("error" in made) return Response.json({ error: made.error, failed: made.failed }, { status: 400 });
      void takeIdea(b.ideaId ?? "");
      return Response.json({ goal: made.goal, said: made.said });
    }
    default:
      return Response.json({ error: "Unknown action." }, { status: 400 });
  }
}

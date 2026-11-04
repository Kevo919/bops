import "server-only";
import { id, update } from "./store";
import { createRoutine, describeSchedule } from "./routines";
import type { Goal, Idea, Schedule } from "../types";

/**
 * The owner's goals and parked ideas (task 31). A goal is set with a bot in the chat (chat.ts
 * set_goal): the bot agrees the steps with the owner first, then one call makes the goal and its
 * routines together, each linked back so the goal reads whole. An idea is a sentence parked for
 * later (chat.ts save_idea, or the Ideas tab): nothing runs from an idea, by design - it becomes a
 * goal only when the owner says so. Retiring a goal (done, dropped) changes the record alone: the
 * routines it made were set up on purpose and keep going; the owner can stop any of them as usual.
 */

/** The steps a goal comes with: what to do and when it runs, in the owner's words for the schedule. */
export type GoalStep = { what: string; schedule: Schedule; title?: string };

/** How often at most the feed keeps ideas: ninety days is a long parking lot. */
const KEEP_IDEAS = 90;

/** What making a goal says, for the bot to tell the owner: the goal and each routine in words. */
export function setGoal(botId: string, title: string, steps: GoalStep[], why?: string): { goal: Goal; said: string } {
  const made: { routineId: string; line: string }[] = [];
  const goal: Goal = { id: id("goal"), botId, title: title.trim().slice(0, 160), ...(why?.trim() ? { why: why.trim().slice(0, 400) } : {}), createdAt: Date.now(), status: "active" };
  for (const s of steps.slice(0, 12)) {
    const r = createRoutine(botId, (s.title ?? s.what).replace(/\s+/g, " ").trim().slice(0, 80), s.what.trim().slice(0, 2000), s.schedule);
    if (r.routine) made.push({ routineId: r.routine.id, line: `${r.routine.title} · ${describeSchedule(r.routine.schedule)}` });
  }
  goal.routineIds = made.map((m) => m.routineId);
  update((s) => {
    (s.goals ??= []).push(goal);
  });
  const said = made.length ? made.map((m) => m.line).join("; ") : "no routines (it's a goal to keep in view)";
  return { goal, said };
}

/** Retire a goal: done (reached) or dropped (not pursuing). Its routines keep running, on purpose. */
export function settleGoal(goalId: string, status: "done" | "dropped"): boolean {
  let found = false;
  update((s) => {
    const g = s.goals?.find((x) => x.id === goalId && x.status === "active");
    if (!g) return;
    g.status = status;
    g.doneAt = Date.now();
    found = true;
  });
  return found;
}

/** Park an idea (a sentence, nothing more). The newest ninety stay. */
export function saveIdea(text: string, from: "chat" | "panel"): Idea {
  const idea: Idea = { id: id("idea"), text: text.trim().slice(0, 400), at: Date.now(), from };
  update((s) => {
    (s.ideas ??= []).unshift(idea);
    const cutoff = Date.now() - KEEP_IDEAS * 86_400_000;
    s.ideas = s.ideas.filter((x, i) => i < 200 && x.at >= cutoff);
  });
  return idea;
}

/** Take an idea out of the parking lot (made a goal, or dismissed). */
export function takeIdea(ideaId: string): boolean {
  let found = false;
  update((s) => {
    if (!s.ideas?.some((x) => x.id === ideaId)) return;
    s.ideas = s.ideas.filter((x) => x.id !== ideaId);
    found = true;
  });
  return found;
}

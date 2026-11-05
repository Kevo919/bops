import "server-only";
import { bot, getState, id, update } from "./store";
import { createRoutine, deleteRoutine, describeSchedule } from "./routines";
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

/** At most this many goals are kept; the oldest settled (done or dropped) ones go first. */
export const MAX_GOALS = 200;

/** A step that couldn't be set up: which one (from 1), its label, and why, in words the bot can fix and call again with. */
export type StepFailure = { step: number; title: string; error: string };

/**
 * Make a goal and its routines, all or nothing: when any step's routine can't be set up, the ones made
 * for it are taken back and no goal is kept, so the bot is told which steps failed and why and can call
 * again with every step (never a goal said to be set while some of its routines don't exist, and no
 * doubles on the second try). What it says on success is the goal and each routine in words.
 */
export function setGoal(botId: string, title: string, steps: GoalStep[], why?: string): { goal: Goal; said: string } | { error: string; failed: StepFailure[] } {
  if (!bot(botId)) return { error: "No such bot.", failed: [] };
  const name = title.trim().slice(0, 160);
  if (!name) return { error: "A goal needs its title.", failed: [] };
  const settled = (getState().goals ?? []).filter((g) => g.status !== "active").length;
  if ((getState().goals ?? []).length - settled >= MAX_GOALS) return { error: `There are already ${MAX_GOALS} goals in progress. Mark some done or dropped in the Ideas tab first.`, failed: [] };
  const made: { routineId: string; line: string }[] = [];
  const failed: StepFailure[] = [];
  steps.slice(0, 12).forEach((s, i) => {
    const label = (s.title ?? s.what).replace(/\s+/g, " ").trim().slice(0, 80);
    const r = createRoutine(botId, label, s.what.trim().slice(0, 2000), s.schedule);
    if (r.routine) made.push({ routineId: r.routine.id, line: `${r.routine.title} · ${describeSchedule(r.routine.schedule)}` });
    else failed.push({ step: i + 1, title: label, error: r.error ?? "Bops couldn't set it up." });
  });
  if (failed.length) {
    for (const m of made) deleteRoutine(m.routineId);
    return { error: failed.map((f) => `step ${f.step} ("${f.title}"): ${f.error}`).join(" "), failed };
  }
  const goal: Goal = { id: id("goal"), botId, title: name, ...(why?.trim() ? { why: why.trim().slice(0, 400) } : {}), createdAt: Date.now(), status: "active", routineIds: made.map((m) => m.routineId) };
  update((s) => {
    const all = [...(s.goals ?? []), goal];
    // Over the cap: the oldest settled goals go first (an active one is never dropped here; see the check above).
    let over = all.length - MAX_GOALS;
    const drop = new Set<string>();
    for (const g of [...all].filter((x) => x.status !== "active").sort((a, b) => (a.doneAt ?? a.createdAt) - (b.doneAt ?? b.createdAt))) {
      if (over <= 0) break;
      drop.add(g.id);
      over--;
    }
    s.goals = all.filter((g) => !drop.has(g.id));
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

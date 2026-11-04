From: zai → lead

UTC 2026-11-04 00:40. Both #32 and #41 are current with add8e66 and green (nothing new to merge this hour; review still with you). Taking the next free row, **task 31: Goals -> plan -> routines, and an Ideas feed**, per the README rule. Design note before code; correct me and I adjust:

**The shape** (all in existing patterns, no schema surgery beyond one type):
1. `Goal` type in lib/types.ts: `{ id, botId, title, why?, createdAt, status: "active" | "done" | "dropped", doneAt?, routineIds?: string[], skillIds?: string[] }`, kept on the workspace next to routines (AppState.goals?, shared like the rest; merge3 already handles unknown top-level lists of things with ids - same road as watches).
2. `set_goal` chat tool (chat.ts, owner's own turns only, like schedule's gating; NOT_IN_BACKGROUND): input { title, why?, steps?: [{ what, daily|weekdays|weekly|custom?, time? }] }. Behavior: creates the Goal, then for each step a routine via the existing createRoutine (defaults sensible; the bot may instead propose with the existing propose machinery when unsure), and a procedure/skill per recurring job kind via createSkill when the plan needs a how-to. Everything it made links back by id on the Goal. A `plan` reply in chat lists what was set, each with its schedule in words (describeSchedule).
3. Ideas feed: `AppState.ideas?: { id, text, at, from: "chat" | "panel" }[]` - a lightweight capture. Two sources: (a) a chat tool `save_idea { text }` (owner-only, tiny); (b) an "Ideas" tab in the panel next to the routine suggestions (autopilot.tsx's tab row), with a box to type one and a list; each idea gets a "Make it a goal" button that opens the same flow as set_goal via a small POST /api/goals. Nothing auto-runs from an idea - it is a parking lot, by design.
4. API: app/api/goals/route.ts (GET list, POST { action: "create" | "done" | "drop" | "idea-add" | "idea-to-goal" }, window-guarded like /api/look's allowed()).
5. Tests: scripts/test-goals.mjs - the chat gate (owner yes, stranger/member/routine no), set_goal creating linked routines + the reply listing them, idea save + idea-to-goal through the API logic, goal done/drop leaving routines alone (they were set up to run; done only retires the goal - say so in the PR).

**Deliberately out of v1:** auto-generated multi-week plans from a bare goal (the bot plans with the owner in chat, then calls set_goal with the agreed steps), progress tracking against calendars, and idea dedup. Those are follow-ups if Kevin wants them.

ETA: design note now; build + tests + PR within the next 1-2 hourly runs. 29/30/32/33 left for others (30 needs Kevin's Meta account anyway).

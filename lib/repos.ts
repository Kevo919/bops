/**
 * Repos (lib/server/repos.ts, config/repos/*.yaml): the shapes the server keeps in the state and the window draws.
 * A recipe says how a GitHub repo is installed and run; what happened when it ran (installed, running, failed, its
 * last health check) and the plan the owner approved are kept here, in AppState.repos, never in the recipe files.
 */

/**
 * The action a bot's run_repo asks the owner's OK as (lib/server/permission.ts): only the owner answers it, from their
 * own Bops, and Always allow counts as once, so no rule or member ever approves a repo's first run.
 */
export const REPO_ASK_ACTION = "Run a GitHub repo";

/** Where one run of a repo is: the steps in order, then how it ended. */
export type RepoRunState = "preparing" | "fetching" | "installing" | "starting" | "running" | "done" | "failed" | "stopped";

/** Still going (a step under way, or a server it started that's up). */
export const RUN_ACTIVE: ReadonlySet<RepoRunState> = new Set(["preparing", "fetching", "installing", "starting", "running"]);

/** A health check: an address on the bot's computer that must answer (`expect`, or any answer below 500), or a command's exit code. */
export type RepoHealth = { http: string; expect?: number } | { cmd: string; expect_exit: number };

/**
 * Exactly what a run does, shown to the owner before the first run and bound to their yes: the repo at one commit,
 * the bot and computer it runs on, the Linux user it runs as, every command, the ports and the plain settings.
 * `id` is a hash of all of it: any change (a new commit, another command) is a new plan that asks again.
 */
export type RepoPlan = {
  id: string;
  repoId: string;
  name: string;
  repo: string;
  url: string;
  private: boolean;
  commit: string;
  botId: string;
  computerId: string;
  user: string;
  install: string[];
  run: string[];
  background: boolean;
  health: RepoHealth | null;
  kind: "web" | "cli" | "mcp" | "library";
  ports: number[];
  /** Plain, non-secret settings from the recipe (never a key). */
  env: Record<string, string>;
  /** Keys the recipe can use, by name only: v1 hands none of them to a repo. */
  keyNames: string[];
  /** Commands Bops guessed from the repo's files (no recipe): the owner reads them before saying yes. */
  detected?: true;
  /** What the owner should know first (the recipe's fit for a bot computer, license notes). */
  notes: string[];
};

/** A health check's result, as last seen. */
export type RepoHealthSeen = { ok: boolean; at: number; detail: string };

/** One run of a repo on a bot's computer. */
export type RepoRun = {
  id: string;
  wsId: string;
  botId: string;
  repoId: string;
  /** The repo's name as shown (a recipe's, or owner/name). */
  name?: string;
  planId: string;
  /** Visibility of the source in the approved plan. Older runs omit it: their output is owner-only. */
  private?: boolean;
  computerId: string;
  commit: string;
  state: RepoRunState;
  at: number;
  updatedAt: number;
  /** Got through its install steps (it stays installed after it stops). */
  installed?: true;
  /** The step it's on, in a few words. */
  step?: string;
  /** Why it failed, in plain words. */
  error?: string;
  health?: RepoHealthSeen;
  ports: number[];
  /** Where the result is said: the chat it was asked in (a task's chat for a task). */
  chatId?: string;
  threadId?: string;
  /** The last lines of its output, keys taken out (lib/secret-patterns.ts), at most a few KB. */
  tail?: string;
  /** How it was started: the window's Run, or a bot's run_repo. */
  by: "window" | "bot";
};

/** The owner's yes to a plan: later runs of the same plan, by the same bot, go without asking again. */
export type RepoApproval = { wsId: string; botId: string; repoId: string; planId: string; at: number; via: "window" | "chat" };

/** A plan a bot's run_repo asked the owner about: the one their yes runs (never one made again after it). */
export type RepoPending = { key: string; plan: RepoPlan; at: number };

export type RepoState = { runs?: RepoRun[]; approved?: RepoApproval[]; pending?: RepoPending[] };

/** A repo's status for one bot, in a word: what the Repos section and the bots' briefing say. */
export type RepoStatusWord = "running" | "installed" | "failed" | "working" | "not installed";

/** The latest run of a repo by a bot, and its status in a word. */
export function repoStatusOf(state: RepoState | undefined, botId: string, repoId: string): { word: RepoStatusWord; run?: RepoRun } {
  const run = [...(state?.runs ?? [])].reverse().find((r) => r.botId === botId && r.repoId === repoId);
  if (!run) return { word: "not installed" };
  if (run.state === "running") return { word: "running", run };
  if (RUN_ACTIVE.has(run.state)) return { word: "working", run };
  if (run.state === "failed") return { word: "failed", run };
  return { word: run.installed ? "installed" : "not installed", run };
}

/** A recipe as the window lists it: who it is, and nothing about how it runs (the plan shows that). */
export type RepoCard = {
  id: string;
  name: string;
  what: string;
  goodFor: string;
  repo: string;
  url: string;
  license: string;
  licenseNote: string;
  kind: RepoPlan["kind"];
  port?: number;
  private: boolean;
  verified: boolean;
  fits: boolean;
  fitsReason: string;
  /** Why it can't run on a bot's computer in this version (Docker), when it can't. */
  blocked?: string;
};

/** What GET /api/repos answers. */
export type ReposAnswer = {
  recipes: RepoCard[];
  bots: { id: string; name: string }[];
  runs: RepoRun[];
  problems: string[];
};

/** The Linux user a repo runs as on a bot's computer: repo-<id>, cut to Linux's 32 characters with a short hash when long. */
export function repoUser(repoId: string, hash: (s: string) => string): string {
  return repoId.length <= 26 ? `repo-${repoId}` : `repo-${repoId.slice(0, 21)}-${hash(repoId).slice(0, 4)}`;
}

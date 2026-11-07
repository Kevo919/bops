import "server-only";
import { join } from "node:path";
import { cloudOn } from "./cloud";
import { cachedLocalSubscriptionStatus, getLocalSubscriptionStatus } from "./local-subscriptions";
import { signedInUser } from "./orgo-auth";
import { pickPcRunner, readPcRunnerChoice, type PcRunnerPick } from "./pc-task-runner";
import { getState } from "./store";
import { userBopsHome } from "./user-paths";

/** Bot tasks on this PC (Settings): the owner's choice, kept on this PC beside Full access (full-access.ts), never in their state. */
export const pcRunnerFile = () => join(/*turbopackIgnore: true*/ userBopsHome(signedInUser()?.id ?? null), "pc-task-runner");
/**
 * The .env.local Bops read its keys from as it started: the one next to the app (the repo folder on the Windows
 * app, process.cwd()), or the one desktop/main.cjs names for a packaged server (BOPS_ENV_LOCAL).
 */
export const envLocalFile = () => process.env.BOPS_ENV_LOCAL || join(/*turbopackIgnore: true*/ process.cwd(), ".env.local");
/** Tasks on the owner's own CLI sign in: a self hosted install, not one shared with a team. */
export const localRunnersHere = () => process.env.BOPS_SELF_HOSTED === "1" && !getState().shared;
export const openAiKeyHere = () => cloudOn() || !!process.env.OPENAI_EXECUTOR_API_KEY?.trim();

/**
 * Who runs a task on this PC now (pc-task-runner.ts pickPcRunner). The Claude sign in is only checked when it can matter.
 * `cached`: a check from the last minute will do (the chat box's chip reading /api/pc-task-runner), not for a task's start.
 */
export async function pcRunnerNow(opts: { cached?: boolean } = {}): Promise<PcRunnerPick> {
  const local = localRunnersHere();
  const choice = readPcRunnerChoice(pcRunnerFile());
  const claude = local && choice !== "openai" ? (await (opts.cached ? cachedLocalSubscriptionStatus : getLocalSubscriptionStatus)("claude")).state : "missing";
  return pickPcRunner({ choice, claude, openaiKey: openAiKeyHere(), local });
}

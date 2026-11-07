import "server-only";
import { workspaceNumber, type BotNumber } from "../bot-number";
import { MAIN_WORKSPACE, workspaceOf, type AppState } from "../types";
import { ownAgentPhoneNumber } from "./agentphone-status";
import { getState } from "./store";

/**
 * Each workspace's bot number by lib/bot-number.ts's one rule, for every screen that shows it: /api/phone (Settings,
 * Email and phone; the bot's profile and settings page), /api/account (How bots reach you) and Settings, Services.
 * The user's own AgentPhone number comes from the last read-only probe (agentphone-status.ts); nothing is read here.
 */
export function botNumbers(state: AppState = getState()): Record<string, BotNumber | null> {
  const own = ownAgentPhoneNumber();
  const incoming = !!process.env.BOPS_AGENTPHONE_HOOK_URL?.trim();
  const out: Record<string, BotNumber | null> = {};
  const list = state.workspaces?.length ? state.workspaces : [{ id: MAIN_WORKSPACE, line: undefined }];
  for (const w of list) {
    const main = (state.bots ?? []).find((b) => b.isMain && workspaceOf(b) === w.id);
    out[w.id] = workspaceNumber({ line: w.line, mainPhone: main?.phone && main.phoneLine ? main.phone : null, own, defaultWorkspace: w.id === MAIN_WORKSPACE, incoming });
  }
  return out;
}

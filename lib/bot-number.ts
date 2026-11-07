/**
 * The number a workspace's main bot is texted and called at, by one rule every screen uses: Settings, Services (the
 * AgentPhone panel), Settings, Email and phone, and the bot's own profile and settings page all show what this says.
 *
 * 1. A number Bops set up: the workspace's line (phone.ts assignWorkspaceLine), else the main bot's own number.
 * 2. Else, in the default workspace only, the user's own AgentPhone number, the one found with their key (the read-only
 *    probe in lib/server/agentphone-status.ts).
 *
 * Which one it is is always said: "a number Bops set up" or "your AgentPhone number", never just "the number".
 */

export type BotNumberWhose = "bops" | "agentphone";

export type BotNumber = {
  /** As people read it: +1 (555) 010-2000. */
  phone: string;
  whose: BotNumberWhose;
};

export const WHOSE_WORDS: Record<BotNumberWhose, string> = {
  bops: "a number Bops set up",
  agentphone: "your AgentPhone number",
};

/** "+15551234567" → "+1 (555) 123-4567"; anything else as it is. */
export const prettyNumber = (n: string) => {
  const d = n.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : n;
};

/** The rule above. `own` is the AgentPhone number found with the key (null when none was, or there's no key). */
export function workspaceNumber(o: { line?: { phone: string } | null; mainPhone?: string | null; own?: string | null; defaultWorkspace: boolean }): BotNumber | null {
  if (o.line?.phone) return { phone: prettyNumber(o.line.phone), whose: "bops" };
  if (o.mainPhone) return { phone: prettyNumber(o.mainPhone), whose: "bops" };
  if (o.own && o.defaultWorkspace) return { phone: prettyNumber(o.own), whose: "agentphone" };
  return null;
}

/** The number in a line, with whose it is: "+1 (555) 010-2000, your AgentPhone number". */
export const numberWithWhose = (n: BotNumber) => `${n.phone}, ${WHOSE_WORDS[n.whose]}`;

/**
 * How a screen says where to reach the bot (`who`, its name). A number Bops set up: "Text or call Boppy at +1 (555)
 * 010-2000 (a number Bops set up)". Your own AgentPhone number is never "text Boppy at": the bot calls and texts from
 * it, but nothing connects texts to it with Bops (only a workspace line Bops sets up does, phone.ts
 * assignWorkspaceLine, and Bops refuses webhooks it didn't make), whatever public address is saved.
 */
export function numberSentence(n: BotNumber, who: string) {
  if (n.whose === "agentphone") return `Your AgentPhone number: ${n.phone}. ${who} can call and text from it; texts to it don't reach ${who} yet.`;
  return `Text or call ${who} at ${n.phone} (${WHOSE_WORDS.bops})`;
}

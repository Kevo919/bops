/**
 * Features still being built, in one place: what each is called, how far along it is and what's left. The window
 * shows each one where it will live, grayed out and not clickable, with a red "Not set up yet" or "In progress"
 * label and its percent in the corner (components/app/in-progress.tsx), so Kevin sees what's coming and how close.
 *
 * Who edits it: the lead, as work lands. Change `percent` (and `left`) in the entry below and commit; nothing else.
 *
 * How percent is judged (the step a feature has finished sets its floor; move it up inside a band as that step goes):
 *   0 to 39    being built: the code is being written on its branch
 *   40 to 59   built: the code is written and works on the builder's machine
 *   60 to 79   tested: its own tests and the repo's checks pass (npm run lint, tsc), the PR is open
 *   80 to 99   reviewed: a review passed and its fixes landed; now being live tested on Kevin's PC
 *   100        live tested and merged: take its entry out of this list, and it shows as a normal part of the app
 *
 * An entry: `id` (lowercase letters, digits and single hyphens; what the window's code names it by), `name` (plain
 * words, as Kevin calls it), `percent` (a whole number 0 to 100) and `left` (one line: what's left, in plain words).
 * The words shown (`name`, `left`) have no dashes of any kind: write "and", a comma or a colon instead.
 * A bad entry stops the build (checkFeatures throws), so a typo never reaches the window.
 */

export type FeatureInProgress = {
  id: string;
  name: string;
  percent: number;
  left: string;
  /** Where it's being built (a branch or PR), for the lead; never shown. */
  where?: string;
};

const LIST: FeatureInProgress[] = [
  { id: "widgets-by-chat", name: "Widgets and pages by chat", percent: 10, left: "Ask a bot in the chat for a widget or a page, and it builds it here", where: "feature/widgets-by-chat" },
  { id: "animations-setting", name: "Animations", percent: 10, left: "Choose how much the window moves: full, calm or off" },
  { id: "composio-for-you", name: "Composio (your account)", percent: 15, left: "Connect your own Composio account, so your bots use your apps through it", where: "feature/composio-for-you" },
  { id: "pc-tasks-claude-plan", name: "Bot tasks on this PC", percent: 60, left: "Security fixes from the review, then a live test on your PC with your Claude plan", where: "feature/pc-tasks-claude-plan (PR #80)" },
  { id: "phone-pairing", name: "Your phone pairing", percent: 75, left: "Finish the review, then pair your phone with a QR code on your PC", where: "feature/easy-phone-pairing (PR #77)" },
];

/** Any dash: hyphen, the Unicode hyphens, figure, en and em dashes, the minus sign. */
const DASH = /[-‐-―−﹘﹣－]/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export class FeatureStatusError extends Error {}

/** The list, checked: each entry whole and plain, no id twice. Throws FeatureStatusError naming the bad entry. */
export function checkFeatures(raw: unknown): FeatureInProgress[] {
  if (!Array.isArray(raw)) throw new FeatureStatusError("The features in progress must be a list.");
  const seen = new Set<string>();
  return raw.map((e, i) => {
    const at = `Feature ${i + 1}`;
    if (!e || typeof e !== "object") throw new FeatureStatusError(`${at} isn't an entry.`);
    const { id, name, percent, left, where } = e as Record<string, unknown>;
    if (typeof id !== "string" || !ID.test(id)) throw new FeatureStatusError(`${at}: its id must be lowercase letters, digits and single hyphens.`);
    if (seen.has(id)) throw new FeatureStatusError(`${at}: the id "${id}" is there twice.`);
    seen.add(id);
    if (typeof name !== "string" || !name.trim()) throw new FeatureStatusError(`${at} (${id}) has no name.`);
    if (name.length > 48) throw new FeatureStatusError(`${at} (${id}): its name is over 48 characters.`);
    if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100) throw new FeatureStatusError(`${at} (${id}): its percent must be a whole number from 0 to 100.`);
    if (typeof left !== "string" || !left.trim()) throw new FeatureStatusError(`${at} (${id}) doesn't say what's left.`);
    if (left.length > 140 || /\n/.test(left)) throw new FeatureStatusError(`${at} (${id}): what's left must be one line, at most 140 characters.`);
    for (const [field, text] of [["name", name], ["left", left]] as const)
      if (DASH.test(text)) throw new FeatureStatusError(`${at} (${id}): its ${field} has a dash; use "and", a comma or a colon.`);
    if (where !== undefined && typeof where !== "string") throw new FeatureStatusError(`${at} (${id}): where must be words.`);
    return { id, name: name.trim(), percent, left: left.trim().replace(/\.$/, ""), ...(where ? { where } : {}) };
  });
}

export const FEATURES_IN_PROGRESS: readonly FeatureInProgress[] = checkFeatures(LIST);

/** The feature `id` while it's being built; null once it's done (100) or not in the list, so it shows normally. */
export function featureInProgress(id: string, list: readonly FeatureInProgress[] = FEATURES_IN_PROGRESS): FeatureInProgress | null {
  const f = list.find((x) => x.id === id);
  return f && f.percent < 100 ? f : null;
}

import type { Bot } from "./types";

/* Bot colors as the UI paints them, shared by the app and the computers Bops dresses (lib/server/desktop). */

/*
 * The washes take the dark look's colors where it sets them (lib/look-theme.ts: --bops-wash-base, --bops-wash-k for how
 * much of the bot's color, and --bops-desk-0..2), and their own everywhere else: the light look, and the computers' own
 * wallpaper (lib/server/desktop), which set none.
 */
export const DESKTOP_BG =
  "linear-gradient(160deg in oklab, var(--bops-desk-0, oklab(96.8% -0.056 0.130)) 0%, var(--bops-desk-1, oklab(95.2% -0.090 0.182)) 45%, var(--bops-desk-2, oklab(86% -0.087 0.168)) 100%)";

/** A soft wash of a bot's color, for its desktop wallpaper and Details card. */
export function botWash(b: Bot) {
  if (b.color.toUpperCase() === "#E9FF3B" || b.isMain) return DESKTOP_BG;
  return `linear-gradient(160deg, color-mix(in oklab, ${b.color} calc(22% * var(--bops-wash-k, 1)), var(--bops-wash-base, white)) 0%, color-mix(in oklab, ${b.color} calc(38% * var(--bops-wash-k, 1)), var(--bops-wash-base, white)) 55%, color-mix(in oklab, ${b.color} calc(62% * var(--bops-wash-k, 1)), var(--bops-wash-base, white)) 100%)`;
}

/** The bezel color when you've taken over a bot's computer: the bot's own color (Sam's lime). */
export function botBezel(b: Bot) {
  if (b.isMain || b.color.toUpperCase() === "#E9FF3B") return "#C6DE12";
  return b.color;
}

/** The bot's color as text or an accent on black (its buttons): Sam's highlighter, others' own color, lifted a little. */
export function botOnInk(b: Bot) {
  if (b.isMain || b.color.toUpperCase() === "#E9FF3B") return "#E8FF3A";
  return `color-mix(in oklab, ${b.color} 85%, white)`;
}

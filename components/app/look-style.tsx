"use client";

import { lookCssText, type Look } from "@/lib/look-theme";

/**
 * The look, painted: one <style> element built from the look in the state (AppState.look). Every field
 * is checked again as the CSS is built (lookCssText runs normalizeLook: the theme and spacing from their
 * lists, the accent a #RRGGBB, the text size a number in range, the custom CSS through sanitizeCss), so
 * state that got there some other way can't paint more than a look may: a field that doesn't pass goes
 * back to Bops' own, and the rest still applies. The text goes in as the element's text content (React
 * sets textContent), never as HTML.
 */
export function LookStyle({ look }: { look?: Look }) {
  const css = lookCssText(look);
  if (!css) return null;
  return <style>{css}</style>;
}

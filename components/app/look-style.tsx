"use client";

import { lookCssText, sanitizeCss, type Look } from "@/lib/look-theme";

/**
 * The look, painted: one <style> element built from the look in the state (AppState.look), with the
 * custom CSS checked again here with sanitizeCss before a word of it is painted. The server checks
 * every field as it saves a look (lib/server/look.ts), so this second check only matters for state
 * that got there some other way; if it fails, the custom CSS is dropped and the rest still applies.
 * The text goes in as the element's text content (React sets textContent), never as HTML.
 */
export function LookStyle({ look }: { look?: Look }) {
  const css = buildLookCss(look);
  if (!css) return null;
  return <style>{css}</style>;
}

/** The look as CSS, with its custom CSS re-checked: dropped (and the rest kept) if it doesn't pass. */
function buildLookCss(look?: Look): string {
  if (!look || !Object.keys(look).length) return "";
  const { css, ...rest } = look;
  if (!css) return lookCssText(rest);
  try {
    return lookCssText({ ...rest, css: sanitizeCss(css) });
  } catch {
    return lookCssText(rest);
  }
}

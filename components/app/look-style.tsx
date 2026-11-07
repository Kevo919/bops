"use client";

import { useEffect } from "react";
import { lookCssText, normalizeLook, type Look } from "@/lib/look-theme";

/** The desktop app's bridge, as far as the look goes (desktop/preload.cjs): the window's own frame follows the theme. */
type ThemeBridge = { setTheme?: (theme: "light" | "dark" | "system") => Promise<unknown> | void };

/**
 * The look, painted: one <style> element built from the look in the state (AppState.look). Every field
 * is checked again as the CSS is built (lookCssText runs normalizeLook: the theme and spacing from their
 * lists, the accent a #RRGGBB, the text size a number in range, the custom CSS through sanitizeCss), so
 * state that got there some other way can't paint more than a look may: a field that doesn't pass goes
 * back to Bops' own, and the rest still applies. The text goes in as the element's text content (React
 * sets textContent), never as HTML.
 *
 * In the desktop app the theme goes to the window's frame too (desktop/main.cjs, nativeTheme): on Windows the title
 * and menu bar are the system's, which stayed dark in the Light theme on a PC set to dark (task 87).
 */
export function LookStyle({ look, ready = true }: { look?: Look; /** The state is in (before it, the look isn't known: the frame waits). */ ready?: boolean }) {
  const css = lookCssText(look);
  const theme = normalizeLook(look).theme ?? "light";
  useEffect(() => {
    if (!ready) return;
    const bridge = (window as unknown as { bopsMac?: ThemeBridge }).bopsMac;
    void Promise.resolve(bridge?.setTheme?.(theme)).catch(() => {});
  }, [theme, ready]);
  if (!css) return null;
  return <style>{css}</style>;
}

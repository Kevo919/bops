"use client";

import { useSyncExternalStore } from "react";

/**
 * A window narrower than this is a phone (the Android app is a WebView of this page), a browser's side panel or a small
 * hosted window: the app shows one column at a time (bops-app.tsx). The same edge as Tailwind's `md` (48rem), so the
 * `max-md:` classes that size things for it and this agree to the pixel. The Windows app never gets this narrow
 * (desktop/main.cjs minWidth 1180).
 */
export const NARROW_QUERY = "(width < 48rem)";

const query = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(NARROW_QUERY) : null);

function subscribe(changed: () => void) {
  const q = query();
  q?.addEventListener?.("change", changed);
  return () => q?.removeEventListener?.("change", changed);
}

/** Whether the window is narrow now (one column); false on the server and wherever there's no matchMedia. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!query()?.matches,
    () => false,
  );
}

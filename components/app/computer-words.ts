"use client";
import { useSyncExternalStore } from "react";
import { computerWordsFor } from "@/lib/computer-words";
let platform = "unknown";
let loading = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loading && platform === "unknown") {
    loading = true;
    void fetch("/api/config", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((config) => {
      if (["win32", "darwin", "linux"].includes(config?.platform)) platform = config.platform;
      for (const notify of listeners) notify();
    }).catch(() => {}).finally(() => { loading = false; });
  }
  return () => { listeners.delete(listener); };
}
/** Server identity, not the viewing phone/browser's OS. Neutral wording until loaded. */
export function useComputerWords() {
  return computerWordsFor(useComputerPlatform());
}
/** The server's platform ("win32", "darwin", "linux"), "unknown" until /api/config answers: for copy no word swap can say. */
export function useComputerPlatform() {
  return useSyncExternalStore(subscribe, () => platform, () => "unknown");
}
/**
 * The same words for the user's own workspace only: in one shared with them, "the owner's Mac" is the owner's own
 * computer, which this window can't name (it may well be a Mac), so its words stay as they are.
 */
export function useOwnComputerWords(state: { shared?: unknown }) {
  const words = useComputerWords();
  return (text: string | TemplateStringsArray, ...values: unknown[]) => state.shared ? (typeof text === "string" ? text : text.map((part, i) => part + (i < values.length ? String(values[i]) : "")).join("")) : words(text, ...values);
}

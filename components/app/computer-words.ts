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
  const host = useSyncExternalStore(subscribe, () => platform, () => "unknown");
  return computerWordsFor(host);
}

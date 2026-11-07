import "server-only";
import { ownerPlatformOf } from "@/lib/owner-platform";
import { getState } from "./store";
import { onRunner } from "./persist";
import { currentTurn } from "./turn-context";

/** The machine owner-facing copy describes, never the cloud runner's operating system. */
export function ownPlatform(): string {
  if (!onRunner() && !currentTurn()) return process.platform;
  const state = getState();
  const recorded = state.mac?.platform;
  if (recorded === "win32" || recorded === "darwin" || recorded === "linux") return recorded;
  // Synced state can keep the owner's machine under macs instead of the local mac field.
  // Mixed or missing recorded platforms are deliberately neutral, not guessed from this runner.
  return ownerPlatformOf(state as unknown as Record<string, unknown>) ?? "unknown";
}

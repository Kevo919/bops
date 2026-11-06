"use client";

import { useEffect } from "react";
import { MacTiles, PIP_KEY, useMacTiles } from "./mac-tab";
import { useAppState } from "./ui";
import { useComputerWords } from "./computer-words";

/** Tells the Bops window to open the Your Mac tab (it listens for this key changing). */
export const OPEN_MAC_KEY = "bops.openMac";

type Bridge = { showMain?: () => void; closePip?: () => void };
const bridge = () => (window as unknown as { bopsMac?: Bridge }).bopsMac;

/**
 * The Mac previews in their own floating window: drag it anywhere on the screen (by its bar), resize
 * it, and it stays on top of other apps. Click a window to jump back to Bops on Your Mac.
 */
export function MacPip() {
  const state = useAppState();
  const tiles = useMacTiles(state);
  const computerWords = useComputerWords();
  // The Bops window hides its corner preview while this one is open.
  useEffect(() => {
    localStorage.setItem(PIP_KEY, "open");
    const closed = () => localStorage.setItem(PIP_KEY, "closed");
    window.addEventListener("beforeunload", closed);
    return () => {
      closed();
      window.removeEventListener("beforeunload", closed);
    };
  }, []);
  const openMac = () => {
    localStorage.setItem(OPEN_MAC_KEY, String(Date.now()));
    bridge()?.showMain?.();
  };

  return (
    <div className="flex h-screen flex-col gap-2 p-2 font-sans text-ink antialiased">
      <div className="flex items-center gap-1 rounded-full bg-white/95 py-1 pl-3 pr-1 shadow-[0_0_0_1px_var(--h-0000000f),0_6px_16px_-10px_var(--h-00000059)] [-webkit-app-region:drag]">
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-[color:var(--hb-2bb673)]" />
        <span className="flex-1 truncate pl-1 text-[12px] font-medium text-[color:var(--ht-3a3a38)]">{computerWords("On your Mac")}</span>
        <button onClick={openMac} title={computerWords("Open Your Mac in Bops")} className="rounded-full px-2 py-0.5 text-[11.5px] font-medium text-[color:var(--ht-6b6b6b)] hover:bg-[color:var(--bops-tint)]/[0.06] hover:text-ink [-webkit-app-region:no-drag]">
          Bops
        </button>
        <button onClick={() => bridge()?.closePip?.() ?? window.close()} aria-label="Put back in Bops" title="Put back in Bops" className="flex size-6 items-center justify-center rounded-full text-[color:var(--ht-6b6b6b)] hover:bg-[color:var(--bops-tint)]/[0.06] hover:text-ink [-webkit-app-region:no-drag]">
          <svg width="9" height="9" viewBox="0 0 12 12">
            <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {tiles.length ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <MacTiles tiles={tiles} onOpen={openMac} max={720} tall />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-2xl bg-white/90 px-4 text-center text-[12.5px] leading-[18px] text-[color:var(--ht-6b6b6b)] shadow-[0_0_0_1px_var(--h-0000000f)]">
          {computerWords("Nothing on your Mac right now. Windows show here while a bot works on your Mac.")}
        </div>
      )}
    </div>
  );
}

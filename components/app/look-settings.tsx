"use client";

import { useRef, useState } from "react";
import { post } from "./ui";
import { Segmented } from "./segmented";
import { FONT_SCALE_MAX, FONT_SCALE_MIN, LOOK_CSS_LIMIT, LOOK_HISTORY, normalizeLook } from "@/lib/look-theme";
import type { AppState, LookDensity, LookTheme } from "@/lib/types";

/**
 * The Look card in Settings (the "look" pane): the same controls a bot changes the look with in the
 * chat (change_look) plus Undo (the last change, from here or the chat, while there's one to take
 * back) and Reset. Every change goes through /api/look, which checks it like the chat's
 * changes and applies it at once (lib/server/look.ts); what comes back here is the state it made.
 */
export function LookSettings({ state }: { state: AppState }) {
  const look = normalizeLook(state.look?.current);
  const canUndo = (state.look?.history?.length ?? 0) > 0;
  const [error, setError] = useState("");
  const send = (change: Record<string, unknown>) => {
    setError("");
    void post("/api/look", { action: "set", look: change }).then(async (res) => {
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That change wasn't kept.");
    });
  };
  // The color picker and the text slider fire as they're dragged: sent once they settle, so the look
  // isn't saved a hundred times on the way.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendSettled = (change: Record<string, unknown>) => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => send(change), 250);
  };
  const rows = "flex w-full items-center gap-3 border-t border-[#ECECEA] py-2.5 first:border-t-0 first:pt-1";
  const line = (title: string, hint?: string) => (
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-semibold leading-4">{title}</div>
      {hint && <div className="text-[12px] leading-4 text-[#6B6B6B]">{hint}</div>}
    </div>
  );
  return (
    <div className="flex flex-col gap-3" data-look-settings>
      <div className="rounded-[14px] bg-white px-3.5 py-1 shadow-[0_0_0_1px_#E6E6E3]">
        <div className={rows}>
          <Segmented<LookTheme> title="Theme" hint="The window's colors, or following this computer's." value={look.theme ?? "light"} options={[["light", "Light"], ["system", "System"], ["dark", "Dark"]]} onPick={(theme) => send({ theme })} />
        </div>
        <div className={rows}>
          {line("Accent color", "Buttons, highlights and what needs you.")}
          {/* type=color needs a value; the default is Bops' own highlighter yellow. */}
          <input
            type="color"
            aria-label="Accent color"
            value={look.accent ?? "#E9FF3B"}
            onChange={(e) => sendSettled({ accent: e.target.value })}
            className="size-7 cursor-pointer rounded-full border border-[#E6E6E3] bg-transparent p-0"
          />
          {look.accent && (
            <button onClick={() => send({ accent: "" })} className="rounded-full px-2 py-0.5 text-[12px] font-medium leading-4 text-ink hover:bg-black/[0.05]">
              Default
            </button>
          )}
        </div>
        <div className={rows}>
          {line("Text size", `${Math.round((look.fontScale ?? 1) * 100)}% of the usual`)}
          <input
            type="range"
            aria-label="Text size"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={0.05}
            value={look.fontScale ?? 1}
            onChange={(e) => sendSettled({ font_scale: Number(e.target.value) })}
            className="w-40 accent-[#0A0A0A]"
          />
        </div>
        <div className={rows}>
          <Segmented<LookDensity> title="Spacing" hint="How much room the window's parts keep." value={look.density ?? "normal"} options={[["compact", "Compact"], ["normal", "Normal"], ["roomy", "Roomy"]]} onPick={(density) => send({ density })} />
        </div>
      </div>
      <div className="rounded-[14px] bg-white px-3.5 py-2.5 shadow-[0_0_0_1px_#E6E6E3]">
        {line(`Custom CSS`, `Plain styles only, at most ${LOOK_CSS_LIMIT.toLocaleString("en-US")} characters. Nothing that loads or runs anything is kept.`)}
        <textarea
          aria-label="Custom CSS"
          defaultValue={look.css ?? ""}
          spellCheck={false}
          rows={5}
          placeholder={"/* e.g.  .sidebar .label { display: none; }  */"}
          onBlur={(e) => {
            if (e.target.value !== (look.css ?? "")) send({ css: e.target.value });
          }}
          className="mt-2 w-full resize-y rounded-[10px] bg-[#F7F7F6] p-2 font-mono text-[12px] leading-4 outline-none"
        />
        {error && <div className="mt-1.5 text-[12px] leading-4 text-[#B42318]">{error}</div>}
      </div>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[12px] leading-4 text-[#6B6B6B]">
          Undo takes back the last change, made here or in the chat (up to {LOOK_HISTORY}). Reset goes back to Bops&apos; own look, and can be undone too.
        </span>
        {canUndo && (
          <button
            onClick={() => {
              setError("");
              void post("/api/look", { action: "undo" });
            }}
            className="rounded-full px-3 py-1 text-[12px] font-semibold leading-4 text-ink shadow-[0_0_0_1px_#D9D9D6] hover:bg-black/[0.04]"
          >
            Undo
          </button>
        )}
        <button
          onClick={() => {
            setError("");
            void post("/api/look", { action: "reset" });
          }}
          className="rounded-full px-3 py-1 text-[12px] font-semibold leading-4 text-ink shadow-[0_0_0_1px_#D9D9D6] hover:bg-black/[0.04]"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

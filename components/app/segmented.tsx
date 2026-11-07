"use client";

import { useRef, type KeyboardEvent } from "react";

/**
 * A setting as the bot panel draws one: its title and a line under it on the left, a pill of choices on the right (the
 * panel's own Thinking, Works on and Approvals look). For a bot's settings page (bot-settings.tsx).
 *
 * `as="buttons"` (Settings, Look: task 86): the choices are toggle buttons in a group, each with aria-pressed and a name
 * of its own ("Normal speed", not three "Normal"s), so an accessibility client presses one with the button's own
 * action (UI Automation's Invoke on Windows), which a role="radio" drawn on a button didn't take there. The arrow keys
 * move between them and press, as a radio group's do, and Enter and Space press the one focused.
 */
export function Segmented<V extends string>({
  title,
  hint,
  value,
  options,
  onPick,
  disabled,
  as = "radios",
  name,
}: {
  title: string;
  hint?: string;
  value: V;
  options: readonly (readonly [V, string])[];
  onPick: (v: V) => void;
  disabled?: boolean;
  as?: "radios" | "buttons";
  /** Each choice's accessible name, for `as="buttons"`: by default its label and the title, "Normal speed". */
  name?: (label: string) => string;
}) {
  const group = useRef<HTMLDivElement>(null);
  const buttons = as === "buttons";
  const nameOf = name ?? ((label: string) => `${label} ${title.toLowerCase()}`);
  const arrows = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step || disabled) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    group.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    if (options[next][0] !== value) onPick(options[next][0]);
  };
  return (
    <div className="flex w-full items-center gap-3" data-setting={title}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-semibold leading-4">{title}</span>
        {hint && <span className="text-[12px] leading-4 text-[color:var(--ht-6b6b6b)]">{hint}</span>}
      </div>
      <div ref={group} role={buttons ? "group" : "radiogroup"} aria-label={title} className="flex shrink-0 gap-0.5 rounded-full bg-[color:var(--bops-tint)]/[0.05] p-[3px]">
        {options.map(([v, label], i) => (
          <button
            key={v}
            type="button"
            {...(buttons ? { "aria-pressed": value === v, "aria-label": nameOf(label) } : { role: "radio", "aria-checked": value === v })}
            disabled={disabled}
            onClick={() => value !== v && onPick(v)}
            onKeyDown={buttons ? (e) => arrows(e, i) : undefined}
            className={`rounded-full px-2.5 py-1 text-[12px] leading-4 disabled:opacity-60 ${buttons ? "outline-none focus-visible:shadow-[0_0_0_1.5px_var(--h-0a0a0a)]" : ""} ${value === v ? "bg-white text-ink shadow-[0_0_0_1px_var(--h-0000000f)]" : "text-[color:var(--ht-6b6b6b)] hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

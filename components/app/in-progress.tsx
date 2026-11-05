"use client";

import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { featureInProgress, type FeatureInProgress } from "@/lib/feature-status";

/**
 * A feature still being built (lib/feature-status.ts), shown where it will live but plainly unfinished: grayed out
 * and not clickable, a red "Not set up yet" or "In progress" label, its percent in the corner, and what's left on
 * hover, tap or focus. A feature in its "testing" state (built and reviewed, not yet live tested) shows its child as
 * it is, usable, with a small red "Being tested" label and its percent beside it. Once its entry reaches 100 or leaves the list, the child shows as it is, nothing around it.
 *
 *   <InProgress id="animations-setting"><Row … /></InProgress>     a widget, a card, a Settings row, a page
 *   <InProgressRow id="widgets-by-chat" name="Widgets" icon={…} />  a nav item or a tab, compact
 *   useInProgress(id)                                               the entry, for code of its own (null: done)
 *
 * Its colors carry their own background (a pill), each a pair for light and dark picked by the window's
 * color-scheme (light-dark(), which the look's dark theme sets), so the red keeps its contrast on either:
 * #B42318 on #FEF3F2 is 6.0:1, #FF9A90 on #3B1F1D is 7.3:1.
 */

export function useInProgress(id: string): FeatureInProgress | null {
  return featureInProgress(id);
}

/** The colors, as inline variables so they reach the browser as written (light-dark() needs Chromium 123). */
const COLORS = {
  "--wip-red": "light-dark(#B42318, #FF9A90)",
  "--wip-red-bg": "light-dark(#FEF3F2, #3B1F1D)",
  "--wip-tip-bg": "light-dark(#1F1F1E, #F2F2F0)",
  "--wip-tip-fg": "light-dark(#FFFFFF, #141414)",
} as CSSProperties;

export type InProgressLabel = "Not set up yet" | "In progress" | "Being tested";

/** What's shown and read for a feature: its label, its percent, the hover line and what a screen reader says. */
export function inProgressWords(f: FeatureInProgress, label?: InProgressLabel) {
  const said = f.state === "testing" ? "Being tested" : (label ?? (f.percent < 50 ? "Not set up yet" : "In progress"));
  return {
    label: said,
    percent: `${f.percent}%`,
    tip: `${f.percent}% built. What's left: ${f.left}.`,
    aria: `${f.name}: ${said.toLowerCase()}, ${f.percent}% built.`,
  };
}

/** Tap, Enter or Space shows what's left (and again hides it); Escape and leaving hide it. */
function useTip() {
  const [open, setOpen] = useState(false);
  return {
    open,
    props: {
      onClick: () => setOpen((o) => !o),
      onBlur: () => setOpen(false),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        } else if (e.key === "Escape") setOpen(false);
      },
    },
  };
}

function Tip({ id, text, open, inside = false, testing = false }: { id: string; text: string; open: boolean; inside?: boolean; testing?: boolean }) {
  return (
    <span
      id={id}
      role="tooltip"
      style={COLORS}
      className={`${open ? "block" : "hidden"} pointer-events-none ${testing ? "mx-1 mb-1 w-fit max-w-full" : `absolute top-[calc(100%+4px)] z-40 ${inside ? "inset-x-1" : "left-2 w-max max-w-[min(300px,calc(100vw-48px))]"}`} rounded-lg bg-[var(--wip-tip-bg)] px-2.5 py-1.5 text-left text-[12px] font-normal normal-case leading-4 tracking-normal text-[var(--wip-tip-fg)] shadow-[0_8px_24px_-10px_rgb(0_0_0/0.4)] ${testing ? "group-hover/wiptip:block group-focus-within/wiptip:block" : "group-hover/wip:block group-focus-visible/wip:block"}`}
    >
      {text}
    </span>
  );
}

/** The red label: a dot and its words, in a pill of its own. */
function Label({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <span
      data-in-progress-label
      data-wip-pill
      className={`inline-flex items-center rounded-full bg-[var(--wip-red-bg)] py-px font-semibold leading-4 text-[var(--wip-red)] ${compact ? "min-w-0 gap-0.5 px-1 text-[10.5px]" : "shrink-0 gap-1 px-1.5 text-[11px]"}`}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--wip-red)]" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function Percent({ text, compact = false, className = "" }: { text: string; compact?: boolean; className?: string }) {
  return (
    <span
      data-in-progress-percent
      data-wip-pill
      className={`shrink-0 rounded-full bg-[var(--wip-red-bg)] py-px font-semibold tabular-nums leading-4 text-[var(--wip-red)] ${compact ? "px-1 text-[10.5px]" : "px-1.5 text-[11px]"} ${className}`}
    >
      {text}
    </span>
  );
}

/**
 * A widget, card, row or page being built: `children` grayed and out of reach (inert: no clicks, no focus, out of
 * the screen reader's way), the red label under it and its percent in the top right corner. The wrapper itself
 * takes focus and a tap, to say what's left.
 */
export function InProgress({ id, children, label, className = "" }: { id: string; children: ReactNode; label?: InProgressLabel; className?: string }) {
  const f = featureInProgress(id);
  const tipId = useId();
  const tip = useTip();
  if (!f) return <>{children}</>;
  const w = inProgressWords(f, label);
  if (f.state === "testing")
    // Usable as it is: not grayed, not disabled. The label is a small button of its own, so a tap on it (never on
    // the child) says what's left; hovering or focusing the label shows it too.
    return (
      <div data-in-progress={f.id} data-in-progress-state="testing" role="group" aria-label={w.aria} aria-describedby={tipId} style={COLORS} className={`relative ${className}`}>
        {children}
        {/* The tooltip sits in the flow under the label (it pushes what follows down), never over the card. */}
        <div className="group/wiptip">
          <div className="flex items-center gap-1.5 px-1 pb-1 pt-1">
            <button type="button" aria-describedby={tipId} aria-expanded={tip.open} {...tip.props} className="cursor-help rounded-full outline-none focus-visible:shadow-[0_0_0_2px_var(--wip-red)]">
              <Label text={w.label} />
            </button>
            <Percent text={w.percent} />
          </div>
          <Tip id={tipId} text={w.tip} open={tip.open} testing />
        </div>
      </div>
    );
  return (
    <div
      data-in-progress={f.id}
      role="group"
      aria-disabled="true"
      aria-label={w.aria}
      aria-describedby={tipId}
      tabIndex={0}
      style={COLORS}
      {...tip.props}
      className={`group/wip relative cursor-help rounded-[14px] outline-none focus-visible:shadow-[0_0_0_2px_var(--wip-red)] ${className}`}
    >
      <div inert aria-hidden className="pointer-events-none select-none opacity-50 grayscale">
        {children}
      </div>
      <div className="flex items-center gap-1.5 px-1 pb-1 pt-0.5" aria-hidden>
        <Label text={w.label} />
      </div>
      <Percent text={w.percent} className="absolute right-1.5 top-1.5" />
      <Tip id={tipId} text={w.tip} open={tip.open} />
    </div>
  );
}

/**
 * A nav item or a tab being built, compact: its icon and name in gray, a small red dot and "In progress" (or "Not set
 * up yet"), and the percent on the right. Not clickable to open anything: a tap says what's left. `children` is the
 * real item, shown instead once the feature is done.
 */
export function InProgressRow({
  id,
  name,
  icon,
  label,
  className = "",
  children,
}: {
  id: string;
  name?: string;
  icon?: ReactNode;
  label?: InProgressLabel;
  className?: string;
  children?: ReactNode;
}) {
  const f = featureInProgress(id);
  const tipId = useId();
  const tip = useTip();
  if (!f) return <>{children ?? null}</>;
  const w = inProgressWords(f, label ?? "In progress");
  // Being tested: the real item, usable, with the red label and percent after it (what's left in its title).
  if (f.state === "testing")
    return (
      <span data-in-progress={f.id} data-in-progress-state="testing" title={w.tip} className="flex items-center gap-1" style={COLORS}>
        <span className="min-w-0 flex-1">{children ?? name ?? f.name}</span>
        {/* Read as it's shown: "Being tested 85%". */}
        <span className="flex shrink-0 items-center gap-1 pr-2.5">
          <Label text={w.label} compact />
          <Percent text={w.percent} compact />
        </span>
      </span>
    );
  return (
    <span className="group/wip relative block" style={COLORS}>
      <button
        type="button"
        data-in-progress={f.id}
        aria-disabled="true"
        aria-label={`${name ?? f.name}: ${w.label.toLowerCase()}, ${f.percent}% built.`}
        aria-describedby={tipId}
        {...tip.props}
        className={`flex w-full cursor-help items-center gap-2 rounded-lg px-2.5 text-left outline-none focus-visible:shadow-[0_0_0_2px_var(--wip-red)] ${className}`}
      >
        {icon && <span className="shrink-0 opacity-50 grayscale">{icon}</span>}
        <span className="min-w-0 max-w-[60%] shrink-0 truncate opacity-55">{name ?? f.name}</span>
        <span aria-hidden className="ml-auto flex min-w-0 items-center justify-end gap-1">
          <Label text={w.label} compact />
          <Percent text={w.percent} compact />
        </span>
      </button>
      {/* Inside the row's own width: a nav that scrolls clips anything past its sides. */}
      <Tip id={tipId} text={w.tip} open={tip.open} inside />
    </span>
  );
}

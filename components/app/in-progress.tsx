"use client";

/*
 * A part of a screen that isn't finished yet, shown so it's never mistaken for one that works: grayed out, a red
 * "Not set up yet", and how far along it is. A minimal local version: a shared one may come with
 * feature/in-progress-badges, and this can move onto it then (same props).
 */
export function InProgress({ title, line, percent }: { title: string; line: string; percent: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div data-in-progress aria-disabled="true" className="flex cursor-not-allowed flex-col gap-1.5 rounded-[14px] bg-[#F7F7F6] p-3.5 shadow-[0_0_0_1px_#ECECEA]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-4 text-[#9A9A98]">{title}</span>
        <span className="shrink-0 text-[12px] font-medium leading-4 text-[#D92D20]">Not set up yet</span>
      </div>
      <span className="text-[12px] leading-4 text-[#A3A3A0]">{line}</span>
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#ECECEA]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${title}: ${pct}% done`}>
          <div className="h-full bg-[#D92D20]" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-[11.5px] tabular-nums text-[#D92D20]">{pct}% done</span>
      </div>
    </div>
  );
}

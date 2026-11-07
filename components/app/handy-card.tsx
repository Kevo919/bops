"use client";

import { useComputerPlatform } from "./computer-words";

/*
 * Settings, Voice typing (optional): a pointer to Handy (https://github.com/cjpais/Handy), a free, open
 * source (MIT) dictation app that works offline in any program, so you can talk into any text box,
 * Bops' included. Bops downloads and installs nothing itself: Get Handy opens its Releases page in your
 * browser (the desktop app sends every target="_blank" link to the system browser, desktop/main.cjs
 * setWindowOpenHandler), and the steps say what to do there. It sits after Keys and Models in Settings.
 */

/** Handy's Releases page: every version with its installers (the Windows one is Handy_<version>_x64-setup.exe). */
export const HANDY_RELEASES_URL = "https://github.com/cjpais/Handy/releases";
export const HANDY_REPO_URL = "https://github.com/cjpais/Handy";

/** How to get going, in order, for a computer not known yet (each kind's installer named). */
export const HANDY_STEPS: { title: string; words: string }[] = [
  { title: "Download it", words: "On the Releases page, open the newest release's Assets and pick the installer for your computer: on Windows, Handy_<version>_x64-setup.exe (arm64 for an Arm PC); on a Mac, the .dmg." },
  { title: "Install it", words: "Run the installer. The first time it opens, Handy fetches a small speech model; after that it works with no internet at all." },
  { title: "Pick a shortcut key", words: "In Handy's settings, choose the key you'll hold to talk. Push to talk is the simplest: hold to speak, let go to type." },
  { title: "Allow the microphone", words: "When your computer asks, let Handy use the microphone (and, on a Mac, Accessibility, so it can type for you)." },
  { title: "Hold the key and talk", words: "Click into any text box, Bops' chat included, hold the key, say what you want, let go. The words appear where the cursor is." },
];

/**
 * The steps for this computer (the server's platform, components/app/computer-words.ts): on Windows only the Windows
 * installer and Windows' own microphone question, on a Mac only the .dmg and Accessibility (task 85: a PC was told about
 * the Mac's .dmg); anywhere else, or before it's known, every kind's.
 */
export function handySteps(platform: string): { title: string; words: string }[] {
  if (platform === "win32")
    return [
      { title: "Download it", words: "On the Releases page, open the newest release's Assets and pick the Windows installer: Handy_<version>_x64-setup.exe (arm64 for an Arm PC)." },
      { title: "Install it", words: "Run the installer. If Windows asks whether to let it make changes, say yes. The first time it opens, Handy fetches a small speech model; after that it works with no internet at all." },
      HANDY_STEPS[2],
      { title: "Allow the microphone", words: "When Windows asks, let Handy use the microphone. If it doesn't ask, turn on Let desktop apps access your microphone in Windows Settings, Privacy and security, Microphone." },
      HANDY_STEPS[4],
    ];
  if (platform === "darwin")
    return [
      { title: "Download it", words: "On the Releases page, open the newest release's Assets and pick the Mac's .dmg (aarch64 for Apple silicon, x64 for an Intel Mac)." },
      { title: "Install it", words: "Open the .dmg and drag Handy to Applications. The first time it opens, Handy fetches a small speech model; after that it works with no internet at all." },
      HANDY_STEPS[2],
      { title: "Allow the microphone", words: "When your Mac asks, let Handy use the microphone and Accessibility, so it can type for you." },
      HANDY_STEPS[4],
    ];
  return HANDY_STEPS;
}

const pill = "shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-4 disabled:opacity-50";
const dark = `${pill} bg-[color:var(--hb-0a0a0a)] text-[color:var(--bops-on-fill)]`;

const ICON = (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
    <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
    <path d="M3 7.5a5 5 0 0010 0M8 12.5v2" />
  </svg>
);

export function HandyCard() {
  const steps = handySteps(useComputerPlatform());
  return (
    <div data-handy-card className="flex flex-col rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_var(--h-e6e6e3)]">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[color:var(--hb-f2f2f0)] text-ink">{ICON}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="text-[13.5px] font-semibold leading-[18px]">Voice typing</span>
            <span className="rounded-full bg-[color:var(--hb-f2f2f0)] px-2 py-px text-[11px] font-medium leading-4 text-[color:var(--ht-3a3a38)]">Optional</span>
          </span>
          <span className="text-[12px] leading-4 text-pencil">
            Talk instead of typing, in Bops and every other program, with Handy: a free, open source (MIT) dictation app that works offline. Hold a key, speak, let go.
          </span>
          <span className="flex items-center gap-1.5 pt-0.5 text-[12px] leading-4 text-[color:var(--ht-3a3a38)]">
            <span className="size-[7px] shrink-0 rounded-full bg-[color:var(--hb-c9c9c6)]" />
            A separate app you install yourself. Bops downloads nothing.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <a className={dark} href={HANDY_RELEASES_URL} target="_blank" rel="noopener noreferrer">
            Get Handy
          </a>
        </div>
      </div>
      <div className="pl-12 pt-3">
        <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[12px] leading-4 text-[color:var(--ht-3a3a38)]">
          {steps.map((s) => (
            <li key={s.title}>
              <span className="font-medium">{s.title}.</span> {s.words}
            </li>
          ))}
        </ol>
        <p className="pt-2 text-[12px] text-pencil">
          Handy is by cjpais and others, not part of Bops:{" "}
          <a className="underline" href={HANDY_REPO_URL} target="_blank" rel="noopener noreferrer">
            its code and license
          </a>
          . It works offline, and nothing you say goes through Bops.
        </p>
      </div>
    </div>
  );
}

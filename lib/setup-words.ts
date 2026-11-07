import { computerWords } from "./computer-words";

/** Real Settings card locations; Keys checks accounts and links the setup guide, it does not edit them. */
export const modelsSettingsPath = (platform = "unknown") => computerWords("Settings → This Mac → Models", platform);
export const providerSetupGuide = (platform = "unknown", member = false) => member ? "Ask the person who manages Bops to connect this account." : `${computerWords("Settings → This Mac → Keys", platform)} has the “How to get keys and set spending limits” guide. Follow that guide to connect this account; the Keys card only checks saved accounts.`;

/** At a member turn's presentation boundary, replace owner-only setup directions, never provider/auth behavior. */
export function memberSetupWords(text: string, member: boolean): string {
  if (!member) return text;
  let words = text;
  for (const platform of ["win32", "darwin", "unknown"]) {
    words = words.replaceAll(providerSetupGuide(platform), providerSetupGuide(platform, true));
    words = words.replaceAll(`Choose another account for this model in ${modelsSettingsPath(platform)}. `, "");
  }
  return words;
}

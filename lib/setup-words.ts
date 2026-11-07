import { computerWords } from "./computer-words";

/** Real Settings card locations; Keys checks accounts and links the setup guide, it does not edit them. */
export const modelsSettingsPath = (platform = "unknown") => computerWords("Settings → This Mac → Models", platform);
export const providerSetupGuide = (platform = "unknown") => `${computerWords("Settings → This Mac → Keys", platform)} has the “How to get keys and set spending limits” guide. Follow that guide to connect this account; the Keys card only checks saved accounts.`;

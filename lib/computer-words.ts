/** Display identity only: the legacy "mac" routing enum stays unchanged. */
export function computerWords(text: string, platform: string = "unknown"): string {
  if (platform === "darwin") return text;
  const win = platform === "win32";
  return text.replace(/\bfor Mac\b/g, win ? "for Windows" : "for this computer").replace(/\bMacs\b/g, win ? "PCs" : "computers")
    .replace(/\bMac\b/g, win ? "PC" : "computer")
    .replace(/\bmacOS\b/g, win ? "Windows" : "the operating system")
    // The Mac's own key store, and its keyboard's shortcut mark (crawl item 4: a Windows user reads
    // "Windows Credential Manager" and "Ctrl", not "Keychain" and "⌘"). The shortcut itself is
    // CommandOrControl everywhere, so every other platform reads Ctrl.
    .replace(/\bKeychain\b/g, win ? "Windows Credential Manager" : "key store")
    .replace(/⌘/g, "Ctrl");
}

/** Translate fixed copy only: names, task titles and other interpolated values stay exact. */
export function computerWordsFor(platform: string) {
  return (text: string | TemplateStringsArray, ...values: unknown[]) => typeof text === "string"
    ? computerWords(text, platform)
    : text.map((part, i) => computerWords(part, platform) + (i < values.length ? String(values[i]) : "")).join("");
}

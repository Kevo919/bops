/** Display identity only: the legacy "mac" routing enum stays unchanged. */
export function computerWords(text: string, platform: string = "unknown"): string {
  if (platform === "darwin") return text;
  const win = platform === "win32";
  return (
    text
      // The Mac's own key store first (crawl item 4 + the 1505 review's correction): on Windows the
      // secrets themselves live in an encrypted file under .data (only its AES key is in Credential
      // Manager, and secret-file.ts notes a same-user program could read it), so the honest words are
      // "an encrypted store" - and these must run BEFORE the generic Mac words, or "your Mac's
      // Keychain" turns into "your PC's Keychain" and never matches.
      // Either apostrophe: the straight one, or the curly one some copy uses (channels.tsx's token note).
      .replace(/your Mac(['’])s Keychain/g, (_, q: string) => (win ? "an encrypted store on your PC" : `your computer${q}s key store`))
      .replace(/this Mac(['’])s Keychain/g, (_, q: string) => (win ? "an encrypted store on this PC" : `this computer${q}s key store`))
      .replace(/\bKeychain\b/g, win ? "an encrypted store on this PC" : "the key store")
      .replace(/\bfor Mac\b/g, win ? "for Windows" : "for this computer")
      .replace(/\bMacs\b/g, win ? "PCs" : "computers")
      .replace(/\bMac\b/g, win ? "PC" : "computer")
      .replace(/\bmacOS\b/g, win ? "Windows" : "the operating system")
      // The shortcut mark: CommandOrControl everywhere, so every other platform reads Ctrl.
      .replace(/⌘/g, "Ctrl")
  );
}

/** Translate fixed copy only: names, task titles and other interpolated values stay exact. */
export function computerWordsFor(platform: string) {
  return (text: string | TemplateStringsArray, ...values: unknown[]) => typeof text === "string"
    ? computerWords(text, platform)
    : text.map((part, i) => computerWords(part, platform) + (i < values.length ? String(values[i]) : "")).join("");
}

/** Display identity only: the legacy "mac" routing enum stays unchanged. */
export function computerWords(text: string, platform: string = "unknown"): string {
  if (platform === "darwin") return text;
  return text.replace(/\bfor Mac\b/g, platform === "win32" ? "for Windows" : "for this computer").replace(/\bMacs\b/g, platform === "win32" ? "PCs" : "computers")
    .replace(/\bMac\b/g, platform === "win32" ? "PC" : "computer")
    .replace(/\bmacOS\b/g, platform === "win32" ? "Windows" : "the operating system");
}

/** Translate fixed copy only: names, task titles and other interpolated values stay exact. */
export function computerWordsFor(platform: string) {
  return (text: string | TemplateStringsArray, ...values: unknown[]) => typeof text === "string"
    ? computerWords(text, platform)
    : text.map((part, i) => computerWords(part, platform) + (i < values.length ? String(values[i]) : "")).join("");
}

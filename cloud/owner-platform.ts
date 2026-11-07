/** Pure recorded-owner identity shared by the app and cloud state slicing. */
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const PLATFORMS = ["win32", "darwin", "linux"] as const;
/**
 * The operating system the owner's Bops runs on, as each of their computers said it (state.macs[device].mac.platform,
 * lib/server/mac.ts checkMac): the one they all say, else none (none said yet, or a Mac and a PC both: "the owner's
 * computer" is true of either).
 */
export function ownerPlatformOf(blob: Record<string, unknown>): (typeof PLATFORMS)[number] | undefined {
  const macs = isObject(blob.macs) ? Object.values(blob.macs) : [];
  const said = new Set(macs.flatMap((m) => (isObject(m) && isObject(m.mac) && PLATFORMS.includes(m.mac.platform as never) ? [m.mac.platform as (typeof PLATFORMS)[number]] : [])));
  return said.size === 1 ? [...said][0] : undefined;
}


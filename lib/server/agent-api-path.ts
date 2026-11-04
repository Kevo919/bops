import { win32 } from "node:path";

/** Agents API paths must start with /. Windows namespace paths preserve the drive/share
 * while satisfying that wire format. Use only at API/MCP boundaries, never for sandbox
 * policy, persisted task identity, or native executor paths. */
export function agentApiPath(native: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32") return native;
  let path = native.replaceAll("/", "\\");
  // Accept our own wire form too, but never Windows device paths (\\.\\).
  if (path.startsWith("\\\\?\\")) {
    path = path.slice(4);
    if (path.startsWith("UNC\\")) path = "\\\\" + path.slice(4);
  }
  const drive = /^[A-Za-z]:\\/.test(path);
  const unc = path.startsWith("\\\\") && !path.startsWith("\\\\.\\");
  if (!drive && !unc) throw new Error("A fully qualified Windows workspace path is required.");
  const rest = drive ? path.slice(3) : path.slice(2);
  const parts = rest.replace(/\\$/, "").split("\\");
  if ((unc && parts.length < 2) || parts.some((part) =>
    (!part && !(drive && !rest)) || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part))) {
    throw new Error("An unambiguous Windows workspace path is required.");
  }
  return win32.toNamespacedPath(path).replaceAll("\\", "/");
}

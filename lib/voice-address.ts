/**
 * Voice (local)'s service address, checked the same way by the server (lib/server/voice-local.ts) and by
 * Settings, Modules (components/app/setup.tsx): http or https only, and a warning when the host isn't this
 * machine or a private network, because then the recording leaves this machine.
 */

export type VoiceAddressCheck = { ok: true; warning: string | null } | { ok: false; error: string };

/** Whether an IP literal (v4 or v6, brackets off) is loopback or on a private network. */
function privateIp(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 127 || // loopback
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) || // link-local
      (a === 100 && b >= 64 && b <= 127) // CGNAT, which Tailscale uses
    );
  }
  const v6 = host.toLowerCase();
  if (v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateIp(mapped[1]);
  return /^f[cd][0-9a-f]{0,2}:/.test(v6) || /^fe[89ab][0-9a-f]?:/.test(v6); // unique-local fc00::/7, link-local fe80::/10
}

/** Whether a host is this machine or a private network address. Other names (a .local, a domain) can't be told, so they're not. */
export function localHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  return privateIp(host);
}

/** The address as the module's setting has it: blank is fine (the module isn't set up), anything else must be http(s). */
export function checkVoiceAddress(raw: string): VoiceAddressCheck {
  const value = raw.trim();
  if (!value) return { ok: true, warning: null };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "The Voice (local) address isn't a web address. Use one like http://127.0.0.1:8000/v1." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: `The Voice (local) address must start with http:// or https:// (it's ${url.protocol}).` };
  if (url.username || url.password) return { ok: false, error: "The Voice (local) address can't hold a login." };
  if (!localHost(url.hostname))
    return { ok: true, warning: `${url.hostname} isn't this machine or a private network address: your recordings leave this machine for it. Use 127.0.0.1 or localhost to keep them here.` };
  return { ok: true, warning: null };
}

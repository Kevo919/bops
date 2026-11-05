import QRCode from "qrcode";
import { APP_URL, TAILSCALE_ANDROID_URL } from "@/lib/remote-links";
import { fromThisMac } from "@/lib/server/owner-email";
import { addresses, pair, pairing, tailscaleState, unpair } from "@/lib/server/remote";
import { fromBopsWindow } from "@/lib/server/ui-token";

export const dynamic = "force-dynamic";

/**
 * Pairing the Bops Android app (lib/server/remote.ts). Only the Bops window may pair or unpair a
 * phone: a paired phone can't pair another, and a page a bot's Chrome reached this server with can't
 * either. A server with no window (a dev server run by hand, a VPS) allows it only from the same
 * machine, as the pairing script does there (scripts/pair-phone.mjs).
 */
const allowed = (request: Request) => (process.env.BOPS_UI_TOKEN ? fromBopsWindow(request) : fromThisMac(request)) && !request.headers.get("x-bops-remote") && !/(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
const no = () => Response.json({ error: "A phone can only be paired in the Bops app." }, { status: 403 });

/**
 * Every QR code is an SVG made here (qrcode), never anything from outside. margin 4 is the standard
 * quiet zone (four blank modules on each side), so a phone's camera finds the code even on a busy screen.
 */
const qrOf = (text: string, px: number) => QRCode.toString(text, { type: "svg", margin: 4, width: px, errorCorrectionLevel: "M" });
const helpQrs = async () => ({ app: await qrOf(APP_URL, 176), tailscale: await qrOf(TAILSCALE_ANDROID_URL, 176) });

/**
 * Whether a phone is paired, and the addresses it can reach this server at. The app and Tailscale QR codes
 * only with ?help=1 (Settings, Your phone open): Settings asks this just to know whether to show Your phone.
 */
export async function GET(request: Request) {
  if (!allowed(request)) return no();
  const p = pairing();
  const help = new URL(request.url).searchParams.get("help") === "1";
  return Response.json({ paired: !!p, created: p?.created ?? null, addresses: addresses(), tailscale: tailscaleState(), ...(help ? { help: await helpQrs() } : {}) });
}

/**
 * Pair a phone: a new code, shown this once. Any phone paired before stops working. Only with an address the
 * phone can use (Tailscale, or https), and with it a QR code of bops://pair?a=<address>&c=<code>: the phone's
 * camera opens the Bops app with both filled in, and the app asks before it connects.
 */
export async function POST(request: Request) {
  if (!allowed(request)) return no();
  // No address a phone can safely use (Tailscale, or https): no pairing, so no "Paired" that no phone can reach,
  // and the phone paired now (if any) keeps working.
  const a = addresses();
  const where = a.public ?? a.tailnet[0];
  if (!where) return Response.json({ error: "This computer has no Tailscale address yet. Install Tailscale here and on your phone, then pair.", addresses: a }, { status: 409 });
  const code = pair();
  // 264px, so a phone held at arm's length reads it.
  const qr = await qrOf(`bops://pair?a=${encodeURIComponent(where)}&c=${encodeURIComponent(code)}`, 264);
  return Response.json({ paired: true, code, addresses: a, qr });
}

/** Unpair: the paired phone stops working at once. */
export async function DELETE(request: Request) {
  if (!allowed(request)) return no();
  unpair();
  return Response.json({ paired: false });
}

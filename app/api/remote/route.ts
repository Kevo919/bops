import { fromThisMac } from "@/lib/server/owner-email";
import { addresses, pair, pairing, unpair } from "@/lib/server/remote";
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

/** Whether a phone is paired, and the addresses it can reach this server at. */
export async function GET(request: Request) {
  if (!allowed(request)) return no();
  const p = pairing();
  return Response.json({ paired: !!p, created: p?.created ?? null, addresses: addresses() });
}

/** Pair a phone: a new code, shown this once. Any phone paired before stops working. */
export async function POST(request: Request) {
  if (!allowed(request)) return no();
  const code = pair();
  return Response.json({ paired: true, code, addresses: addresses() });
}

/** Unpair: the paired phone stops working at once. */
export async function DELETE(request: Request) {
  if (!allowed(request)) return no();
  unpair();
  return Response.json({ paired: false });
}

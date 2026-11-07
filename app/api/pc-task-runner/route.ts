import { EXECUTOR_KEY, maskKey, saveExecutorKey, writePcRunnerChoice, readPcRunnerChoice } from "@/lib/server/pc-task-runner";
import { envLocalFile, pcRunnerFile, pcRunnerNow } from "@/lib/server/pc-task-setting";
import { fromThisMac } from "@/lib/server/owner-email";
import { fromBopsWindow } from "@/lib/server/ui-token";
import { getState } from "@/lib/server/store";
import { notReady } from "@/lib/server/ready";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/**
 * Bot tasks on this PC (Settings): who runs them (the owner's Claude plan or the OpenAI key) and the OpenAI key for
 * the executor, written to this PC's .env.local. The owner's, in the desktop window only (never a paired phone, a
 * shared install or a browser elsewhere), as /api/local-subscriptions is. The key goes in and is never sent back:
 * only whether it's set and its last four characters.
 */
function denied(request: Request) {
  const phone = request.headers.has("x-bops-remote") || /(?:^|;\s*)bops_remote=/.test(request.headers.get("cookie") ?? "");
  let allowed = false;
  try {
    allowed = process.env.BOPS_SELF_HOSTED === "1" && !!process.env.BOPS_UI_TOKEN && !phone && !getState().shared && fromThisMac(request) && fromBopsWindow(request);
  } catch {
    /* malformed credentials fail closed */
  }
  return allowed ? notReady() : Response.json({ error: "Bot tasks on this PC can only be set up by the owner in the desktop app." }, { status: 403, headers });
}

/** `cached`: a plain read (the chat box's chip, Settings opening) may use the last minute's Claude check; a change never does. */
async function view(cached = false) {
  const pick = await pcRunnerNow({ cached });
  const key = process.env[EXECUTOR_KEY]?.trim();
  return { choice: readPcRunnerChoice(pcRunnerFile()) ?? null, runner: pick.runner, ...(pick.runner ? {} : { problem: pick.error }), openaiKey: { set: !!key, masked: maskKey(key) } };
}

export async function GET(request: Request) {
  const blocked = denied(request);
  if (blocked) return blocked;
  return Response.json(await view(true), { headers });
}

export async function POST(request: Request) {
  const blocked = denied(request);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as { choice?: unknown; key?: unknown } | null;
  if (!body || (body.choice === undefined && body.key === undefined)) return Response.json({ error: "Choose who runs bot tasks, or paste a key." }, { status: 400, headers });
  if (body.choice !== undefined) {
    if (body.choice !== "claude" && body.choice !== "openai" && body.choice !== null) return Response.json({ error: "Choose Your Claude plan or OpenAI key." }, { status: 400, headers });
    writePcRunnerChoice(pcRunnerFile(), body.choice);
  }
  if (body.key !== undefined) {
    if (typeof body.key !== "string") return Response.json({ error: "Paste the key as text." }, { status: 400, headers });
    try {
      saveExecutorKey(envLocalFile(), body.key.trim());
    } catch (e) {
      // Only this route's own words: never the key, nor a file system error that could name a path.
      const words = e instanceof Error && e.message.startsWith("That doesn't look") ? e.message : "Bops couldn't save the key on this PC. Check that the Bops folder can be written to, then try again.";
      return Response.json({ error: words }, { status: 400, headers });
    }
  }
  return Response.json(await view(), { headers });
}

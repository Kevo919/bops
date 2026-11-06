import { askMemory, askWorkspace, copyMemory, deleteGroup, fixFact, forgetFact, memoryFor, memoryInfo, memoryOn, pinFact, previewCopy, reviewMemory, scopeOf, settleFlag, shareMemory, undoMemory } from "@/lib/server/memory";
import { bringInOwnBank, dropOwnBank } from "@/lib/server/memory-deletes";
import { getState } from "@/lib/server/store";
import { ownMemory } from "@/lib/chain";
import { sharedOpen } from "@/lib/server/shared";
import { currentWorkspaceId, setChainBot } from "@/lib/server/workspaces";
import type { MemoryGroup } from "@/lib/types";
import { notReady } from "@/lib/server/ready";
import { cloudOn, cloudSession } from "@/lib/server/cloud";
import { classifyMemoryError, memoryLogLine } from "@/lib/server/memory-outage";

/** A workspace's memory, for the Memory sheet; with ?bot=, a bot's Memory tab (?q= searches, ?mine=1 is what it learned). */
export async function GET(request: Request) {
  const u = new URL(request.url).searchParams;
  const botId = u.get("bot");
  // No memory service here (no Honcho key on a self-hosted Bops): a bot's Memory tab says so, not a failed fetch.
  // Signed in with Orgo, whether memory is on is the cloud session's: read it first (as the apps catalog does), or a
  // fresh start would say "off" before the session has come.
  if (botId) {
    if (cloudOn()) await cloudSession().catch(() => null);
    if (!memoryOn()) return Response.json({ off: true, workspace: "", ws: "", card: [], facts: [] });
  }
  try {
    if (botId) return Response.json(await memoryFor(botId, { q: u.get("q") ?? undefined, mine: u.get("mine") === "1" }));
    return Response.json(await memoryInfo(u.get("ws") ?? currentWorkspaceId()));
  } catch (e) {
    // Memory is on but its service wouldn't answer: a different thing from off, and the sheet must say so
    // ("can't reach") instead of falling back to "isn't on". Three outcomes (lib/server/memory-outage.ts):
    // a refused key is 200 {refused} (trying again won't fix it); a genuine outage - the SDK's network,
    // timeout, 5xx or 429 errors - is 503 {unreachable}; anything else is a code bug, a plain 500 (a bare
    // TypeError included: a null dereference is one). The log line names the outcome; the service's own
    // message stays there, redacted, never in the body (D4).
    if (memoryOn()) {
      const kind = classifyMemoryError(e);
      console.warn(memoryLogLine(kind, e));
      if (kind === "refused") return Response.json({ refused: true });
      if (kind === "unreachable") return Response.json({ unreachable: true }, { status: 503 });
      return Response.json({ error: "Memory failed; this isn't an outage." }, { status: 500 });
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

type Body = {
  action: "undo" | "forget-old" | "review" | "delete" | "keep" | "delete-group" | "ask" | "fix" | "pin" | "forget" | "preview-copy" | "copy" | "share" | "own" | "bring-in" | "drop-own";
  messageId?: string;
  ws?: string;
  id?: string;
  from?: string;
  kinds?: ("personal" | "work")[];
  group?: MemoryGroup;
  bot?: string;
  question?: string;
  text?: string;
};

export async function POST(request: Request) {
  const unready = notReady();
  if (unready) return unready;
  const b = (await request.json().catch(() => ({}))) as Body;
  const ws = b.ws ?? currentWorkspaceId();
  // From a bot's Memory tab: its memory scope (its own bank while it keeps its memory to itself: lib/chain.ts).
  const where = b.bot ? scopeOf(b.bot) : ws;
  try {
    switch (b.action) {
      case "undo":
      case "forget-old":
        await undoMemory(b.messageId ?? "", b.action);
        return Response.json({ ok: true });
      case "review":
        reviewMemory(ws);
        return Response.json({ ok: true });
      case "delete":
      case "keep":
        await settleFlag(ws, b.id ?? "", b.action === "keep");
        return Response.json({ ok: true });
      case "ask":
        // A bot's Memory tab asks as that bot (its workspace); the Knowledge page asks its workspace.
        return Response.json(b.bot ? await askMemory(b.bot, b.question ?? "") : await askWorkspace(ws, b.question ?? ""));
      case "fix":
        await fixFact(where, b.id ?? "", b.text ?? "");
        return Response.json({ ok: true });
      case "pin":
        await pinFact(where, b.text ?? "");
        return Response.json({ ok: true });
      case "forget":
        await forgetFact(where, b.id ?? "");
        return Response.json({ ok: true });
      // What a bot kept to itself, back with the team's (Bring it in), or deleted (a bank kept apart let go): the owner's only.
      case "bring-in":
      case "drop-own": {
        if (!b.bot || sharedOpen()) return Response.json({ error: "Only the owner can change this." }, { status: 403 });
        // Only a bank kept apart: never the one a bot still keeps its memory in (the chart's change comes first).
        if (ownMemory(getState(), b.bot)) return Response.json({ error: "It still keeps its memory to itself." }, { status: 409 });
        // (Its bank goes through the outbox: memory not answering now only puts that off. Memory off refuses Bring it in.)
        const count = b.action === "bring-in" ? await bringInOwnBank(b.bot) : (await dropOwnBank(b.bot), 0);
        setChainBot(b.bot, { kept: undefined });
        return Response.json({ ok: true, count });
      }
      case "delete-group":
        if (b.group) deleteGroup(ws, b.group);
        return Response.json({ ok: true });
      case "preview-copy":
        return Response.json(await previewCopy(ws, b.from ?? ""));
      case "copy":
        return Response.json(await copyMemory(ws, b.from ?? "", b.kinds ?? ["personal"]));
      case "share":
        shareMemory(ws, b.from ?? null);
        return Response.json({ ok: true });
      case "own":
        shareMemory(ws, null);
        return Response.json({ ok: true });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

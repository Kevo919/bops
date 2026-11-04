import "server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanDoc, docTooLong, MEMORY_FILE, renderMemoryDoc, renderSoul, SOUL_FILE } from "@/lib/bot-docs";
import { MAX_BOT_DOC_CHARS } from "@/lib/types";
import { pinnedLines } from "./memory";
import { bot, ownerName, update, userDir } from "./store";

/**
 * A bot's SOUL.md and MEMORY.md on the server (lib/bot-docs.ts says what they are): read for the Memory tab's Edit,
 * saved or reset from it, and mirrored as files. The state is the source of truth (Bot.soul, Bot.memoryDoc); the
 * files under the user's .data folder (.data/users/<id>/bots/<bot>/SOUL.md and MEMORY.md, or .data/bots/<bot>/
 * self-hosted) are written on every save and reset, and never read: nothing on disk can change a bot.
 */

/** A bot id as a folder name (ids are letters, digits and dashes: bots.ts freeBotId; anything else is kept out). */
const folderOf = (botId: string) => botId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "_";

/** Where a bot's mirror files go, or null signed out on the Mac app (nobody to keep them for). */
export function docsDir(botId: string): string | null {
  const dir = userDir();
  return dir ? join(dir, "bots", folderOf(botId)) : null;
}

/** What the Edit shows for one document: the owner's text (null: none, the generated one is read), and the generated one. */
export type DocView = { text: string | null; generated: string };

/** Both documents of a bot as the Edit shows them, with the mirror folder and the size cap. */
export async function botDocs(botId: string): Promise<{ soul: DocView; memory: DocView; max: number; dir: string | null }> {
  const b = bot(botId);
  if (!b) throw new Error("no such bot");
  const owner = ownerName();
  const pinned = await pinnedLines(botId);
  return {
    soul: { text: b.soul ?? null, generated: renderSoul(b, owner) },
    memory: { text: b.memoryDoc ?? null, generated: renderMemoryDoc(b, owner, pinned) },
    max: MAX_BOT_DOC_CHARS,
    dir: docsDir(botId),
  };
}

/** What a save changes: a string sets the document (empty resets it), null resets it, undefined leaves it. */
export type DocsPatch = { soul?: string | null; memoryDoc?: string | null };

/**
 * Save or reset a bot's documents, then write the mirror files. A document over the cap is refused whole (the
 * owner sees what they wrote), so nothing is cut quietly; the page's text areas stop at the cap too.
 */
export async function saveBotDocs(botId: string, patch: DocsPatch): Promise<{ ok: true } | { error: string }> {
  const b = bot(botId);
  if (!b) return { error: "no such bot" };
  for (const [k, v] of Object.entries(patch) as [keyof DocsPatch, string | null | undefined][])
    if (typeof v === "string" && docTooLong(v)) return { error: `${k === "soul" ? SOUL_FILE : MEMORY_FILE} is too long: at most ${MAX_BOT_DOC_CHARS.toLocaleString("en-US")} characters.` };
  update((s) => {
    const x = s.bots.find((y) => y.id === botId);
    if (!x) return;
    if (patch.soul !== undefined) {
      const v = patch.soul === null ? undefined : cleanDoc(patch.soul);
      if (v === undefined) delete x.soul;
      else x.soul = v;
    }
    if (patch.memoryDoc !== undefined) {
      const v = patch.memoryDoc === null ? undefined : cleanDoc(patch.memoryDoc);
      if (v === undefined) delete x.memoryDoc;
      else x.memoryDoc = v;
    }
  });
  await mirrorBotDocs(botId).catch((e: Error) => console.warn(`[bot-docs] ${botId} mirror: ${e.message}`));
  return { ok: true };
}

/**
 * Write a bot's SOUL.md and MEMORY.md under its folder in .data: the owner's text, or the generated one while they
 * haven't written any. A convenience for the owner to read; nothing reads them back. Does nothing signed out.
 */
export async function mirrorBotDocs(botId: string): Promise<string | null> {
  const dir = docsDir(botId);
  if (!dir) return null;
  const docs = await botDocs(botId);
  mkdirSync(dir, { recursive: true });
  const ending = (t: string) => (t.endsWith("\n") ? t : `${t}\n`);
  writeFileSync(join(dir, SOUL_FILE), ending(docs.soul.text ?? docs.soul.generated));
  writeFileSync(join(dir, MEMORY_FILE), ending(docs.memory.text ?? docs.memory.generated));
  return dir;
}

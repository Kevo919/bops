import { readDoc } from "@/lib/server/docs";

/**
 * A document a bot made for the owner (lib/server/docs.ts, chat.ts make_doc): a real .docx, .pptx or
 * .xlsx, served as an attachment so the owner's own Word, PowerPoint or Excel opens it - Bops only
 * built it, it doesn't render it. Nothing of the model's runs: the file is plain content built by
 * Bops' own code, and it comes back byte for byte as it was saved.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/docs/[docId]">) {
  const { docId } = await ctx.params;
  const doc = readDoc(docId);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": doc.type,
      // An attachment with its own name: the browser hands it to the owner's own app, not a tab.
      "Content-Disposition": `attachment; filename="${doc.name.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

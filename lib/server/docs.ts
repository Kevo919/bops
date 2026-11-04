import "server-only";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import PptxGenJS from "pptxgenjs";
import ExcelJS from "exceljs";
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { userDir } from "./store";

/**
 * Real files a bot can make for the owner (chat.ts make_doc): a Word document, a PowerPoint deck or an
 * Excel workbook, from one plain shape - a title and sections of heading, bullets, a table and notes -
 * so the model describes content and Bops builds the file. Nothing clever travels from the model: no
 * HTML, no formulas-as-strings run by Excel (every cell is text or a number), no macros, no remote
 * parts, and the file is capped in size like a page is. Saved beside the pages (docsDir) and served by
 * /api/docs, which streams it as an attachment: the owner's own Word, PowerPoint or Excel opens it.
 */

/** One section of a document: a heading, some bullets, a table, and speaker notes (a deck's slides). */
export type DocSection = { heading?: string; bullets?: string[]; table?: { columns: string[]; rows: string[][] }; notes?: string };
/** What the model sends: what to make and what goes in it. */
export type DocSpec = { kind: "docx" | "pptx" | "xlsx"; title: string; sections: DocSection[] };

/** The most of anything one document takes: past this the model is dumping, not writing. */
const MAX_SECTIONS = 40;
const MAX_BULLETS = 40;
const MAX_TABLE = 400; // cells
const MAX_TEXT = 4_000; // one string
/** A file past this is refused on the way in (the builders make ~2 MB at the caps; 12 MB is far past). */
export const MAX_FILE = 12 * 1024 * 1024;

/** A spec the builders may use: trimmed, capped, every string plain text (no HTML to carry anywhere). */
export function cleanDoc(spec: unknown): DocSpec {
  if (!spec || typeof spec !== "object") throw new Error("Say what to make: { kind, title, sections }.");
  const s = spec as Record<string, unknown>;
  const kind = s.kind === "pptx" || s.kind === "xlsx" ? s.kind : s.kind === "docx" ? "docx" : undefined;
  if (!kind) throw new Error('kind is one of "docx", "pptx", "xlsx".');
  const title = String(s.title ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200);
  if (!title) throw new Error("Give it a title.");
  const raw = Array.isArray(s.sections) ? s.sections : [];
  if (!raw.length || raw.length > MAX_SECTIONS) throw new Error(`sections: 1 to ${MAX_SECTIONS} of them.`);
  const text = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, MAX_TEXT);
  const sections = raw.slice(0, MAX_SECTIONS).map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const t = o.table as { columns?: unknown; rows?: unknown } | undefined;
    const table = Array.isArray(t?.columns) && Array.isArray(t?.rows) ? { columns: (t!.columns as unknown[]).slice(0, 30).map(text), rows: (t!.rows as unknown[]).slice(0, Math.ceil(MAX_TABLE / Math.max(1, (t!.columns as unknown[]).length))).map((r) => (Array.isArray(r) ? r.slice(0, 30).map(text) : [text(r)])) } : undefined;
    return { heading: text(o.heading).slice(0, 200) || undefined, bullets: Array.isArray(o.bullets) ? o.bullets.slice(0, MAX_BULLETS).map(text).filter(Boolean) : undefined, ...(table ? { table } : {}), ...(text(o.notes) ? { notes: text(o.notes) } : {}) };
  });
  if (sections.every((x) => !x.heading && !x.bullets?.length && !x.table && !x.notes)) throw new Error("Every section is empty: give each a heading, bullets, a table or notes.");
  return { kind, title, sections };
}

const slug = (title: string) => title.replace(/[^\w -]+/g, "").replace(/\s+/g, "-").slice(0, 60) || "document";

/** The file's bytes, by kind. Only what cleanDoc passed: plain strings and numbers as strings. */
export async function buildDoc(spec: DocSpec): Promise<Buffer> {
  return spec.kind === "docx" ? wordDoc(spec) : spec.kind === "pptx" ? await deckDoc(spec) : await sheetDoc(spec);
}

/** Word: the title as a heading, each section a heading with its bullets and table under it. */
async function wordDoc({ title, sections }: DocSpec): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 })];
  for (const s of sections) {
    if (s.heading) children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 }));
    for (const b of s.bullets ?? []) children.push(new Paragraph({ text: b, bullet: { level: 0 } }));
    if (s.notes) children.push(new Paragraph({ children: [new TextRun({ text: s.notes, italics: true })] }));
    if (s.table) children.push(tableOf(s.table.columns, s.table.rows));
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

/** The plain table both Word uses natively and the deck and sheet copy from. */
function tableOf(columns: string[], rows: string[][]) {
  const cell = (t: string) => new TableCell({ children: [new Paragraph(t)] });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: columns.map(cell) }), ...rows.map((r) => new TableRow({ children: [...columns.keys()].map((i) => cell(r[i] ?? "")) }))] });
}

/** PowerPoint: one slide per section (heading the title line, bullets the body, table as slide text, notes its notes). */
async function deckDoc({ title, sections }: DocSpec): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.title = title;
  const cover = pptx.addSlide();
  cover.addText(title, { x: 0.5, y: 2, w: 9, h: 1, fontSize: 32, bold: true });
  for (const s of sections) {
    const slide = pptx.addSlide();
    if (s.heading) slide.addText(s.heading, { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 22, bold: true });
    const lines = [...(s.bullets ?? []), ...(s.table ? [s.table.columns.join(" | "), ...s.table.rows.map((r) => r.join(" | "))] : [])].slice(0, MAX_BULLETS + MAX_TABLE / 10);
    if (lines.length) slide.addText(lines.map((l) => ({ text: l, options: { bullet: true } })), { x: 0.5, y: 1.1, w: 9, h: 4, fontSize: 14, valign: "top" });
    if (s.notes) slide.addNotes(s.notes);
  }
  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}

/** Excel: a title row, then one block per section (heading row, bullets as rows, table under its header). */
async function sheetDoc({ title, sections }: DocSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(slug(title).slice(0, 30) || "Sheet1");
  ws.addRow([title]).font = { bold: true, size: 14 };
  for (const s of sections) {
    if (s.heading) {
      ws.addRow([]);
      ws.addRow([s.heading]).font = { bold: true };
    }
    for (const b of s.bullets ?? []) ws.addRow([b]);
    if (s.table) {
      ws.addRow([]);
      ws.addRow(s.table.columns).font = { bold: true };
      for (const r of s.table.rows) ws.addRow([...s.table.columns.keys()].map((i) => r[i] ?? ""));
    }
    if (s.notes) ws.addRow([s.notes]).font = { italic: true };
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/* ---------------- Keeping them, like pages ---------------- */

const KEEP_MS = 30 * 24 * 3_600_000;
const docsDir = () => {
  const dir = userDir();
  return dir ? join(dir, "docs") : null;
};

/** Build and save one: returns its id (docs_<hex>), for the chat to link and /api/docs to serve. */
export async function saveDoc(raw: unknown): Promise<{ id: string; name: string; type: string }> {
  const spec = cleanDoc(raw);
  const bytes = await buildDoc(spec);
  if (bytes.byteLength > MAX_FILE) throw new Error(`That came out to ${Math.round(bytes.byteLength / 1024 / 1024)} MB; keep it under ${MAX_FILE / 1024 / 1024} MB.`);
  const DIR = docsDir();
  if (!DIR) throw new Error("Sign in to Bops first.");
  mkdirSync(DIR, { recursive: true });
  for (const f of readdirSync(DIR)) if (/^docs_/.test(f) && Date.now() - statSync(join(DIR, f)).mtimeMs > KEEP_MS) rmSync(join(DIR, f), { force: true });
  const docId = `docs_${randomBytes(8).toString("hex")}`;
  const name = `${slug(spec.title)}.${spec.kind}`;
  writeFileSync(join(DIR, `${docId}__${name}`), bytes);
  return { id: docId, name, type: spec.kind === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : spec.kind === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

/** A saved document by id: its bytes, its name, how it's served (an attachment: it opens in the owner's own app). */
export function readDoc(docId: string) {
  const DIR = docsDir();
  if (!DIR || !/^docs_[a-f0-9]{16}$/.test(docId)) return null;
  const entry = readdirSync(DIR).find((f) => f.startsWith(docId));
  if (!entry) return null;
  const name = entry.slice(docId.length + 2); // docs_<hex>__<name>, as files.ts names its copies
  const ext = name.split(".").pop();
  const type = ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return { bytes: readFileSync(join(DIR, entry)), name, type };
}

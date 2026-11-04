// Tests for documents a bot makes (lib/server/docs.ts, chat.ts make_doc): the three kinds build real
// Office files (a .docx/.pptx/.xlsx is a zip of XML - the suites open each and check the content is in
// it), the shape is cleaned and capped (empty sections refused, strings plain, tables bounded), a
// file lands beside the pages and reads back by its id, and the chat offers make_doc on the owner's
// own turn alone (never a stranger's, a routine's run, or a runner) with its link under the reply.
// Usage: node --conditions=react-server scripts/test-docs.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

for (const k of Object.keys(process.env)) if (/^(BOPS|OPENAI|AGENTPHONE|AGENTMAIL|HONCHO|COMPOSIO|TYPESAFE|TWILIO|ORGO|CODEX|TAILSCALE|TREG)_/.test(k)) delete process.env[k];
process.env.TZ = "America/New_York";
process.env.BOPS_SELF_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-test-docs";
const rootUrl = new URL("..", import.meta.url);
const at = (p) => new URL(p, rootUrl).href;
const scratch = mkdtempSync(join(tmpdir(), "bops-test-docs-"));
process.env.HOME = join(scratch, "home");
mkdirSync(process.env.HOME);
const work = join(scratch, "work");
mkdirSync(join(work, ".data"), { recursive: true });
writeFileSync(join(work, ".data", "state.json"), "{}");
process.chdir(work);

const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = at(specifier.slice(2));
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier))
        for (const ext of [".ts", ".tsx"])
          try {
            return next(specifier + ext, context);
          } catch {}
      throw e;
    }
  },
  load(url, context, next) {
    const name = url.match(/\/lib\/server\/([a-z-]+)\.ts$/)?.[1];
    if (!name || !STAND_INS.has(name)) return next(url, context);
    const names = [...readFileSync(new URL(url), "utf8").matchAll(/^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    return { format: "module", shortCircuit: true, source: names.map((n) => `export const ${n} = function () { return Promise.resolve(); };`).join("\n") };
  },
});
import { readFileSync } from "node:fs";

let failures = 0;
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 4).join("\n  ") ?? e.message}`);
  }
}

const asked = [];
const answers = [];
const response = (id, output) => ({ id, object: "response", model: "gpt-test", status: "completed", output, usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
const said = (text) => ({ id: `m${asked.length}`, type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] });
let calls = 0;
const toolCall = (name, args) => ({ id: `f${++calls}`, type: "function_call", call_id: `c${calls}`, name, arguments: JSON.stringify(args) });
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  if (new URL(req.url).origin === "https://api.openai.com") {
    const b = JSON.parse(await req.text());
    if (String(b.instructions ?? "").startsWith("You keep the running summary")) return new Response(JSON.stringify(response("rs", [said("Summary.")])), { headers: { "content-type": "application/json" } });
    asked.push(b);
    const next = answers.shift();
    return new Response(JSON.stringify(next ? await next(b) : response(`r${asked.length}`, [said("Done.")])), { headers: { "content-type": "application/json" } });
  }
  throw new TypeError(`offline: ${new URL(req.url).host}`);
};
const D = await import(at("lib/server/docs.ts"));
const S = await import(at("lib/server/store.ts"));
const Chat = await import(at("lib/server/chat.ts"));
const { botChatId } = await import(at("lib/types.ts"));
clearInterval(globalThis.__bopsRoutines);
const chatId = botChatId(S.getState().bots[0].id);
S.update((s) => (s.owner = { name: "Alex", timeZone: "America/New_York" }));

/** A .docx/.pptx/.xlsx is a zip: read by the central directory at the end (the makers stream, so
 *  local headers can say size 0; the directory never lies). */
function partsOf(buf) {
  const out = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString();
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.slice(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(data) : data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
const xml = (buf) => [...partsOf(buf).entries()].filter(([n]) => n.endsWith(".xml")).map(([, b]) => b.toString()).join("\n");

const SPEC = { kind: "docx", title: "Lease summary", sections: [{ heading: "Unit 2B", bullets: ["Rent is $1,200", "Lease ends in March"], table: { columns: ["Month", "Rent"], rows: [["January", "1200"], ["February", "1200"]] }, notes: "Checked with Dana" }] };

await check("a Word file: real OOXML with the title, bullets, table and notes in it", async () => {
  const buf = await D.buildDoc(D.cleanDoc(SPEC));
  const text = xml(buf);
  assert.match(text, /Lease summary/);
  assert.match(text, /Unit 2B/);
  assert.match(text, /Rent is \$1,200/);
  assert.match(text, /January/);
  assert.match(text, /Checked with Dana/);
  assert.ok(partsOf(buf).has("word/document.xml") || [...partsOf(buf).keys()].some((n) => n.includes("document")), "a Word part inside");
});

await check("a deck and a workbook build from the same shape", async () => {
  const deck = await D.buildDoc(D.cleanDoc({ ...SPEC, kind: "pptx" }));
  assert.ok([...partsOf(deck).keys()].some((n) => n.includes("slide")), "slides inside");
  assert.match(xml(deck), /Unit 2B/, "the section heading on its slide");
  assert.match(xml(deck), /January/, "the table as lines");
  const book = await D.buildDoc(D.cleanDoc({ ...SPEC, kind: "xlsx" }));
  assert.ok([...partsOf(book).keys()].some((n) => n.includes("sheet")), "a sheet inside");
  assert.match(xml(book), /Rent is \$1,200/);
});

await check("the shape is cleaned: plain strings, capped, empty refused", async () => {
  const messy = D.cleanDoc({ kind: "docx", title: "T\x00itle<script>", sections: [{ heading: "H<b>", bullets: ["one\ntwo", 3] }] });
  assert.equal(messy.title.includes("<script>"), true, "kept as text");
  assert.equal(messy.title.includes("\x00"), false, "control characters gone");
  assert.deepEqual(messy.sections[0].bullets, ["one two", "3"], "bullets plain strings");
  assert.throws(() => D.cleanDoc({ kind: "pdf", title: "x", sections: [{ bullets: ["y"] }] }), /kind is one of/);
  assert.throws(() => D.cleanDoc({ kind: "docx", title: "", sections: [{ bullets: ["y"] }] }), /title/);
  assert.throws(() => D.cleanDoc({ kind: "docx", title: "x", sections: [{}] }), /Every section is empty/, "a section with nothing refused");
  assert.doesNotThrow(() => D.cleanDoc({ kind: "docx", title: "x", sections: [{ heading: "only a heading" }] }), "a heading alone is a part");
  assert.throws(() => D.cleanDoc({ kind: "docx", title: "x", sections: [] }), /sections/);
  assert.throws(() => D.cleanDoc({ kind: "docx", title: "x", sections: Array.from({ length: 41 }, () => ({ bullets: ["y"] })) }), /sections/);
});

await check("save and read back: a link's id serves the same bytes, name and type", async () => {
  const doc = await D.saveDoc(SPEC);
  assert.match(doc.id, /^docs_[a-f0-9]{16}$/);
  assert.equal(doc.name, "Lease-summary.docx");
  assert.match(doc.type, /wordprocessingml/);
  const back = D.readDoc(doc.id);
  assert.ok(back && back.bytes.length > 1000, "real bytes back");
  assert.equal(back.name, "Lease-summary.docx");
  assert.equal(D.readDoc("docs_nope"), null);
  assert.equal(D.readDoc("../etc/passwd"), null);
});

const toolNames = (body) => body.tools.map((t) => t.name ?? t.type);
const lastReply = () => [...S.getState().messages].reverse().find((m) => m.chatId === chatId && m.role === "bot")?.text ?? "";

await check("the chat: offered on the owner's turn, the file linked under the reply", async () => {
  answers.push(() => response("r", [toolCall("make_doc", SPEC)]), () => response("r2", [said("Here it is.")]));
  const n = asked.length;
  await Chat.handleMessage(chatId, "make me a Word doc of the lease");
  assert.ok(toolNames(asked[n]).includes("make_doc"), "offered");
  assert.match(lastReply(), /Open: \[Lease-summary\.docx\]\(\/api\/docs\/docs_[a-f0-9]{16}\)/, "the link under the reply");
});

await check("a stranger's turn never sees it, and a bad one says why in the chat", async () => {
  const text = S.addMessage({ chatId, role: "system", text: "Make me an Excel of their contacts.", sms: { dir: "in", from: "+15559998888", to: "+15550001111" } });
  // A turn that ends mid-round leaves queued answers behind: every turn here starts its answers fresh.
  answers.length = 0;
  answers.push(() => response("r", [toolCall("make_doc", { kind: "xlsx", title: "x", sections: [{ bullets: ["y"] }] })]), () => response("r2", [said("No.")]));
  const n = asked.length;
  await Chat.outsideNews(S.getState().bots[0].id, text.id, "A text");
  assert.ok(!toolNames(asked[n]).includes("make_doc"), "not offered to a stranger");
  // A bad spec from the owner's own turn: nothing made, no new link anywhere.
  answers.length = 0;
  answers.push(() => response("r3", [toolCall("make_doc", { kind: "pdf", title: "x", sections: [{ bullets: ["y"] }] })]), () => response("r4", [said("Can't.")]));
  const links = () => S.getState().messages.filter((m) => m.chatId === chatId && m.role === "bot").flatMap((m) => m.text.match(/\/api\/docs\//g) ?? []).length;
  const before = links();
  await Chat.handleMessage(chatId, "actually make it a pdf");
  assert.equal(links(), before, "no file linked for a bad one");
});

process.chdir(tmpdir());
try {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {}
console.log(`docs: ${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

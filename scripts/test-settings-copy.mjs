// Copy guard: JSX text and prose literals in every task-98 message builder.
// Runtime DOM suites additionally cover interpolated labels, tooltips and fetched Check results.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
const files = ["components/app/setup.tsx", "components/app/models-card.tsx", "components/app/connections-card.tsx", "components/app/chat-model.tsx", "lib/server/chat-providers.ts", "lib/server/key-check.ts", "lib/server/composio-mcp.ts", "lib/server/composio.ts", "lib/server/zapier.ts", "lib/server/mcp.ts", "lib/server/openai-client.ts", "lib/server/pc-task-runner.ts", "lib/feature-status.ts", "lib/setup-words.ts", "config/modules.cjs"];
const bad = /[A-Z_]{4,}_(?:KEY|URL)|\.env/;
const failures = [];
for (const file of files) {
 const source = ts.createSourceFile(file, readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
 const visit = node => {
  if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
   // Bare env identifiers are internal lookup keys; sentences and JSX are displayed copy.
   const text = node.text;
   if ((/\s/.test(text.trim()) || ts.isJsxText(node)) && bad.test(text)) failures.push(`${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}: ${text.trim()}`);
  }
  ts.forEachChild(node, visit);
 };
 visit(source);
}
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`PASS: user-facing prose sweep across ${files.length} message-builder files`);

const { MODULES } = createRequire(import.meta.url)("../config/modules.cjs");
for (const entry of MODULES) {
 for (const text of [entry.name, entry.help, ...entry.settings.flatMap(s => [s.label, s.help])]) {
  if (text) assert.doesNotMatch(text, bad, `${entry.id}: real module display metadata`);
 }
}
console.log(`PASS: display metadata from all ${MODULES.length} real modules`);

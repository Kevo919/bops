// Copy guard: JSX text and prose literals in every task-98 message builder.
// Runtime DOM suites additionally cover interpolated labels, tooltips and fetched Check results.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { createRequire, registerHooks } from "node:module";
const files = ["components/app/setup.tsx", "components/app/models-card.tsx", "components/app/connections-card.tsx", "components/app/chat-model.tsx", "lib/server/chat-providers.ts", "lib/server/key-check.ts", "lib/server/composio-mcp.ts", "lib/server/composio.ts", "lib/server/zapier.ts", "lib/server/mcp.ts", "lib/server/openai-client.ts", "lib/server/pc-task-runner.ts", "lib/feature-status.ts", "lib/setup-words.ts", "config/modules.cjs", "lib/server/services.ts", "lib/server/remote-mcp.ts", "lib/server/routines.ts", "components/app/bops-app.tsx"];
const bad = /[A-Z_]{4,}_(?:KEY|URL)|\.env/;
const failures = [];
const baseline = process.argv.includes("--baseline");
for (const file of files) {
 const source = ts.createSourceFile(file, baseline ? execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" }) : readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
 const visit = node => {
  if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
   // Bare env identifiers are internal lookup keys; sentences and JSX are displayed copy.
   const text = node.text;
   const memberOnly = file === "lib/setup-words.ts" && ts.isConditionalExpression(node.parent) && node.parent.whenTrue === node && node.parent.condition.getText(source) === "member";
   const managerReferral = /person (?:who )?manag(?:es|ing) Bops/i.test(text) && !memberOnly;
   if ((/\s/.test(text.trim()) || ts.isJsxText(node)) && (bad.test(text) || managerReferral || text.includes("Settings, Models"))) failures.push(`${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}: ${text.trim()}`);
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

registerHooks({ resolve(specifier, context, next) {
 try { return next(specifier, context); } catch (error) {
  if (specifier.startsWith("./")) return next(specifier + ".ts", context);
  throw error;
 }
} });
const { providerSetupGuide, memberSetupWords } = await import("../lib/setup-words.ts");
for (const [platform, label] of [["win32", "This PC"], ["darwin", "This Mac"], ["unknown", "This computer"]]) {
 const owner = providerSetupGuide(platform);
 assert.ok(owner.includes(`Settings → ${label} → Keys`));
 assert.doesNotMatch(owner, /person who manages/);
 const member = providerSetupGuide(platform, true);
 assert.match(member, /Ask the person who manages Bops/);
 assert.doesNotMatch(member, /Settings/);
 assert.equal(memberSetupWords(owner, false), owner);
 assert.equal(memberSetupWords(owner, true), member);
 assert.equal(memberSetupWords("Provider unavailable", true), "Provider unavailable");
}
console.log("PASS: owner and member setup guidance on Windows, Mac and unknown platforms");

const chat = readFileSync(new URL("../lib/server/chat.ts", import.meta.url), "utf8");
assert.match(chat, /memberSetupWords\(foundFailure.text, !!opts.member\)/);
assert.match(chat, /memberSetupWords\(foundFailure.details, !!opts.member\)/);
assert.match(chat, /memberSetupWords\(e instanceof Error \? e.message : String\(e\), !!opts.member\)/);
console.log("PASS: authoritative member-turn flag controls displayed provider errors and details");

for (const error of [undefined, null, "provider failed", 42]) {
 assert.equal(memberSetupWords(error instanceof Error ? error.message : String(error), true), String(error));
}
console.log("PASS: non-Error failures retain their message for member turns");

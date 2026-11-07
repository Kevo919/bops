// Copy guard: JSX text and prose literals in every task-98 message builder.
// Runtime DOM suites additionally cover interpolated labels, tooltips and fetched Check results.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { createRequire, registerHooks } from "node:module";
const files = ["components/app/setup.tsx", "components/app/models-card.tsx", "components/app/connections-card.tsx", "components/app/chat-model.tsx", "lib/server/chat-providers.ts", "lib/server/key-check.ts", "lib/server/composio-mcp.ts", "lib/server/composio.ts", "lib/server/zapier.ts", "lib/server/mcp.ts", "lib/server/openai-client.ts", "lib/server/pc-task-runner.ts", "lib/feature-status.ts", "lib/setup-words.ts", "config/modules.cjs", "lib/server/services.ts", "lib/server/remote-mcp.ts", "lib/server/routines.ts", "components/app/bops-app.tsx"];
const bad = /[A-Z_]{4,}_(?:KEY|URL)|\.env/;
// Static guard complements DOM/runtime checks; it tracks simple constants and known env-name expressions,
// not arbitrary JavaScript execution or cross-file data flow.
function scanCopy(file, text) {
 const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
 const constants = new Map();
 const collect = node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer);
  ts.forEachChild(node, collect);
 };
 collect(source);
 const value = (node, seen = new Set()) => {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) {
   if (seen.has(node.text)) return "";
   if (constants.has(node.text)) return value(constants.get(node.text), new Set([...seen, node.text]));
   return /^(?:keyName|envName|envKey)$/.test(node.text) ? "ENVIRONMENT_API_KEY" : "";
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return value(node.left, seen) + value(node.right, seen);
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => value(span.expression, seen) + span.literal.text).join("");
  if (ts.isPropertyAccessExpression(node) && /^(?:key|keys|keyName|envName|envKey)$/.test(node.name.text)) return "ENVIRONMENT_API_KEY";
  if (ts.isCallExpression(node)) {
   if (ts.isIdentifier(node.expression) && /^(?:accountKeyName|chatKeyName)$/.test(node.expression.text)) return "ENVIRONMENT_API_KEY";
   if (ts.isPropertyAccessExpression(node.expression)) return value(node.expression.expression, seen);
  }
  return "";
 };
 const display = node => {
  for (let parent = node.parent; parent && !ts.isStatement(parent); parent = parent.parent) {
   if (ts.isJsxAttribute(parent)) return /^(?:title|aria-label|placeholder|alt)$/.test(parent.name.getText(source));
   if (ts.isJsxExpression(parent) && !ts.isJsxAttribute(parent.parent)) return true;
   if (ts.isPropertyAssignment(parent) && /^(?:message|title|label|help|hint|problem|notSet|badAddress)$/.test(parent.name.getText(source))) return true;
  }
  return false;
 };
 const internal = node => {
  for (let parent = node.parent; parent && !ts.isStatement(parent); parent = parent.parent) {
   if (ts.isNewExpression(parent) && parent.expression.getText(source) === "RegExp") return true;
   if (ts.isPropertyAssignment(parent) && parent.name.getText(source) === "Authorization") return true;
  }
  return false;
 };
 const failures = [];
 const fail = (node, text) => failures.push(`${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}: ${text.trim()}`);
 const visit = node => {
  if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
   const text = node.text;
   const memberOnly = file === "lib/setup-words.ts" && ts.isConditionalExpression(node.parent) && node.parent.whenTrue === node && node.parent.condition.getText(source) === "member";
   const managerReferral = /person (?:who )?manag(?:es|ing) Bops/i.test(text) && !memberOnly;
   if ((/\s/.test(text.trim()) || ts.isJsxText(node)) && (bad.test(text) || managerReferral || text.includes("Settings, Models"))) fail(node, text);
  }
  if (!process.argv.includes("--negative-interpolation") && ts.isTemplateExpression(node)) {
   const prose = /[a-z]{3}/i.test(node.head.text + node.templateSpans.map(s => s.literal.text).join(""));
   if (!internal(node) && (display(node) || prose) && bad.test(value(node))) fail(node, "environment identifier in interpolated copy");
  }
  if (!process.argv.includes("--negative-interpolation") && ts.isJsxExpression(node) && node.expression && display(node.expression) && bad.test(value(node.expression))) fail(node, "environment identifier in displayed JSX expression");
  ts.forEachChild(node, visit);
 };
 visit(source);
 return failures;
}
const badFixtures = [
 'const prefix = "OPENAI"; const message = `Add ${prefix}_API_KEY`;',
 'const variable = "OPENAI_API_KEY"; const message = `Add ${variable}`;',
 'const view = <span title={`${provider.keyName} is set`}>Connected</span>;',
 'const view = <span>{row.key}</span>;',
 'const view = <span>{`Needs ${m.keys.join(", ")}`}</span>;',
 'const prefix = "OPENAI"; const suffix = "_API_KEY"; const view = <span>{prefix + suffix}</span>;',
];
for (const fixture of badFixtures) assert.ok(scanCopy("fixture.tsx", fixture).length, `negative fixture escaped: ${fixture}`);
for (const fixture of ['const view = <span key={row.key} data-key={row.key}>Connected</span>;', 'fetch("/api/key-check", { body: JSON.stringify({ key: row.key }) });', 'const id = `${keyName}\\n${key}`;']) assert.deepEqual(scanCopy("fixture.tsx", fixture), [], fixture);
console.log("PASS: interpolation/JSX negative fixtures fail; internal keys remain allowed");
const baseline = process.argv.includes("--baseline");
const failures = files.flatMap(file => scanCopy(file, baseline ? execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" }) : readFileSync(new URL(`../${file}`, import.meta.url), "utf8")));
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

for (const error of [undefined, null, "provider failed", 42]) {
 assert.equal(memberSetupWords(error instanceof Error ? error.message : String(error), true), String(error));
}
console.log("PASS: non-Error failures retain their message for member turns");

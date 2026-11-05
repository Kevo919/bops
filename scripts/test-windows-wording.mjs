// Crawl item 4 + option B: Mac wording on a Windows computer, and the vault's OpenAI row saying it isn't
// the chat's key. computerWords already swapped Mac/PC; it now also maps Keychain -> Windows Credential
// Manager and ⌘ -> Ctrl (the shortcut is CommandOrControl everywhere), and the raw sites that bypassed it
// are wrapped: the Kbd badge, both sidebar tooltips, the token note (channels), the Logins Keychain
// strings, Skills' "Kept on this Mac", plus the keys row's new note (option B).
// Usage: node scripts/test-windows-wording.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootPath = fileURLToPath(new URL("..", import.meta.url));
const rootUrl = pathToFileURL(rootPath).href;
const read = (p) => readFileSync(new URL(p, rootUrl), "utf8");
const { computerWords } = await import(new URL("lib/computer-words.ts", rootUrl).href);

let failures = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.stack?.split("\n").slice(0, 3).join("\n  ") ?? e.message}`);
  }
}

check("computerWords maps what a Windows user reads", () => {
  assert.equal(computerWords("your Mac's Keychain", "win32"), "your PC's Windows Credential Manager");
  assert.equal(computerWords("Collapse the sidebar (⌘\\)", "win32"), "Collapse the sidebar (Ctrl\\)");
  assert.equal(computerWords("Kept on this Mac.", "win32"), "Kept on this PC.");
  assert.equal(computerWords("your Mac's Keychain", "darwin"), "your Mac's Keychain", "the Mac keeps its own words");
  assert.equal(computerWords("⌘", "linux"), "Ctrl", "CommandOrControl is Ctrl off the Mac");
});

check("every raw site is wrapped (no bare ⌘/Keychain/Mac copy left in the UI files)", () => {
  const files = ["components/app/chat-view.tsx", "components/app/sidebar.tsx", "components/app/sidebar-rail.tsx", "components/app/channels.tsx", "components/app/logins.tsx", "components/app/skills.tsx"];
  for (const f of files) {
    const s = read(f);
    for (const line of s.split("\n")) {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*")) continue;
      assert.ok(!/(title|data-tip|aria-label)="[^"]*(⌘|Keychain)[^"]*"/.test(line), `${f}: a raw Mac string in an attribute: ${t.slice(0, 60)}`);
      assert.ok(!/>[^<{]*(⌘|Keychain)/.test(line), `${f}: a raw Mac string in text: ${t.slice(0, 60)}`);
    }
  }
  assert.match(read("components/app/chat-view.tsx"), /computerWords\("⌘"\)/);
  assert.match(read("components/app/sidebar.tsx"), /computerWords\("Collapse the sidebar/);
  assert.match(read("components/app/sidebar-rail.tsx"), /computerWords\("Expand the sidebar/);
  assert.match(read("components/app/channels.tsx"), /computerWords\(`The token stays/);
  assert.match(read("components/app/skills.tsx"), /computerWords\("Kept on this Mac\."\)/);
});

check("option B: the vault's OpenAI row says it isn't the chat's key", () => {
  const s = read("components/app/keys.tsx");
  assert.match(s, /NOT_THE_CHAT: Record<string, string> = \{ OPENAI_API_KEY:/);
  assert.match(s, /NOT_THE_CHAT\[p\.name\]/, "rendered on the row");
  assert.match(s, /the chat's models read this computer's own OpenAI key, not the vault/);
});

// Task 62: a bot's AI settings said "Your Mac" on Windows, and the Claude card on This PC still said local
// subscription tasks weren't enabled after PR #80 made them work.
const { computerWordsFor } = await import(new URL("lib/computer-words.ts", rootUrl).href);
// lib/shared.ts imports through "@/", which plain node can't load: its two helpers, checked against their source.
const yourMac = (state) => `${state.shared ? "the owner's" : "your"} Mac`;
const Your = (state) => (state.shared ? "The owner's" : "Your");
const { claudeLocalLine } = await import(new URL("lib/local-plan-words.ts", rootUrl).href);

check("Works on (a bot's AI settings) says your PC on Windows", () => {
  const own = { shared: undefined };
  const shared = read("lib/shared.ts");
  assert.match(shared, /export const yourMac = \(state: Viewing\) => `\$\{your\(state\)\} Mac`;/);
  assert.match(shared, /export const Your = \(state: Viewing\) => \(state\.shared \? "The owner's" : "Your"\);/);
  assert.equal(computerWords(`Its cloud computer, or ${yourMac(own)} when a task needs it`, "win32"), "Its cloud computer, or your PC when a task needs it");
  assert.equal(computerWords(`${Your(own)} Mac, always`, "win32"), "Your PC, always");
  assert.equal(computerWords(`${Your(own)} Mac`, "win32"), "Your PC");
  assert.equal(computerWords(`${Your(own)} Mac`, "darwin"), "Your Mac", "the Mac keeps its own words");
  const s = read("components/app/bot-settings-ai.tsx");
  assert.match(s, /useComputerWords\(\)/);
  assert.match(s, /words\(yourMac\(state\)\)/);
  assert.match(s, /words\(`\$\{Your\(state\)\} Mac, always`\)/);
  assert.match(s, /\["mac", words\(`\$\{Your\(state\)\} Mac`\)\]/);
  for (const line of s.split("\n")) {
    const raw = line.replace(/words\([^)]*\)\)?`?\)?/g, "");
    assert.ok(!/`\$\{Your\(state\)\} Mac/.test(raw), `bot-settings-ai.tsx: an unwrapped Mac line: ${line.trim().slice(0, 70)}`);
  }
  assert.match(read("components/app/bot-computers.tsx"), /words\("Uses this Mac"\)/);
  assert.equal((read("components/app/app-envs.tsx").match(/computerWords\("This Mac can't reach its computer/g) ?? []).length, 2);
});

check("a name someone gave that has Mac in it stays as they wrote it", () => {
  const words = computerWordsFor("win32");
  const name = "Mac Studio";
  assert.equal(words`${name} works on this Mac`, "Mac Studio works on this PC", "only the fixed words change");
  assert.equal(words`Works on ${"Macbook Bot"}'s computer`, "Works on Macbook Bot's computer");
  // bot-computers.tsx: the line with another bot's name is never passed through the words.
  const s = read("components/app/bot-computers.tsx");
  assert.match(s, /return `Works on \$\{c\.name\}'s computer`;/);
  assert.ok(!/words\(`Works on \$\{c\.name\}/.test(s));
});

check("the Claude card on This PC says what bot tasks on this PC do now", () => {
  const signedClaude = claudeLocalLine(true, "claude");
  assert.match(signedClaude, /signed in on this PC, and bot tasks on this PC run on your Claude plan/);
  assert.match(claudeLocalLine(true, "openai"), /use the OpenAI key for now: choose Your Claude plan below/);
  assert.match(claudeLocalLine(true, null), /can run on your Claude plan: choose that below/);
  assert.match(claudeLocalLine(true, undefined), /can run on your Claude plan/);
  assert.match(claudeLocalLine(false, "openai"), /^Connect Claude Code's own subscription on this PC/);
  for (const line of [signedClaude, claudeLocalLine(true, "openai"), claudeLocalLine(true, null), claudeLocalLine(false, null)]) {
    assert.ok(!/not enabled/i.test(line), `still stale: ${line}`);
    assert.ok(!/[\u2012-\u2015-]/.test(line), `a dash: ${line}`);
    assert.equal(computerWords(line, "win32"), line, "already PC words");
  }
  const s = read("components/app/setup.tsx");
  assert.ok(!s.includes("Local subscription tasks are not enabled yet"), "the stale Claude line is gone");
  assert.match(s, /claudeLocalLine\(!!s\?\.connected, runner\)/, "from /api/local-subscriptions");
  assert.match(s, /<LocalSubscriptions runner=\{pcView\?\.runner\} \/>/, "and the runner setting");
  assert.match(s, /<PcTaskRunnerCard onView=\{setPcView\} \/>/, "a stable setter, so the first fetch runs once");
});

if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`windows wording: ${passed} passed`);
process.exit(0);

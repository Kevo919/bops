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

if (failures) {
  console.error(`${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`windows wording: ${passed} passed`);
process.exit(0);

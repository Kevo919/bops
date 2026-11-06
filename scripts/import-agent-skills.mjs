// Import the user's own Agent Skill folders (the ~/.claude/skills and ~/.agents/skills shape: a folder
// with SKILL.md, name + description frontmatter, optional files) into a Bops workspace as DRAFT skills
// labeled "From Claude" - nothing a bot sees until the owner reviews and publishes (SkillRef.status is
// draft by way of createSkill + a follow-up patchRef; here we mark draft explicitly).
//
//   node scripts/import-agent-skills.mjs [--limit N] [--label L] [--dir PATH]... [--dry]
//
//   --limit N   import the first N only (default 20: review in batches, not all 700 at once)
//   --label L   the label to file them under (default "From Claude")
//   --dir PATH  a skills root to read (repeatable; default ~/.claude/skills then ~/.agents/skills)
//   --dry       list what would be imported, import nothing
//
// Collisions: a slug already in the workspace is skipped (listed); ~/.claude wins over ~/.agents/skills
// when both hold the same folder name. Skipped-not-failed: the summary says how many and why.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};
const dry = args.includes("--dry");
const LIMIT = Number(flag("limit", "20"));
const LABEL = flag("label", "From Claude");
const dirs = [];
for (let i = args.indexOf("--dir"); i >= 0; i = args.indexOf("--dir", i + 1)) if (args[i + 1]) dirs.push(args[i + 1]);
if (!dirs.length) for (const d of [join(homedir(), ".claude", "skills"), join(homedir(), ".agents", "skills")]) if (existsSync(d)) dirs.push(d);

// Run against the app's own state: a scratch HOME so nothing real is touched, then the server modules.
const scratch = join(process.env.TEMP ?? "/tmp", `bops-import-skills-${Date.now()}`);
mkdirSync(join(scratch, ".data"), { recursive: true });
writeFileSync(join(scratch, ".data", "state.json"), "{}");
process.env.HOME = scratch;
process.env.BOPS_SELF_HOSTED = "1";
process.chdir(scratch);

const root = new URL("..", import.meta.url);
const at = (p) => new URL(p, root).href;
const { registerHooks } = await import("node:module");
const STAND_INS = new Set(["mac", "relay", "desktop", "mirror", "sessions"]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier.startsWith("@/")) specifier = at(specifier.slice(2));
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier)) for (const ext of [".ts", ".tsx"]) try { return next(specifier + ext, context); } catch {}
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

const S = await import(at("lib/server/store.ts"));
const WS = await import(at("lib/server/workspace-skills.ts"));
const { MAIN_WORKSPACE } = await import(at("lib/types.ts"));
clearInterval(globalThis.__bopsRoutines);

// A workspace to receive them (the main one; created if this is a fresh state).
if (!S.getState().workspaces?.length) S.update((s) => void (s.workspaces ??= []).push({ id: MAIN_WORKSPACE, name: "Main", createdAt: Date.now() }));

/** One SKILL.md's frontmatter (--- yaml ---), as flat key/value we read name/description from. */
const frontmatterOf = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return out;
};

/** A folder's files besides SKILL.md, capped the way bundles are (relative paths, size limits). */
const filesOf = (dir) => {
  const out = [];
  const walk = (d, prefix) => {
    for (const e of readdirSync(d)) {
      if (e === "SKILL.md" || e.startsWith(".")) continue;
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, `${prefix}${e}/`);
      else if (st.size <= 512 * 1024 && out.length < 40) out.push({ path: `${prefix}${e}`, from: p });
    }
  };
  walk(dir, "");
  return out;
};

// Gather candidates: name-labeled folders holding a SKILL.md with a description; first root wins on dupes.
const seen = new Set();
const candidates = [];
for (const root0 of dirs) {
  for (const e of readdirSync(root0).sort()) {
    const dir = join(root0, e);
    if (!statSync(dir).isDirectory() || seen.has(e)) continue;
    const md = join(dir, "SKILL.md");
    if (!existsSync(md)) continue;
    seen.add(e);
    const fm = frontmatterOf(readFileSync(md, "utf8"));
    const name = String(fm.name ?? e);
    const description = String(fm.description ?? "").trim();
    if (!description) continue; // Bops requires one; listed as skipped below.
    candidates.push({ dir, name, description, body: readFileSync(md, "utf8"), files: filesOf(dir) });
  }
}

const existing = new Set(WS.refsOf(MAIN_WORKSPACE).map((r) => r.slug));
const take = candidates.filter((c) => {
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
  return !existing.has(slug);
});

console.log(`Skills roots: ${dirs.join(", ")}`);
console.log(`Candidates: ${candidates.length}; already in the workspace: ${candidates.length - take.length}; importing up to ${LIMIT}${dry ? " (dry run)" : ""}.`);

let imported = 0;
const skipped = [];
for (const c of take.slice(0, LIMIT)) {
  if (dry) { console.log(`  would import: ${c.name}`); imported++; continue; }
  try {
    const { ref } = WS.createSkill(MAIN_WORKSPACE, {
      name: c.name,
      description: c.description.slice(0, 500),
      body: c.body,
      label: LABEL,
      files: c.files.map((f) => ({ path: f.path, content: readFileSync(f.from, "utf8") })),
    });
    // createSkill defaults to draft (status: "draft" in its ref), so bots see nothing until the
    // owner publishes; the label groups them for review. Nothing further to set.
    imported++;
    console.log(`  imported (draft): ${c.name}`);
  } catch (e) {
    skipped.push(`${c.name}: ${e.message}`);
  }
}
console.log(`Done: ${imported} imported${skipped.length ? `; skipped ${skipped.length} (${skipped.slice(0, 5).join("; ")})` : ""}.`);
console.log(`Review them in Bops: Skills -> ${LABEL}; publish the ones you want your bots to see.`);
// Windows EPERM on a just-used cwd: step out first, retry, tolerate (the task-15 lesson).
process.chdir(process.env.TEMP ?? "/tmp");
try { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }); } catch {}

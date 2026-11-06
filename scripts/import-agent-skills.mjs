// Import the user's own Agent Skill folders (the ~/.claude/skills and ~/.agents/skills shape: a folder
// with SKILL.md, name + description frontmatter, optional files) into this Bops's workspace as DRAFT
// skills labeled "From Claude", through the app's own createSkill (lib/server/workspace-skills.ts), so
// they land where the Skills screen lists them. A draft is inert: no bot sees it until the owner
// publishes it (skillsFor lists published ones only), and none is given to a bot here.
//
//   node scripts/import-agent-skills.mjs [--app PATH] [--user ID] [--limit N] [--label L] [--dir PATH]... [--dry]
//
//   --app PATH  the Bops folder that holds .data (default: the current folder)
//   --user ID   the Orgo user whose state to add them to (.data/users/<id>/state.json); default the
//               state the install runs on while nobody is signed in (.data/state.json)
//   --limit N   import the first N only (default 20: review in batches, not all 700 at once)
//   --label L   the label to file them under (default "From Claude")
//   --dir PATH  a skills root to read (repeatable; default ~/.claude/skills then ~/.agents/skills)
//   --dry       list what would be imported, import nothing
//
// Only for a self-hosted install (BOPS_SELF_HOSTED=1: the state in files under .data). The desktop app
// signed in with Orgo keeps its state in Bops Cloud: there, use Skills, Import from folder, in the app.
// Close Bops first: a running server holds the state in memory and its next save would undo the import.
// So the run is refused while Bops answers (its port, from PORT or .env.local, on 127.0.0.1, ::1,
// localhost and the HOST/HOSTNAME it's set to listen on), and checked again right before the state is
// saved: if Bops started meanwhile, nothing is saved and the folders this run wrote are taken away again.
// A skill folder already on disk is never written over (createSkill's writeTree replaces the folder at
// its slug): one whose slug folder is there, listed or not, is imported under the next free slug.
//
// What's read, and what never is: a skill folder's own regular files only. Symlinks (to a file or a
// folder, inside or out) are skipped, and every file's real path is checked to be inside its skill
// folder. A file that can't be read (a symlink loop, ELOOP; no permission) is skipped, never the run.
// Secret-looking files (*.env, .env*, *.pem, *.key, id_*, *credentials*, *secret*, *token*, keystores)
// are skipped by name, and any text file the app's secret scan (gitleaks' rules, skill-bundle.ts
// scanSecrets) flags is skipped by content. Binary files are skipped. Collisions: a slug already in the
// workspace is skipped; ~/.claude wins over ~/.agents/skills when both hold the same folder name.
// Tested by scripts/test-import-agent-skills.mjs.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { registerHooks } from "node:module";
import { parse as parseYaml } from "yaml";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};
const dry = args.includes("--dry");
const LIMIT = Number(flag("limit", "20"));
const LABEL = flag("label", "From Claude");
const USER = flag("user", "");
const APP = resolve(flag("app", process.cwd()));
const dirs = [];
for (let i = args.indexOf("--dir"); i >= 0; i = args.indexOf("--dir", i + 1)) if (args[i + 1]) dirs.push(resolve(args[i + 1]));
if (!dirs.length) for (const d of [join(homedir(), ".claude", "skills"), join(homedir(), ".agents", "skills")]) if (existsSync(d)) dirs.push(d);

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

/* ---------------- Which state, and is it safe to write ---------------- */

/** KEY=value lines of the install's .env.local and .env (what Next loads), the first one saying it winning. */
const envOf = (dir) => {
  const out = {};
  for (const f of [".env.local", ".env"]) {
    let text = "";
    try {
      text = readFileSync(join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return out;
};
const appEnv = envOf(APP);
if ((process.env.BOPS_SELF_HOSTED || appEnv.BOPS_SELF_HOSTED) !== "1")
  fail(`${APP} isn't a self-hosted Bops (BOPS_SELF_HOSTED=1 in its .env.local): its state is in Bops Cloud, which this script can't write. Import each folder in the app instead: Skills, Import from folder.`);
const scope = (id) => id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "_";
const stateFile = USER ? join(APP, ".data", "users", scope(USER), "state.json") : join(APP, ".data", "state.json");
if (!existsSync(stateFile)) fail(`No Bops state at ${stateFile}. Run it from the Bops folder (or pass --app), with --user for a signed-in Orgo user's state.`);

const port = Number(process.env.PORT || appEnv.PORT || "3210");
// Every address the server could be reached at here: loopback both ways, and the host it's told to listen on.
const hosts = [...new Set(["127.0.0.1", "::1", "localhost", ...[process.env.HOST, appEnv.HOST, appEnv.HOSTNAME].filter((h) => h && h !== "0.0.0.0" && h !== "::")])];
/**
 * Whether a Bops server is listening here: a TCP connect to each host at its port. Synchronous (a child
 * process), so no background save of this run's state can slip in while it's asked.
 */
function bopsRunning() {
  const probe = `const net=require("node:net");const [port,...hosts]=JSON.parse(process.argv[1]);let left=hosts.length;const done=(w)=>{if(w){process.stdout.write(w);process.exit(0)}if(--left===0)process.exit(0)};for(const h of hosts){const s=net.connect({host:h,port});s.setTimeout(800);s.on("connect",()=>done(h+":"+port));s.on("timeout",()=>{s.destroy();done()});s.on("error",()=>done())}`;
  const r = spawnSync(process.execPath, ["-e", probe, JSON.stringify([port, ...hosts])], { encoding: "utf8", timeout: 5000, windowsHide: true });
  return r.stdout.trim() || null;
}
if (!dry) {
  const up = bopsRunning();
  if (up) fail(`Bops is running (it answers at ${up}): close it first, then import. Its next save would undo the import.`);
}

/* ---------------- The app's own modules, against this install's state (lib/server/persist.ts fileStore) ---------------- */

process.env.BOPS_SELF_HOSTED = "1";
process.chdir(APP);
const root = new URL("..", import.meta.url);
const at = (p) => new URL(p, root).href;
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
const B = await import(at("lib/server/skill-bundle.ts"));
const { MAIN_WORKSPACE } = await import(at("lib/types.ts"));
clearInterval(globalThis.__bopsRoutines);
if (USER) await S.bindSignIn(USER);
const wsId = S.getState().workspaces?.some((w) => w.id === MAIN_WORKSPACE) ? MAIN_WORKSPACE : S.getState().workspaces?.[0]?.id;
if (!wsId) fail("That state has no workspace to add skills to.");

/* ---------------- Reading a skill folder, safely ---------------- */

const MAX_FILES = 40;
const MAX_FILE = 512 * 1024;
const MAX_DEPTH = 8;
const SECRET_NAME = [/\.env$/i, /^\.env/i, /\.pem$/i, /\.key$/i, /^id_/i, /credentials/i, /secret/i, /token/i, /\.(p12|pfx|jks|keystore|kdbx|ppk|gpg)$/i, /^\.?(netrc|pgpass|npmrc|pypirc)$/i];
const secretName = (name) => SECRET_NAME.some((re) => re.test(name));
const inside = (top, p) => p === top || p.startsWith(top + sep);
const why = (e) => e.code ?? e.message;

/** One SKILL.md as YAML frontmatter (the yaml package: folded > and literal | blocks, quoting, all of it) and its body. */
function splitSkillMd(text) {
  const t = text.replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(t);
  if (!m) return { frontmatter: {}, body: t };
  const fm = m[1].trim() ? parseYaml(m[1]) : {};
  if (fm === null || typeof fm !== "object" || Array.isArray(fm)) throw new Error("its frontmatter isn't a YAML map");
  return { frontmatter: fm, body: t.slice(m[0].length) };
}

/** A skill folder's files besides SKILL.md: regular text files inside it, no secrets. What's left out is said, by path and why. */
function filesOf(dir, skipped) {
  const top = realpathSync(dir);
  const out = [];
  const walk = (abs, prefix, depth) => {
    if (depth > MAX_DEPTH) return void skipped.push(`${prefix}: too deep`);
    let names;
    try {
      names = readdirSync(abs).sort();
    } catch (e) {
      return void skipped.push(`${prefix || "."}: ${why(e)}`);
    }
    for (const name of names) {
      const rel = `${prefix}${name}`;
      if (!prefix && name === "SKILL.md") continue;
      // Dot names (.git, .DS_Store) are junk, left out without a line; a secret-looking one (.env) is said.
      if (name.startsWith(".") && !secretName(name)) continue;
      try {
        const full = join(abs, name);
        const st = lstatSync(full);
        if (st.isSymbolicLink()) {
          skipped.push(`${rel}: a symlink`);
          continue;
        }
        // Never a path out of the folder, however it got there (a link above it, a mount).
        const real = realpathSync(full);
        if (!inside(top, real)) {
          skipped.push(`${rel}: outside the skill folder`);
          continue;
        }
        if (st.isDirectory()) {
          if (!B.junkReason(`${rel}/x`)) walk(full, `${rel}/`, depth + 1);
          continue;
        }
        if (!st.isFile()) {
          skipped.push(`${rel}: not a regular file`);
          continue;
        }
        if (secretName(name)) {
          skipped.push(`${rel}: may hold a secret`);
          continue;
        }
        if (B.junkReason(rel)) continue;
        if (st.size > MAX_FILE) {
          skipped.push(`${rel}: over ${MAX_FILE / 1024} KB`);
          continue;
        }
        if (out.length >= MAX_FILES) {
          skipped.push(`${rel}: over ${MAX_FILES} files`);
          continue;
        }
        const text = B.textOf(rel, readFileSync(real));
        if (text === null) {
          skipped.push(`${rel}: binary`);
          continue;
        }
        if (B.scanSecrets(rel, text).length) {
          skipped.push(`${rel}: holds what looks like a secret`);
          continue;
        }
        out.push({ path: rel, content: text, executable: (st.mode & 0o111) !== 0 });
      } catch (e) {
        // ELOOP, EACCES, a file gone mid-read: that file is skipped, never the run.
        skipped.push(`${rel}: ${why(e)}`);
      }
    }
  };
  walk(top, "", 0);
  return out;
}

// Candidates: folders (never a symlinked one) holding a regular SKILL.md with a description; the first root wins on dupes.
const seen = new Set();
const candidates = [];
const notTaken = [];
for (const root0 of dirs) {
  let top;
  let entries;
  try {
    top = realpathSync(root0);
    entries = readdirSync(top).sort();
  } catch (e) {
    notTaken.push(`${root0}: ${why(e)}`);
    continue;
  }
  for (const e of entries) {
    if (e.startsWith(".") || seen.has(e)) continue;
    const dir = join(top, e);
    try {
      const st = lstatSync(dir);
      if (st.isSymbolicLink()) {
        notTaken.push(`${e}: a symlink`);
        continue;
      }
      if (!st.isDirectory() || !inside(top, realpathSync(dir))) continue;
      const md = join(dir, "SKILL.md");
      const mdSt = lstatSync(md, { throwIfNoEntry: false });
      if (!mdSt) continue;
      if (mdSt.isSymbolicLink() || !mdSt.isFile() || !inside(realpathSync(dir), realpathSync(md))) {
        notTaken.push(`${e}: its SKILL.md isn't a regular file in the folder`);
        continue;
      }
      seen.add(e);
      const { frontmatter, body } = splitSkillMd(readFileSync(md, "utf8"));
      const name = String(frontmatter.name ?? e).trim() || e;
      const description = String(frontmatter.description ?? "").replace(/\s+/g, " ").trim();
      if (!description) {
        notTaken.push(`${e}: no description`);
        continue;
      }
      candidates.push({ dir, name, description, frontmatter, body });
    } catch (err) {
      notTaken.push(`${e}: ${why(err)}`);
    }
  }
}

const slugOf = (c) => (typeof c.frontmatter.name === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.frontmatter.name) ? c.frontmatter.name : B.slugify(c.name));
const existing = new Set(WS.refsOf(wsId).map((r) => r.slug));
const take = candidates.filter((c) => !existing.has(slugOf(c)));

console.log(`State: ${stateFile}`);
console.log(`Skills roots: ${dirs.join(", ") || "(none)"}`);
console.log(`Candidates: ${candidates.length}; already in the workspace: ${candidates.length - take.length}; importing up to ${LIMIT}${dry ? " (dry run)" : ""}.`);
for (const n of notTaken) console.log(`  not taken: ${n}`);

// The spec's own fields are kept; Bops' are createSkill's to write, and the label is the one asked for.
const SPEC_KEYS = ["license", "compatibility", "metadata", "allowed-tools"];
let imported = 0;
const failed = [];
/** The folders this run wrote, with the SKILL.md it wrote there: taken away again if the state can't be saved. */
const made = [];
/** A slug free in the list and on disk: a folder already there (another skill's, or one left behind) is never written over. */
const onDisk = (slug) => !!lstatSync(WS.skillDir(wsId, "skill", slug), { throwIfNoEntry: false });
const listed = new Set(WS.refsOf(wsId).map((r) => r.slug));
const freeSlugFor = (base) => {
  let slug = base;
  for (let n = 2; listed.has(slug) || onDisk(slug); n++) slug = `${base.slice(0, B.BUNDLE_LIMITS.slug - String(n).length - 1)}-${n}`;
  return slug;
};
for (const c of take.slice(0, LIMIT)) {
  const skipped = [];
  const files = filesOf(c.dir, skipped);
  const skippedNote = skipped.length ? `; skipped ${skipped.join("; ")}` : "";
  if (dry) {
    console.log(`  would import: ${c.name} (${files.length} files${skippedNote})`);
    imported++;
    continue;
  }
  const extra = Object.fromEntries(SPEC_KEYS.filter((k) => c.frontmatter[k] !== undefined).map((k) => [k, c.frontmatter[k]]));
  // The slug, chosen here and given as the frontmatter's name (createSkill keeps a valid one): free in the list and on disk.
  const slug = freeSlugFor(slugOf(c));
  if (slug !== slugOf(c)) console.log(`  ${c.name}: a folder for ${slugOf(c)} is already there; importing it as ${slug} instead`);
  extra.name = slug;
  // body is SKILL.md without its frontmatter: createSkill writes the one frontmatter block itself.
  const input = { name: c.name, description: c.description.slice(0, B.BUNDLE_LIMITS.description), body: c.body, label: LABEL, files, source: "import", status: "draft" };
  try {
    let result;
    try {
      if (onDisk(slug)) throw new Error(`a folder for ${slug} appeared meanwhile; not written over`);
      result = WS.createSkill(wsId, { ...input, frontmatter: extra });
    } catch (e) {
      // A field the app won't keep in that form (metadata that isn't strings): the skill without it.
      if (!(e instanceof WS.SkillError) || !/frontmatter/i.test(e.message)) throw e;
      result = WS.createSkill(wsId, { ...input, frontmatter: { name: slug } });
    }
    const dir = WS.skillDir(wsId, "skill", result.ref.slug);
    made.push({ dir, skillMd: readFileSync(join(dir, "SKILL.md"), "utf8") });
    listed.add(result.ref.slug);
    imported++;
    console.log(`  imported (draft): ${c.name} -> ${result.ref.slug} (${files.length} files${skippedNote})`);
  } catch (e) {
    const detail = e.problems?.length ? ` (${e.problems.slice(0, 3).map((p) => `${p.path}${p.line ? `:${p.line}` : ""} ${p.reason}`).join("; ")})` : "";
    failed.push(`${c.name}: ${e.message}${detail}`);
  }
}
if (!dry && imported) {
  // Test-only: hold here (synchronously, so no background save runs) for a test to start a server.
  const hold = Number(process.env.BOPS_IMPORT_TEST_HOLD_MS || 0);
  if (hold > 0) {
    console.log("holding before the save");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, hold);
  }
  // Bops started while this ran: it loaded the state from before, and its next save would drop these drafts and
  // leave their folders behind. Nothing is saved, and the folders this run wrote (still as it wrote them) go.
  const up = bopsRunning();
  if (up) {
    for (const m of made)
      try {
        if (readFileSync(join(m.dir, "SKILL.md"), "utf8") === m.skillMd) rmSync(m.dir, { recursive: true, force: true });
      } catch {}
    console.error(`Bops started while importing (it answers at ${up}): nothing was saved, and the ${made.length} folders this run wrote were taken away. Close Bops and run it again.`);
    // Out now, before the store's background save can run.
    process.exit(3);
  }
  if (!(await S.flushState(10_000))) failed.push("the state didn't finish saving");
}
console.log(`Done: ${imported} ${dry ? "would be imported" : "imported"}${failed.length ? `; not imported ${failed.length} (${failed.slice(0, 5).join("; ")})` : ""}.`);
if (!dry && imported) console.log(`Start Bops and open Skills: they're drafts under ${LABEL}. Publish the ones you want your bots to see.`);
// The app's modules start timers of their own; the state is saved, so this run is done.
process.exit(failed.length ? 2 : 0);

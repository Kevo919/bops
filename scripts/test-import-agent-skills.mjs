// Tests for scripts/import-agent-skills.mjs: the user's own Agent Skill folders imported into a Bops workspace as drafts,
// through createSkill, into a temp self-hosted install (its own .data, nothing real touched). What must never come in:
// a symlink (to a file or a folder), a symlink loop (skipped, the run goes on), secret files by name (prod.env, id_rsa)
// or by content (a GitHub token), binary files, anything outside the skill folder. What must: one frontmatter block in
// each SKILL.md, folded (>) and literal (|) descriptions read as YAML, the drafts listed by the Skills screen's route
// under From Claude, and no bot seeing them until they're published.
// Usage: node scripts/test-import-agent-skills.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { parse as parseYaml } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const script = join(root, "scripts", "import-agent-skills.mjs");
const base = mkdtempSync(join(tmpdir(), "bops-test-import-"));
const app = join(base, "app");
const skills = join(base, "skills");
const outside = join(base, "outside");
const MARK = "OUTSIDE-THE-SKILL-FOLDER";

// The install: self-hosted, a state file (empty: the app makes its Main workspace).
mkdirSync(join(app, ".data"), { recursive: true });
writeFileSync(join(app, ".env.local"), "BOPS_SELF_HOSTED=1\n");
writeFileSync(join(app, ".data", "state.json"), "{}");

// Outside any skill: what a link would reach.
mkdirSync(join(outside, "dir"), { recursive: true });
writeFileSync(join(outside, "private.md"), `${MARK}\n`);
writeFileSync(join(outside, "dir", "inner.md"), `${MARK}\n`);
mkdirSync(join(outside, "linked-skill"), { recursive: true });
writeFileSync(join(outside, "linked-skill", "SKILL.md"), `---\nname: linked-skill\ndescription: ${MARK}\n---\n${MARK}\n`);

const put = (rel, content) => {
  mkdirSync(join(skills, rel, ".."), { recursive: true });
  writeFileSync(join(skills, rel), content);
};
// A normal skill with a folded description and files of every kind.
put("normal/SKILL.md", "---\nname: normal\ndescription: >\n  Folded line one\n  and line two.\nlicense: MIT\n---\n# Normal\n\nDo the thing.\n");
put("normal/ref/guide.md", "# Guide\n");
put("normal/scripts/run.sh", "#!/bin/sh\necho ok\n");
put("normal/prod.env", "API=1\n");
put("normal/id_rsa", "not really a key\n");
put("normal/api-token.txt", "x\n");
put("normal/leak.md", `token here: ghp_${"A1b2C3d4E5".repeat(4)}\n`);
put("normal/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
put("normal/blob.txt", Buffer.from([0x68, 0x69, 0x00, 0xff, 0xfe]));
symlinkSync(join(outside, "private.md"), join(skills, "normal", "linked.md"));
symlinkSync(join(outside, "dir"), join(skills, "normal", "linkdir"));
symlinkSync(join(skills, "normal", "ref", "guide.md"), join(skills, "normal", "inside-link.md"));
symlinkSync("loop-b", join(skills, "normal", "loop-a"));
symlinkSync("loop-a", join(skills, "normal", "loop-b"));
symlinkSync("self", join(skills, "normal", "ref", "self"));
// A literal (|) description, and a SKILL.md with no frontmatter name (the folder's name is its name).
put("literal/SKILL.md", "---\ndescription: |\n  Line one.\n  Line two.\n---\n\nBody of literal.\n");
// At the root: a symlinked skill folder and a symlink loop.
symlinkSync(join(outside, "linked-skill"), join(skills, "linked-skill"));
symlinkSync("loopy", join(skills, "loopy"));
// A skill whose SKILL.md is a link out.
mkdirSync(join(skills, "md-link"));
symlinkSync(join(outside, "linked-skill", "SKILL.md"), join(skills, "md-link", "SKILL.md"));

const run = (...extra) => spawnSync(process.execPath, [script, "--app", app, "--dir", skills, ...extra], { encoding: "utf8", env: { ...process.env, PORT: "1", BOPS_SELF_HOSTED: "" }, timeout: 120_000 });
const strayScratch = () => readdirSync(tmpdir()).filter((n) => n.startsWith("bops-import-skills-"));
const scratchBefore = strayScratch();

let passed = 0;
const test = async (name, f) => {
  await f();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const ws = join(app, ".data", "workspaces", "ws_main", "skills");
const stateOf = () => JSON.parse(readFileSync(join(app, ".data", "state.json"), "utf8"));
const filesUnder = (dir, prefix = "") =>
  readdirSync(dir)
    .sort()
    .flatMap((n) => (statSync(join(dir, n)).isDirectory() ? filesUnder(join(dir, n), `${prefix}${n}/`) : [`${prefix}${n}`]));

try {
  await test("a dry run lists and writes nothing", () => {
    const r = run("--dry");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /would import: normal/);
    assert.ok(!existsSync(ws), "no skills folder");
    assert.deepEqual(stateOf(), {});
  });

  let out = "";
  await test("the run finishes without crashing on links and loops, and imports the two real skills", () => {
    const r = run();
    out = r.stdout;
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(out, /Done: 2 imported\./);
    assert.match(out, /imported \(draft\): normal -> normal/);
    assert.match(out, /imported \(draft\): literal -> literal/);
    assert.match(out, /not taken: linked-skill: a symlink/);
    assert.match(out, /not taken: loopy: a symlink/);
    assert.match(out, /not taken: md-link: its SKILL\.md isn't a regular file/);
    assert.deepEqual(strayScratch(), scratchBefore, "no scratch folder left behind");
  });

  await test("each is a draft in the real workspace's state, under From Claude, given to no bot", () => {
    const s = stateOf();
    const refs = s.workspaces.find((w) => w.id === "ws_main").skills;
    assert.deepEqual(refs.map((r) => r.slug).sort(), ["literal", "normal"]);
    for (const r of refs) {
      assert.equal(r.status, "draft");
      assert.equal(r.version, undefined, "no published version");
      assert.deepEqual(r.botIds, []);
      assert.equal(r.label, "From Claude");
      assert.equal(r.source, "import");
    }
  });

  await test("symlinked files and folders, loops, secrets by name and content, and binaries are left out", () => {
    assert.deepEqual(filesUnder(join(ws, "normal")), ["SKILL.md", "ref/guide.md", "scripts/run.sh"]);
    for (const n of ["linked.md", "linkdir", "inside-link.md", "loop-a", "loop-b", "ref/self"]) assert.match(out, new RegExp(`${n.replace("/", "\\/")}: a symlink`));
    for (const n of ["prod.env", "id_rsa", "api-token.txt"]) assert.match(out, new RegExp(`${n.replace(".", "\\.")}: may hold a secret`));
    assert.match(out, /leak\.md: holds what looks like a secret/);
    assert.match(out, /logo\.png: binary/);
    assert.match(out, /blob\.txt: binary/);
    const all = filesUnder(join(app, ".data")).map((f) => readFileSync(join(app, ".data", f), "utf8")).join("\n");
    assert.ok(!all.includes(MARK), "nothing from outside a skill folder was read into Bops");
    assert.ok(!all.includes("ghp_"), "no token");
  });

  await test("one frontmatter block, and folded (>) and literal (|) descriptions read as YAML", () => {
    for (const [slug, description, body] of [
      ["normal", "Folded line one and line two.", "# Normal"],
      ["literal", "Line one. Line two.", "Body of literal."],
    ]) {
      const md = readFileSync(join(ws, slug, "SKILL.md"), "utf8");
      assert.equal(md.match(/^---$/gm).length, 2, `${slug}: one frontmatter block\n${md}`);
      const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(md);
      const fm = parseYaml(m[1]);
      assert.equal(fm.name, slug);
      assert.equal(fm.description, description);
      assert.equal(fm.metadata?.label, "From Claude");
      assert.equal(m[2].trim().split("\n")[0], body);
    }
    assert.equal(parseYaml(/^---\n([\s\S]*?)\n---/.exec(readFileSync(join(ws, "normal", "SKILL.md"), "utf8"))[1]).license, "MIT", "the spec's own fields kept");
    const state = stateOf().workspaces[0].skills;
    assert.equal(state.find((r) => r.slug === "normal").description, "Folded line one and line two.");
  });

  await test("a second run imports nothing again (already in the workspace)", () => {
    const r = run();
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /already in the workspace: 2/);
    assert.match(r.stdout, /Done: 0 imported\./);
  });

  // A run that keeps going while the test does (spawnSync would hold this process's servers too).
  const runAsync = (appDir, env = {}, onOut = () => {}) =>
    new Promise((resolve) => {
      const { PORT: _p, ...rest } = process.env;
      void _p;
      const child = spawn(process.execPath, [script, "--app", appDir, "--dir", skills], { env: { ...rest, BOPS_SELF_HOSTED: "", ...env } });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d;
        onOut(out);
      });
      child.stderr.on("data", (d) => (err += d));
      child.on("close", (status) => resolve({ status, out, err }));
    });
  const freshApp = (name, envLocal = "BOPS_SELF_HOSTED=1\n") => {
    const dir = join(base, name);
    mkdirSync(join(dir, ".data"), { recursive: true });
    writeFileSync(join(dir, ".env.local"), envLocal);
    writeFileSync(join(dir, ".data", "state.json"), "{}");
    return dir;
  };
  const listen = (host, port = 0) =>
    new Promise((resolve, reject) => {
      const server = createServer((_, res) => res.end("{}"));
      server.once("error", reject);
      server.listen(port, host, () => resolve(server));
    });

  await test("refused while Bops is running: its port from PORT on 127.0.0.1, from .env.local on ::1, and for a Bops Cloud install", async () => {
    const v4 = await listen("127.0.0.1");
    const r = await runAsync(app, { PORT: String(v4.address().port) });
    v4.close();
    assert.equal(r.status, 1, r.out + r.err);
    assert.match(r.err, /Bops is running \(it answers at 127\.0\.0\.1:\d+\)/);
    // The port from .env.local (no PORT in the environment), on ::1 where this machine has it, else 127.0.0.1.
    const v6 = await listen("::1").catch(() => null);
    const there = v6 ?? (await listen("127.0.0.1"));
    const six = freshApp("six", `BOPS_SELF_HOSTED=1\nPORT=${there.address().port}\n`);
    const r6 = await runAsync(six);
    there.close();
    assert.equal(r6.status, 1, r6.out + r6.err);
    assert.match(r6.err, v6 ? /answers at ::1:\d+/ : /answers at 127\.0\.0\.1:\d+/);
    assert.deepEqual(JSON.parse(readFileSync(join(six, ".data", "state.json"), "utf8")), {});
    if (!v6) console.log("  (no IPv6 loopback here: .env.local's port checked on 127.0.0.1)");
    const cloud = join(base, "cloud");
    mkdirSync(join(cloud, ".data"), { recursive: true });
    writeFileSync(join(cloud, ".data", "state.json"), "{}");
    const c = spawnSync(process.execPath, [script, "--app", cloud, "--dir", skills], { encoding: "utf8", env: { ...process.env, PORT: "1", BOPS_SELF_HOSTED: "" } });
    assert.equal(c.status, 1);
    assert.match(c.stderr, /isn't a self-hosted Bops/);
    assert.ok(!existsSync(join(cloud, ".data", "workspaces")));
  });

  await test("a slug folder already on disk (another skill's, or left behind) is never written over: the next free slug", async () => {
    const two = freshApp("two");
    const theirs = join(two, ".data", "workspaces", "ws_main", "skills", "normal");
    mkdirSync(theirs, { recursive: true });
    writeFileSync(join(theirs, "SKILL.md"), "SERVER MADE THIS\n");
    const r = await runAsync(two, { PORT: "1" });
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /a folder for normal is already there; importing it as normal-2 instead/);
    assert.equal(readFileSync(join(theirs, "SKILL.md"), "utf8"), "SERVER MADE THIS\n", "the folder there is untouched");
    const md = readFileSync(join(two, ".data", "workspaces", "ws_main", "skills", "normal-2", "SKILL.md"), "utf8");
    assert.match(md, /^---\nname: normal-2\n/);
    assert.match(md, /# Normal/);
    const refs = JSON.parse(readFileSync(join(two, ".data", "state.json"), "utf8")).workspaces[0].skills;
    assert.deepEqual(refs.map((x) => x.slug).sort(), ["literal", "normal-2"]);
  });

  await test("Bops started mid-run: nothing saved, and only the folders this run wrote are taken away", async () => {
    const three = freshApp("three");
    const keep = join(three, ".data", "workspaces", "ws_main", "skills", "keep");
    mkdirSync(keep, { recursive: true });
    writeFileSync(join(keep, "SKILL.md"), "KEEP\n");
    const probe = await listen("127.0.0.1");
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    let server = null;
    const r = await runAsync(three, { PORT: String(port), BOPS_IMPORT_TEST_HOLD_MS: "8000" }, (out) => {
      if (!server && out.includes("holding before the save")) server = listen("127.0.0.1", port);
    });
    assert.ok(server, "the run reached the save");
    (await server).close();
    assert.equal(r.status, 3, r.out + r.err);
    assert.match(r.err, /Bops started while importing .*nothing was saved, and the 2 folders this run wrote were taken away/);
    assert.deepEqual(JSON.parse(readFileSync(join(three, ".data", "state.json"), "utf8")), {}, "the state is as it was");
    assert.deepEqual(readdirSync(join(three, ".data", "workspaces", "ws_main", "skills")), ["keep"], "no orphan folders");
    assert.equal(readFileSync(join(keep, "SKILL.md"), "utf8"), "KEEP\n");
  });

  await test("the Skills screen's route lists them under From Claude, and no bot sees a draft", async () => {
    process.env.BOPS_SELF_HOSTED = "1";
    process.chdir(app);
    const at = (p) => pathToFileURL(join(root, p)).href;
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
    const route = await import(at("app/api/skills/route.ts"));
    clearInterval(globalThis.__bopsRoutines);
    const res = await route.GET(new Request("http://localhost:3210/api/skills"));
    assert.equal(res.status, 200, await res.clone().text());
    const body = await res.json();
    assert.ok(body.labels.includes("From Claude"), `labels: ${JSON.stringify(body.labels)}`);
    const mine = body.skills.filter((s) => s.label === "From Claude");
    assert.deepEqual(mine.map((s) => s.slug).sort(), ["literal", "normal"]);
    assert.ok(mine.every((s) => s.status === "draft"));
    const WS = await import(at("lib/server/workspace-skills.ts"));
    const S = await import(at("lib/server/store.ts"));
    for (const b of S.getState().bots) assert.deepEqual(WS.skillsFor(b.id).filter((r) => r.label === "From Claude"), [], `${b.id} sees no draft`);
  });
} finally {
  process.chdir(tmpdir());
  rmSync(base, { recursive: true, force: true });
}
console.log(`import agent skills: ${passed} passed`);
process.exit(0);

#!/usr/bin/env node
// Writes config/bops.example.yaml from the module catalog (config/modules.cjs), so it always lists every
// module and setting. Copy it to config/bops.yaml and change what you want (or use Settings, Modules).
//   node scripts/modules-example.cjs
const fs = require("node:fs");
const path = require("node:path");
const { modules } = require("../config/modules.cjs");

const root = path.resolve(__dirname, "..");
const wrap = (text, indent) => text.match(/.{1,96}(\s|$)/g).map((l) => `${indent}# ${l.trim()}`).join("\n");
const out = [
  "# Bops' modules, one section each (config/modules.cjs). Copy this file to config/bops.yaml and change what",
  "# you want, or change them in Bops: Settings, Modules. Every line here is commented out: Bops' defaults.",
  "# Keys and secrets go in .env.local, never here. Changes take effect when Bops restarts.",
  "",
];
for (const m of modules(root)) {
  out.push(wrap(`${m.name}. ${m.help}`, ""));
  if (m.keys?.length) out.push(`# Keys (in .env.local): ${m.keys.join(", ")}`);
  out.push(`# ${m.id}:`);
  if (!m.required) out.push("#   enabled: true");
  for (const s of m.settings ?? []) {
    if (s.key === "enabled") continue;
    const example = s.type === "toggle" ? String(s.default ?? false) : (s.placeholder ?? (Array.isArray(s.type) ? s.type[0] : ""));
    out.push(`#   ${s.key}: ${example}${" ".repeat(Math.max(1, 28 - s.key.length - String(example).length))}# ${s.label}${Array.isArray(s.type) ? ` (${s.type.join(", ")})` : ""}`);
  }
  out.push("");
}
fs.writeFileSync(path.join(root, "config", "bops.example.yaml"), out.join("\n"));
console.log("wrote config/bops.example.yaml");

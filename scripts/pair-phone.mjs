#!/usr/bin/env node
// Pair the Bops Android app with a Bops server that has no desktop window (a VPS such as Hostinger's):
// prints a new pairing code and writes its hash to .data/remote.json (lib/server/remote.ts does the same
// for the window's "Pair a phone"). The phone paired before stops working at once.
//   node scripts/pair-phone.mjs          pair (a new code)
//   node scripts/pair-phone.mjs --off    unpair
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), ".data", "remote.json");
if (process.argv.includes("--off")) {
  rmSync(file, { force: true });
  console.log("Unpaired: the phone can't reach this Bops anymore.");
} else {
  const code = randomBytes(32).toString("base64url");
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({ hash: createHash("sha256").update(code, "utf8").digest("hex"), created: Date.now() }), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
  console.log(`Pairing code (enter it in the Bops app on your phone; it's shown only now):\n\n  ${code}\n`);
}

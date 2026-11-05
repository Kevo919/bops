import "server-only";
import { createRequire } from "node:module";
import { setLlms } from "@/lib/agents";

/**
 * Your LLMs (config/llms.yaml, read by config/llms.cjs) into lib/agents.ts as this server starts: imported by
 * the store, so they're there before any bot's AI is read. A change to the file takes effect when Bops restarts.
 */
try {
  // A build without config/ (the Mac release) has none: Bops agent only, as before.
  // A require of its own, not the global one: Next's server bundle has a CommonJS require, but this file run as
  // plain ESM (node scripts/*.mjs, which strip its types) has none, so the list was never read there.
  const load = createRequire(import.meta.url);
  const file = load(/* turbopackIgnore: true */ `${process.cwd()}/config/llms.cjs`) as { read: (root: string) => unknown[] };
  const list = file.read(process.cwd());
  setLlms(list);
  if (list.length) console.log(`[llms] ${list.length} from config/llms.yaml`);
} catch (e) {
  console.warn(`[llms] config/llms.yaml: ${(e as Error).message}`);
}

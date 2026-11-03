import "server-only";
import { setLlms } from "@/lib/agents";

/**
 * Your LLMs (config/llms.yaml, read by config/llms.cjs) into lib/agents.ts as this server starts: imported by
 * the store, so they're there before any bot's AI is read. A change to the file takes effect when Bops restarts.
 */
try {
  // A build without config/ (the Mac release) has none: Bops agent only, as before.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const file = require(/* turbopackIgnore: true */ `${process.cwd()}/config/llms.cjs`) as { read: (root: string) => unknown[] };
  const list = file.read(process.cwd());
  setLlms(list);
  if (list.length) console.log(`[llms] ${list.length} from config/llms.yaml`);
} catch (e) {
  console.warn(`[llms] config/llms.yaml: ${(e as Error).message}`);
}

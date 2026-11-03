import type { ChildProcess } from "node:child_process";

const monitors = new WeakMap<ChildProcess, AbortController>();

/** Observe the owned executor for its whole lifetime. CLI output is untrusted: retain
 * only a bounded classification window and expose fixed diagnostic labels, never text,
 * URLs, credentials, paths, or command arguments. Silence is not proof of readiness. */
export function monitorExecutor(child: ChildProcess, graceMs = 3000): Promise<ChildProcess> {
  const controller = new AbortController();
  monitors.set(child, controller);
  let tail = "";
  const clues = new Set<string>();
  const take = (data: Buffer) => {
    tail = (tail + data.subarray(-4096).toString()).slice(-4096);
    if (/unauthorized|authentication failed|invalid api key|401/i.test(tail)) clues.add("authentication rejected");
    if (/unrecognized subcommand|unexpected argument|unknown option/i.test(tail)) clues.add("unsupported CLI arguments");
    if (/working directory|current directory|\bcwd\b/i.test(tail)) clues.add("working-directory diagnostic");
    if (/sandbox/i.test(tail)) clues.add("sandbox diagnostic");
    if (/connection refused|connection reset|timed out|tls|websocket/i.test(tail)) clues.add("connection diagnostic");
  };
  child.stdout?.on("data", take);
  child.stderr?.on("data", take);
  const fail = (reason: string) => {
    if (!controller.signal.aborted) controller.abort(new Error(`Local executor ${reason}${clues.size ? ` (${[...clues].join(", ")})` : ""}.`));
  };
  child.on("error", () => fail("could not run"));
  child.once("exit", (code: number | null) => fail(`exited${typeof code === "number" ? ` with code ${code}` : ""}`));
  child.once("close", () => {
    fail("closed");
    child.stdout?.off("data", take);
    child.stderr?.off("data", take);
    tail = "";
  });
  return new Promise((resolve, reject) => {
    const failed = () => { clearTimeout(timer); reject(controller.signal.reason); };
    // Keep the existing startup grace period; the CLI's help documents no readiness
    // message. Crucially, the monitor stays attached after this timer resolves.
    const timer = setTimeout(() => {
      controller.signal.removeEventListener("abort", failed);
      resolve(child);
    }, graceMs);
    controller.signal.addEventListener("abort", failed, { once: true });
  });
}

/** Race a remote turn against its local executor, including an exit between turns. */
export async function withExecutor<T>(child: ChildProcess | undefined, work: (signal?: AbortSignal) => Promise<T>, cancel: () => void): Promise<T> {
  const signal = child && monitors.get(child)?.signal;
  if (!signal) return work();
  if (signal.aborted) { cancel(); throw signal.reason; }
  let failed: () => void = () => {};
  const failure = new Promise<never>((_resolve, reject) => {
    failed = () => { cancel(); reject(signal.reason); };
    signal.addEventListener("abort", failed, { once: true });
  });
  try { return await Promise.race([work(signal), failure]); }
  finally { signal.removeEventListener("abort", failed); }
}

/** An exit can cancel before an in-flight input creates its remote turn. Cancel
 * again after that input settles, so the late-created turn cannot be orphaned. */
export async function sendExecutorInput(signal: AbortSignal | undefined, send: () => Promise<unknown>, cancel: () => Promise<unknown>): Promise<void> {
  signal?.throwIfAborted();
  try { await send(); }
  finally {
    if (signal?.aborted) {
      await cancel();
      signal.throwIfAborted();
    }
  }
}

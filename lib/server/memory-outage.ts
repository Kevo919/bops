import "server-only";
import { AuthenticationError, ConnectionError, PermissionDeniedError, RateLimitError, ServerError, TimeoutError } from "@honcho-ai/sdk";
import { APIConnectionError } from "openai";

/**
 * What a failed memory read was, for /api/memory (the Memory sheet and a bot's Memory tab):
 *  - "refused": the service turned the key away (401/403). Trying again won't fix it: the sheet says
 *    to check the key, and the route answers 200 {refused: true}.
 *  - "unreachable": a genuine outage, worth trying again: the SDK's own ConnectionError/TimeoutError
 *    (it wraps fetch's network TypeError as ConnectionError: @honcho-ai/sdk dist/http/client.js),
 *    the service's 5xx (ServerError) or 429 (RateLimitError), OpenAI's APIConnectionError (and its
 *    APIConnectionTimeoutError), memoryInfo's own timeout, or a fetch TypeError whose `cause` is a
 *    system network error. The route answers 503 {unreachable: true}.
 *  - "error": anything else - a code bug. A bare TypeError is one too (a null dereference is a
 *    TypeError), so it stays a 500, never a 503 that says "try again".
 * Decided by class, status and the cause's error code - never by matching message text, which
 * matches ports and ids too.
 */
export type MemoryFailure = "refused" | "unreachable" | "error";

/** memoryInfo's own words when the card read runs out of time (lib/server/memory.ts). */
export const MEMORY_TIMEOUT = "The memory service didn't answer.";

const NET_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"]);
// The SDK's classes by name too, for a copy bundled twice (instanceof then fails across copies).
const OUTAGE_NAMES = new Set(["ConnectionError", "TimeoutError", "ServerError", "RateLimitError"]);

type Err = { status?: unknown; name?: unknown; message?: unknown; cause?: unknown; code?: unknown };

/** A system network error (Node's errno codes, or undici's UND_ERR_*): what fetch's TypeError carries as `cause`. */
function networkCause(cause: unknown): boolean {
  const code = (cause as Err | null)?.code;
  return typeof code === "string" && (NET_CODES.has(code) || code.startsWith("UND_ERR_"));
}

export function classifyMemoryError(e: unknown): MemoryFailure {
  const err = (e ?? {}) as Err;
  const status = typeof err.status === "number" ? err.status : undefined;
  if (status === 401 || status === 403 || e instanceof AuthenticationError || e instanceof PermissionDeniedError || err.name === "AuthenticationError" || err.name === "PermissionDeniedError") return "refused";
  if (e instanceof ConnectionError || e instanceof TimeoutError || e instanceof ServerError || e instanceof RateLimitError || e instanceof APIConnectionError) return "unreachable";
  if (typeof err.name === "string" && OUTAGE_NAMES.has(err.name)) return "unreachable";
  if (status === 429 || (status !== undefined && status >= 500 && status <= 599)) return "unreachable";
  if (e instanceof Error && err.message === MEMORY_TIMEOUT) return "unreachable";
  // fetch failed at the network: a TypeError whose cause is the socket's or DNS's own error.
  if (e instanceof TypeError && networkCause(err.cause)) return "unreachable";
  return "error";
}

/** The server log's line for a failed memory read: labelled by outcome, long tokens redacted, at most 200 characters. */
export function memoryLogLine(kind: MemoryFailure, e: unknown): string {
  const err = (e ?? {}) as Err;
  const cause = networkCause(err.cause) ? ` (${String((err.cause as Err).code)})` : "";
  const what = `${typeof err.name === "string" ? err.name : "Error"}: ${String(err.message ?? "")}${cause}`;
  return `[memory] ${kind}: ${what.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")}`.slice(0, 200);
}

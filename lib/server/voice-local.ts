import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { checkVoiceAddress } from "@/lib/voice-address";

/**
 * Voice (local): speech to text through the owner's own Whisper service instead of OpenAI, so the mic
 * works with no OpenAI key (module "voice-local", config/modules.cjs: its settings become VOICE_LOCAL_*
 * env vars). With a loopback address (127.0.0.1, localhost) the recording never leaves this machine; any
 * other host gets it, and Settings warns about that (lib/voice-address.ts). The service is any that speaks
 * OpenAI's /v1/audio/transcriptions: Speaches (recipe config/repos/speaches.yaml), faster-whisper-server,
 * or whisper.cpp's server started with `--inference-path /v1/audio/transcriptions` (its own default route
 * is /inference). Spoken replies on calls stay with AgentPhone's voice agent: it speaks, Bops only writes
 * the words (phone-voice.ts), so there is no OpenAI TTS here to replace.
 */

/**
 * Whether config/bops.yaml turns the module off. Read here, not only by apply(), because the module has no
 * key for apply() to clear: an address in .env.local or the environment would otherwise keep it on.
 */
function moduleOff(): boolean {
  try {
    const config = parse(readFileSync(join(process.cwd(), "config", "bops.yaml"), "utf8")) as Record<string, { enabled?: unknown } | undefined> | null;
    return config?.["voice-local"]?.enabled === false;
  } catch {
    return false;
  }
}

/** On: the module isn't switched off and has a service address, so the mic runs locally. */
export const voiceLocalOn = () => !!process.env.VOICE_LOCAL_BASE_URL?.trim() && !moduleOff();

/** What the owner chose for a service that doesn't answer: an error (the default, so nothing goes elsewhere unasked), or OpenAI. */
export const voiceLocalFallback = (): "openai" | "error" => (process.env.VOICE_LOCAL_FALLBACK?.trim().toLowerCase() === "openai" ? "openai" : "error");

/** Longest the mic waits on the local service: a recording is at most five minutes (transcribe.ts). */
const TIMEOUT_MS = 120_000;
/** Most of an answer read: a transcription of five minutes is a few KB. */
export const MAX_ANSWER = 1024 * 1024;

/** Connection errors that mean nobody answered (Node's fetch puts them on the cause). */
const DOWN = new Set(["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);

/**
 * The local service's own failure. `down` is only for a service that didn't answer at all (connection
 * refused, no route, timed out): the one case transcribe.ts may hand the recording to OpenAI. A service
 * that answered, even badly (4xx/5xx, a redirect, bad JSON, no text), is never `down`.
 */
export class VoiceLocalError extends Error {
  down: boolean;
  constructor(message: string, down = false) {
    super(message);
    this.down = down;
  }
}

/** The body as text, at most `max` bytes (more is an error, not a cut-off answer). */
async function readCapped(res: Response, max: number): Promise<string> {
  if (Number(res.headers.get("content-length") ?? 0) > max) throw new VoiceLocalError("Your Voice (local) service sent back too much.");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new VoiceLocalError("Your Voice (local) service sent back too much.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** The service's own short words for a refusal: OpenAI-style {error:{message}}, FastAPI's {detail}, or the plain text. */
function theirWords(text: string): string {
  let words = text;
  try {
    const j = JSON.parse(text) as { error?: { message?: unknown } | string; detail?: unknown; message?: unknown };
    const w = j && typeof j.error === "object" ? j.error?.message : (j?.error ?? j?.detail ?? j?.message);
    if (w !== undefined) words = typeof w === "string" ? w : JSON.stringify(w);
  } catch {}
  words = words.replace(/\s+/g, " ").trim();
  return words.length > 200 ? `${words.slice(0, 199)}…` : words;
}

/** A local transcription, or a VoiceLocalError with the service's own words when it refused. */
export async function localTranscribe(audio: Blob): Promise<string> {
  const raw = process.env.VOICE_LOCAL_BASE_URL?.trim() ?? "";
  if (!raw) throw new VoiceLocalError("Voice (local) is off.");
  const checked = checkVoiceAddress(raw);
  if (!checked.ok) throw new VoiceLocalError(checked.error);
  const base = raw.replace(/\/+$/, "");
  const model = process.env.VOICE_LOCAL_STT_MODEL?.trim() || "whisper-1";
  const ext = /mp4|m4a|aac/.test(audio.type) ? "m4a" : /ogg/.test(audio.type) ? "ogg" : /wav/.test(audio.type) ? "wav" : "webm";
  const form = new FormData();
  form.set("file", audio, `recording.${ext}`);
  form.set("model", model);
  let res: Response;
  try {
    // redirect "error": a redirect would carry the recording to wherever it points (another host).
    res = await fetch(`${base}/audio/transcriptions`, { method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const err = e as Error & { code?: string; cause?: { code?: string; message?: string } };
    if (err.name === "TimeoutError") throw new VoiceLocalError("Your Voice (local) service didn't answer in time.", true);
    const code = err.cause?.code ?? err.code;
    if (code && DOWN.has(code)) throw new VoiceLocalError(`Your Voice (local) service isn't reachable (${code}).`, true);
    if (/redirect/i.test(`${err.message} ${err.cause?.message ?? ""}`))
      throw new VoiceLocalError("Your Voice (local) service answered with a redirect, which Bops doesn't follow (it would send the recording elsewhere). Use the address it redirects to.");
    throw new VoiceLocalError(`Your Voice (local) service broke off (${code ?? err.cause?.message ?? err.message}).`);
  }
  // Read inside the timeout (the signal covers the body too), at most MAX_ANSWER.
  let text: string;
  try {
    text = await readCapped(res, MAX_ANSWER);
  } catch (e) {
    if (e instanceof VoiceLocalError) throw e;
    throw new VoiceLocalError((e as Error).name === "TimeoutError" ? "Your Voice (local) service didn't finish answering in time." : "Your Voice (local) service's answer broke off.");
  }
  if (!res.ok) {
    const words = theirWords(text);
    throw new VoiceLocalError(`Your Voice (local) service refused (${res.status})${words ? `: ${words}` : ""}`);
  }
  let body: { text?: unknown } | null = null;
  try {
    body = JSON.parse(text) as { text?: unknown } | null;
  } catch {}
  if (typeof body?.text !== "string") throw new VoiceLocalError("Your Voice (local) service sent no text back.");
  // Empty text is a silent recording, not a failure: the mic says it caught no words.
  return body.text.trim();
}

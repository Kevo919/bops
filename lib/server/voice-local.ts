import "server-only";

/**
 * Voice (local): speech to text through the owner's own Whisper service instead of OpenAI, so the mic
 * works with no OpenAI key and nothing leaves this machine (module "voice-local", config/modules.cjs:
 * its settings become VOICE_LOCAL_* env vars). The service is any that speaks OpenAI's
 * /v1/audio/transcriptions — whisper.cpp's server (ggml-org/whisper.cpp) or faster-whisper-server
 * (SYSTRAN/faster-whisper under the hood) are the documented ones. Spoken replies on calls stay with
 * AgentPhone's voice agent: it speaks, Bops only writes the words (phone-voice.ts), so there is no
 * OpenAI TTS here to replace.
 */

/** Set up (the module's service address), so the mic can run locally. Empty when off or unset. */
export const voiceLocalOn = () => !!process.env.VOICE_LOCAL_BASE_URL?.trim();

/** Longest the mic waits on the local service: a recording is at most five minutes (transcribe.ts). */
const TIMEOUT_MS = 120_000;

/** A local transcription, or a VoiceLocalError with the service's own words when it refused. */
export async function localTranscribe(audio: Blob): Promise<string> {
  const base = process.env.VOICE_LOCAL_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new VoiceLocalError("Voice (local) is off.");
  const model = process.env.VOICE_LOCAL_STT_MODEL?.trim() || "whisper-1";
  const ext = /mp4|m4a|aac/.test(audio.type) ? "m4a" : /ogg/.test(audio.type) ? "ogg" : /wav/.test(audio.type) ? "wav" : "webm";
  const form = new FormData();
  form.set("file", audio, `recording.${ext}`);
  form.set("model", model);
  let res: Response;
  try {
    res = await fetch(`${base}/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new VoiceLocalError(e instanceof Error && e.name === "TimeoutError" ? "Your Voice (local) service didn't answer in time." : `Your Voice (local) service isn't reachable (${e instanceof Error ? e.message : "unknown error"}).`);
  }
  if (!res.ok) throw new VoiceLocalError(`Your Voice (local) service refused: ${res.status}`);
  const body = (await res.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof body?.text !== "string") throw new VoiceLocalError("Your Voice (local) service sent no text back.");
  return body.text.trim();
}

/** The local service's own failure, so transcribe.ts can say so plainly instead of blaming OpenAI. */
export class VoiceLocalError extends Error {}

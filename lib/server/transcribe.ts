import "server-only";
import OpenAI, { toFile } from "openai";
import { cloudProxy } from "./cloud";
import { openaiClient } from "./openai-client";
import { getState } from "./store";
import { usageTags } from "./usage";
import { localTranscribe, VoiceLocalError, voiceLocalFallback, voiceLocalOn } from "./voice-local";

/**
 * The chat's mic: what the user said, as text for the composer (they read it, then send it). One
 * gpt-transcribe call per recording, told the names it may hear (the user's, their bots') so they're
 * spelled right. Through Bops Cloud its seconds are counted for the bot the chat is with.
 *
 * With the Voice (local) module on (voice-local.ts), the recording goes to the owner's own Whisper
 * service and nowhere else. Only when that service doesn't answer at all (connection refused, no route,
 * timed out) and the module's "If your service is down" setting says OpenAI does it go to OpenAI, and the
 * answer says so (`note`, which the mic shows). A service that answered, even with an error, bad JSON or
 * no text, is never a reason to send the recording elsewhere: its own words are the error. The fallback
 * uses the owner's own OPENAI_API_KEY directly (at OPENAI_BASE_URL when set), never Bops Cloud's
 * /proxy/openai, unless Bops Cloud is this Bops' only way to OpenAI (signed in with Orgo, no key).
 */

const client = openaiClient();
const MODEL = "gpt-transcribe";
/**
 * OpenAI takes up to 25 MB, but Next passes on only the first 10 MB of a request (proxyClientMaxBodySize).
 * Five minutes of speech (the mic's longest) is about 2 MB.
 */
export const MAX_RECORDING = 9 * 1024 * 1024;

/** What the mic gets: the words, and a short note when they didn't come the way the owner set up. */
export type Transcription = { text: string; note?: string };

/** The fallback's OpenAI: the owner's own key, called directly (null when there's none). */
function ownOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? new OpenAI({ apiKey }) : null;
}

export async function transcribe(audio: Blob, botId?: string): Promise<Transcription> {
  // Local first: the owner pointed the mic at their own service on purpose.
  if (voiceLocalOn()) {
    try {
      return { text: await localTranscribe(audio) };
    } catch (e) {
      if (!(e instanceof VoiceLocalError) || !e.down) throw e;
      if (voiceLocalFallback() !== "openai") throw new VoiceLocalError(`${e.message} Voice (local) is set to show an error when it's down (Settings, Modules).`);
      const own = ownOpenAI();
      if (own) return { text: await openaiTranscribe(own, audio, botId, false), note: "Your local voice service didn't answer, so this used OpenAI." };
      if (cloudProxy("openai")) return { text: await openaiTranscribe(client, audio, botId, true), note: "Your local voice service didn't answer, so this used OpenAI (through Bops Cloud)." };
      throw e;
    }
  }
  return { text: await openaiTranscribe(client, audio, botId, true) };
}

async function openaiTranscribe(openai: OpenAI, audio: Blob, botId: string | undefined, tagged: boolean): Promise<string> {
  const names = [getState().owner?.name.trim(), ...getState().bots.map((b) => b.name)].filter(Boolean);
  const ext = /mp4|m4a|aac/.test(audio.type) ? "m4a" : /ogg/.test(audio.type) ? "ogg" : /wav/.test(audio.type) ? "wav" : "webm";
  const file = await toFile(audio, `recording.${ext}`, { type: audio.type || "audio/webm" });
  const r = await openai.audio.transcriptions.create(
    { model: MODEL, file, prompt: `A message typed into Bops, a chat app with AI bots. Names that may come up: ${[...new Set(names)].join(", ")}.` },
    tagged ? usageTags("chat", botId) : {},
  );
  return r.text.trim();
}

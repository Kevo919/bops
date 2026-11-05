import OpenAI, { type ClientOptions } from "openai";
import { APP_VERSION_HEADER, BOPS_STATE_LEVEL_HEADER, STATE_LEVEL, TELEMETRY_HEADER } from "@/cloud/protocol";
import { appVersion, telemetryHere } from "./app-version";
import { cloudProxy } from "./cloud";

/**
 * An OpenAI client that finds its key when it makes a call, not when its module loads. Signed in
 * with Orgo, calls go through Bops Cloud (lib/server/cloud.ts) on the user's Orgo key. The base URL
 * is read per call too, so a sign-in or sign-out applies at once, and the live call sideband
 * (phone.ts), which builds its WebSocket address from the client's, goes through the cloud as well.
 * Self-hosting, it's OPENAI_API_KEY: the Mac app ships with no keys, and a client made with
 * `new OpenAI()` throws on import without one, which takes down every route that imports it.
 */
export function openaiClient(opts: Omit<ClientOptions, "apiKey" | "defaultHeaders"> = {}) {
  const client = new OpenAI({
    ...opts,
    // Which app is calling, and which state it may be given (an older app's calls are refused once a
    // newer one wrote the user's state: cloud/state.ts behindState), said to Bops Cloud only: read at
    // each call (and each sideband socket), and left out (null) when the app calls OpenAI directly.
    defaultHeaders: {
      get [APP_VERSION_HEADER]() {
        return cloudProxy("openai") ? (appVersion() ?? null) : null;
      },
      get [BOPS_STATE_LEVEL_HEADER]() {
        return cloudProxy("openai") ? String(STATE_LEVEL) : null;
      },
      get [TELEMETRY_HEADER]() {
        return cloudProxy("openai") && !telemetryHere() ? "off" : null;
      },
    },
    apiKey: async () => {
      const via = cloudProxy("openai");
      if (via) return via.key;
      const key = process.env.OPENAI_API_KEY;
      // Said plainly, because Logins can show an OpenAI key that does NOT power the chat: the chat's
      // models read this computer's environment alone (a key saved in Logins is the Orgo vault's, for
      // bots' API calls). On the Windows app that means the .env.local next to the app, then a restart.
      if (!key)
        throw new OpenAI.OpenAIError(
          process.env.BOPS_SELF_HOSTED === "1"
            ? "No key for the chat's models: the chat reads OPENAI_API_KEY from this computer's environment - on the Windows app, the .env.local file next to the app (like C:\\Users\\<you>\\bops\\.env.local), then restart Bops. An OpenAI key saved in Logins is the vault's, for bots' API calls; it doesn't power the chat."
            : "Sign in with Orgo first.",
        );
      return key;
    },
  });
  let direct = client.baseURL;
  Object.defineProperty(client, "baseURL", {
    get: () => {
      const via = cloudProxy("openai");
      return via ? `${via.url}/v1` : direct;
    },
    set: (url: string) => void (direct = url),
    configurable: true,
  });
  return client;
}

import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import type { NextConfig } from "next";

// Bops' modules (config/modules.cjs): config/bops.yaml goes into this server's settings first, so every
// module (AI models, computers, memory, apps, email, phoneâ€¦) is switched and swapped there.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const applied = (require("./config/modules.cjs") as { apply: (root: string) => string[] }).apply(process.cwd());
if (applied.length) console.log(`[modules] from config/bops.yaml: ${applied.join(", ")}`);

// This app's version, built in: the server tells Bops Cloud which app is calling (lib/server/app-version.ts).
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };

// The development server answers pages to this computer's own addresses too (a paired phone reaches it over
// Tailscale or the home wifi, lib/server/remote.ts): Next blocks its dev files to other origins otherwise.
const ownAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => !!a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  env: { BOPS_APP_VERSION: version },
  allowedDevOrigins: ownAddresses,
  // A second app from this folder at once (the local two-person stack, scripts/dev-two-person.mjs) builds into a
  // folder of its own, as next dev locks its own. Unset, as everywhere else, it's Next's .next.
  ...(process.env.BOPS_NEXT_DIST_DIR ? { distDir: process.env.BOPS_NEXT_DIST_DIR } : {}),
  // The desktop app is the product; Next's floating dev badge sat on top of the sidebar footer.
  devIndicators: false,
  // Loaded by Node, not bundled: the AgentMail SDK lazily imports optional payment packages
  // (@x402/fetch, mppx) that aren't installed, which the bundler can't resolve.
  // @napi-rs/keyring is a native module (Windows Credential Manager, lib/server/secret-file.ts): loaded by Node too.
  serverExternalPackages: ["agentmail", "@napi-rs/keyring"],
  // The Mac app ships this server prebuilt (.next/standalone, started by desktop/main.cjs).
  output: "standalone",
  // Images are served as they are: resizing them on a local server isn't worth shipping sharp and
  // libvips (about 18 MB) in the app. next/image still renders, with the original file.
  images: { unoptimized: true },
  // The page cache stays in memory. The Mac app runs this server from inside its signed bundle, and
  // with the default (true) Next writes rendered pages to .next/server/route-cache there: one added
  // file breaks the app's seal, and macOS then calls Bops "damaged" and offers to move it to the Trash.
  experimental: { isrFlushToDisk: false },
  // Files the server reads or runs by path at runtime, which the build's tracing can't see:
  // the scripts it copies onto bots' computers (vm/), the browser tools it hands Codex
  // (lib/server/local.ts, sessions.ts), the page recorder it injects (lib/server/mirror.ts) and
  // AgentMail, which is loaded by Node at runtime (serverExternalPackages) with its one dependency.
  outputFileTracingIncludes: {
    "/*": [
      "./vm/**/*",
      "./node_modules/agentmail/**/*",
      "./node_modules/ws/**/*",
      "./node_modules/@playwright/mcp/**/*",
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*",
      "./node_modules/@rrweb/record/dist/record.umd.min.cjs",
    ],
  },
  // Reading .data/ and vm/ through process.cwd() makes the tracer take the whole project. Only
  // the built server, node_modules and the files above ship: never source, docs, the encrypted
  // envs/, local state or the desktop build itself.
  outputFileTracingExcludes: {
    "/*": [
      "./.data/**",
      "./.env*",
      "./app/**",
      "./assets/**",
      "./build/**",
      "./components/**",
      "./db/**",
      "./desktop/**",
      "./dist-desktop/**",
      "./android/**",
      "./docs/**",
      "./edge/**",
      "./envs/**",
      "./lib/**",
      "./orgo/**",
      "./scripts/**",
      "./site/**",
      "./types/**",
      "./vendor/**",
      "./node_modules/app-builder-lib/**",
      // Only next/image's optimizer loads these, and images are unoptimized (above).
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
      "./*.md",
      "./*.ts",
      "./*.mjs",
      "./components.json",
      "./package-lock.json",
      "./tsconfig.json",
    ],
    // The server's own trace (next-server, not a route's) is where next/image's optimizer pulls them in.
    "next-server": ["./node_modules/sharp/**", "./node_modules/@img/**"],
  },
};

export default nextConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // vm/*.cjs run as plain CommonJS under Node (or Bops.exe with ELECTRON_RUN_AS_NODE), outside the bundler:
  // require() is how they load node: builtins, so the TypeScript rule against it doesn't apply to them.
  {
    files: ["vm/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Electron shell is plain CommonJS, and so are the test harnesses that run its page reader and its apps' fence.
    "desktop/**",
    "scripts/render-harness.cjs",
    // CommonJS by design (desktop/main.cjs and next.config.ts load them): the module catalog and its example writer.
    "config/**/*.cjs",
    "scripts/modules-example.cjs",
    "scripts/test-app-frames.electron.cjs",
    // Release output (the built app) and the downloaded relay agent (scripts/release.sh).
    "dist-desktop/**",
    "vendor/**",
    // React and Tailwind, prebuilt for apps bots make (scripts/build-made-app-runtime.sh).
    "public/made-apps/**",
  ]),
]);

export default eslintConfig;

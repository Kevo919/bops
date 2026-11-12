// BG-09: reusing a bot's running Chrome only when it is provably that bot's own (lib/server/chrome-start.ts
// sameBrowser, used by local.ts ensureChrome). Its profile's DevToolsActivePort names a port and a browser id; the
// browser answering on that port must give the same id in /json/version. A file left from a Chrome that has gone,
// with another program now holding the port, must never be taken as the bot's. Plain Node, no fake Chrome
// executable, a real local HTTP server for the reused-port case: runs the same on Windows, Mac and Linux.
// Usage: node scripts/test-chrome-identity.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activeBrowserPath, sameBrowser } from "../lib/server/chrome-start.ts";

const tmp = mkdtempSync(join(tmpdir(), "bops-chrome-identity-"));
let n = 0;
const profile = (lines) => {
  const p = join(tmp, `p${n++}`);
  mkdirSync(p);
  if (lines !== null) writeFileSync(join(p, "DevToolsActivePort"), lines);
  return p;
};
const ID_A = "/devtools/browser/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ID_B = "/devtools/browser/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const answer = (port, path) => async () => ({ Browser: "Chrome/131", webSocketDebuggerUrl: `ws://127.0.0.1:${port}${path}` });
let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};

try {
  await check("the browser id is read from the profile's file, and only in Chrome's shape", () => {
    assert.equal(activeBrowserPath(profile(`9333\n${ID_A}\n`)), ID_A);
    assert.equal(activeBrowserPath(profile(`9333\r\n${ID_A}\r\n`)), ID_A, "Windows line endings");
    assert.equal(activeBrowserPath(profile("9333\n")), null, "no second line");
    assert.equal(activeBrowserPath(profile("9333\n/somewhere/else\n")), null, "not a browser id");
    assert.equal(activeBrowserPath(profile(null)), null, "no file");
  });

  await check("the same browser on the named port is reused", async () => {
    assert.equal(await sameBrowser(profile(`9333\n${ID_A}\n`), 9333, answer(9333, ID_A)), true);
  });

  await check("a stale file with another browser on that port is NOT taken as the bot's", async () => {
    assert.equal(await sameBrowser(profile(`9333\n${ID_A}\n`), 9333, answer(9333, ID_B)), false);
  });

  await check("no proof means no reuse: no file, no id line, wrong port, no answer, odd answers", async () => {
    assert.equal(await sameBrowser(profile(null), 9333, answer(9333, ID_A)), false, "no file");
    assert.equal(await sameBrowser(profile("9333\n"), 9333, answer(9333, ID_A)), false, "no id line");
    assert.equal(await sameBrowser(profile(`9444\n${ID_A}\n`), 9333, answer(9333, ID_A)), false, "the profile names another port");
    assert.equal(await sameBrowser(profile(`9333\n${ID_A}\n`), 9333, async () => { throw new Error("refused"); }), false, "nothing answers");
    for (const odd of [null, {}, { webSocketDebuggerUrl: 7 }, { webSocketDebuggerUrl: "not a url" }])
      assert.equal(await sameBrowser(profile(`9333\n${ID_A}\n`), 9333, async () => odd), false, `answer ${JSON.stringify(odd)}`);
    assert.equal(await sameBrowser(profile(`9333\n${ID_A}\n`), 9333, answer(9555, ID_A)), false, "the answer names another port");
    for (const url of [`wss://127.0.0.1:9333${ID_A}`, `http://127.0.0.1:9333${ID_A}`, `ws://192.168.1.20:9333${ID_A}`, `ws://example.com:9333${ID_A}`])
      assert.equal(await sameBrowser(profile(`9333\n${ID_A}\n`), 9333, async () => ({ webSocketDebuggerUrl: url })), false, `not Chrome's local shape: ${url}`);
    assert.equal(await sameBrowser(profile(`9333\n${ID_A}\n`), 9333, async () => ({ webSocketDebuggerUrl: `ws://localhost:9333${ID_A}` })), true, "localhost is this machine");
  });

  await check("reused port, for real: a local server holding the port, answering with another browser's id", async () => {
    const server = createServer((req, res) => {
      if (req.url !== "/json/version") return res.writeHead(404).end();
      const port = server.address().port;
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ Browser: "Chrome/131", webSocketDebuggerUrl: `ws://127.0.0.1:${port}${ID_B}` }));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    try {
      // The bot's profile still names this port and its old browser id (that Chrome has gone).
      assert.equal(await sameBrowser(profile(`${port}\n${ID_A}\n`), port), false, "another browser's id: not reused");
      // The same server is taken only when the profile names its id.
      assert.equal(await sameBrowser(profile(`${port}\n${ID_B}\n`), port), true, "its own id: reused");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  console.log(`chrome identity: ${passed} passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

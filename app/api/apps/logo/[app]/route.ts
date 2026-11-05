import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * An app's real logo, from Composio's logo service, kept on disk after the first fetch so the Vault
 * and the app picker draw instantly (and offline). Only app slugs: letters, digits, _ and -.
 * An app with no logo there (or the service down) is remembered for ten minutes, and its 404 is
 * cacheable, so an offline run doesn't ask — and log a console error — once per render (crawl L10);
 * the UI's own fallback (an initial on a tile) covers what the 404 means.
 */
const DIR = `${process.cwd()}/.data/logos`;
const MISS_MS = 10 * 60_000;
const g = globalThis as unknown as { bopsLogoMiss?: Map<string, number> };
const missed = (app: string) => (g.bopsLogoMiss ??= new Map()).get(app) ?? 0;
const noteMiss = (app: string) => (g.bopsLogoMiss ??= new Map()).set(app, Date.now());

export async function GET(_request: Request, ctx: { params: Promise<{ app: string }> }) {
  const { app } = await ctx.params;
  if (!/^[a-z0-9_-]{1,64}$/i.test(app)) return new Response("not found", { status: 404 });
  const file = `${DIR}/${app}`;
  const headers = (type: string, cache = "public, max-age=604800") => ({ "Content-Type": type, "Cache-Control": cache });
  if (existsSync(file) && existsSync(`${file}.type`)) return new Response(readFileSync(file), { headers: headers(readFileSync(`${file}.type`, "utf8")) });
  if (Date.now() - missed(app) < MISS_MS) return new Response("not found", { status: 404, headers: headers("text/plain", "public, max-age=600") });
  const res = await fetch(`https://logos.composio.dev/api/${app}`).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !/^image\//.test(type)) {
    noteMiss(app);
    return new Response("not found", { status: 404, headers: headers("text/plain", "public, max-age=600") });
  }
  const body = Buffer.from(await res.arrayBuffer());
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file, body);
  writeFileSync(`${file}.type`, type);
  return new Response(body, { headers: headers(type) });
}

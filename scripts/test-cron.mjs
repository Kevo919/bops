// Tests for cron schedules ({ kind: "cron", expr } in lib/types.ts): the parser and the math in
// cloud/schedule.ts (fields, steps, ranges, lists, month and day names, the @ shortcuts, what's wrong
// with a bad one in plain words, the 15 minute least gap across the day and across midnight, how one
// reads in plain words with no dashes, how many runs a day), next runs in America/Chicago across both
// clock changes of 2026 (the 2 AM that doesn't happen on March 8th, the 1 AM that happens twice on
// November 1st, a 9 AM that moves an hour in UTC, every 15 minutes keeping its beat through both), the
// day of the month or the day of the week when both are given, months, and an expression that never
// comes due. Then the picker (components/app/cadence-picker.tsx) rendered into a DOM (linkedom): Custom
// (a cron expression) in How often, the text box, the line that reads it back with its next run, and the
// error shown in its place as a bad one is typed.
//
// This process is in Kolkata, so a right answer in Chicago can't come from the process's own zone.
// Nothing reaches a server. The .tsx files are compiled with the TypeScript in node_modules as they load.
// Usage: node scripts/test-cron.mjs   (not with --conditions=react-server: the picker is a client component)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

process.env.TZ = "Asia/Kolkata";
const rootPath = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const rootUrl = pathToFileURL(rootPath).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = `${rootUrl}/${specifier.slice(2)}`;
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(\.{1,2}\/|\/|file:)/.test(specifier))
        for (const ext of [".ts", ".tsx"])
          try {
            return next(specifier + ext, context);
          } catch {}
      throw e;
    }
  },
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    if (!url.endsWith(".tsx")) return next(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: url });
    return { format: "module", source: out.outputText, shortCircuit: true };
  },
});
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => (rest[0]?.code === "MODULE_TYPELESS_PACKAGE_JSON" ? undefined : emitWarning(warning, ...rest));

let passed = 0;
let failed = 0;
async function check(name, f) {
  try {
    await f();
    passed++;
    console.log(`ok ${passed} - ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n  ${e.message.split("\n").join("\n  ")}`);
  }
}
const Z = (iso) => Date.parse(iso);
const iso = (ms) => (ms === undefined ? "undefined" : new Date(ms).toISOString());
const eq = (got, want, what) => assert.equal(iso(got), iso(want), what);
const DASHES = /[‒–—―]| - /;
const noDashes = (text, where) => assert.ok(!DASHES.test(text), `a dash in ${where}: ${text}`);
const CH = "America/Chicago";
const MIN = 60_000;

const S = await import(`${rootUrl}/cloud/schedule.ts`);
const cron = (expr) => ({ kind: "cron", expr });
/** The next run of an expression after `from` in Chicago, through normalizeSchedule like a routine's. */
const next = (expr, from, tz = CH) => {
  const n = S.normalizeSchedule(cron(expr));
  assert.ok(!("error" in n), `${expr} reads: ${n.error}`);
  return S.nextRun(n.schedule, from, tz);
};
/** The next `count` runs, one after the other. */
const runs = (expr, from, count, tz = CH) => {
  const out = [];
  let t = from;
  for (let i = 0; i < count; i++) {
    t = next(expr, t, tz);
    if (t === undefined) break;
    out.push(t);
  }
  return out;
};
const error = (expr) => {
  const n = S.normalizeSchedule(cron(expr));
  assert.ok("error" in n, `${expr} was refused`);
  noDashes(n.error, `the error for ${expr}`);
  return n.error;
};

/* ---------------- Reading one ---------------- */

await check("parseCron: fields, steps, ranges, lists, names, Sunday as 7, the @ shortcuts", () => {
  const spec = (expr) => {
    const p = S.parseCron(expr);
    assert.ok(!("error" in p), `${expr}: ${p.error}`);
    return p.spec;
  };
  assert.deepEqual(spec("0 9 * * 1-5").minutes, [0]);
  assert.deepEqual(spec("0 9 * * 1-5").hours, [9]);
  assert.deepEqual(spec("0 9 * * 1-5").dows, [1, 2, 3, 4, 5]);
  assert.deepEqual(spec("*/15 * * * *").minutes, [0, 15, 30, 45]);
  assert.deepEqual(spec("0-59/20 * * * *").minutes, [0, 20, 40]);
  assert.deepEqual(spec("30 9-17/2 * * *").hours, [9, 11, 13, 15, 17]);
  assert.deepEqual(spec("0 5/6 * * *").hours, [5, 11, 17, 23], "a number with a step runs from it to the top, as cron does");
  assert.deepEqual(spec("0 9,17 * * *").hours, [9, 17]);
  assert.deepEqual(spec("0 9 1,15 * *").doms, [1, 15]);
  assert.deepEqual(spec("0 9 * jan,jul *").months, [1, 7]);
  assert.deepEqual(spec("0 9 * JAN-MAR *").months, [1, 2, 3]);
  assert.deepEqual(spec("0 9 * * mon,wed,fri").dows, [1, 3, 5]);
  assert.deepEqual(spec("0 9 * * Mon-Fri").dows, [1, 2, 3, 4, 5]);
  assert.deepEqual(spec("0 9 * * 7").dows, [0], "7 is Sunday too");
  assert.deepEqual(spec("0 9 * * 5-7").dows, [0, 5, 6]);
  assert.deepEqual(spec("0 9 * * 1,1,2").dows, [1, 2], "each once");
  assert.deepEqual(spec("  0   9 *  * 1-5 ").hours, [9], "extra spaces read");
  assert.deepEqual(spec("@hourly").hours.length, 24);
  assert.deepEqual(spec("@daily").hours, [0]);
  assert.deepEqual(spec("@midnight").hours, [0]);
  assert.deepEqual(spec("@weekly").dows, [0]);
  assert.deepEqual(spec("@monthly").doms, [1]);
  assert.deepEqual(spec("@yearly").months, [1]);
  assert.deepEqual(spec("@annually").months, [1]);
  const s = spec("0 9 1 * mon");
  assert.equal(s.anyDom, false);
  assert.equal(s.anyDow, false);
  assert.equal(spec("0 */2 * * *").anyHour, true);
  assert.equal(spec("0 0-23 * * *").anyHour, false, "a range isn't a star, as cron tells them apart");
});

await check("parseCron: what's wrong, in plain words", () => {
  assert.match(error(""), /needs a cron expression/);
  assert.match(error("0 9 * *"), /5 parts/);
  assert.match(error("0 9 * * * *"), /5 parts/);
  assert.match(error("60 9 * * *"), /"60" isn't a minute \(0 to 59\)/);
  assert.match(error("0 24 * * *"), /"24" isn't an? hour \(0 to 23\)/);
  assert.match(error("0 9 0 * *"), /"0" isn't a day of the month \(1 to 31\)/);
  assert.match(error("0 9 32 * *"), /"32" isn't a day of the month/);
  assert.match(error("0 9 * 13 *"), /"13" isn't a month \(1 to 12, or jan to dec\)/);
  assert.match(error("0 9 * * 8"), /"8" isn't a day of the week \(0 to 7, or sun to sat\)/);
  assert.match(error("0 9 * * monday"), /"monday" isn't a day of the week/);
  assert.match(error("0 9 * * mon-"), /"mon-" isn't a day of the week/);
  assert.match(error("0 17-9 * * *"), /"17-9" runs backwards/);
  assert.match(error("*/0 * * * *"), /"\/0" isn't a step/);
  assert.match(error("0 9 * * 1-5 extra"), /5 parts/);
  assert.match(error("0 9 * * ?"), /"\?" isn't a day of the week/);
  assert.match(error("0 9 * * 1--5"), /isn't a day of the week/);
  assert.match(error("@never"), /5 parts/);
  // Object's own members aren't shortcuts.
  assert.match(error("__proto__"), /5 parts/);
  assert.match(error("constructor"), /5 parts/);
  assert.match(error("toString"), /5 parts/);
  assert.match(error("__proto__ 9 * * *"), /isn't a minute/);
  assert.match(error("0 9 L * *"), /"L" isn't a day of the month/);
  const n = S.normalizeSchedule({ kind: "cron", expr: 42 });
  assert.ok("error" in n);
  assert.ok("error" in S.normalizeSchedule({ kind: "cron" }));
});

await check("the least gap: 15 minutes, across the day and across midnight when two days can run back to back", () => {
  assert.match(error("* * * * *"), /every minute\. The shortest gap is 15 minutes/);
  assert.match(error("*/10 * * * *"), /10 minutes apart\. The shortest gap is 15 minutes/);
  assert.match(error("*/14 * * * *"), /4 minutes apart/, "56 past, then the top of the next hour");
  assert.match(error("0,10 * * * *"), /10 minutes apart/);
  assert.match(error("1-5 9 * * *"), /every minute/);
  assert.match(error("0,59 0,23 * * *"), /1 minute apart|every minute/);
  // 11:55 PM then 12:05 AM the next day.
  assert.match(error("5,55 0,23 * * *"), /10 minutes apart/);
  assert.match(error("5,55 0,23 * * 1,2"), /10 minutes apart/, "Monday night into Tuesday morning");
  assert.match(error("5,55 0,23 * * sat,sun"), /10 minutes apart/, "Saturday into Sunday");
  assert.match(error("5,55 0,23 * * 0,6"), /10 minutes apart/, "Saturday into Sunday, the other way round");
  assert.match(error("5,55 0,23 1,31 * *"), /10 minutes apart/, "the 31st into the 1st");
  assert.match(error("5,55 0,23 * jan *"), /10 minutes apart/, "every day of a month");
  assert.match(error("5,55 0,23 15 * 1"), /10 minutes apart/, "the 15th and a Monday can be two days running");
  for (const ok of ["*/15 * * * *", "*/20 * * * *", "0,15,30,45 * * * *", "0-59/15 * * * *", "0 * * * *", "0 */1 * * *", "5,55 0,23 * * 1", "5,55 0,23 * * 1,3,5", "5,55 0,23 15 * *", "59 23 * * *", "0 0 * * *", "45 23,0 * * *", "0 9,17 * * *"]) {
    const n = S.normalizeSchedule(cron(ok));
    assert.ok(!("error" in n), `${ok} reads: ${n.error}`);
  }
  // Only two runs a day, 23 hours and 10 minutes apart one way and 50 minutes the other: fine.
  assert.ok(!("error" in S.normalizeSchedule(cron("5 0 * * *"))));
  assert.ok(!("error" in S.normalizeSchedule(cron("50 23 * * *"))));
});

await check("normalizeSchedule keeps the expression as typed, spaces tidied", () => {
  const n = S.normalizeSchedule({ kind: "cron", expr: "  0  9 * * 1-5\t" });
  assert.deepEqual(n, { schedule: { kind: "cron", expr: "0 9 * * 1-5" } });
  assert.deepEqual(S.normalizeSchedule(cron("@daily")), { schedule: { kind: "cron", expr: "@daily" } });
  assert.ok(S.SCHEDULE_KINDS.includes("cron"));
});

await check("describeSchedule: plain words, no dashes", () => {
  const cases = [
    ["0 9 * * 1-5", "Weekdays at 9 AM"],
    ["0 9 * * mon-fri", "Weekdays at 9 AM"],
    ["0 9 * * *", "Every day at 9 AM"],
    ["30 8 * * *", "Every day at 8:30 AM"],
    ["0 9,17 * * *", "Every day at 9 AM and 5 PM"],
    ["0 8,12,17 * * 1-5", "Weekdays at 8 AM, 12 PM and 5 PM"],
    ["0 9 * * 1", "Mondays at 9 AM"],
    ["0 9 * * 1,3,5", "Mon, Wed and Fri at 9 AM"],
    ["0 9 * * 0,6", "Weekends at 9 AM"],
    ["0 9 * * 7", "Sundays at 9 AM"],
    ["*/15 * * * *", "Every 15 minutes"],
    ["*/30 * * * 1-5", "Every 30 minutes, weekdays"],
    ["*/15 9-17 * * 1-5", "Every 15 minutes, 9 AM to 5:45 PM, weekdays"],
    ["*/30 9,13 * * *", "Every 30 minutes, 9 AM and 1 PM"],
    ["0 * * * *", "Every hour"],
    ["@hourly", "Every hour"],
    ["30 * * * *", "Every hour at 30 past"],
    ["15,45 * * * *", "Every hour at 15 and 45 past"],
    ["0 */2 * * *", "Every 2 hours"],
    ["30 */6 * * *", "Every 6 hours at 30 past"],
    ["0 9-17 * * 1-5", "Every hour, 9 AM to 5 PM, weekdays"],
    ["30 9-17 * * *", "Every hour at 30 past, 9:30 AM to 5:30 PM"],
    ["0 9-17 * * *", "Every hour, 9 AM to 5 PM"],
    ["0 9 1 * *", "The 1st of the month at 9 AM"],
    ["0 9 1,15 * *", "The 1st and 15th of the month at 9 AM"],
    ["0 9 2,3,22 * *", "The 2nd, 3rd and 22nd of the month at 9 AM"],
    ["0 9 1 * mon", "The 1st of the month and Mondays at 9 AM"],
    ["0 9 * jan,jul *", "Every day at 9 AM, Jan and Jul"],
    ["0 9 1 1 *", "The 1st of the month at 9 AM, Jan"],
    ["@yearly", "The 1st of the month at 12 AM, Jan"],
    ["@monthly", "The 1st of the month at 12 AM"],
    ["@weekly", "Sundays at 12 AM"],
    ["@daily", "Every day at 12 AM"],
    ["0 0,2,4,6,8,10,12,14,16,18,20,22 * * *", "Every 2 hours"],
    ["0 1-23/2 * * *", "Every 2 hours from 1 AM"],
    ["30 8-20/4 * * 1-5", "Every 4 hours from 8:30 AM, weekdays"],
    ["0,30 9,10,11,12,13 * * 1-5", "Every 30 minutes, 9 AM to 1:30 PM, weekdays"],
  ];
  for (const [expr, want] of cases) {
    const got = S.describeSchedule(cron(expr), CH);
    assert.equal(got, want, expr);
    noDashes(got, expr);
  }
  // Too many times to list reads as a count.
  const many = S.describeSchedule(cron("5,20,35,50 9,10,11,12,13,14,15 * * *"), CH);
  assert.equal(many, "Every day at 28 times a day");
  // One that doesn't read says so, and never comes due.
  assert.equal(S.describeSchedule(cron("not cron"), CH), 'Cron "not cron"');
  assert.equal(S.nextRun(cron("not cron"), Date.now(), CH), undefined);
  assert.equal(S.nextRun(cron("*/5 * * * *"), Date.now(), CH), undefined, "one under the least gap never runs");
});

await check("runsADay, inHours, eventWindow for a cron schedule", () => {
  assert.equal(S.runsADay(cron("*/15 * * * *")), 96);
  assert.equal(S.runsADay(cron("0 9-17 * * 1-5")), 9);
  assert.equal(S.runsADay(cron("0 9 * * *")), 1);
  assert.equal(S.runsADay(cron("bad")), 1);
  assert.equal(S.inHours(cron("0 9 * * *"), Date.now(), CH), true);
  assert.equal(S.eventWindow(cron("0 9 * * *"), Date.now(), undefined, CH), undefined);
});

/* ---------------- When it runs next, in Chicago ---------------- */

await check("weekdays at 9 AM: the next weekday, in Chicago, not the process's zone", () => {
  // Friday March 6th 10 AM CST: Monday the 9th at 9 AM, which is CDT by then (the clocks changed on the 8th).
  eq(next("0 9 * * 1-5", Z("2026-03-06T16:00:00Z")), Z("2026-03-09T14:00:00Z"));
  // At 9 AM exactly: that minute has gone; tomorrow.
  eq(next("0 9 * * 1-5", Z("2026-11-03T15:00:00Z")), Z("2026-11-04T15:00:00Z"));
  // A second before: today.
  eq(next("0 9 * * 1-5", Z("2026-11-03T14:59:59Z")), Z("2026-11-03T15:00:00Z"));
  // The same expression in Kolkata and UTC.
  eq(next("0 9 * * 1-5", Z("2026-11-03T15:00:00Z"), "Asia/Kolkata"), Z("2026-11-04T03:30:00Z"));
  eq(next("0 9 * * 1-5", Z("2026-11-03T15:00:00Z"), "UTC"), Z("2026-11-04T09:00:00Z"));
  // Unset: the process's own zone (Kolkata here).
  eq(S.nextRun(cron("0 9 * * 1-5"), Z("2026-11-03T15:00:00Z")), Z("2026-11-04T03:30:00Z"));
});

await check("spring forward, March 8th 2026: 2 AM doesn't happen, so it runs at 3 AM CDT, once", () => {
  // The night before: 2 AM CST (08:00Z). On the 8th: 3 AM CDT (08:00Z), the same distance into the gap. The 9th: 2 AM CDT (07:00Z).
  eq(next("0 2 * * *", Z("2026-03-07T00:00:00Z")), Z("2026-03-07T08:00:00Z"));
  eq(next("0 2 * * *", Z("2026-03-08T06:00:00Z")), Z("2026-03-08T08:00:00Z"));
  eq(next("0 2 * * *", Z("2026-03-08T08:00:00Z")), Z("2026-03-09T07:00:00Z"));
  // 2:30 AM runs at 3:30 AM CDT that day.
  eq(next("30 2 * * *", Z("2026-03-08T06:00:00Z")), Z("2026-03-08T08:30:00Z"));
  // 3 AM that day is 3 AM CDT (08:00Z): the same moment as the 2 AM one, so a "2 and 3 AM" routine runs once.
  const both = runs("0 2,3 * * *", Z("2026-03-08T06:00:00Z"), 3);
  assert.deepEqual(both.map(iso), ["2026-03-08T08:00:00.000Z", "2026-03-09T07:00:00.000Z", "2026-03-09T08:00:00.000Z"]);
  // 9 AM moves an hour in UTC across the change.
  eq(next("0 9 * * *", Z("2026-03-07T15:00:00Z")), Z("2026-03-08T14:00:00Z"));
});

await check("spring forward: every 15 minutes keeps its beat through the jump", () => {
  // 1:45 AM CST (07:45Z), then 3:00, 3:15, 3:30, 3:45 AM CDT (08:00Z on): 15 real minutes apart each.
  const list = runs("*/15 * * * *", Z("2026-03-08T07:45:00Z"), 6);
  assert.deepEqual(list.map(iso), ["2026-03-08T08:00:00.000Z", "2026-03-08T08:15:00.000Z", "2026-03-08T08:30:00.000Z", "2026-03-08T08:45:00.000Z", "2026-03-08T09:00:00.000Z", "2026-03-08T09:15:00.000Z"]);
  for (let i = 1; i < list.length; i++) assert.equal(list[i] - list[i - 1], 15 * MIN);
  // Hourly too: 1 AM CST (07:00Z), 3 AM CDT (08:00Z), 4 AM (09:00Z).
  assert.deepEqual(runs("0 * * * *", Z("2026-03-08T06:30:00Z"), 3).map(iso), ["2026-03-08T07:00:00.000Z", "2026-03-08T08:00:00.000Z", "2026-03-08T09:00:00.000Z"]);
});

await check("fall back, November 1st 2026: 1 AM happens twice; a 1 AM run takes the first, a star hour takes both", () => {
  // Midnight CDT (05:00Z): 1 AM CDT (06:00Z) is the first 1 AM. After it: the next day's 1 AM CST (07:00Z on the 2nd), not the second 1 AM.
  eq(next("0 1 * * *", Z("2026-11-01T05:00:00Z")), Z("2026-11-01T06:00:00Z"));
  eq(next("0 1 * * *", Z("2026-11-01T06:00:00Z")), Z("2026-11-02T07:00:00Z"));
  eq(next("30 1 * * *", Z("2026-11-01T05:00:00Z")), Z("2026-11-01T06:30:00Z"));
  eq(next("30 1 * * *", Z("2026-11-01T06:30:00Z")), Z("2026-11-02T07:30:00Z"));
  // A range of hours isn't a star: 1 AM once as well.
  assert.deepEqual(runs("0 0-3 * * *", Z("2026-11-01T05:00:00Z"), 3).map(iso), ["2026-11-01T06:00:00.000Z", "2026-11-01T08:00:00.000Z", "2026-11-01T09:00:00.000Z"]);
  // Every hour: 1 AM CDT (06:00Z), 1 AM CST (07:00Z), 2 AM CST (08:00Z).
  assert.deepEqual(runs("0 * * * *", Z("2026-11-01T05:30:00Z"), 3).map(iso), ["2026-11-01T06:00:00.000Z", "2026-11-01T07:00:00.000Z", "2026-11-01T08:00:00.000Z"]);
  // Every 15 minutes: 15 real minutes apart through the repeated hour.
  const list = runs("*/15 * * * *", Z("2026-11-01T05:45:00Z"), 9);
  assert.deepEqual(list.map(iso), [
    "2026-11-01T06:00:00.000Z",
    "2026-11-01T06:15:00.000Z",
    "2026-11-01T06:30:00.000Z",
    "2026-11-01T06:45:00.000Z",
    "2026-11-01T07:00:00.000Z",
    "2026-11-01T07:15:00.000Z",
    "2026-11-01T07:30:00.000Z",
    "2026-11-01T07:45:00.000Z",
    "2026-11-01T08:00:00.000Z",
  ]);
  for (let i = 1; i < list.length; i++) assert.equal(list[i] - list[i - 1], 15 * MIN);
  // 9 AM moves the other way in UTC: 9 AM CDT (14:00Z) on the 31st, 9 AM CST (15:00Z) on the 1st.
  eq(next("0 9 * * *", Z("2026-10-31T14:00:00Z")), Z("2026-11-01T15:00:00Z"));
  eq(next("0 9 * * *", Z("2026-10-31T13:59:00Z")), Z("2026-10-31T14:00:00Z"));
});

await check("the day of the month, the day of the week, both (either runs), and months", () => {
  // Tuesday November 3rd: the 15th is a Sunday.
  eq(next("0 9 1,15 * *", Z("2026-11-03T15:00:00Z")), Z("2026-11-15T15:00:00Z"));
  // The 1st or any Monday: Monday the 9th comes first; from Saturday the 28th, Monday the 30th, then Tuesday December 1st.
  eq(next("0 9 1 * mon", Z("2026-11-03T15:00:00Z")), Z("2026-11-09T15:00:00Z"));
  assert.deepEqual(runs("0 9 1 * mon", Z("2026-11-28T15:00:00Z"), 3).map(iso), ["2026-11-30T15:00:00.000Z", "2026-12-01T15:00:00.000Z", "2026-12-07T15:00:00.000Z"]);
  // Only in January: New Year's Day 2027, 9 AM CST.
  eq(next("0 9 * jan *", Z("2026-11-03T15:00:00Z")), Z("2027-01-01T15:00:00Z"));
  // The last Friday of the month isn't a cron thing, but Friday the 13th is a Friday: any 13th that's a Friday, or any Friday.
  eq(next("0 9 13 * fri", Z("2026-11-03T15:00:00Z")), Z("2026-11-06T15:00:00Z"));
  // Weekends only: Saturday the 7th.
  eq(next("0 9 * * sat,sun", Z("2026-11-03T15:00:00Z")), Z("2026-11-07T15:00:00Z"));
  // The 31st runs only in months that have one: from November 3rd, December 31st.
  eq(next("0 9 31 * *", Z("2026-11-03T15:00:00Z")), Z("2026-12-31T15:00:00Z"));
  // February 29th: 2028.
  eq(next("0 9 29 2 *", Z("2026-11-03T15:00:00Z")), Z("2028-02-29T15:00:00Z"));
  // Never: February 30th.
  assert.equal(next("0 9 30 2 *", Z("2026-11-03T15:00:00Z")), undefined);
  assert.equal(next("0 9 31 2,4,6,9,11 *", Z("2026-11-03T15:00:00Z")), undefined);
});

await check("every few hours and several times a day, in order", () => {
  assert.deepEqual(runs("0 */6 * * *", Z("2026-11-03T15:00:00Z"), 3).map(iso), ["2026-11-03T18:00:00.000Z", "2026-11-04T00:00:00.000Z", "2026-11-04T06:00:00.000Z"]);
  assert.deepEqual(runs("0 9-17 * * 1-5", Z("2026-11-06T22:00:00Z"), 3).map(iso), ["2026-11-06T23:00:00.000Z", "2026-11-09T15:00:00.000Z", "2026-11-09T16:00:00.000Z"]);
  assert.deepEqual(runs("15,45 8 * * *", Z("2026-11-03T14:00:00Z"), 3).map(iso), ["2026-11-03T14:15:00.000Z", "2026-11-03T14:45:00.000Z", "2026-11-04T14:15:00.000Z"]);
  // Not a number for `from`: nothing.
  assert.equal(S.nextRun(cron("0 9 * * *"), NaN, CH), undefined);
});

/* ---------------- The picker ---------------- */

const { parseHTML } = await import("linkedom");
const { window: win } = parseHTML("<!doctype html><html><body></body></html>");
const doc = win.document;
win.HTMLElement.prototype.focus = function () {};
doc.oninput = null;
globalThis.window = globalThis;
globalThis.document = doc;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "test" } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const P = await import(`${rootUrl}/components/app/cadence-picker.tsx`);

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};
const setterOf = (el, prop) => {
  for (let p = Object.getPrototypeOf(el); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, prop);
    if (d?.set) return d.set;
  }
  return null;
};
const type = (el, value) =>
  act(async () => {
    const set = setterOf(el, "value");
    if (set) set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    await settle();
  });
const choose = (select, value) =>
  act(async () => {
    for (const o of select.querySelectorAll("option")) {
      if (o.getAttribute("value") === value) o.setAttribute("selected", "");
      else o.removeAttribute("selected");
    }
    assert.equal(select.value, value, `${value} is an option`);
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
    await settle();
  });

/** The picker holding its own value, as a popover does, with the last value sent kept for the test. */
const seen = { value: undefined };
function Holder({ first }) {
  const [value, setValue] = useState(first);
  seen.value = value;
  return h(P.CadencePicker, { value, onChange: setValue, ownerZone: CH, onZone: () => {} });
}

await check("tidy and cronError for the picker", () => {
  assert.deepEqual(P.tidy({ kind: "cron", expr: "  0  9 * * 1-5 " }), { kind: "cron", expr: "0 9 * * 1-5" });
  assert.equal(P.sameCadence({ kind: "cron", expr: "0 9 * * 1-5" }, { kind: "cron", expr: "0 9  * * 1-5" }), true);
  assert.equal(P.sameCadence({ kind: "cron", expr: "0 9 * * 1-5" }, { kind: "cron", expr: "0 9 * * *" }), false);
  assert.equal(P.cronError("0 9 * * 1-5"), undefined);
  assert.match(P.cronError("*/5 * * * *"), /shortest gap is 15 minutes/);
  assert.match(P.cronError(""), /needs a cron expression/);
});

await check("the picker: a cron routine opens on its expression, read back with its next run", async () => {
  const box = doc.createElement("div");
  doc.body.appendChild(box);
  const root = createRoot(box);
  await act(async () => {
    root.render(h(Holder, { first: { kind: "cron", expr: "0 9 * * 1-5" } }));
    await settle();
  });
  const select = box.querySelector("select");
  assert.ok(select, "How often is open, as the expression isn't a suggestion");
  assert.equal(select.value, "cron");
  assert.ok([...select.querySelectorAll("option")].some((o) => o.textContent === "Custom (a cron expression)"));
  const input = box.querySelector('input[aria-label="Cron expression"]');
  assert.equal(input.value, "0 9 * * 1-5");
  assert.equal(input.getAttribute("aria-invalid"), "false");
  const line = box.querySelector("[aria-live]");
  assert.match(line.textContent, /^Weekdays at 9 AM\. Next: /);
  noDashes(line.textContent, "the read back");
  assert.equal(line.getAttribute("role"), null);

  // A gap under 15 minutes: the error in the line's place, and the box marked.
  await type(input, "*/5 * * * *");
  assert.deepEqual(seen.value, { kind: "cron", expr: "*/5 * * * *" });
  assert.equal(input.getAttribute("aria-invalid"), "true");
  const alert = box.querySelector("[role=alert]");
  assert.ok(alert, "an alert");
  assert.match(alert.textContent, /5 minutes apart\. The shortest gap is 15 minutes\./);
  // Half typed: what's missing.
  await type(input, "0 9 * *");
  assert.match(box.querySelector("[role=alert]").textContent, /5 parts/);
  await type(input, "0 9 * * 9");
  assert.match(box.querySelector("[role=alert]").textContent, /"9" isn't a day of the week/);
  // Right again: the words and the next run, no alert.
  await type(input, "*/30 9-17 * * mon-fri");
  assert.equal(box.querySelector("[role=alert]"), null);
  assert.match(box.querySelector("[aria-live]").textContent, /^Every 30 minutes, 9 AM to 5:30 PM, weekdays\. Next: /);
  // One that never comes due says so.
  await type(input, "0 9 30 2 *");
  assert.equal(box.querySelector("[role=alert]"), null);
  assert.equal(box.querySelector("[aria-live]").textContent, "The 30th of the month at 9 AM, Feb. That never comes due.");
  await act(async () => root.unmount());
  box.remove();
});

await check("the picker: Custom (a cron expression) in How often starts at weekdays at 9 AM", async () => {
  const box = doc.createElement("div");
  doc.body.appendChild(box);
  const root = createRoot(box);
  await act(async () => {
    root.render(h(Holder, { first: { kind: "every", minutes: 30 } }));
    await settle();
  });
  // Every 30 minutes isn't a suggestion, so it opens picked on its own chip (crawl L4): Custom opens the fields.
  assert.equal(box.querySelector("select"), null, "its own chip is picked, the fields stay closed");
  const customChip = [...box.querySelectorAll('button[role="radio"]')].find((b) => b.textContent.trim() === "Custom");
  await act(async () => {
    customChip.dispatchEvent(new win.Event("click", { bubbles: true }));
    await settle();
  });
  const select = box.querySelector("select");
  assert.equal(select.value, "every");
  await choose(select, "cron");
  assert.deepEqual(seen.value, { kind: "cron", expr: "0 9 * * 1-5" });
  assert.equal(box.querySelector('input[aria-label="Cron expression"]').value, "0 9 * * 1-5");
  assert.match(box.querySelector("[aria-live]").textContent, /^Weekdays at 9 AM\. Next: /);
  // And back to a kind with times: the expression goes, a time stays.
  await choose(box.querySelector("select"), "daily");
  assert.deepEqual(seen.value, { kind: "daily", time: "09:00" });
  await act(async () => root.unmount());
  box.remove();
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

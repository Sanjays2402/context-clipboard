// Sanity: lib/reading-time + content-stats breadcrumb tail integration.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-readtime-"));
async function load(entry, name) {
  const out = join(dir, name + ".mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href);
}
const { readingTimeLabel } = await load("src/lib/reading-time.ts", "reading-time");
const { formatContentStats, formatContentStatsMarkdown } = await load("src/lib/content-stats.ts", "content-stats");

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) pass++;
  else { fail++; console.error(`FAIL ${msg}: got ${A} want ${B}`); }
};

// below 60-word floor -> null
eq(readingTimeLabel(0), null, "0 words null");
eq(readingTimeLabel(59), null, "59 words null");
// floor and above -> "~N min read", round UP, min 1
eq(readingTimeLabel(60), "~1 min read", "60 words 1 min");
eq(readingTimeLabel(200), "~1 min read", "200 words exactly 1 min");
eq(readingTimeLabel(210), "~2 min read", "210 rounds up to 2");
eq(readingTimeLabel(1200), "~6 min read", "1200 words 6 min");
eq(readingTimeLabel(NaN), null, "NaN null");
eq(readingTimeLabel(-5), null, "negative null");

// breadcrumb tail: short clip has no read tail
const short = formatContentStats({ kind: "text", content: "the quick brown fox jumps" });
eq(short.includes("min read"), false, "short clip no read tail");
// long clip (80 words) appends "~1 min read"
const body80 = ("word ".repeat(80)).trim();
const long = formatContentStats({ kind: "text", content: body80 });
eq(long.endsWith("~1 min read"), true, "long clip read tail present");
eq(long.includes("80 words"), true, "80 words counted");
// md parity: strip ** reproduces plain (read tail has no bold)
const md = formatContentStatsMarkdown({ kind: "text", content: body80 });
eq(md.endsWith("~1 min read"), true, "md read tail present");
eq(md.replace(/\*\*/g, ""), long, "md strip-** == plain (read tail parity)");

rmSync(dir, { recursive: true, force: true });
console.log(`reading-time sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

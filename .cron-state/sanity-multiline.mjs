// Sanity: is:multiline search operator + multilineMatches predicate.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-multiline-"));
const out = join(dir, "search.mjs");
await build({ entryPoints: ["src/lib/search.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { parseQuery, applyQuery, multilineMatches, describeQuery } = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) pass++;
  else { fail++; console.error(`FAIL ${msg}: got ${A} want ${B}`); }
};

// predicate
eq(multilineMatches({ kind: "text", content: "one line" }), false, "single line false");
eq(multilineMatches({ kind: "text", content: "a\nb" }), true, "two lines true");
eq(multilineMatches({ kind: "text", content: "a\r\nb" }), true, "crlf true");
eq(multilineMatches({ kind: "image", content: "data:\n\n" }), false, "image false");
eq(multilineMatches({ kind: "link", content: "https://x" }), false, "link single false");

// parser sets the flag + describe
eq(parseQuery("is:multiline").multilineOnly, true, "parse sets flag");
eq(describeQuery(parseQuery("is:multiline")).includes("multiline"), true, "describe includes");

// applyQuery filters
const clips = [
  { id: "1", kind: "text", content: "single", source: {}, tags: [], pinned: false, createdAt: 1, lastSeenAt: 1, hitCount: 0, bytes: 6, hash: "a" },
  { id: "2", kind: "text", content: "line1\nline2", source: {}, tags: [], pinned: false, createdAt: 2, lastSeenAt: 2, hitCount: 0, bytes: 11, hash: "b" },
  { id: "3", kind: "image", content: "data:\n", source: {}, tags: [], pinned: false, createdAt: 3, lastSeenAt: 3, hitCount: 0, bytes: 6, hash: "c" },
];
const res = applyQuery(clips, parseQuery("is:multiline")).map((c) => c.id);
eq(res, ["2"], "only multiline text clip survives");

rmSync(dir, { recursive: true, force: true });
console.log(`multiline sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

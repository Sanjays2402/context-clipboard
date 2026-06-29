// Sanity: is:singleline operator + singleLineMatches predicate.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-singleline-"));
const out = join(dir, "search.mjs");
await build({ entryPoints: ["src/lib/search.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { parseQuery, applyQuery, singleLineMatches, multilineMatches, describeQuery } = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); } };

// predicate is the exact inverse of multiline for text/link, both false for image
eq(singleLineMatches({ kind: "text", content: "one line" }), true, "single true");
eq(singleLineMatches({ kind: "text", content: "a\nb" }), false, "multi false");
eq(singleLineMatches({ kind: "text", content: "" }), true, "empty is single");
eq(singleLineMatches({ kind: "image", content: "data:" }), false, "image false");
eq(singleLineMatches({ kind: "link", content: "https://x" }), true, "link single true");
// partition: never both true, never both false for text/link
for (const body of ["x", "x\ny", ""]) {
  eq(singleLineMatches({ kind: "text", content: body }) !== multilineMatches({ kind: "text", content: body }), true, `partition ${JSON.stringify(body)}`);
}

eq(parseQuery("is:singleline").singleLineOnly, true, "parse sets flag");
eq(describeQuery(parseQuery("is:singleline")).includes("singleline"), true, "describe includes");

const clips = [
  { id: "1", kind: "text", content: "single", source: {}, tags: [], pinned: false, createdAt: 1, lastSeenAt: 1, hitCount: 0, bytes: 6, hash: "a" },
  { id: "2", kind: "text", content: "l1\nl2", source: {}, tags: [], pinned: false, createdAt: 2, lastSeenAt: 2, hitCount: 0, bytes: 5, hash: "b" },
  { id: "3", kind: "image", content: "data:", source: {}, tags: [], pinned: false, createdAt: 3, lastSeenAt: 3, hitCount: 0, bytes: 5, hash: "c" },
];
eq(applyQuery(clips, parseQuery("is:singleline")).map((c) => c.id), ["1"], "only single-line text survives");

rmSync(dir, { recursive: true, force: true });
console.log(`singleline sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

// Sanity: is:longread operator + longReadMatches predicate.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-longread-"));
const out = join(dir, "search.mjs");
await build({ entryPoints: ["src/lib/search.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { parseQuery, applyQuery, longReadMatches, describeQuery } = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); } };
const words = (n) => Array.from({ length: n }, () => "w").join(" ");

eq(longReadMatches({ kind: "text", content: words(60) }), true, "exactly 60 words matches");
eq(longReadMatches({ kind: "text", content: words(59) }), false, "59 below floor");
eq(longReadMatches({ kind: "text", content: words(200) }), true, "long matches");
eq(longReadMatches({ kind: "text", content: "short snippet" }), false, "tiny no match");
eq(longReadMatches({ kind: "text", content: "" }), false, "empty no match");
eq(longReadMatches({ kind: "image", content: words(200) }), false, "image excluded");

eq(parseQuery("is:longread").longReadOnly, true, "parse sets flag");
eq(describeQuery(parseQuery("is:longread")).includes("longread"), true, "describe includes");

const clips = [
  { id: "1", kind: "text", content: words(80), source: {}, tags: [], pinned: false, createdAt: 1, lastSeenAt: 1, hitCount: 0, bytes: 160, hash: "a" },
  { id: "2", kind: "text", content: "tiny", source: {}, tags: [], pinned: false, createdAt: 2, lastSeenAt: 2, hitCount: 0, bytes: 4, hash: "b" },
  { id: "3", kind: "image", content: words(80), source: {}, tags: [], pinned: false, createdAt: 3, lastSeenAt: 3, hitCount: 0, bytes: 160, hash: "c" },
];
eq(applyQuery(clips, parseQuery("is:longread")).map((c) => c.id), ["1"], "only long text clip survives");

rmSync(dir, { recursive: true, force: true });
console.log(`longread sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

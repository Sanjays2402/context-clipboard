// Sanity: bulletListForClip / numberedListForClip — list-format send-to rows.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-listfmt-"));
const out = join(dir, "lf.mjs");
await build({ entryPoints: ["src/lib/list-format.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { bulletListForClip, numberedListForClip } = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); } };

eq(bulletListForClip({ kind: "text", content: "a\nb\nc" }), "- a\n- b\n- c", "bullets");
eq(numberedListForClip({ kind: "text", content: "a\nb\nc" }), "1. a\n2. b\n3. c", "numbered");
eq(bulletListForClip({ kind: "text", content: "a\n\n  \nb" }), "- a\n- b", "inner blanks dropped");
eq(numberedListForClip({ kind: "text", content: " x \n y " }), "1. x\n2. y", "trim + ordinals");
eq(bulletListForClip({ kind: "text", content: "x\r\ny" }), "- x\n- y", "crlf normalised");
eq(bulletListForClip({ kind: "text", content: "only one" }), undefined, "single line hidden");
eq(numberedListForClip({ kind: "image", content: "data:\na\nb" }), undefined, "image hidden");
eq(bulletListForClip({ kind: "text", content: "" }), undefined, "empty hidden");
eq(numberedListForClip(null), undefined, "null safe");

rmSync(dir, { recursive: true, force: true });
console.log(`list-format sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

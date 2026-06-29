// Sanity: lastLineOf — detail send-to "Copy last line" row.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-lastline-"));
const out = join(dir, "ll.mjs");
await build({ entryPoints: ["src/lib/last-line.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { lastLineOf } = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); } };

eq(lastLineOf({ kind: "text", content: "a\nb\nc" }), "c", "last of three");
eq(lastLineOf({ kind: "text", content: "a\nb\n" }), "b", "trailing newline skipped");
eq(lastLineOf({ kind: "text", content: "a\nb\n\n  \n" }), "b", "trailing blanks skipped");
eq(lastLineOf({ kind: "text", content: "x\r\ny" }), "y", "crlf normalised");
eq(lastLineOf({ kind: "text", content: "  total: 42 " }), undefined, "single line hidden");
eq(lastLineOf({ kind: "image", content: "data:\na\nb" }), undefined, "image hidden");
eq(lastLineOf({ kind: "text", content: "" }), undefined, "empty hidden");
eq(lastLineOf(null), undefined, "null safe");

rmSync(dir, { recursive: true, force: true });
console.log(`last-line sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

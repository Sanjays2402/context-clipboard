// Sanity: lib/clip-blockquote body-as-quote + send-to "quote" row wiring.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-quote-"));
async function load(entry, name) {
  const out = join(dir, name + ".mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href);
}
const { clipAsBlockquote } = await load("src/lib/clip-blockquote.ts", "clip-blockquote");
const { buildSendActions } = await load("src/lib/send-to.ts", "send-to");

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) pass++;
  else { fail++; console.error(`FAIL ${msg}: got ${A} want ${B}`); }
};

// single line -> single quoted line
eq(clipAsBlockquote({ kind: "text", content: "hello" }), "> hello", "single line");
// multi line -> each gets a prefix
eq(clipAsBlockquote({ kind: "text", content: "a\nb\nc" }), "> a\n> b\n> c", "multi line");
// inner blank preserved as bare >
eq(clipAsBlockquote({ kind: "text", content: "a\n\nb" }), "> a\n>\n> b", "inner blank");
// CRLF normalised
eq(clipAsBlockquote({ kind: "text", content: "a\r\nb" }), "> a\n> b", "crlf");
// outer blank trimmed
eq(clipAsBlockquote({ kind: "text", content: "\n\nx\n\n" }), "> x", "outer trim");
// link kind quotes content
eq(clipAsBlockquote({ kind: "link", content: "https://x.io" }), "> https://x.io", "link");
// images / empty / bad -> undefined
eq(clipAsBlockquote({ kind: "image", content: "data:..." }), undefined, "image undef");
eq(clipAsBlockquote({ kind: "text", content: "   " }), undefined, "whitespace undef");
eq(clipAsBlockquote({ kind: "text", content: "" }), undefined, "empty undef");
eq(clipAsBlockquote(null), undefined, "null undef");

// send-to wiring: quote row present + available for multi-line text, gated for image
const ts = buildSendActions({ id: "1", kind: "text", content: "x\ny", source: {} });
const q = ts.find((a) => a.id === "quote");
eq(!!q, true, "quote row exists");
eq(q.available, true, "quote available for text");
eq(q.payload, "> x\n> y", "quote payload");
const im = buildSendActions({ id: "2", kind: "image", content: "data:x", source: {} });
eq(im.find((a) => a.id === "quote").available, false, "quote hidden for image");

rmSync(dir, { recursive: true, force: true });
console.log(`clip-blockquote sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

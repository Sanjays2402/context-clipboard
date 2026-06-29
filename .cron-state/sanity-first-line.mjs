// Sanity: lib/first-line first-non-blank-line + send-to "first-line" row.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-firstline-"));
async function load(entry, name) {
  const out = join(dir, name + ".mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href);
}
const { firstLineOf } = await load("src/lib/first-line.ts", "first-line");
const { buildSendActions } = await load("src/lib/send-to.ts", "send-to");

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) pass++;
  else { fail++; console.error(`FAIL ${msg}: got ${A} want ${B}`); }
};

// multi-line -> line 1
eq(firstLineOf({ kind: "text", content: "title\nbody\nmore" }), "title", "first of three");
// trailing whitespace trimmed
eq(firstLineOf({ kind: "text", content: "title  \nrest" }), "title", "trim trailing");
// leading blank lines skipped to first non-blank
eq(firstLineOf({ kind: "text", content: "\n\nreal\nx" }), "real", "skip leading blanks");
// CRLF normalised
eq(firstLineOf({ kind: "text", content: "head\r\nfoot" }), "head", "crlf");
// single line -> undefined (plain copy covers it)
eq(firstLineOf({ kind: "text", content: "only" }), undefined, "single line undef");
// images / empty / bad -> undefined
eq(firstLineOf({ kind: "image", content: "data:x" }), undefined, "image undef");
eq(firstLineOf({ kind: "text", content: "" }), undefined, "empty undef");
eq(firstLineOf(null), undefined, "null undef");

// send-to wiring: present + available for multi-line, gated for single-line
const ml = buildSendActions({ id: "1", kind: "text", content: "h\nb", source: {} });
const f = ml.find((a) => a.id === "first-line");
eq(!!f, true, "first-line row exists");
eq(f.available, true, "first-line available multi");
eq(f.payload, "h", "first-line payload");
const sl = buildSendActions({ id: "2", kind: "text", content: "solo", source: {} });
eq(sl.find((a) => a.id === "first-line").available, false, "first-line hidden single");

rmSync(dir, { recursive: true, force: true });
console.log(`first-line sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

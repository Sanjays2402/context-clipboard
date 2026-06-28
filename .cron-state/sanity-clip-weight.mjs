// Sanity: lib/clip-weight single-clip chars+bytes summary + send-to row wiring.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-weight-"));
async function load(entry, name) {
  const out = join(dir, name + ".mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href);
}
const { clipWeight, clipWeightSummary } = await load("src/lib/clip-weight.ts", "clip-weight");
const { buildSendActions } = await load("src/lib/send-to.ts", "send-to");

let pass = 0,
  fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a),
    B = JSON.stringify(b);
  if (A === B) pass++;
  else {
    fail++;
    console.error(`FAIL ${msg}: got ${A} want ${B}`);
  }
};

// --- basic ASCII: bytes == chars ---
eq(clipWeight({ kind: "text", content: "hello" }), { chars: 5, words: 1, bytes: 5 }, "ascii chars=bytes");
eq(clipWeightSummary({ kind: "text", content: "hello" }), "5 chars \u00b7 1 word \u00b7 5 B", "ascii summary");

// --- singular grammar (1 char, 1 word) ---
eq(clipWeightSummary({ kind: "text", content: "x" }), "1 char \u00b7 1 word \u00b7 1 B", "1 char singular");

// --- word count: whitespace-delimited runs (matches content-stats) ---
eq(clipWeight({ kind: "text", content: "the quick brown fox" }), { chars: 19, words: 4, bytes: 19 }, "4 words");
eq(clipWeightSummary({ kind: "text", content: "the quick brown fox" }), "19 chars \u00b7 4 words \u00b7 19 B", "4-word summary");
// Multiple spaces / newlines collapse to single word boundaries.
eq(clipWeight({ kind: "text", content: "a   b\n\nc" }).words, 3, "collapsed whitespace -> 3 words");

// --- multi-byte: emoji is 1 code point but 4 UTF-8 bytes ---
const emoji = clipWeight({ kind: "text", content: "a😀b" });
eq(emoji.chars, 3, "emoji: 3 code points");
eq(emoji.words, 1, "emoji: 1 word (no whitespace)");
eq(emoji.bytes, 6, "emoji: 1+4+1 = 6 bytes");
eq(clipWeightSummary({ kind: "text", content: "a😀b" }), "3 chars \u00b7 1 word \u00b7 6 B", "emoji summary bytes>chars");

// --- CJK: 1 code point = 3 UTF-8 bytes ---
eq(clipWeight({ kind: "text", content: "中文" }), { chars: 2, words: 1, bytes: 6 }, "CJK 2 chars 6 bytes");

// --- KB tier formatting matches formatCopyBytes (1500 B -> 1.5 KB) ---
eq(clipWeightSummary({ kind: "text", content: "x".repeat(1500) }), "1,500 chars \u00b7 1 word \u00b7 1.5 KB", "KB tier + grouping");

// --- grouping at thousands (chars AND words both group) ---
eq(clipWeightSummary({ kind: "text", content: "x".repeat(1240) }), "1,240 chars \u00b7 1 word \u00b7 1.2 KB", "1240 grouped");
// 2000 single-char words -> "2,000 words" grouped.
eq(clipWeightSummary({ kind: "text", content: ("w ".repeat(2000)).trim() }), "3,999 chars \u00b7 2,000 words \u00b7 3.9 KB", "word count grouped at thousands");

// --- link clips are eligible (they have a text body) ---
eq(clipWeightSummary({ kind: "link", content: "https://example.com" }), "19 chars \u00b7 1 word \u00b7 19 B", "link eligible");

// --- null gates ---
eq(clipWeight({ kind: "image", content: "data:image/png;base64,AAAA" }), null, "image -> null");
eq(clipWeightSummary({ kind: "image", content: "data:..." }), null, "image summary null");
eq(clipWeight({ kind: "text", content: "" }), null, "empty -> null");
eq(clipWeight({ kind: "text", content: "   \n\t " }), null, "whitespace-only -> null");
eq(clipWeight(null), null, "null input -> null");
eq(clipWeight({ kind: "text", content: 42 }), null, "non-string content -> null");

// --- send-to row wiring: present + available for a text clip ---
const acts = buildSendActions({ id: "1", kind: "text", content: "hello world", source: {} });
const w = acts.find((a) => a.id === "weight");
eq(!!w, true, "weight row present");
eq(w.kind, "copy", "weight row is copy kind");
eq(w.available, true, "weight available for text clip");
eq(w.payload, "11 chars \u00b7 2 words \u00b7 11 B", "weight payload is WYSIWYG summary");

// --- send-to row hidden (unavailable, no payload) for image clip ---
const imgActs = buildSendActions({ id: "2", kind: "image", content: "data:image/png;base64,AA", source: {} });
const wi = imgActs.find((a) => a.id === "weight");
eq(wi.available, false, "weight unavailable for image");
eq(wi.payload, undefined, "weight payload undefined for image");

rmSync(dir, { recursive: true, force: true });
console.log(`clip-weight sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

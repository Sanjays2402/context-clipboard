// Sanity: lib/content-stats — computeContentStats + statsForClip +
// groupThousands + formatContentStats + formatContentStatsMarkdown.
//
// Bundles the REAL src/lib/content-stats.ts (no inline copies) so the
// assertions track shipping behaviour — including the UTF-8 byte segment
// the breadcrumb now tails onto the char/word/line counts. Covers
// code-point counting (astral glyphs), whitespace word splitting,
// CRLF/CR line normalisation, empty-body zeroing, image-clip null,
// single-line line-drop grammar, thousands grouping, the byte tail
// (weight parity with the Send-to "Copy weight" row + the bulk receipts),
// and the md/plain bold-only-the-figure parity.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-content-stats-"));
const out = join(dir, "content-stats.mjs");
await build({
  entryPoints: ["src/lib/content-stats.ts"],
  bundle: true,
  format: "esm",
  outfile: out,
  logLevel: "silent",
});
const {
  computeContentStats,
  statsForClip,
  groupThousands,
  formatContentStats,
  formatContentStatsMarkdown,
} = await import(pathToFileURL(out).href);

// Local UTF-8 byte counter to derive expected byte tails independently of
// the module (so the test asserts against a SECOND implementation, not the
// one under test). Mirrors the TextEncoder contract.
const u8 = (s) => new TextEncoder().encode(s).length;
const fmtBytes = (n) => {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.floor(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. computeContentStats: basic counting (unchanged by the byte tail) -
check("simple sentence chars", computeContentStats("hello world").chars, 11);
check("simple sentence words", computeContentStats("hello world").words, 2);
check("simple sentence lines", computeContentStats("hello world").lines, 1);
check("empty body all zero", computeContentStats(""), { chars: 0, words: 0, lines: 0 });
check("whitespace-only words zero", computeContentStats("   \n  ").words, 0);
check("whitespace-only chars counted", computeContentStats("   ").chars, 3);

// --- 2. word splitting edge cases ---------------------------------------
check("multiple spaces collapse", computeContentStats("a    b     c").words, 3);
check("tabs are word separators", computeContentStats("a\tb\tc").words, 3);
check("leading/trailing trimmed", computeContentStats("  hi there  ").words, 2);
check("newlines split words", computeContentStats("one\ntwo\nthree").words, 3);
check("code line word count", computeContentStats("foo(bar, baz)").words, 2);
check("single word", computeContentStats("hello").words, 1);

// --- 3. line counting + CRLF/CR normalisation ---------------------------
check("two lines LF", computeContentStats("a\nb").lines, 2);
check("three lines LF", computeContentStats("a\nb\nc").lines, 3);
check("CRLF counts once", computeContentStats("a\r\nb").lines, 2);
check("lone CR counts once", computeContentStats("a\rb").lines, 2);
check("trailing newline adds line", computeContentStats("a\n").lines, 2);
check("mixed CRLF + LF", computeContentStats("a\r\nb\nc").lines, 3);
check("single line no newline", computeContentStats("just one line here").lines, 1);

// --- 4. code-point counting (astral glyphs) -----------------------------
check("emoji is one char", computeContentStats("\u{1F370}").chars, 1);
check("emoji + text chars", computeContentStats("cake \u{1F370}").chars, 6);
check("astral glyph word", computeContentStats("\u{1F370}").words, 1);

// --- 5. statsForClip: kind gating ---------------------------------------
check("image clip returns null", statsForClip({ kind: "image", content: "data:image/png;base64,AAAA" }), null);
check("text clip returns stats", statsForClip({ kind: "text", content: "hi" }), { chars: 2, words: 1, lines: 1 });
check("link clip returns stats", statsForClip({ kind: "link", content: "https://x.com" }).chars, 13);
check("null clip returns null", statsForClip(null), null);
check("undefined clip returns null", statsForClip(undefined), null);
check("non-string content coerced", statsForClip({ kind: "text", content: null }), { chars: 0, words: 0, lines: 0 });

// --- 6. groupThousands ---------------------------------------------------
check("group under 1000", groupThousands(240), "240");
check("group 1240", groupThousands(1240), "1,240");
check("group million", groupThousands(1234567), "1,234,567");
check("group exactly 1000", groupThousands(1000), "1,000");
check("group zero", groupThousands(0), "0");
check("group negative", groupThousands(-1500), "-1,500");
check("group NaN safe", groupThousands(NaN), "0");
check("group Infinity safe", groupThousands(Infinity), "0");
check("group truncates float", groupThousands(1240.9), "1,240");

// --- 7. formatContentStats: grammar + line-drop + byte tail --------------
check("single-line drops line, tails bytes", formatContentStats({ kind: "text", content: "hello world" }), "11 chars \u00b7 2 words \u00b7 11 B");
check("multi-line shows line + bytes", formatContentStats({ kind: "text", content: "a\nb\nc" }), "5 chars \u00b7 3 words \u00b7 3 lines \u00b7 5 B");
check("one char singular + bytes", formatContentStats({ kind: "text", content: "x" }), "1 char \u00b7 1 word \u00b7 1 B");
check("empty body hides row", formatContentStats({ kind: "text", content: "" }), null);
check("whitespace-only still shows chars + bytes", formatContentStats({ kind: "text", content: "   " }), "3 chars \u00b7 0 words \u00b7 3 B");
check("image hides row", formatContentStats({ kind: "image", content: "data:..." }), null);
check("null hides row", formatContentStats(null), null);
check("two lines plural + bytes", formatContentStats({ kind: "text", content: "a\nb" }), "3 chars \u00b7 2 words \u00b7 2 lines \u00b7 3 B");

// --- 7b. byte tail is the LAST segment + matches an independent count ----
const multibyte = { kind: "text", content: "中文 note \u{1F370}" };
const mbStats = computeContentStats(multibyte.content);
const mbLine = formatContentStats(multibyte);
check("byte tail is the final segment", mbLine.endsWith(` \u00b7 ${fmtBytes(u8(multibyte.content))}`), true);
// Multi-byte body: bytes strictly exceed code-point chars (the whole point).
check("multibyte bytes > chars", u8(multibyte.content) > mbStats.chars, true);
// KB tier renders through the breadcrumb just like the bulk receipts.
check("KB tier in breadcrumb", formatContentStats({ kind: "text", content: "x".repeat(1500) }), "1,500 chars \u00b7 1 word \u00b7 1.5 KB");

// --- 8. realistic end-to-end --------------------------------------------
const jsonBlob = '{\n  "name": "context-clipboard",\n  "version": "0.6.2"\n}';
const jsonStats = computeContentStats(jsonBlob);
check("json blob lines", jsonStats.lines, 4);
check("json blob words", jsonStats.words, 6);
check("json blob format", formatContentStats({ kind: "text", content: jsonBlob }), `${groupThousands(jsonStats.chars)} chars \u00b7 6 words \u00b7 4 lines \u00b7 ${fmtBytes(u8(jsonBlob))}`);

const prose = "This is a multi-sentence note. It spans one logical line but wraps in the UI.";
check("prose single line no line seg", /lines/.test(formatContentStats({ kind: "text", content: prose })), false);
check("prose word count", computeContentStats(prose).words, 15);

const csvRow = "alice,30,engineer,remote";
check("csv row one line", computeContentStats(csvRow).lines, 1);
check("csv row format drops lines, tails bytes", formatContentStats({ kind: "text", content: csvRow }), "24 chars \u00b7 1 word \u00b7 24 B");

// --- 9. idempotence / determinism ---------------------------------------
const sample = "line1\nline2 has more words\nline3";
const a = JSON.stringify(computeContentStats(sample));
const b = JSON.stringify(computeContentStats(sample));
check("deterministic", a, b);

// --- 10. formatContentStatsMarkdown: bold figures + bold byte tail ------
check("md single-line bolds figures, drops line, bolds bytes", formatContentStatsMarkdown({ kind: "text", content: "hello world" }), "**11** chars \u00b7 **2** words \u00b7 **11** B");
check("md multi-line includes line + bytes", formatContentStatsMarkdown({ kind: "text", content: "a\nb\nc" }), "**5** chars \u00b7 **3** words \u00b7 **3** lines \u00b7 **5** B");
check("md one char singular + bytes", formatContentStatsMarkdown({ kind: "text", content: "x" }), "**1** char \u00b7 **1** word \u00b7 **1** B");
check("md KB tier bolds figure not unit", formatContentStatsMarkdown({ kind: "text", content: "x".repeat(1500) }), "**1,500** chars \u00b7 **1** word \u00b7 **1.5** KB");
check("md image hides", formatContentStatsMarkdown({ kind: "image", content: "data:..." }), null);
check("md empty hides", formatContentStatsMarkdown({ kind: "text", content: "" }), null);
check("md null hides", formatContentStatsMarkdown(null), null);
check("md whitespace-only shows chars, 0 words + bytes", formatContentStatsMarkdown({ kind: "text", content: "   " }), "**3** chars \u00b7 **0** words \u00b7 **3** B");
// Same hide/show decision as the plain formatter on every shape.
for (const c of [
  { kind: "text", content: "hello world" },
  { kind: "text", content: "a\nb\nc" },
  { kind: "text", content: "" },
  { kind: "image", content: "data:x" },
  null,
  { kind: "link", content: "https://example.com/very/long/path?with=query" },
]) {
  const plainNull = formatContentStats(c) === null;
  const mdNull = formatContentStatsMarkdown(c) === null;
  check(`md/plain show-decision parity ${JSON.stringify(c)}`, mdNull, plainNull);
}
// Stripping the ** from the MD line must reproduce the plain line exactly —
// the byte tail bolds only the figure (unit stays plain), so this parity
// must hold WITH the byte segment too (the contract the copy paths rely on).
for (const parityClip of [
  { kind: "text", content: "alpha beta\ngamma delta epsilon" },
  { kind: "text", content: "中文 \u{1F370} mixed" },
  { kind: "text", content: "x".repeat(1500) },
  { kind: "link", content: "https://example.com" },
]) {
  check(
    `md without ** equals plain line ${JSON.stringify(parityClip.content).slice(0, 20)}`,
    formatContentStatsMarkdown(parityClip).replace(/\*\*/g, ""),
    formatContentStats(parityClip),
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`content-stats sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);

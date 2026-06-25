// Sanity: computeContentStats + statsForClip + groupThousands +
// formatContentStats from src/lib/content-stats.ts.
//
// Inline copies so this runs without a bundler. Covers code-point
// counting (astral glyphs), whitespace word splitting, CRLF/CR line
// normalisation, empty-body zeroing, image-clip null, single-line
// line-drop grammar, thousands grouping, and realistic end-to-end.

function computeContentStats(body) {
  const text = typeof body === "string" ? body : "";
  const chars = [...text].length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  let lines;
  if (text === "") {
    lines = 0;
  } else {
    const normalised = text.replace(/\r\n?/g, "\n");
    lines = normalised.split("\n").length;
  }
  return { chars, words, lines };
}

function statsForClip(c) {
  if (!c) return null;
  if (c.kind === "image") return null;
  const body = typeof c.content === "string" ? c.content : "";
  return computeContentStats(body);
}

function groupThousands(n) {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const digits = Math.abs(Math.trunc(n)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function countUnit(n, unit) {
  return `${groupThousands(n)} ${unit}${n === 1 ? "" : "s"}`;
}

function formatContentStats(c) {
  const s = statsForClip(c);
  if (!s) return null;
  if (s.chars === 0 && s.words === 0 && s.lines === 0) return null;
  const parts = [countUnit(s.chars, "char"), countUnit(s.words, "word")];
  if (s.lines > 1) parts.push(countUnit(s.lines, "line"));
  return parts.join(" \u00b7 ");
}

function boldCountUnit(n, unit) {
  return `**${groupThousands(n)}** ${unit}${n === 1 ? "" : "s"}`;
}

function formatContentStatsMarkdown(c) {
  const s = statsForClip(c);
  if (!s) return null;
  if (s.chars === 0 && s.words === 0 && s.lines === 0) return null;
  const parts = [boldCountUnit(s.chars, "char"), boldCountUnit(s.words, "word")];
  if (s.lines > 1) parts.push(boldCountUnit(s.lines, "line"));
  return parts.join(" \u00b7 ");
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. computeContentStats: basic counting -----------------------------
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
// A single emoji is 2 UTF-16 units but 1 code point — we count 1.
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

// --- 7. formatContentStats: grammar + line-drop -------------------------
check("single-line drops line count", formatContentStats({ kind: "text", content: "hello world" }), "11 chars \u00b7 2 words");
check("multi-line shows line count", formatContentStats({ kind: "text", content: "a\nb\nc" }), "5 chars \u00b7 3 words \u00b7 3 lines");
check("one char singular", formatContentStats({ kind: "text", content: "x" }), "1 char \u00b7 1 word");
check("empty body hides row", formatContentStats({ kind: "text", content: "" }), null);
check("whitespace-only body still shows chars", formatContentStats({ kind: "text", content: "   " }), "3 chars \u00b7 0 words");
check("image hides row", formatContentStats({ kind: "image", content: "data:..." }), null);
check("null hides row", formatContentStats(null), null);
check("two lines plural", formatContentStats({ kind: "text", content: "a\nb" }), "3 chars \u00b7 2 words \u00b7 2 lines");

// --- 8. realistic end-to-end --------------------------------------------
const jsonBlob = '{\n  "name": "context-clipboard",\n  "version": "0.6.2"\n}';
const jsonStats = computeContentStats(jsonBlob);
check("json blob lines", jsonStats.lines, 4);
check("json blob words", jsonStats.words, 6);
check("json blob format", formatContentStats({ kind: "text", content: jsonBlob }), `${groupThousands(jsonStats.chars)} chars \u00b7 6 words \u00b7 4 lines`);

const prose = "This is a multi-sentence note. It spans one logical line but wraps in the UI.";
check("prose single line no line seg", /lines/.test(formatContentStats({ kind: "text", content: prose })), false);
check("prose word count", computeContentStats(prose).words, 15);

const csvRow = "alice,30,engineer,remote";
check("csv row one line", computeContentStats(csvRow).lines, 1);
check("csv row format drops lines", formatContentStats({ kind: "text", content: csvRow }), "24 chars \u00b7 1 word");

// --- 9. idempotence / determinism ---------------------------------------
const sample = "line1\nline2 has more words\nline3";
const a = JSON.stringify(computeContentStats(sample));
const b = JSON.stringify(computeContentStats(sample));
check("deterministic", a, b);

// --- 10. formatContentStatsMarkdown: bold figures, parity with plain ----
check("md single-line bolds figures, drops line", formatContentStatsMarkdown({ kind: "text", content: "hello world" }), "**11** chars \u00b7 **2** words");
check("md multi-line includes line seg", formatContentStatsMarkdown({ kind: "text", content: "a\nb\nc" }), "**5** chars \u00b7 **3** words \u00b7 **3** lines");
check("md one char singular", formatContentStatsMarkdown({ kind: "text", content: "x" }), "**1** char \u00b7 **1** word");
check("md thousands grouping inside bold", formatContentStatsMarkdown({ kind: "text", content: "a".repeat(1240) }), "**1,240** chars \u00b7 **1** word");
check("md image hides", formatContentStatsMarkdown({ kind: "image", content: "data:..." }), null);
check("md empty hides", formatContentStatsMarkdown({ kind: "text", content: "" }), null);
check("md null hides", formatContentStatsMarkdown(null), null);
check("md whitespace-only shows chars, 0 words", formatContentStatsMarkdown({ kind: "text", content: "   " }), "**3** chars \u00b7 **0** words");
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
// Stripping the ** from the MD line must reproduce the plain line exactly.
const parityClip = { kind: "text", content: "alpha beta\ngamma delta epsilon" };
check(
  "md without ** equals plain line",
  formatContentStatsMarkdown(parityClip).replace(/\*\*/g, ""),
  formatContentStats(parityClip),
);

console.log(`content-stats sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);

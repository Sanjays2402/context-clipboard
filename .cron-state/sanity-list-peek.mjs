// Sanity: peekTooltip from src/lib/list-peek.ts. Inline copy so this
// runs bundler-free (mirrors the module exactly).
//
// Covers: not-truncated => null, truncated => flattened+capped peek,
// whitespace collapse, ellipsis-on-cap, post-flatten re-fit => null,
// custom rowSliceLength + cap, and defensive nullish / bad-length input.

const DEFAULT_ROW_SLICE = 140;
const DEFAULT_CAP = 500;

function normaliseLen(v, fallback) {
  if (v == null || !Number.isFinite(v)) return fallback;
  const n = Math.trunc(v);
  return n > 0 ? n : fallback;
}

function peekTooltip(fullPreview, opts = {}) {
  if (typeof fullPreview !== "string") return null;
  const rowSlice = normaliseLen(opts.rowSliceLength, DEFAULT_ROW_SLICE);
  const cap = normaliseLen(opts.cap, DEFAULT_CAP);
  if (fullPreview.length <= rowSlice) return null;
  const flattened = fullPreview.replace(/\s+/g, " ").trim();
  if (flattened.length <= rowSlice) return null;
  if (flattened.length <= cap) return flattened;
  return flattened.slice(0, cap).trimEnd() + "\u2026";
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. not truncated -> null -------------------------------------------
check("short body -> null", peekTooltip("hello world"), null);
check("exactly rowSlice -> null", peekTooltip("a".repeat(140)), null);
check("rowSlice+1 of single char -> peek", peekTooltip("a".repeat(141)), "a".repeat(141));

// --- 2. truncated -> flattened peek -------------------------------------
const longLine = "x".repeat(200);
check("200 chars passes through (under cap)", peekTooltip(longLine), longLine);

// --- 3. whitespace collapse ---------------------------------------------
const multiline = "line one\n\n\n" + "padding ".repeat(30); // > 140 raw
const peeked = peekTooltip(multiline);
check("no newlines in peek", /\n/.test(peeked), false);
check("interior runs collapse to single space", /  /.test(peeked), false);
check("peek is trimmed", peeked === peeked.trim(), true);

// --- 4. ellipsis on cap -------------------------------------------------
const huge = "y".repeat(1000);
const capped = peekTooltip(huge);
check("capped length = cap + ellipsis", capped.length, DEFAULT_CAP + 1);
check("capped ends with ellipsis", capped.endsWith("\u2026"), true);
check("capped body is first 500 y's", capped.slice(0, DEFAULT_CAP), "y".repeat(DEFAULT_CAP));

// --- 5. post-flatten re-fit -> null -------------------------------------
// A body that's >140 raw but collapses to <=140 after whitespace flatten
// (mostly newlines/spaces past the cut) shouldn't emit a redundant peek.
const mostlyWhitespace = "abc" + "\n".repeat(200);
check("whitespace-heavy collapses under slice -> null", peekTooltip(mostlyWhitespace), null);

// --- 6. custom rowSliceLength + cap -------------------------------------
check("custom rowSlice 10, fits -> null", peekTooltip("a".repeat(8), { rowSliceLength: 10 }), null);
check(
  "custom rowSlice 10, truncated -> peek",
  peekTooltip("a".repeat(20), { rowSliceLength: 10 }),
  "a".repeat(20),
);
check(
  "custom cap 5 with ellipsis",
  peekTooltip("z".repeat(50), { rowSliceLength: 10, cap: 5 }),
  "zzzzz\u2026",
);

// --- 7. defensive -------------------------------------------------------
check("null -> null", peekTooltip(null), null);
check("undefined -> null", peekTooltip(undefined), null);
check("number -> null", peekTooltip(12345), null);
check("object -> null", peekTooltip({ preview: "x" }), null);
check("empty string -> null", peekTooltip(""), null);
// Bad length options fall back to defaults rather than throwing.
check("NaN rowSlice falls back to 140", peekTooltip("a".repeat(141), { rowSliceLength: NaN }), "a".repeat(141));
check("negative cap falls back to 500", peekTooltip("b".repeat(600), { cap: -5 }).length, DEFAULT_CAP + 1);

console.log(`list-peek sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);

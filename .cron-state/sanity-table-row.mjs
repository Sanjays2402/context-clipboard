// Sanity: looksLikeTableRow + splitTableCells + escapeCell + tableRowForClip.
//
// Inline copies of src/lib/table-row.ts so this runs without a
// bundler. Covers detection rules, delimiter precedence (tab >
// comma+space > bare comma), cell escaping (pipe + whitespace),
// edge cases (single cell, empty input, mixed delimiters),
// and round-trip integration with buildSendActions-style inputs.

const TAB_RE = /\t/;
const PIPE_RE = /\|/g;

function looksLikeTableRow(c) {
  if (c.kind === "image") return false;
  const body = (c.content || "").trim();
  if (!body) return false;
  if (/\n/.test(body)) return false;
  if (TAB_RE.test(body)) return true;
  return /,/.test(body);
}

function splitTableCells(body) {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (TAB_RE.test(trimmed)) return trimmed.split("\t").map((c) => c.trim());
  return trimmed.split(/\s*,\s*/).map((c) => c.trim());
}

function escapeCell(value) {
  if (value == null) return "";
  return String(value).replace(PIPE_RE, "\\|").replace(/\s+/g, " ").trim();
}

function tableRowForClip(c) {
  if (!looksLikeTableRow(c)) return undefined;
  const cells = splitTableCells(c.content);
  if (cells.length <= 1) return undefined;
  const escaped = cells.map(escapeCell);
  return `| ${escaped.join(" | ")} |`;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. looksLikeTableRow: rejections ------------------------------------
check("rejects image", looksLikeTableRow({ kind: "image", content: "a\tb" }), false);
check("rejects empty content", looksLikeTableRow({ kind: "text", content: "" }), false);
check("rejects whitespace-only", looksLikeTableRow({ kind: "text", content: "   " }), false);
check("rejects multi-line (newline)", looksLikeTableRow({ kind: "text", content: "a\tb\nc\td" }), false);
check("rejects plain sentence (no delim)", looksLikeTableRow({ kind: "text", content: "Hello world" }), false);
check("rejects single word", looksLikeTableRow({ kind: "text", content: "foo" }), false);

// --- 2. looksLikeTableRow: acceptances -----------------------------------
check("accepts tab-separated", looksLikeTableRow({ kind: "text", content: "a\tb\tc" }), true);
check("accepts comma-separated", looksLikeTableRow({ kind: "text", content: "a,b,c" }), true);
check("accepts comma+space", looksLikeTableRow({ kind: "text", content: "a, b, c" }), true);
check("accepts mixed (tab wins)", looksLikeTableRow({ kind: "text", content: "a\tb,c" }), true);
check("accepts link kind too", looksLikeTableRow({ kind: "link", content: "a,b,c" }), true);

// --- 3. splitTableCells: tab precedence ----------------------------------
check("tab split: 3 cells", splitTableCells("a\tb\tc"), ["a", "b", "c"]);
check("tab split: trimmed", splitTableCells(" a \t b \t c "), ["a", "b", "c"]);
check("tab > comma when both present", splitTableCells("a\tb,c"), ["a", "b,c"]);

// --- 4. splitTableCells: comma+space precedence over bare comma ----------
check("comma+space split", splitTableCells("a, b, c"), ["a", "b", "c"]);
check("comma+space honored even with newline-like spaces", splitTableCells("a,  b,  c"), ["a", "b", "c"]);

// --- 5. splitTableCells: bare comma fallback -----------------------------
check("bare comma split", splitTableCells("a,b,c"), ["a", "b", "c"]);
check("bare comma: trimmed", splitTableCells(" a,b, c"), ["a", "b", "c"]);

// --- 6. splitTableCells: empty cells preserved ---------------------------
check("preserves empty leading", splitTableCells(",foo,bar"), ["", "foo", "bar"]);
check("preserves empty middle", splitTableCells("foo,,bar"), ["foo", "", "bar"]);
check("preserves empty trailing", splitTableCells("foo,bar,"), ["foo", "bar", ""]);
check("all empty", splitTableCells(",,"), ["", "", ""]);

// --- 7. splitTableCells: defensive ---------------------------------------
check("empty body → []", splitTableCells(""), []);
check("whitespace body → []", splitTableCells("   "), []);

// --- 8. escapeCell: defensive --------------------------------------------
check("escape null → empty", escapeCell(null), "");
check("escape undefined → empty", escapeCell(undefined), "");
check("escape numeric → string", escapeCell(42), "42");
check("escape empty → empty", escapeCell(""), "");

// --- 9. escapeCell: pipe + whitespace ------------------------------------
check("escape pipe", escapeCell("foo|bar"), "foo\\|bar");
check("escape double pipe", escapeCell("a|b|c"), "a\\|b\\|c");
check("collapse internal whitespace", escapeCell("foo   bar"), "foo bar");
check("collapse tab+space mix", escapeCell("foo\t \t bar"), "foo bar");
check("trim outer whitespace", escapeCell("  foo  "), "foo");
check("trim + collapse combined", escapeCell("  foo\t\tbar  "), "foo bar");

// --- 10. tableRowForClip: integration ------------------------------------
check("TSV → MD row",
  tableRowForClip({ kind: "text", content: "Alice\t30\tEngineer" }),
  "| Alice | 30 | Engineer |");
check("CSV → MD row",
  tableRowForClip({ kind: "text", content: "Alice,30,Engineer" }),
  "| Alice | 30 | Engineer |");
check("CSV+space → MD row",
  tableRowForClip({ kind: "text", content: "Alice, 30, Engineer" }),
  "| Alice | 30 | Engineer |");

// --- 11. tableRowForClip: undefined paths --------------------------------
check("image clip → undefined",
  tableRowForClip({ kind: "image", content: "data:..." }),
  undefined);
check("empty → undefined",
  tableRowForClip({ kind: "text", content: "" }),
  undefined);
check("plain sentence → undefined",
  tableRowForClip({ kind: "text", content: "Hello world" }),
  undefined);
check("multi-line → undefined",
  tableRowForClip({ kind: "text", content: "a,b\nc,d" }),
  undefined);

// --- 12. tableRowForClip: single-cell collapse → undefined ---------------
// Body is just ",," — split returns 3 empty cells, but the join "|  |  |  |"
// is still technically a valid row. Our gate is cells.length <= 1, so this
// 3-cell case is kept (degenerate but user asked for it). A genuine
// single-cell case has cells.length === 1.
check("body = single comma → 2 empty cells, kept",
  tableRowForClip({ kind: "text", content: "," }),
  "|  |  |");
check("body = single value (no delim) → undefined via looksLike",
  tableRowForClip({ kind: "text", content: "alone" }),
  undefined);

// --- 13. tableRowForClip: cell escaping in row context -------------------
check("escapes pipes in cells",
  tableRowForClip({ kind: "text", content: "a|b\tc|d\te|f" }),
  "| a\\|b | c\\|d | e\\|f |");
check("collapses internal whitespace in cells",
  tableRowForClip({ kind: "text", content: "a  b\tc   d" }),
  "| a b | c d |");

// --- 14. tableRowForClip: real-world spreadsheet paste -------------------
// Excel/Google Sheets copies cells as tab-separated text.
const sheetRow = "John Doe\tjohn@example.com\t2024-01-15\t$1,234.56";
check("Excel-style row preserved (comma-in-value is fine with tab delim)",
  tableRowForClip({ kind: "text", content: sheetRow }),
  "| John Doe | john@example.com | 2024-01-15 | $1,234.56 |");

// --- 15. tableRowForClip: log-line CSV -----------------------------------
check("log line CSV",
  tableRowForClip({ kind: "text", content: "2024-01-15,INFO,server started" }),
  "| 2024-01-15 | INFO | server started |");

// --- 16. tableRowForClip: trim outer whitespace --------------------------
check("outer trim before split (TSV)",
  tableRowForClip({ kind: "text", content: "  a\tb\tc  " }),
  "| a | b | c |");
check("outer trim before split (CSV)",
  tableRowForClip({ kind: "text", content: "  a,b,c  " }),
  "| a | b | c |");

console.log(`table-row sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);

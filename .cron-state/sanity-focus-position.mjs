// Sanity: formatFocusPosition from src/lib/focus-position.ts. Inline copy
// so this runs bundler-free.
//
// Covers 1-based grammar, clamping a stale index into range, null for
// empty/un-clampable, and the new "· N selected" selection tail
// (positive only; zero/missing/invalid drops the tail).

function formatFocusPosition(input) {
  if (!input) return null;
  const { activeIndex, total } = input;
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(activeIndex) || activeIndex < 0) return null;
  const t = Math.trunc(total);
  const clamped = Math.min(Math.max(0, Math.trunc(activeIndex)), t - 1);
  const base = `row ${clamped + 1} of ${t}`;
  const sel = input.selectedCount;
  if (sel != null && Number.isFinite(sel)) {
    const n = Math.trunc(sel);
    if (n > 0) return `${base} \u00b7 ${n} selected`;
  }
  return base;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. basic 1-based grammar -------------------------------------------
check("first row", formatFocusPosition({ activeIndex: 0, total: 28 }), "row 1 of 28");
check("middle row", formatFocusPosition({ activeIndex: 12, total: 28 }), "row 13 of 28");
check("last row", formatFocusPosition({ activeIndex: 27, total: 28 }), "row 28 of 28");
check("single-row list", formatFocusPosition({ activeIndex: 0, total: 1 }), "row 1 of 1");

// --- 2. clamping a stale / out-of-range index ---------------------------
check("over-range clamps to last", formatFocusPosition({ activeIndex: 99, total: 5 }), "row 5 of 5");
check("over-by-one clamps", formatFocusPosition({ activeIndex: 5, total: 5 }), "row 5 of 5");
check("float index truncates", formatFocusPosition({ activeIndex: 3.9, total: 10 }), "row 4 of 10");
check("float total truncates", formatFocusPosition({ activeIndex: 0, total: 10.7 }), "row 1 of 10");

// --- 3. null cases ------------------------------------------------------
check("null input", formatFocusPosition(null), null);
check("undefined input", formatFocusPosition(undefined), null);
check("zero total", formatFocusPosition({ activeIndex: 0, total: 0 }), null);
check("negative total", formatFocusPosition({ activeIndex: 0, total: -3 }), null);
check("negative index", formatFocusPosition({ activeIndex: -1, total: 5 }), null);
check("NaN index", formatFocusPosition({ activeIndex: NaN, total: 5 }), null);
check("NaN total", formatFocusPosition({ activeIndex: 0, total: NaN }), null);
check("Infinity total", formatFocusPosition({ activeIndex: 0, total: Infinity }), null);

// --- 4. selection tail (new) --------------------------------------------
check("positive selection appends tail", formatFocusPosition({ activeIndex: 2, total: 28, selectedCount: 4 }), "row 3 of 28 \u00b7 4 selected");
check("single selection still tail (count, not grammar)", formatFocusPosition({ activeIndex: 0, total: 10, selectedCount: 1 }), "row 1 of 10 \u00b7 1 selected");
check("zero selection drops tail", formatFocusPosition({ activeIndex: 0, total: 10, selectedCount: 0 }), "row 1 of 10");
check("missing selection drops tail", formatFocusPosition({ activeIndex: 0, total: 10 }), "row 1 of 10");
check("negative selection drops tail", formatFocusPosition({ activeIndex: 0, total: 10, selectedCount: -2 }), "row 1 of 10");
check("NaN selection drops tail", formatFocusPosition({ activeIndex: 0, total: 10, selectedCount: NaN }), "row 1 of 10");
check("Infinity selection drops tail", formatFocusPosition({ activeIndex: 0, total: 10, selectedCount: Infinity }), "row 1 of 10");
check("float selection truncates", formatFocusPosition({ activeIndex: 0, total: 10, selectedCount: 3.9 }), "row 1 of 10 \u00b7 3 selected");
// Tail composes with clamping.
check("selection tail + clamped index", formatFocusPosition({ activeIndex: 99, total: 5, selectedCount: 2 }), "row 5 of 5 \u00b7 2 selected");
// Empty-list null wins over a selection (nothing to point at).
check("empty list + selection still null", formatFocusPosition({ activeIndex: 0, total: 0, selectedCount: 3 }), null);

console.log(`focus-position sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);

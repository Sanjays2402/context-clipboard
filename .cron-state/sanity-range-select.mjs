// Sanity: computeRange + idsForRange + rangeIdsToAdd from
// src/lib/range-select.ts. Inline copies so this runs bundler-free.
//
// Covers direction-agnostic spans, bounds clamping, no-anchor
// collapse, empty/degenerate lists, stale-index skipping in the id
// projection, and the add-only idempotent intent.

function clampIndex(i, max) {
  if (max < 0) return -1;
  if (i < 0) return 0;
  if (i > max) return max;
  return i;
}

function computeRange(anchor, target, length) {
  if (!Number.isFinite(target) || !Number.isFinite(length)) return null;
  if (length <= 0) return null;
  const max = length - 1;
  const t = clampIndex(Math.trunc(target), max);
  if (t < 0) return null;
  const rawAnchor =
    anchor == null || !Number.isFinite(anchor) ? t : clampIndex(Math.trunc(anchor), max);
  const from = Math.min(rawAnchor, t);
  const to = Math.max(rawAnchor, t);
  const indices = [];
  for (let i = from; i <= to; i++) indices.push(i);
  return { indices, from, to };
}

function idsForRange(items, indices) {
  const out = [];
  for (const i of indices) {
    const item = items[i];
    if (item && typeof item.id === "string") out.push(item.id);
  }
  return out;
}

function rangeIdsToAdd(rangeIds, alreadySelected) {
  const out = [];
  for (const id of rangeIds) {
    if (!alreadySelected.has(id)) out.push(id);
  }
  return out;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. computeRange: downward span -------------------------------------
check("anchor 1 to target 4", computeRange(1, 4, 10).indices, [1, 2, 3, 4]);
check("anchor 1 to target 4 from", computeRange(1, 4, 10).from, 1);
check("anchor 1 to target 4 to", computeRange(1, 4, 10).to, 4);

// --- 2. computeRange: upward span (direction-agnostic) ------------------
check("anchor 7 to target 3 ascending", computeRange(7, 3, 10).indices, [3, 4, 5, 6, 7]);
check("anchor 7 to target 3 from", computeRange(7, 3, 10).from, 3);
check("anchor 7 to target 3 to", computeRange(7, 3, 10).to, 7);

// --- 3. single-row ranges -----------------------------------------------
check("anchor == target", computeRange(5, 5, 10).indices, [5]);
check("no anchor collapses to target", computeRange(null, 3, 10).indices, [3]);
check("undefined anchor collapses", computeRange(undefined, 6, 10).indices, [6]);
check("NaN anchor collapses to target", computeRange(NaN, 2, 10).indices, [2]);

// --- 4. bounds clamping --------------------------------------------------
check("target beyond end clamps", computeRange(8, 99, 10).indices, [8, 9]);
check("anchor beyond end clamps", computeRange(99, 7, 10).indices, [7, 8, 9]);
check("negative target clamps to 0", computeRange(3, -5, 10).indices, [0, 1, 2, 3]);
check("negative anchor clamps to 0", computeRange(-5, 3, 10).indices, [0, 1, 2, 3]);
check("full list span", computeRange(0, 4, 5).indices, [0, 1, 2, 3, 4]);

// --- 5. degenerate lists -------------------------------------------------
check("empty list null", computeRange(0, 0, 0), null);
check("negative length null", computeRange(0, 0, -3), null);
check("single-item list", computeRange(0, 0, 1).indices, [0]);
check("single-item clamps target", computeRange(0, 5, 1).indices, [0]);
check("non-finite length null", computeRange(0, 1, Infinity), null);
check("non-finite target null", computeRange(0, Infinity, 10), null);

// --- 6. float truncation -------------------------------------------------
check("float target truncates", computeRange(1, 4.9, 10).indices, [1, 2, 3, 4]);
check("float anchor truncates", computeRange(2.7, 5, 10).indices, [2, 3, 4, 5]);

// --- 7. idsForRange ------------------------------------------------------
const items = [
  { id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" },
];
check("ids for full range", idsForRange(items, [0, 1, 2, 3, 4]), ["a", "b", "c", "d", "e"]);
check("ids for partial", idsForRange(items, [1, 3]), ["b", "d"]);
check("ids skip out-of-bounds", idsForRange(items, [3, 4, 5, 6]), ["d", "e"]);
check("ids empty indices", idsForRange(items, []), []);
check("ids skip non-string id", idsForRange([{ id: "x" }, { id: 5 }, { id: "z" }], [0, 1, 2]), ["x", "z"]);
check("ids skip missing item", idsForRange([{ id: "x" }], [0, 1]), ["x"]);

// --- 8. rangeIdsToAdd: add-only idempotence -----------------------------
check("add all when none selected", rangeIdsToAdd(["a", "b", "c"], new Set()), ["a", "b", "c"]);
check("skip already selected", rangeIdsToAdd(["a", "b", "c"], new Set(["b"])), ["a", "c"]);
check("all selected adds nothing", rangeIdsToAdd(["a", "b"], new Set(["a", "b"])), []);
check("empty range adds nothing", rangeIdsToAdd([], new Set(["a"])), []);

// --- 9. realistic end-to-end --------------------------------------------
// User cmd-clicks index 2 (anchor=2, selects "c"), then shift-clicks
// index 5 → range [2..5] = c,d,e,f; "c" already selected so add d,e,f.
const list = [
  { id: "c0" }, { id: "c1" }, { id: "c2" }, { id: "c3" },
  { id: "c4" }, { id: "c5" }, { id: "c6" },
];
const r = computeRange(2, 5, list.length);
const rangeIds = idsForRange(list, r.indices);
check("e2e range ids", rangeIds, ["c2", "c3", "c4", "c5"]);
const sel = new Set(["c2"]);
check("e2e add list", rangeIdsToAdd(rangeIds, sel), ["c3", "c4", "c5"]);
// Apply, then a second shift-click from same anchor to index 0 →
// range [0..2] = c0,c1,c2; c2 already in, add c0,c1.
for (const id of rangeIdsToAdd(rangeIds, sel)) sel.add(id);
const r2 = computeRange(2, 0, list.length);
const rangeIds2 = idsForRange(list, r2.indices);
check("e2e second extend ids", rangeIds2, ["c0", "c1", "c2"]);
check("e2e second add list", rangeIdsToAdd(rangeIds2, sel), ["c0", "c1"]);

console.log(`range-select sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);

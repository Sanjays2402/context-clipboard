// Sanity: lib/tag-chip-nav.ts (roving-tabindex chip keyboard nav).
// Inline copies so this runs bundler-free. Covers arrow clamping,
// Home/End, empty row, stale/NaN index clamp, every removal landing
// case, and the key predicates.

function safeCount(count) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.trunc(count);
}
function clampIndex(index, count) {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), count - 1);
}
function nextChipFocusIndex(count, current, key) {
  const n = safeCount(count);
  if (n === 0) return -1;
  const cur = clampIndex(current, n);
  switch (key) {
    case "ArrowLeft": return Math.max(0, cur - 1);
    case "ArrowRight": return Math.min(n - 1, cur + 1);
    case "Home": return 0;
    case "End": return n - 1;
    default: return cur;
  }
}
function focusIndexAfterRemove(countBefore, removedIndex) {
  const n = safeCount(countBefore);
  if (n <= 1) return -1;
  if (!Number.isInteger(removedIndex) || removedIndex < 0 || removedIndex >= n) return -1;
  const after = n - 1;
  return Math.min(removedIndex, after - 1);
}
function isChipNavKey(key) {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "Home" || key === "End";
}
function isChipRemoveKey(key) {
  return key === "Backspace" || key === "Delete";
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

ck("right from 0", nextChipFocusIndex(4, 0, "ArrowRight"), 1);
ck("left from 0 clamps", nextChipFocusIndex(4, 0, "ArrowLeft"), 0);
ck("right from last clamps", nextChipFocusIndex(4, 3, "ArrowRight"), 3);
ck("left from last", nextChipFocusIndex(4, 3, "ArrowLeft"), 2);
ck("Home", nextChipFocusIndex(4, 3, "Home"), 0);
ck("End", nextChipFocusIndex(4, 1, "End"), 3);
ck("nav empty -> -1", nextChipFocusIndex(0, 0, "ArrowRight"), -1);
ck("stale idx clamps then steps", nextChipFocusIndex(3, 99, "ArrowLeft"), 1);
ck("nan idx -> 0 then right", nextChipFocusIndex(3, NaN, "ArrowRight"), 1);

ck("remove middle -> same slot", focusIndexAfterRemove(4, 1), 1);
ck("remove last -> new last", focusIndexAfterRemove(4, 3), 2);
ck("remove first -> 0", focusIndexAfterRemove(4, 0), 0);
ck("remove only chip -> -1 (input)", focusIndexAfterRemove(1, 0), -1);
ck("remove from empty -> -1", focusIndexAfterRemove(0, 0), -1);
ck("remove out-of-range -> -1", focusIndexAfterRemove(4, 9), -1);
ck("remove second-to-last of 2 -> 0", focusIndexAfterRemove(2, 0), 0);
ck("remove last of 2 -> 0", focusIndexAfterRemove(2, 1), 0);

ck("isNav left", isChipNavKey("ArrowLeft"), true);
ck("isNav End", isChipNavKey("End"), true);
ck("isNav not Enter", isChipNavKey("Enter"), false);
ck("isRemove Backspace", isChipRemoveKey("Backspace"), true);
ck("isRemove Delete", isChipRemoveKey("Delete"), true);
ck("isRemove not x", isChipRemoveKey("x"), false);

console.log(`tag-chip-nav: ${p}/${t}`);
process.exit(p === t ? 0 : 1);

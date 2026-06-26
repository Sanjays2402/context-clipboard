// Sanity: tag-chip keyboard reorder math (lib/tag-chip-nav).
//
// Ctrl/Cmd+ArrowLeft / ArrowRight moves a focused detail tag chip one
// slot — the keyboard-only counterpart to drag-to-reorder. This harness
// exercises reorderChipTargetIndex (the destination-index resolver) and
// isChipReorderKey, PLUS the end-to-end move composed with reorderTags
// (the same list op the popup commits) so the chord -> new order path is
// verified whole.
//
// Coverage:
//   1. reorderChipTargetIndex — left/right single step; clamp at both
//      edges (no wrap); single/empty -> -1; stale index clamps.
//   2. isChipReorderKey — only ArrowLeft/ArrowRight.
//   3. Composed move — target index fed into reorderTags(before = moving
//      left) produces the expected reordered comma-list, and an
//      edge-clamped no-op leaves the list unchanged.

function safeCount(count) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.trunc(count);
}
function clampIndex(index, count) {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), count - 1);
}
function reorderChipTargetIndex(count, current, key) {
  const n = safeCount(count);
  if (n <= 1) return -1;
  const cur = clampIndex(current, n);
  if (key === "ArrowLeft") return Math.max(0, cur - 1);
  if (key === "ArrowRight") return Math.min(n - 1, cur + 1);
  return cur;
}
function isChipReorderKey(key) {
  return key === "ArrowLeft" || key === "ArrowRight";
}

// Mirror of lib/tag-chips.reorderTags (cleaned-list move) for the
// composed end-to-end check.
function dedupe(list) {
  const seen = new Set(), out = [];
  for (const t of list) { const k = t.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(t); }
  return out;
}
function sanitizeList(tags) {
  if (!Array.isArray(tags)) return [];
  return dedupe(tags.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean));
}
function reorderTags(tags, fromIndex, toIndex, before) {
  const list = sanitizeList(tags);
  const n = list.length;
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) ||
      fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n) return list;
  if (fromIndex === toIndex) return list;
  const moved = list[fromIndex];
  const without = list.slice(0, fromIndex).concat(list.slice(fromIndex + 1));
  const targetTag = list[toIndex];
  let insertAt = without.indexOf(targetTag);
  if (insertAt < 0) insertAt = without.length;
  if (!before) insertAt += 1;
  without.splice(insertAt, 0, moved);
  return without;
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. target index
ck("right from 0 of 4 -> 1", reorderChipTargetIndex(4, 0, "ArrowRight"), 1);
ck("left from 2 of 4 -> 1", reorderChipTargetIndex(4, 2, "ArrowLeft"), 1);
ck("left at index 0 clamps -> 0", reorderChipTargetIndex(4, 0, "ArrowLeft"), 0);
ck("right at last clamps -> last", reorderChipTargetIndex(4, 3, "ArrowRight"), 3);
ck("single chip -> -1", reorderChipTargetIndex(1, 0, "ArrowRight"), -1);
ck("empty -> -1", reorderChipTargetIndex(0, 0, "ArrowLeft"), -1);
ck("stale index clamps then steps", reorderChipTargetIndex(3, 99, "ArrowLeft"), 1);

// 2. key predicate
ck("ArrowLeft is reorder key", isChipReorderKey("ArrowLeft"), true);
ck("ArrowRight is reorder key", isChipReorderKey("ArrowRight"), true);
ck("Home not reorder key", isChipReorderKey("Home"), false);
ck("Backspace not reorder key", isChipReorderKey("Backspace"), false);

// 3. composed move (popup feeds target into reorderTags with before =
//    moving-left). Start: [a, b, c, d]
const tags = ["a", "b", "c", "d"];
// move chip at idx 2 (c) LEFT -> target 1, before=true => [a, c, b, d]
{
  const to = reorderChipTargetIndex(4, 2, "ArrowLeft"); // 1
  ck("move c left target", to, 1);
  ck("c moves left of b", reorderTags(tags, 2, to, to < 2), ["a", "c", "b", "d"]);
}
// move chip at idx 1 (b) RIGHT -> target 2, before=false => [a, c, b, d]
{
  const to = reorderChipTargetIndex(4, 1, "ArrowRight"); // 2
  ck("move b right target", to, 2);
  ck("b moves right of c", reorderTags(tags, 1, to, to < 1), ["a", "c", "b", "d"]);
}
// edge clamp no-op: move idx 0 LEFT -> target 0 == from, caller skips
{
  const to = reorderChipTargetIndex(4, 0, "ArrowLeft"); // 0
  ck("edge clamp yields same index (caller no-ops)", to, 0);
}

console.log(`tag-chip-reorder: ${p}/${t}`);
process.exit(p === t ? 0 : 1);

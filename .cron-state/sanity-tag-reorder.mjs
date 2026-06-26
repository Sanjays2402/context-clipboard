// Sanity: detail tag-chip drag-to-reorder (lib/tag-chips.reorderTags).
//
// The detail chip row maps 1:1 to the clip's comma-separated tag string;
// dragging a chip rearranges the tags without retyping. This harness
// exercises the pure reorder math (move from->to, before/after drop edge)
// in isolation (inline copy, bundler-free) so the DnD drop handler and
// the stored comma string can never disagree.
//
// Coverage:
//   1. Move-right (insert after a later chip).
//   2. Move-left (insert before an earlier chip).
//   3. before vs after drop edge.
//   4. No-op moves (from===to, out-of-range) return cleaned list.
//   5. Cleaning/dedupe still applies (round-trips with parse).

// --- inline copies of the lib/tag-chips primitives ---
function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const tag of list) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}
function sanitizeList(tags) {
  if (!Array.isArray(tags)) return [];
  return dedupe(tags.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean));
}
function reorderTags(tags, fromIndex, toIndex, before) {
  const list = sanitizeList(tags);
  const n = list.length;
  if (
    !Number.isInteger(fromIndex) || !Number.isInteger(toIndex) ||
    fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n
  ) return list;
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

const base = ["a", "b", "c", "d"];

// 1. move-right: drag a (0) after c (2)
ck("a after c", reorderTags(base, 0, 2, false), ["b", "c", "a", "d"]);
// move-right before: drag a (0) before c (2) -> lands just before c
ck("a before c", reorderTags(base, 0, 2, true), ["b", "a", "c", "d"]);

// 2. move-left: drag d (3) before b (1)
ck("d before b", reorderTags(base, 3, 1, true), ["a", "d", "b", "c"]);
// move-left after: drag d (3) after b (1)
ck("d after b", reorderTags(base, 3, 1, false), ["a", "b", "d", "c"]);

// 3. adjacent swap: drag a (0) after b (1)
ck("a after b (swap)", reorderTags(base, 0, 1, false), ["b", "a", "c", "d"]);
// drag b (1) before a (0)
ck("b before a (swap)", reorderTags(base, 1, 0, true), ["b", "a", "c", "d"]);

// 4. no-ops
ck("from===to no-op", reorderTags(base, 2, 2, true), ["a", "b", "c", "d"]);
ck("from out of range", reorderTags(base, 9, 1, true), ["a", "b", "c", "d"]);
ck("to out of range", reorderTags(base, 0, 9, false), ["a", "b", "c", "d"]);
ck("non-integer idx", reorderTags(base, 0.5, 2, false), ["a", "b", "c", "d"]);
ck("null list -> []", reorderTags(null, 0, 1, true), []);

// 5. cleaning still applies
ck("dirty input cleaned", reorderTags(["a", " b ", "", "a", "c"], 0, 2, false), ["b", "c", "a"]);
// (cleaned = [a,b,c]; move a(0) after c(2) -> [b,c,a])

// move first -> last position (after last chip)
ck("first to last", reorderTags(["x", "y", "z"], 0, 2, false), ["y", "z", "x"]);
// move last -> first position (before first chip)
ck("last to first", reorderTags(["x", "y", "z"], 2, 0, true), ["z", "x", "y"]);

console.log(`tag-reorder: ${p}/${t}`);
process.exit(p === t ? 0 : 1);

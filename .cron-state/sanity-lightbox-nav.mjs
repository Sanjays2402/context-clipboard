// Sanity: image-lightbox prev/next traversal (lib/lightbox-nav).
//
// The lightbox steps through the image-only subsequence of the current
// list with wrap-around, so a user reviewing a run of screenshots never
// has to close + re-open it per image. This harness exercises the pure
// core (inline copies, bundler-free): the zoomable membership filter,
// the prev/next step math + wrap, the position pill, and the toast.
//
// Coverage:
//   1. imageNavIds — keeps image clips with usable content, in order;
//      drops non-images, empty-content images, malformed entries.
//   2. stepLightbox — forward/back in range; wrap at both edges; single
//      image -> null; stale id -> null; bad direction -> null; wrap off.
//   3. lightboxPosition — 1-based index/total; null for lone image /
//      stale id.
//   4. formatLightboxWrapToast — direction-specific copy.

function isZoomable(c) {
  return !!c && c.kind === "image" && typeof c.content === "string" && c.content.length > 0;
}
function imageNavIds(clips) {
  if (!Array.isArray(clips)) return [];
  const out = [];
  for (const c of clips) {
    if (isZoomable(c) && typeof c.id === "string" && c.id !== "") out.push(c.id);
  }
  return out;
}
function stepLightbox(ids, currentId, direction, wrap) {
  if (direction !== -1 && direction !== 1) return null;
  if (!Array.isArray(ids) || ids.length <= 1) return null;
  if (typeof currentId !== "string" || currentId === "") return null;
  const cur = ids.indexOf(currentId);
  if (cur < 0) return null;
  const n = ids.length;
  const raw = cur + direction;
  if (raw >= 0 && raw <= n - 1) return { id: ids[raw], wrapped: false };
  if (!wrap) return null;
  const wrappedIdx = raw < 0 ? n - 1 : 0;
  return { id: ids[wrappedIdx], wrapped: true };
}
function lightboxPosition(ids, currentId) {
  if (!Array.isArray(ids) || ids.length <= 1) return null;
  if (typeof currentId !== "string" || currentId === "") return null;
  const i = ids.indexOf(currentId);
  if (i < 0) return null;
  return { index: i + 1, total: ids.length };
}
function formatLightboxWrapToast(direction) {
  return direction === 1 ? "Looped to the first image" : "Looped to the last image";
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. membership filter — image-with-content only, in list order
const mixed = [
  { id: "t1", kind: "text", content: "hi" },
  { id: "i1", kind: "image", content: "data:a" },
  { id: "l1", kind: "link", content: "http://x" },
  { id: "i2", kind: "image", content: "data:b" },
  { id: "bad", kind: "image", content: "" },     // image w/ no content -> dropped
  { id: "i3", kind: "image", content: "data:c" },
  null,                                          // malformed -> dropped
  { id: "", kind: "image", content: "data:d" },  // no id -> dropped
];
ck("imageNavIds keeps images w/ content in order", imageNavIds(mixed), ["i1", "i2", "i3"]);
ck("imageNavIds nullish -> []", imageNavIds(null), []);
ck("imageNavIds no images -> []", imageNavIds([{ id: "t", kind: "text", content: "x" }]), []);

const ids = ["i1", "i2", "i3"];

// 2. step in range
ck("next from i1 -> i2", stepLightbox(ids, "i1", 1, true), { id: "i2", wrapped: false });
ck("prev from i2 -> i1", stepLightbox(ids, "i2", -1, true), { id: "i1", wrapped: false });
ck("next from i2 -> i3", stepLightbox(ids, "i2", 1, true), { id: "i3", wrapped: false });
// wrap at edges
ck("next from last wraps to first", stepLightbox(ids, "i3", 1, true), { id: "i1", wrapped: true });
ck("prev from first wraps to last", stepLightbox(ids, "i1", -1, true), { id: "i3", wrapped: true });
// wrap off -> dead-end null
ck("next from last, wrap off -> null", stepLightbox(ids, "i3", 1, false), null);
ck("prev from first, wrap off -> null", stepLightbox(ids, "i1", -1, false), null);
// in-range step ignores wrap flag
ck("mid step wrap off still works", stepLightbox(ids, "i1", 1, false), { id: "i2", wrapped: false });
// degenerate
ck("single image -> null", stepLightbox(["only"], "only", 1, true), null);
ck("empty ids -> null", stepLightbox([], "x", 1, true), null);
ck("stale id -> null", stepLightbox(ids, "gone", 1, true), null);
ck("bad direction -> null", stepLightbox(ids, "i1", 0, true), null);

// 3. position pill (1-based)
ck("position i1 -> 1 of 3", lightboxPosition(ids, "i1"), { index: 1, total: 3 });
ck("position i3 -> 3 of 3", lightboxPosition(ids, "i3"), { index: 3, total: 3 });
ck("position lone image -> null", lightboxPosition(["only"], "only"), null);
ck("position stale id -> null", lightboxPosition(ids, "gone"), null);

// 4. wrap toast copy
ck("wrap toast forward", formatLightboxWrapToast(1), "Looped to the first image");
ck("wrap toast back", formatLightboxWrapToast(-1), "Looped to the last image");

console.log(`lightbox-nav: ${p}/${t}`);
process.exit(p === t ? 0 : 1);

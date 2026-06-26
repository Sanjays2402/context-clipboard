// Sanity: image-lightbox position dot-strip model (lib/lightbox-dots).
//
// The lightbox shows a clickable dot per image so the user can jump
// straight to image K instead of stepping prev/next. This harness
// exercises the pure model (inline copies, bundler-free).
//
// Coverage:
//   1. dotStripVisible: hidden for 0/1, shown for 2+.
//   2. lightboxDots: one dot per image, 1-based index, total, active.
//   3. active resolution: exactly one active, none for stale id, first
//      match only on a freak duplicate.
//   4. dotLabel: grammar + "(current)" tail.
//   5. defensive: nullish / single / malformed entries.

function dotStripVisible(ids) {
  return Array.isArray(ids) && ids.length > 1;
}
function lightboxDots(ids, currentId) {
  if (!Array.isArray(ids) || ids.length <= 1) return [];
  const total = ids.length;
  let activeSeen = false;
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (typeof id !== "string" || id === "") continue;
    const isActive = !activeSeen && id === currentId;
    if (isActive) activeSeen = true;
    out.push({ id, index: i + 1, total, active: isActive });
  }
  return out;
}
function dotLabel(dot) {
  if (!dot) return "";
  const base = `Image ${dot.index} of ${dot.total}`;
  return dot.active ? `${base} (current)` : base;
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  const gg = JSON.stringify(g);
  const ww = JSON.stringify(w);
  if (gg === ww) p++;
  else console.error("FAIL", n, "got", gg, "want", ww);
}

// 1. dotStripVisible
ck("visible empty", dotStripVisible([]), false);
ck("visible single", dotStripVisible(["a"]), false);
ck("visible pair", dotStripVisible(["a", "b"]), true);
ck("visible many", dotStripVisible(["a", "b", "c", "d"]), true);
ck("visible null", dotStripVisible(null), false);

// 2. lightboxDots — shape
const dots = lightboxDots(["a", "b", "c"], "b");
ck("3 dots", dots.length, 3);
ck("dot0 id", dots[0].id, "a");
ck("dot0 index 1-based", dots[0].index, 1);
ck("dot2 index", dots[2].index, 3);
ck("dot total", dots[1].total, 3);

// 3. active resolution
ck("dot0 inactive", dots[0].active, false);
ck("dot1 active (current b)", dots[1].active, true);
ck("dot2 inactive", dots[2].active, false);
ck(
  "exactly one active",
  dots.filter((d) => d.active).length,
  1,
);
const stale = lightboxDots(["a", "b"], "zzz");
ck("stale current -> none active", stale.filter((d) => d.active).length, 0);
const dup = lightboxDots(["x", "x", "y"], "x");
ck("freak duplicate -> first match only active", dup.filter((d) => d.active).length, 1);
ck("freak duplicate -> dot0 is the active one", dup[0].active, true);
ck("freak duplicate -> dot1 not active", dup[1].active, false);

// 4. dotLabel
ck("label inactive", dotLabel({ id: "a", index: 2, total: 5, active: false }), "Image 2 of 5");
ck("label active", dotLabel({ id: "a", index: 2, total: 5, active: true }), "Image 2 of 5 (current)");
ck("label null", dotLabel(null), "");

// 5. defensive
ck("single -> empty dots", lightboxDots(["a"], "a").length, 0);
ck("empty -> empty dots", lightboxDots([], "a").length, 0);
ck("null -> empty dots", lightboxDots(null, "a").length, 0);
const sparse = lightboxDots(["a", "", "c"], "c");
ck("malformed empty-id skipped", sparse.length, 2);
ck("malformed -> indices follow surviving positions", sparse[1].index, 3);

console.log(`lightbox-dots sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);

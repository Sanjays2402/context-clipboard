// Sanity: lightbox dot-strip windowing for long image runs
// (lib/lightbox-dots.windowLightboxDots + dotWindowLabel).
//
// For a run longer than the dot cap, the strip shows a sliding band
// centred on the active dot (so a 40-screenshot run shows ~15 dots +
// "…" edge cues instead of wrapping into a wall). Short runs render
// every dot unchanged. Inline copies of the pure helpers (bundler-free).
//
// Coverage:
//   1. short run (<= cap): every dot, not windowed, no edges.
//   2. long run centred on a middle dot: cap dots, both edges truncated.
//   3. active near the start: window hugs the start (no leading "…").
//   4. active near the end: window hugs the end (no trailing "…").
//   5. active dot ALWAYS inside the returned window.
//   6. window size is exactly the cap for a long run.
//   7. no active dot -> anchors at the start.
//   8. dotWindowLabel = "<index> of <total>" from the active dot.
//   9. defensive: nullish list, cap < 1.

const DEFAULT_MAX_DOTS = 15;

function windowLightboxDots(dots, maxVisible = DEFAULT_MAX_DOTS) {
  const all = Array.isArray(dots) ? dots : [];
  const total = all.length;
  const cap = Number.isFinite(maxVisible) && maxVisible >= 1 ? Math.floor(maxVisible) : 1;
  if (total <= cap) {
    return { dots: all.slice(), hasMoreBefore: false, hasMoreAfter: false, windowed: false };
  }
  let activeIdx = 0;
  for (let i = 0; i < total; i++) {
    if (all[i] && all[i].active) {
      activeIdx = i;
      break;
    }
  }
  const half = Math.floor(cap / 2);
  let start = activeIdx - half;
  if (start < 0) start = 0;
  if (start > total - cap) start = total - cap;
  const end = start + cap;
  return {
    dots: all.slice(start, end),
    hasMoreBefore: start > 0,
    hasMoreAfter: end < total,
    windowed: true,
  };
}
function dotWindowLabel(dots) {
  if (!Array.isArray(dots)) return "";
  for (const d of dots) {
    if (d && d.active) return `${d.index} of ${d.total}`;
  }
  return "";
}

// Build a fake dot list of length n with the active dot at index `act`.
function mk(n, act) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `c${i}`, index: i + 1, total: n, active: i === act });
  }
  return out;
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. short run (<= cap)
{
  const w = windowLightboxDots(mk(8, 3), 15);
  ck("short run shows every dot", w.dots.length, 8);
  ck("short run not windowed", w.windowed, false);
  ck("short run no leading edge", w.hasMoreBefore, false);
  ck("short run no trailing edge", w.hasMoreAfter, false);
}

// 2. long run centred on a middle dot (40 dots, active at index 20, cap 15)
{
  const w = windowLightboxDots(mk(40, 20), 15);
  ck("long run windowed to cap", w.dots.length, 15);
  ck("long run is windowed", w.windowed, true);
  ck("long run middle has leading edge", w.hasMoreBefore, true);
  ck("long run middle has trailing edge", w.hasMoreAfter, true);
  // half = 7, start = 20 - 7 = 13, so first visible index is 13 -> label 14.
  ck("long run window start centred", w.dots[0].index, 14);
}

// 3. active near the start (active at 1)
{
  const w = windowLightboxDots(mk(40, 1), 15);
  ck("near-start hugs start (no leading edge)", w.hasMoreBefore, false);
  ck("near-start has trailing edge", w.hasMoreAfter, true);
  ck("near-start window begins at dot 1", w.dots[0].index, 1);
}

// 4. active near the end (active at 38, total 40)
{
  const w = windowLightboxDots(mk(40, 38), 15);
  ck("near-end has leading edge", w.hasMoreBefore, true);
  ck("near-end hugs end (no trailing edge)", w.hasMoreAfter, false);
  ck("near-end window ends at last dot", w.dots[w.dots.length - 1].index, 40);
}

// 5. active dot is always inside the window (scan every position)
{
  let allInside = true;
  for (let a = 0; a < 40; a++) {
    const w = windowLightboxDots(mk(40, a), 15);
    if (!w.dots.some((d) => d.active)) allInside = false;
  }
  ck("active dot always inside window across all positions", allInside, true);
}

// 6. window size is exactly cap for a long run, every position
{
  let allCap = true;
  for (let a = 0; a < 40; a++) {
    const w = windowLightboxDots(mk(40, a), 15);
    if (w.dots.length !== 15) allCap = false;
  }
  ck("window size always = cap for long run", allCap, true);
}

// 7. no active dot -> anchors at the start
{
  const dots = mk(40, -1); // none active
  const w = windowLightboxDots(dots, 15);
  ck("no active anchors at start", w.dots[0].index, 1);
  ck("no active still windowed", w.windowed, true);
  ck("no active no leading edge", w.hasMoreBefore, false);
}

// 8. dotWindowLabel from active dot
{
  ck("label from active dot", dotWindowLabel(mk(40, 20)), "21 of 40");
  ck("label empty when no active", dotWindowLabel(mk(40, -1)), "");
}

// 9. defensive
{
  const w = windowLightboxDots(null, 15);
  ck("nullish list -> empty", w.dots.length, 0);
  ck("nullish list -> not windowed", w.windowed, false);
  const w2 = windowLightboxDots(mk(5, 2), 0); // cap < 1 clamps to 1
  ck("cap<1 clamps to 1 (non-empty window)", w2.dots.length, 1);
  ck("cap<1 keeps active in window", w2.dots[0].active, true);
  ck("label nullish list -> empty string", dotWindowLabel(null), "");
}

console.log(`lightbox-dots-window sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);

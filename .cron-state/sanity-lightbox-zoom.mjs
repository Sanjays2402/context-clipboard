// Sanity: image-lightbox zoom level core (lib/lightbox-zoom).
//
// The lightbox opens an image at fit-to-viewport (1.0 = the floor); +/-
// step the scale, 0 resets to fit, with a clamp at [1, MAX] and round-
// percent readouts. This harness exercises the pure core (inline copies,
// bundler-free): clamp, stepping with boundary saturation, the can-step
// predicates, the percent label, and the CSS transform string.
//
// Coverage:
//   1. clampZoom — into [1, 5]; nullish/NaN -> fit.
//   2. stepZoom — in/out by 0.5; saturates at floor + ceiling; bad dir.
//   3. isZoomed / canZoomIn / canZoomOut — boundary predicates.
//   4. resetZoom — always fit.
//   5. formatZoomPercent — round whole-percent readout.
//   6. zoomTransform — scale(N) with trimmed number.

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;

function coerce(z) {
  return typeof z === "number" && Number.isFinite(z) ? z : MIN_ZOOM;
}
function clampZoom(z) {
  const v = coerce(z);
  if (v < MIN_ZOOM) return MIN_ZOOM;
  if (v > MAX_ZOOM) return MAX_ZOOM;
  return v;
}
function stepZoom(current, direction) {
  const cur = clampZoom(current);
  if (direction !== -1 && direction !== 1) return cur;
  return clampZoom(cur + direction * ZOOM_STEP);
}
function resetZoom() {
  return MIN_ZOOM;
}
function isZoomed(z) {
  return clampZoom(z) > MIN_ZOOM + 1e-9;
}
function canZoomIn(z) {
  return clampZoom(z) < MAX_ZOOM - 1e-9;
}
function canZoomOut(z) {
  return clampZoom(z) > MIN_ZOOM + 1e-9;
}
function formatZoomPercent(z) {
  return `${Math.round(clampZoom(z) * 100)}%`;
}
function zoomTransform(z) {
  const v = clampZoom(z);
  const n = Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(3)));
  return `scale(${n})`;
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. clampZoom
ck("clamp fit", clampZoom(1), 1);
ck("clamp below floor", clampZoom(0.2), 1);
ck("clamp negative", clampZoom(-3), 1);
ck("clamp above ceil", clampZoom(9), 5);
ck("clamp mid", clampZoom(2.5), 2.5);
ck("clamp null -> fit", clampZoom(null), 1);
ck("clamp undefined -> fit", clampZoom(undefined), 1);
ck("clamp NaN -> fit", clampZoom(NaN), 1);
ck("clamp Infinity -> fit (not finite)", clampZoom(Infinity), 1);

// 2. stepZoom
ck("step in from fit", stepZoom(1, 1), 1.5);
ck("step out from fit (floor)", stepZoom(1, -1), 1); // saturates
ck("step in mid", stepZoom(2, 1), 2.5);
ck("step out mid", stepZoom(2, -1), 1.5);
ck("step in to ceiling", stepZoom(4.5, 1), 5);
ck("step in at ceiling (sat)", stepZoom(5, 1), 5);
ck("step out from 1.5", stepZoom(1.5, -1), 1);
ck("step bad dir 0", stepZoom(2, 0), 2);
ck("step bad dir 2", stepZoom(2, 2), 2);
ck("step null current -> fit then in", stepZoom(null, 1), 1.5);

// full climb floor -> ceiling lands exactly on MAX
let z = resetZoom();
for (let i = 0; i < 20; i++) z = stepZoom(z, 1);
ck("climb saturates at 5", z, 5);
for (let i = 0; i < 20; i++) z = stepZoom(z, -1);
ck("descend saturates at 1", z, 1);

// 3. predicates
ck("isZoomed fit", isZoomed(1), false);
ck("isZoomed 1.5", isZoomed(1.5), true);
ck("isZoomed below floor (clamped)", isZoomed(0.5), false);
ck("canZoomIn fit", canZoomIn(1), true);
ck("canZoomIn ceil", canZoomIn(5), false);
ck("canZoomIn near ceil", canZoomIn(4.5), true);
ck("canZoomOut fit", canZoomOut(1), false);
ck("canZoomOut mid", canZoomOut(2), true);
ck("canZoomOut ceil", canZoomOut(5), true);

// 4. resetZoom
ck("reset is fit", resetZoom(), 1);

// 5. percent label
ck("pct fit", formatZoomPercent(1), "100%");
ck("pct 1.5", formatZoomPercent(1.5), "150%");
ck("pct 2", formatZoomPercent(2), "200%");
ck("pct 5", formatZoomPercent(5), "500%");
ck("pct clamps over", formatZoomPercent(99), "500%");
ck("pct null", formatZoomPercent(null), "100%");

// 6. transform string
ck("xf fit", zoomTransform(1), "scale(1)");
ck("xf 1.5", zoomTransform(1.5), "scale(1.5)");
ck("xf 2", zoomTransform(2), "scale(2)");
ck("xf 2.5", zoomTransform(2.5), "scale(2.5)");
ck("xf clamps", zoomTransform(50), "scale(5)");

console.log(`lightbox-zoom sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);

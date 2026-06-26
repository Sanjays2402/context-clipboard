// Sanity: list-row image-thumb → lightbox gating (lib/thumb-zoom).
//
// A plain click on an image clip's list-row thumb opens the lightbox
// directly (skipping detail), BUT only when there's no selection intent
// — in multi-select mode the thumb keeps toggling the row. This harness
// exercises the pure decision (inline copy, bundler-free).
//
// Coverage:
//   1. zoom fires: image + on thumb + no selection intent.
//   2. blocked by selection intent (active selection or modifier held).
//   3. blocked off-thumb (click landed elsewhere in the row).
//   4. blocked for non-image kinds (text/link have no zoomable thumb).
//   5. defensive: nullish context.

function shouldZoomThumb(ctx) {
  if (!ctx) return false;
  return ctx.onThumb === true && ctx.kind === "image" && !ctx.selectionIntent;
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", g, "want", w);
}

// 1. the happy path — plain click on an image thumb, no selection
ck("image thumb plain click zooms", shouldZoomThumb({ onThumb: true, kind: "image", selectionIntent: false }), true);

// 2. selection intent always wins (the thumb stays part of the row)
ck("selection active blocks zoom", shouldZoomThumb({ onThumb: true, kind: "image", selectionIntent: true }), false);

// 3. clicked elsewhere in the row -> not the thumb -> no zoom
ck("off-thumb click no zoom", shouldZoomThumb({ onThumb: false, kind: "image", selectionIntent: false }), false);
ck("off-thumb + selection no zoom", shouldZoomThumb({ onThumb: false, kind: "image", selectionIntent: true }), false);

// 4. non-image kinds have no zoomable thumb
ck("text thumb no zoom", shouldZoomThumb({ onThumb: true, kind: "text", selectionIntent: false }), false);
ck("link thumb no zoom", shouldZoomThumb({ onThumb: true, kind: "link", selectionIntent: false }), false);

// 5. defensive
ck("null ctx -> false", shouldZoomThumb(null), false);
ck("undefined ctx -> false", shouldZoomThumb(undefined), false);
ck("missing onThumb -> false", shouldZoomThumb({ kind: "image", selectionIntent: false }), false);
ck("truthy-non-true onThumb -> false", shouldZoomThumb({ onThumb: 1, kind: "image", selectionIntent: false }), false);
ck("truthy-non-true selectionIntent still blocks", shouldZoomThumb({ onThumb: true, kind: "image", selectionIntent: 1 }), false);

console.log(`thumb-zoom sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);

// Sanity: image lightbox caption + zoom-availability (lib/lightbox).
//
// The detail view caps an image clip's thumbnail at 200px; clicking it
// opens a full-resolution lightbox over a dim backdrop (data URL is
// local — no network). This harness exercises the pure caption grammar
// (which mirrors the detail image-info line to the digit) + the canZoom
// gate in isolation (inline copies, bundler-free).
//
// Coverage:
//   1. canZoom strictness — image+content true; wrong kind / empty
//      content / nullish false.
//   2. Caption format — dims · bytes · mime, matching detail's line.
//   3. Caption degradation — unknown dims, default mime, omitted bytes.
//   4. formatBytes parity with the popup formatter (1024-base).

// --- inline copies of the lib/lightbox functions ---
function canZoom(kind, content) {
  return kind === "image" && typeof content === "string" && content.length > 0;
}
function isPos(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}
function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function lightboxCaption(meta) {
  const m = meta || {};
  const dims = isPos(m.width) && isPos(m.height)
    ? `${Math.trunc(m.width)}×${Math.trunc(m.height)} px`
    : "unknown size";
  const mime = typeof m.mime === "string" && m.mime.trim() ? m.mime.trim() : "image/png";
  const parts = [dims];
  if (typeof m.bytes === "number" && Number.isFinite(m.bytes) && m.bytes >= 0) {
    parts.push(formatBytes(m.bytes));
  }
  parts.push(mime);
  return parts.join(" \u00b7 ");
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. canZoom gate
ck("image + data url zooms", canZoom("image", "data:image/png;base64,AAA"), true);
ck("text never zooms", canZoom("text", "hello"), false);
ck("link never zooms", canZoom("link", "https://x"), false);
ck("image with empty content no zoom", canZoom("image", ""), false);
ck("image with null content no zoom", canZoom("image", null), false);
ck("null kind no zoom", canZoom(null, "data:..."), false);

// 2. full caption (mirrors detail image-info line)
ck("full caption", lightboxCaption({ width: 1920, height: 1080, bytes: 254464, mime: "image/png" }),
  "1920×1080 px · 248.5 KB · image/png");
ck("small bytes", lightboxCaption({ width: 16, height: 16, bytes: 512, mime: "image/jpeg" }),
  "16×16 px · 512 B · image/jpeg");

// 3. degradation
ck("unknown dims", lightboxCaption({ bytes: 1024, mime: "image/gif" }),
  "unknown size · 1.0 KB · image/gif");
ck("missing mime -> png", lightboxCaption({ width: 8, height: 8, bytes: 100 }),
  "8×8 px · 100 B · image/png");
ck("zero/neg dims -> unknown", lightboxCaption({ width: 0, height: -3, bytes: 4096, mime: "image/webp" }),
  "unknown size · 4.0 KB · image/webp");
ck("bytes omitted when missing", lightboxCaption({ width: 32, height: 32, mime: "image/png" }),
  "32×32 px · image/png");
ck("non-finite bytes omitted", lightboxCaption({ width: 4, height: 4, bytes: NaN, mime: "image/png" }),
  "4×4 px · image/png");
ck("nullish meta -> bare unknown line", lightboxCaption(null), "unknown size · image/png");

// 4. formatBytes parity
ck("1 MB", formatBytes(1024 * 1024), "1.0 MB");
ck("1.5 GB", formatBytes(Math.round(1.5 * 1024 * 1024 * 1024)), "1.50 GB");
ck("neg -> 0 B", formatBytes(-5), "0 B");

console.log(`lightbox: ${p}/${t}`);
process.exit(p === t ? 0 : 1);

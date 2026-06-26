// Sanity: image-clip download filename derivation (lib/image-download).
//
// The lightbox "Save image" affordance saves the data URL via an
// a[download] (local, no network). The only real logic is the FILENAME,
// which this harness exercises (inline copies, bundler-free).
//
// Coverage:
//   1. extensionForMime: known mimes, aliases, unknown/missing -> png.
//   2. hostSlug: www-strip, multi-dot fold, punctuation, bare host, junk.
//   3. imageDownloadName: full / host-only / dims-only / bare / null.

const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/avif": "avif",
};
const STEM = "context-clipboard";

function extensionForMime(mime) {
  if (typeof mime !== "string") return "png";
  return MIME_EXT[mime.trim().toLowerCase()] ?? "png";
}
function hostSlug(url) {
  if (typeof url !== "string" || url.trim() === "") return "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = url.split("/")[0] || "";
  }
  return host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function isPosDim(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}
function imageDownloadName(clip) {
  const c = clip || {};
  const ext = extensionForMime(c.mime);
  const parts = [STEM];
  const slug = hostSlug(c.source?.url);
  if (slug) parts.push(slug);
  if (isPosDim(c.width) && isPosDim(c.height)) {
    parts.push(`${Math.trunc(c.width)}x${Math.trunc(c.height)}`);
  }
  return `${parts.join("-")}.${ext}`;
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. extensionForMime
ck("png", extensionForMime("image/png"), "png");
ck("jpeg -> jpg", extensionForMime("image/jpeg"), "jpg");
ck("jpg alias", extensionForMime("image/jpg"), "jpg");
ck("webp", extensionForMime("image/webp"), "webp");
ck("svg+xml", extensionForMime("image/svg+xml"), "svg");
ck("uppercase mime folds", extensionForMime("IMAGE/PNG"), "png");
ck("whitespace mime trims", extensionForMime("  image/gif "), "gif");
ck("unknown mime -> png", extensionForMime("image/tiff"), "png");
ck("missing mime -> png", extensionForMime(undefined), "png");
ck("null mime -> png", extensionForMime(null), "png");

// 2. hostSlug
ck("github host", hostSlug("https://github.com/x/y"), "github-com");
ck("www stripped", hostSlug("https://www.example.com"), "example-com");
ck("multi-dot folds", hostSlug("https://docs.github.com/page"), "docs-github-com");
ck("bare host", hostSlug("stackoverflow.com"), "stackoverflow-com");
ck("empty -> empty", hostSlug(""), "");
ck("null -> empty", hostSlug(null), "");
ck("all-punct host -> empty", hostSlug("http://..."), "");
ck("port dropped by URL parse", hostSlug("http://localhost:3000/app"), "localhost");

// 3. imageDownloadName
ck(
  "full name",
  imageDownloadName({ mime: "image/png", width: 1920, height: 1080, source: { url: "https://github.com/x" } }),
  "context-clipboard-github-com-1920x1080.png",
);
ck(
  "host only (no dims)",
  imageDownloadName({ mime: "image/jpeg", source: { url: "https://www.example.com" } }),
  "context-clipboard-example-com.jpg",
);
ck("dims only (no host)", imageDownloadName({ width: 800, height: 600 }), "context-clipboard-800x600.png");
ck("bare object", imageDownloadName({}), "context-clipboard.png");
ck("null clip", imageDownloadName(null), "context-clipboard.png");
ck(
  "fractional dims truncated",
  imageDownloadName({ width: 100.9, height: 50.2, mime: "image/webp" }),
  "context-clipboard-100x50.webp",
);
ck(
  "zero dim dropped",
  imageDownloadName({ width: 0, height: 600, source: { url: "https://a.io" } }),
  "context-clipboard-a-io.png",
);
ck(
  "negative dim dropped",
  imageDownloadName({ width: -5, height: -5, source: { url: "https://a.io" } }),
  "context-clipboard-a-io.png",
);

console.log(`image-download sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);

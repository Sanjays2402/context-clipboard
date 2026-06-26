/**
 * Image-clip "save to disk" filename derivation.
 *
 * The lightbox shows a captured image at full resolution from the data
 * URL already on the clip (local — no network). Once a user is staring
 * at a screenshot full-screen, the natural next action is "save this so
 * I can attach it / drop it in a doc". Chrome's data-URL `a[download]`
 * does the actual save with zero permissions and zero network — the
 * only real decision is what to NAME the file, which is what this pure
 * module owns.
 *
 * No DOM, no Blob, no download trigger — the popup builds the anchor
 * and clicks it. Keeping the filename grammar here means the slug
 * normalisation + the mime→extension map are exercised headless and
 * can't drift from what the user sees in the lightbox caption.
 *
 * Design decisions:
 *   - The stem is `context-clipboard` (the product) + a host slug when
 *     the clip carries a source host + the pixel dimensions when known,
 *     so a folder of saved captures self-describes:
 *     `context-clipboard-github-com-1920x1080.png`. A clip with no host
 *     drops that segment (`context-clipboard-1920x1080.png`); no dims
 *     drops those (`context-clipboard-github-com.png`).
 *   - The extension comes from the clip's mime (image/png -> png,
 *     image/jpeg -> jpg, image/webp -> webp, image/gif -> gif,
 *     image/svg+xml -> svg, image/bmp -> bmp). An unknown / missing
 *     mime falls back to `png` — the capture default — so the file
 *     always has a sane image extension a viewer will honour.
 *   - The host slug is lowercased, `www.` stripped, and every run of
 *     non-alphanumerics folded to a single `-` (so `docs.github.com`
 *     -> `docs-github-com`), then trimmed of leading/trailing dashes.
 *     This keeps the name filesystem-safe across macOS / Windows /
 *     Linux without quoting.
 *   - Defensive throughout: a nullish clip yields the bare
 *     `context-clipboard.png`; a non-finite dimension is omitted rather
 *     than printing `NaNxNaN`; a host that slugs to empty (all
 *     punctuation) is dropped, not left as a dangling dash.
 */

export interface ImageDownloadClip {
  /** Image mime, e.g. "image/png" — drives the file extension. */
  mime?: string;
  /** Image pixel width, when known. */
  width?: number;
  /** Image pixel height, when known. */
  height?: number;
  /** Source context — the host is slugged into the filename. */
  source?: { url?: string } | null;
}

/** Product stem every saved capture shares, so they sort together. */
const STEM = "context-clipboard";

/** mime -> file extension. Unknown / missing falls back to `png`. */
const MIME_EXT: Record<string, string> = {
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

/**
 * Resolve the download file extension for an image mime. Case- and
 * whitespace-insensitive; an unknown or absent mime returns `png` (the
 * capture default) so the saved file always opens as an image.
 */
export function extensionForMime(mime: string | null | undefined): string {
  if (typeof mime !== "string") return "png";
  const key = mime.trim().toLowerCase();
  return MIME_EXT[key] ?? "png";
}

/**
 * Lowercase host slug for a filename: strip `www.`, fold every run of
 * non-alphanumerics to a single `-`, trim dangling dashes. Returns ""
 * for a nullish / unparseable / all-punctuation host (the caller then
 * drops the segment). Parses the host out of a full URL; a bare host
 * string works too.
 */
export function hostSlug(url: string | null | undefined): string {
  if (typeof url !== "string" || url.trim() === "") return "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // Not a full URL — treat the input as a bare host/authority and
    // take the part before the first slash.
    host = url.split("/")[0] || "";
  }
  return host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** True when `n` is a finite positive integer-able pixel dimension. */
function isPosDim(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Build the download filename for an image clip:
 *   `context-clipboard-<host>-<W>x<H>.<ext>`
 * with the host and/or dimension segments omitted when unavailable.
 *
 * Examples:
 *   { mime: "image/png", width: 1920, height: 1080, source:{url:"https://github.com/x"} }
 *     -> "context-clipboard-github-com-1920x1080.png"
 *   { mime: "image/jpeg", source:{url:"https://www.example.com"} }
 *     -> "context-clipboard-example-com.jpg"
 *   { width: 800, height: 600 }            -> "context-clipboard-800x600.png"
 *   {} / null                              -> "context-clipboard.png"
 */
export function imageDownloadName(clip: ImageDownloadClip | null | undefined): string {
  const c = clip || {};
  const ext = extensionForMime(c.mime);
  const parts: string[] = [STEM];
  const slug = hostSlug(c.source?.url);
  if (slug) parts.push(slug);
  if (isPosDim(c.width) && isPosDim(c.height)) {
    parts.push(`${Math.trunc(c.width)}x${Math.trunc(c.height)}`);
  }
  return `${parts.join("-")}.${ext}`;
}

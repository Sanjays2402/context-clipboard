/**
 * Image lightbox: caption formatting + zoom-availability predicate.
 *
 * The detail view renders an image clip's thumbnail capped at 200px
 * tall (so the panel stays compact). But a screenshot of a config, a
 * diagram, or a dense table is often unreadable at that size — the user
 * has to download or re-open the source page just to read it. A
 * click-to-zoom lightbox shows the captured image at full resolution
 * over a dim backdrop, no round-trip to the network (the data URL is
 * already on the clip — stays local-only).
 *
 * This module is the pure caption + gate core behind that overlay. No
 * DOM — the popup owns the overlay element, the click/Esc wiring, and
 * the `<img>` src; keeping the caption grammar + the "can this clip
 * zoom?" predicate here means they're exercised headless and the
 * detail-info line + the lightbox caption can't drift.
 *
 * Design decisions:
 *   - The caption mirrors the existing detail image-info line
 *     (`WxH px · 12.4 KB · image/png`) so the zoomed view carries the
 *     same metadata the user saw in detail — no surprise, just bigger.
 *     Unknown dimensions degrade to "unknown size" exactly as the
 *     detail line does.
 *   - `canZoom` gates strictly on kind === "image" AND a non-empty
 *     string content (the data URL). A malformed image record with no
 *     content can't be zoomed (there's nothing to show), so the popup
 *     hides the affordance rather than opening an empty backdrop.
 *   - Byte formatting is a local copy of the popup's `formatBytes`
 *     (1024-base, one decimal past KB) so the module stays dependency-
 *     free and the two readouts match to the digit.
 */

export interface LightboxMeta {
  /** Image pixel width, when known. */
  width?: number;
  /** Image pixel height, when known. */
  height?: number;
  /** Approximate byte size of the clip. */
  bytes?: number;
  /** Image mime, e.g. "image/png". */
  mime?: string;
}

/**
 * True when a clip can be opened in the image lightbox: it must be an
 * image kind AND carry a non-empty content string (the data URL the
 * `<img>` renders). Defensive against nullish / malformed records — a
 * clip with no usable content yields false so the popup hides the
 * zoom affordance.
 */
export function canZoom(
  kind: string | null | undefined,
  content: string | null | undefined,
): boolean {
  return kind === "image" && typeof content === "string" && content.length > 0;
}

/**
 * Format the lightbox caption from an image clip's metadata, mirroring
 * the detail image-info line: `1920×1080 px · 248.5 KB · image/png`.
 * Unknown dimensions degrade to "unknown size"; a missing mime falls
 * back to "image/png" (the capture default). Bytes are omitted only
 * when the size is unusable (non-finite / negative), keeping the line
 * honest rather than printing "0 B" for a record with no size stamp.
 */
export function lightboxCaption(meta: LightboxMeta | null | undefined): string {
  const m = meta || {};
  const dims =
    isPos(m.width) && isPos(m.height)
      ? `${Math.trunc(m.width as number)}×${Math.trunc(m.height as number)} px`
      : "unknown size";
  const mime = typeof m.mime === "string" && m.mime.trim() ? m.mime.trim() : "image/png";
  const parts = [dims];
  if (typeof m.bytes === "number" && Number.isFinite(m.bytes) && m.bytes >= 0) {
    parts.push(formatBytes(m.bytes));
  }
  parts.push(mime);
  return parts.join(" \u00b7 ");
}

/** True when `n` is a finite positive number (a usable pixel dimension). */
function isPos(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Human byte size — 1024-base, one decimal past KB. Local copy of the
 * popup's formatter so the lightbox caption matches the detail line to
 * the digit without importing popup internals.
 */
function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

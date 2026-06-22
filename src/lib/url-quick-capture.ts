/**
 * Quick-capture URL parser.
 *
 * The system-clipboard quick-capture button reads whatever's currently
 * in the OS clipboard and ingests it as a clip — text or image. URLs
 * land as text clips, which is fine for accidental URL copies but
 * wrong when the user explicitly wants to save a link they typed or
 * pasted from somewhere out-of-band (a Slack message, a chat window,
 * a note app that can't grant clipboard permission to the popup).
 *
 * This module is the pure parser/validator. The popup exposes a tiny
 * inline input next to the quick-capture button; the user pastes /
 * types a URL there, hits Enter, and the popup routes the result
 * through a new `addLink` RPC which ingests it as a `kind: "link"`
 * clip with the URL as content and a derived preview/title.
 *
 * SECURITY: only http(s) is accepted. data:/file:/javascript:/chrome:/
 * about: are all rejected — the popup never re-emits them so they
 * can't be smuggled into a link clip that later opens in a new tab.
 *
 * Local-only: no fetch, no metadata enrichment. Just URL parsing.
 */

export interface QuickCaptureUrl {
  /** The validated, normalised URL (no fragments stripped — those are
   *  often meaningful for SPA links). Always starts with http:// or
   *  https://. */
  url: string;
  /** Hostname with leading `www.` stripped, used as the clip preview
   *  prefix and the auto-tag. */
  host: string;
  /** Short display preview: "host.com/path" without query/fragment
   *  for tidy list rendering. Caps at 80 chars. */
  preview: string;
  /** Source title: prefers the path's last segment ("decoded-slug")
   *  when present, else the host. Caps at 80 chars. */
  title: string;
}

/**
 * Parse and validate a URL string for quick-capture. Returns null
 * when the input is invalid (empty, not a URL, not http/https,
 * malformed). The popup uses the null return as the gate that keeps
 * the Enter key from triggering an ingest of garbage.
 *
 * Defensive:
 *   - empty / whitespace-only / non-string -> null
 *   - missing scheme is auto-prefixed with `https://` (typical case:
 *     user pastes "github.com/foo") — but only when the input already
 *     looks like a host.tld pattern. Plain words don't get coerced.
 *   - data:/file:/javascript:/chrome:/about:/blob: -> null
 *   - URL constructor throws on garbage -> null (caught here)
 */
export function parseQuickCaptureUrl(raw: unknown): QuickCaptureUrl | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Auto-prefix https:// when the input looks like a bare host.tld(/path?)
  // but lacks a scheme. We have to distinguish a true scheme prefix
  // (e.g. "javascript:", "http:") from a bare host:port (e.g.
  // "example.com:8080") — schemes never contain `.` before the `:`,
  // so we anchor the scheme detector accordingly.
  let candidate = trimmed;
  const looksLikeScheme = /^[a-z][a-z0-9+-]*:/i.test(candidate);
  if (!looksLikeScheme) {
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[:/?#].*)?$/i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else if (/^localhost(?::\d+)?(?:[/?#].*)?$/i.test(candidate)) {
      // localhost is special — no TLD, but a legitimate dev URL the
      // user might want to capture (e.g. when sharing a dev preview).
      candidate = `https://${candidate}`;
    } else {
      return null;
    }
  }

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }
  // Whitelist: only http(s). Reject everything else explicitly so
  // bad-faith inputs (javascript:alert, data:text/html,...) can't
  // smuggle anything into the clip store.
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname) return null;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return null;

  // Preview: "host/path" tidy. Trim query/fragment for the visible
  // list row; the full URL stays in content + source.url. Cap at 80
  // so long pretty-paths don't blow the row width.
  const pathPart = u.pathname && u.pathname !== "/" ? u.pathname : "";
  const previewRaw = host + pathPart;
  const preview = previewRaw.length > 80 ? previewRaw.slice(0, 79) + "…" : previewRaw;

  // Title: derive from the last meaningful path segment when present
  // (decoded so "%20" reads as a space), else the host. Both are
  // capped at 80 chars.
  let title = host;
  if (u.pathname && u.pathname !== "/") {
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length > 0) {
      const last = segs[segs.length - 1];
      try {
        const decoded = decodeURIComponent(last).replace(/[-_+]/g, " ").trim();
        if (decoded.length > 0) {
          title = decoded.length > 80 ? decoded.slice(0, 79) + "…" : decoded;
        }
      } catch {
        // Bad %-encoding — keep the host fallback rather than throwing.
      }
    }
  }

  return {
    url: u.toString(),
    host,
    preview,
    title,
  };
}

/**
 * Build the auto-tags for a quick-captured link. We always include
 * `quick-capture` (matches the system-clipboard variant so users can
 * `tag:quick-capture` across both), plus the host as a tag for cheap
 * filtering. The host tag is normalised to lowercase + www-stripped
 * to match how the rest of the pipeline emits host tags.
 *
 * Defensive against an empty host (returns just ["quick-capture"]).
 */
export function buildQuickCaptureTags(host: string): string[] {
  const out = ["quick-capture"];
  if (host && typeof host === "string") {
    const cleaned = host.toLowerCase().replace(/^www\./, "").trim();
    if (cleaned) out.push(cleaned);
  }
  return out;
}

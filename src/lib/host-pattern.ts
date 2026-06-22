/**
 * Site-rule host extractor.
 *
 * Per-site capture rules live or die on the user typing the right
 * host pattern. The form's `<input>` accepts `host`, `*.host`, or
 * `127.0.0.1:3000` but most users come from a browser tab — they want
 * to paste the URL they're standing on and have the form do the right
 * thing.
 *
 * `extractHostPattern(input)` takes anything (raw URL, half-URL,
 * already-typed host, garbage) and returns the host plus suggested
 * wildcard variants. The popup's paste handler uses this to swap a
 * pasted URL into the bare host AND optionally surface a `*.example.com`
 * chip for multi-subdomain cases.
 *
 * Pure — no DOM, no IDB. Tests at .cron-state/sanity-host-pattern.mjs.
 */

export interface HostPatternResult {
  /** Bare host without protocol/path/port — empty when input has no host. */
  host: string;
  /**
   * Suggested apex-wildcard pattern (`*.example.com`) when `host` has
   * a subdomain. Undefined when the host is already an apex or when
   * wildcarding would be ambiguous (single-label hosts, IPs).
   */
  wildcard?: string;
  /** Set when the input clearly looked like a URL (had a protocol). */
  fromUrl: boolean;
}

/**
 * Quick "does this look like a paste rather than typing" guard.
 * Returns true for anything with a protocol, slashes, or a port —
 * basically the shapes a real URL takes but a bare hostname doesn't.
 */
export function looksLikeUrl(input: string): boolean {
  const s = (input || "").trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  // Protocol-relative // path
  if (s.startsWith("//")) return true;
  // Has a path separator after a host candidate
  if (/^[a-z0-9.-]+\.[a-z]{2,}\/[^ ]/i.test(s)) return true;
  return false;
}

/**
 * Extract a host pattern from raw input. Strategy:
 *
 *  1) Try URL parsing first — gives us a clean hostname for anything
 *     resembling `https://github.com/foo`.
 *  2) Fall back to a strip-protocol-then-take-up-to-slash pass for
 *     malformed but still useful inputs ("https://" with no host,
 *     "github.com/foo" without protocol, etc).
 *  3) For everything else, treat the input as if the user typed a
 *     bare host — strip leading `www.` + lowercase, return as-is.
 *
 * Wildcard suggestion:
 *  - Single-label hosts (`localhost`, `intranet`) → no wildcard (would
 *    match nothing useful).
 *  - IP addresses → no wildcard (CIDR is out of scope here).
 *  - Two-label hosts (`example.com`) → no wildcard (already apex).
 *  - Three+ label hosts (`docs.github.com`) → wildcard = `*.<last two
 *    labels>` (`*.github.com`). This is correct for common cases; the
 *    "co.uk" / "com.au" PSL hell is left to the user to override since
 *    the rule form lets them type anything.
 */
export function extractHostPattern(input: string): HostPatternResult {
  const raw = (input || "").trim();
  if (!raw) return { host: "", fromUrl: false };
  const fromUrl = looksLikeUrl(raw);

  let host = "";
  // Path #1: URL parse.
  try {
    const withScheme = /^https?:\/\//i.test(raw)
      ? raw
      : raw.startsWith("//")
        ? `https:${raw}`
        : fromUrl
          ? `https://${raw}`
          : raw;
    if (/^https?:\/\//i.test(withScheme)) {
      const u = new URL(withScheme);
      host = u.hostname.toLowerCase();
    }
  } catch {
    // Fall through to the manual parse below.
  }

  // Path #2: manual strip.
  if (!host) {
    // Reject non-host schemes outright — `data:`, `file:`, `chrome:`,
    // `about:`, `javascript:` etc. don't carry a meaningful hostname
    // (or carry one we don't want as a rule target). The naive split
    // below would return "data" / "file" / "chrome" / "about" /
    // "javascript" as the "host" which would silently land an
    // invalid rule.
    const NON_HOST_SCHEMES = /^(?:data|file|chrome|chrome-extension|about|javascript|view-source|blob|moz-extension):/i;
    if (NON_HOST_SCHEMES.test(raw)) {
      return { host: "", fromUrl };
    }
    let s = raw.replace(/^https?:\/\//i, "").replace(/^\/\//, "");
    // Trim path / query / hash off — we only want the authority part.
    s = s.split(/[/?#]/)[0];
    // Drop port if present.
    s = s.split(":")[0];
    host = s.toLowerCase();
  }

  // Common normalisation: strip the visual `www.` prefix to match what
  // the rest of the codebase does. The user can always add it back
  // manually if they really only want www-prefixed captures.
  if (host.startsWith("www.")) host = host.slice(4);

  // Reject anything that came out empty or is obviously garbage.
  if (!host) return { host: "", fromUrl };
  if (host === "." || host.endsWith(".")) host = host.replace(/\.+$/, "");
  if (!host) return { host: "", fromUrl };

  // Wildcard suggestion math.
  let wildcard: string | undefined;
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);
  const labels = host.split(".");
  if (!isIp && labels.length >= 3) {
    // Take the last two labels — `*.github.com` rather than
    // `*.docs.github.com`. Good for the common case (`docs.github.com`,
    // `api.stripe.com`); users on PSL-style hosts (`a.b.co.uk`) can
    // type their own wildcard.
    wildcard = "*." + labels.slice(-2).join(".");
  }

  return { host, wildcard, fromUrl };
}

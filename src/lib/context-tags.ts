/**
 * Pure helpers for deriving tag suggestions from a browser tab's
 * URL + title. Used by the note composer so a user capturing a note
 * while looking at a GitHub PR can one-click `github`, `pr`, the
 * repo name, etc. — no typing required.
 *
 * Intentionally heuristic. The whole point is "guess one or two
 * tags the user is likely to want without false-positives" — we'd
 * rather show zero chips than wrong ones.
 *
 * Pure: no IO, no DOM. Safe to unit-test off-DOM.
 */

const NOISE_HOSTS = new Set([
  "newtab",
  "about",
  "chrome",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

/** Punctuation / structural noise tokens we never want as tags. */
const PATH_STOP = new Set([
  "www",
  "html",
  "htm",
  "php",
  "asp",
  "jsp",
  "index",
  "home",
  "main",
  "page",
  "view",
  "tab",
  "section",
  "amp",
  "amphtml",
  "m",
  "en",
  "us",
  "uk",
  "fr",
  "de",
  "es",
  "default",
  "id",
  "ref",
  "utm",
]);

/**
 * Pull the second-level domain from a host, stripping leading
 * `www.` and known multi-part suffixes (`.co.uk`, `.com.au`,
 * etc.). Returns "" when the host is unparseable / falsy / on the
 * NOISE_HOSTS list.
 *
 * Examples:
 *   docs.github.com           -> github
 *   www.bbc.co.uk             -> bbc
 *   sub.dom.example.com.au    -> example
 *   localhost                 -> ""
 */
export function tagFromHost(host?: string): string {
  if (!host) return "";
  const h = host.toLowerCase().replace(/^www\./, "");
  if (NOISE_HOSTS.has(h)) return "";
  // Strip everything after a port (`:3000`) so localhost-like dev
  // hosts don't suddenly become tag-worthy.
  const clean = h.split(":")[0];
  if (!clean || NOISE_HOSTS.has(clean)) return "";
  const parts = clean.split(".").filter(Boolean);
  if (parts.length === 0) return "";
  // Known 2-part TLDs where the second-from-right is also a TLD.
  // Bounded list — covers the common cases without an external
  // dataset. Anything not in here uses the simple `parts[len-2]`
  // path which is right for the vast majority of hosts.
  const TWO_PART_TLDS = new Set([
    "co.uk", "ac.uk", "gov.uk", "org.uk",
    "co.jp", "ac.jp",
    "com.au", "net.au", "org.au",
    "co.nz",
    "com.br",
    "co.in",
    "com.hk",
  ]);
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join(".");
    if (TWO_PART_TLDS.has(lastTwo)) return parts[parts.length - 3];
  }
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0];
}

/**
 * Pull tag-like tokens out of a URL's path. Used after `tagFromHost`
 * so the user gets context tags too: a github.com/foo/bar URL might
 * suggest `github`, `foo`, `bar`.
 *
 * Heuristics:
 *   - Tokenize on /  - _  . ?  &  =  +  %
 *   - Lowercase, dedupe, strip empty
 *   - Drop common path noise (PATH_STOP)
 *   - Drop tokens that look like ids: all-digits >= 4, hex >= 12,
 *     mixed-case base64-ish >= 16, UUID shapes.
 *   - Drop tokens > 24 chars (long slugs aren't tags)
 *   - Drop tokens that contain whitespace (URL-decode artifacts)
 *   - Keep at most `maxTokens` — earlier path segments first
 *
 * Pure; works on a raw URL string.
 */
export function tagsFromUrl(rawUrl?: string, maxTokens = 4): string[] {
  if (!rawUrl) return [];
  let path = "";
  try {
    const u = new URL(rawUrl);
    path = u.pathname || "";
  } catch {
    return [];
  }
  if (!path || path === "/") return [];
  const tokens = path
    .split(/[/\-_.?&=+%]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (out.length >= maxTokens) break;
    if (seen.has(t)) continue;
    if (PATH_STOP.has(t)) continue;
    if (t.length === 0 || t.length > 24) continue;
    if (/\s/.test(t)) continue;
    // ID-looking tokens we never want as tags.
    if (/^\d{4,}$/.test(t)) continue;
    if (/^[0-9a-f]{12,}$/i.test(t)) continue;
    if (/^[a-z0-9]{16,}$/i.test(t) && /\d/.test(t) && /[a-z]/.test(t)) continue;
    if (/^[0-9a-f-]{32,}$/i.test(t)) continue;
    // Drop pure-numeric short tokens (issue numbers etc.) too.
    if (/^\d+$/.test(t)) continue;
    out.push(t);
    seen.add(t);
  }
  return out;
}

/**
 * Combine host + URL-path tags into a deduplicated, ordered list.
 * Host always comes first when present so the user sees the most
 * meaningful tag at the front of the chip strip. Capped at `max`.
 */
export function contextTagsForTab(
  tab: { url?: string; title?: string } | undefined | null,
  max = 5,
): string[] {
  if (!tab) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  function push(t: string) {
    const cleaned = (t || "").trim().toLowerCase();
    if (!cleaned) return;
    if (seen.has(cleaned)) return;
    if (out.length >= max) return;
    out.push(cleaned);
    seen.add(cleaned);
  }
  let host = "";
  try {
    if (tab.url) host = new URL(tab.url).hostname;
  } catch {
    host = "";
  }
  const hostTag = tagFromHost(host);
  if (hostTag) push(hostTag);
  for (const t of tagsFromUrl(tab.url)) push(t);
  return out;
}

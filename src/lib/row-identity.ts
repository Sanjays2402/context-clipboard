/**
 * Visual identity for a list row: a host monogram (letter + stable hue)
 * and which auto-tags are redundant on the row itself.
 *
 * The monogram replaces a favicon. Captured favicons are remote URLs, and
 * loading them from the popup would ping every site in the user's history,
 * which breaks the local-only posture. A letter on a tile tinted by a hash
 * of the site name is enough to tell github / stackoverflow / notion rows
 * apart while scanning.
 *
 * Pure: no DOM.
 */

/** Hostname labels that say nothing about the site, skipped for the letter. */
const GENERIC_LABELS = new Set(["www", "m", "en", "docs", "app", "news", "mail", "web"]);

/** Second-level labels that sit in front of a country TLD (bbc.co.uk). */
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

/**
 * The label that names the site: "github" for gist.github.com,
 * "wikipedia" for en.wikipedia.org, "bbc" for www.bbc.co.uk.
 */
export function siteLabel(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  let i = labels.length - 2;
  if (i > 0 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[i])) i--;
  // Bare IPs and the like: fall back to the first non-generic label.
  if (/^\d+$/.test(labels[i])) {
    return labels.find((l) => !GENERIC_LABELS.has(l)) ?? labels[0];
  }
  return labels[i];
}

/** FNV-1a: small, fast, and stable across sessions and browsers. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface HostMonogram {
  /** One uppercase character for the tile. */
  letter: string;
  /** 0-359; the CSS derives tile + glyph colors per theme. */
  hue: number;
}

/** Letter + hue for a hostname, or null when there's nothing to show. */
export function hostMonogram(host: string | null | undefined): HostMonogram | null {
  if (!host) return null;
  const label = siteLabel(host);
  const ch = [...label].find((c) => /[\p{L}\p{N}]/u.test(c));
  if (!ch) return null;
  return { letter: ch.toUpperCase(), hue: hash(label) % 360 };
}

/** Auto-tags that only restate the clip's kind. */
const KIND_TAGS = new Set(["url", "image", "link", "text"]);

/**
 * True when a tag adds nothing on the row: it restates the clip kind, or
 * it's the source host / its registrable domain (an auto-tag), which the
 * meta line already shows. "wikipedia.org" is redundant for
 * en.wikipedia.org; "github.com" is not redundant for a gitlab.com clip.
 */
export function isRedundantRowTag(tag: string, host: string | null | undefined): boolean {
  const t = tag.toLowerCase();
  if (KIND_TAGS.has(t)) return true;
  if (!host || !t.includes(".")) return false;
  const h = host.toLowerCase().replace(/^www\./, "");
  return h === t || h.endsWith("." + t);
}

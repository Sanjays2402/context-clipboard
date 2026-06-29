/**
 * "Copy title only" send-to row — the bare source title of a clip,
 * stripped of the URL. The cite-by-name companion to "Copy URL only"
 * (bare URL) and "Copy as Markdown link" (`[title](url)`).
 *
 * When a user has captured a paragraph from an article and later wants
 * to reference WHERE it came from by NAME — "as the Vercel docs say" —
 * they want just the title text, no link math, no domain. Common in
 * note-taking, citations, and chat where the title is the human label.
 *
 * Pure: no IO, no DOM. The popup writes the result.
 *
 * Title source: source.title, collapsed to a single line + trimmed.
 * Common page-title suffixes (" | Site", " - Site", " — Site", " · Site")
 * are stripped so the user gets the bare article name, not the SEO tail.
 * Returns undefined when the clip has no title, or when the title is
 * just the URL again (some captures fall back to URL-as-title — that's
 * what Copy URL only is for) so the row hides rather than dimming.
 */

import type { ClipItem } from "./types";

interface TitleClip {
  source?: ClipItem["source"];
}

/** Strip an SEO site-suffix tail (" | Site", " - Site", " — Site"). */
function stripSiteSuffix(title: string): string {
  // Cut the LAST separator-delimited tail when there's a real lead before
  // it — keep "Foo — Bar" intact only if Foo is too short to be a heading.
  const m = title.match(/^(.+?)\s+[|\u2014\u2013\u00b7-]\s+[^|\u2014\u2013\u00b7-]+$/);
  if (m && m[1].trim().length >= 8) return m[1].trim();
  return title;
}

export function titleForClip(c: TitleClip | null | undefined): string | undefined {
  const raw = (c?.source?.title || "").replace(/\s+/g, " ").trim();
  if (!raw) return undefined;
  // A URL-as-title fallback isn't a name — Copy URL only handles that.
  if (/^https?:\/\//i.test(raw)) return undefined;
  const title = stripSiteSuffix(raw);
  return title || undefined;
}

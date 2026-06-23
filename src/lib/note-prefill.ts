/**
 * Pure helper for the note-composer's pre-fill from the active tab.
 *
 * When the user opens the note composer (popup → "Add a note" button
 * or the Cmd+K command), an empty textarea is intimidating — "what
 * was I going to say?". A small pre-fill ("Captured from <title>")
 * gives the user a starting frame: they edit / clear / append rather
 * than start from a blank slate.
 *
 * The text is deliberately humble:
 *   - Short: one line, ~80 chars max.
 *   - Citational: just the source, not commentary. The user adds the
 *     commentary themselves.
 *   - Trivially clearable: Cmd+A → Delete or just typing replaces it
 *     completely (autocomplete-on-focus behavior is opt-in by user
 *     intent; we don't auto-select for them).
 *
 * Why pure?
 *   - The note composer + Cmd+K command + (future) automated capture
 *     paths can all share the same prefill logic. Pulling the
 *     normalisation out keeps the popup's openNoteComposer thin and
 *     gives us a unit-testable surface for the truncation + URL
 *     fallback contract.
 *
 * What we DON'T do:
 *   - No tag inference (renderNoteTagSuggestions already covers
 *     context tags via contextTagsForTab).
 *   - No URL embedding in the note text — the source URL is already
 *     captured separately via the clip's source. The note is the
 *     user's COMMENTARY, not redundant context.
 *   - No HTML escaping — the caller writes to a <textarea>.value,
 *     not innerHTML.
 */

/**
 * Heuristic: drop trailing site-name suffixes like " | GitHub" or
 * " - Stack Overflow" that most pages append to their <title>. The
 * note prefill should focus on what the page is about, not where
 * it came from (which the URL captures).
 *
 * Rules:
 *   - " | <site>" / " - <site>" / " — <site>" / " · <site>" at the end
 *     where <site> is up to 40 chars without separator.
 *   - We strip at most ONE such suffix (some titles legitimately
 *     contain pipes/dashes mid-string; greedy stripping would butcher
 *     them).
 *   - Empty / non-string input → empty string.
 */
function stripSiteSuffix(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "";
  // Match the LAST occurrence of a separator + suffix. The suffix
  // can't contain the separator itself, so we use a non-greedy
  // negation char-class. Caps the suffix at 40 chars so a legit
  // long sentence like "Foo - The very long subtitle of an article"
  // doesn't get amputated.
  const m = trimmed.match(/^(.+?)\s*[|\-—·]\s*([^|\-—·]{1,40})$/);
  if (!m) return trimmed;
  // Only strip when the suffix is plausibly a site name: short and
  // ends without ending punctuation (titles don't end in "."; site
  // suffixes do not). This avoids amputating "Title - 2024 edition"
  // style suffixes. The threshold of 30 chars + no terminal `.` is
  // empirical — close to what readable.js / page-meta libraries do.
  const head = m[1].trim();
  const suffix = m[2].trim();
  if (!head || !suffix) return trimmed;
  if (suffix.length > 30) return trimmed;
  if (/[.!?]$/.test(suffix)) return trimmed;
  return head;
}

/**
 * Normalise the active tab's title for the prefill. Returns "" when
 * no usable title is present (chrome:// pages, blank tabs, etc.).
 *
 * - Strips site-name suffixes (one pass).
 * - Collapses runs of whitespace.
 * - Caps at 80 chars with a word-boundary ellipsis (consistent with
 *   summarizeClipNote's truncation contract).
 */
export function normaliseTabTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const stripped = stripSiteSuffix(cleaned);
  if (stripped.length <= 80) return stripped;
  const cut = stripped.slice(0, 80);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 60) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

/**
 * Extract a fallback "from <host>" label when no usable title is
 * available. Returns "" when the URL isn't parseable / not http(s).
 */
export function fallbackHostLabel(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return "";
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host || "";
  } catch {
    return "";
  }
}

/**
 * Build the note-composer prefill from the active tab's title + URL.
 *
 * Output shapes:
 *   - Title present →                          "Captured from <title>"
 *   - Title absent, host present →             "Captured from <host>"
 *   - Both absent (chrome://, blank tab, etc) → ""  (caller leaves the
 *                                                   textarea empty)
 *
 * The "Captured from " stem is intentional — it reads as the start of
 * a note ("Captured from FooBar. I was looking at the X section
 * because…"), inviting continuation. Plays nicer with the user's
 * editing than a bare title alone (which would look like the user
 * already wrote the note).
 *
 * The user can blow it all away with Cmd+A → Delete; we don't
 * auto-select on focus because that's a documented anti-pattern for
 * text inputs (it loses the user's existing text on first keystroke
 * if they type a single char to extend).
 *
 * Pure: no DOM, no api.tabs. Caller passes whatever it learned from
 * api.tabs.query.
 */
export function buildNotePrefill(opts: {
  title?: unknown;
  url?: unknown;
}): string {
  const title = normaliseTabTitle(opts.title);
  if (title) return `Captured from ${title}`;
  const host = fallbackHostLabel(opts.url);
  if (host) return `Captured from ${host}`;
  return "";
}

/**
 * Predicate: should the prefill actually be APPLIED right now?
 *
 * Returns false when:
 *   - the textarea already has content (don't overwrite the user's
 *     existing draft — composer might be re-opened mid-edit).
 *   - the prefill itself would be empty (no usable tab context).
 *
 * Pure: no DOM. Caller checks this against the live textarea.value
 * before assigning.
 */
export function shouldApplyNotePrefill(
  currentValue: unknown,
  prefill: string,
): boolean {
  if (typeof currentValue === "string" && currentValue.trim().length > 0) {
    return false;
  }
  if (typeof prefill !== "string" || prefill.length === 0) return false;
  return true;
}

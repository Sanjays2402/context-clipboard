/**
 * Pure helper for the in-page palette's per-row warning tint.
 *
 * Some per-clip notes carry CAUTION keywords - "prod only",
 * "do not paste", "staging URL", "deprecated". When the user
 * reaches for Cmd+Shift+V and that clip surfaces in the palette,
 * the note-tail tells them WHAT the caveat says but not THAT it
 * is a caveat-of-consequence. A soft warm tint on the row signals
 * "this clip needs your attention before you paste it" the same
 * way a build log highlights an error line over an info line -
 * the user notices it without having to read every tail.
 *
 * Why a separate pure module instead of inline regex in content.ts?
 *   - content.ts runs in every page; keeping logic out of it cuts
 *     bundle size + simplifies the per-page CSP surface.
 *   - The keyword list is tunable in one place. As more users
 *     report patterns ("we use 'beta' for prod-equivalent here"),
 *     the list expands without scope creeping into the palette
 *     code.
 *   - Unit-testable in isolation: regex + edge cases + tier
 *     mapping all live behind a single pure function.
 *
 * Why a fixed keyword list (not user-configurable)?
 *   - First-shipped iteration: nail the 80% case (common English
 *     production-safety vocabulary) before adding settings UI.
 *   - The list is *additive* to the palette experience - a clip
 *     without a matching note still works exactly as before, so
 *     a false negative (no tint where the user would have wanted
 *     one) is harmless; the only failure mode is a false POSITIVE,
 *     which the conservative list keeps rare.
 *   - User-defined patterns can land later as a per-host site-rule
 *     extension (same place customPatterns lives).
 *
 * Detection is case-INSENSITIVE and word-boundary anchored so:
 *   - "production" matches; "preproduction" does NOT (boundary).
 *   - "do not paste" matches; "donut" does NOT (literal substring
 *     never crosses a word boundary).
 *   - Hash-prefixed forms like "#prod" / "#staging" also tint -
 *     users write hashtags inline as informal flags so the gate
 *     accepts both spellings.
 *
 * Pure: no DOM, no IO. Caller (content.ts) checks the result and
 * adds a CSS class to the palette row when present.
 */

/**
 * Warning keyword list. Each entry is a literal phrase that, when
 * matched against the note text under case-insensitive +
 * word-boundary semantics, tints the row. Multi-word phrases are
 * matched as exact whitespace-separated runs (`do not paste` matches
 * "Do not paste this" but not "do paste not").
 *
 * Curated for high signal / low noise:
 *   - environment names that imply consequence: prod, production,
 *     staging, beta, sandbox
 *   - explicit verbs of caution: do not, don't paste, never,
 *     caution, warning, danger
 *   - lifecycle warnings: deprecated, draft, wip, todo, fixme
 *   - secrecy markers: secret, private, confidential, internal
 *
 * Notably EXCLUDED:
 *   - "dev" / "development" - too common in unrelated note prose
 *     ("I dev on this clip daily") to gate on safely
 *   - "test" - same false-positive risk ("just a test capture")
 *   - "live" - ambiguous (live-streaming vs live-production)
 *
 * If the user has a clip-note style that legitimately uses one of
 * these words in non-warning context, the false positive is a
 * cosmetic tint - the row still works exactly as before, and they
 * can edit the note. No data is dropped, no action is blocked.
 */
export const NOTE_WARNING_KEYWORDS: readonly string[] = [
  // Environment names (highest-signal — pasting a staging URL into
  // prod is the canonical "should have warned me" moment)
  "prod",
  "production",
  "staging",
  "beta",
  "sandbox",
  // Explicit verbs of caution
  "do not",
  "don't paste",
  "never use",
  "never paste",
  "caution",
  "warning",
  "danger",
  // Lifecycle markers
  "deprecated",
  "draft",
  "wip",
  "todo",
  "fixme",
  // Secrecy markers
  "secret",
  "private",
  "confidential",
  "internal only",
];

/**
 * Build a single combined regex from the keyword list. Compiled
 * once at module load so each palette open doesn't re-pay the
 * RegExp construction cost.
 *
 * Word-boundary anchoring:
 *   - JS `\b` is anchored between `\w` and `\W`, where `\w` is
 *     [A-Za-z0-9_]. That means `\bprod\b` matches "prod" at any
 *     non-word neighbor (space, comma, EOL, `#`, `!`) but NOT
 *     inside "preproduction" (the `pre` is word-chars on the
 *     leading side, so the `\b` between `pre` and `pro` doesn't
 *     fire).
 *   - For multi-word phrases ("do not"), the `\b` only wraps the
 *     outer ends; internal whitespace stays loose so "do  not"
 *     (double space) and "do\tnot" (tab) both match. We replace
 *     literal spaces in the phrase with `\s+` to handle the latter.
 *   - For phrases containing an apostrophe ("don't paste"), `\b`
 *     sits between `n` and `'` which IS a boundary, then between
 *     `'` and `t` which is ALSO a boundary - so the apostrophe
 *     stays a hard match (the regex won't accept "dont paste").
 *     We escape the apostrophe defensively even though `'` isn't
 *     a regex metachar - tightens the audit on the constant.
 *
 * Escape note metachars: `.` and `?` aren't in our list today,
 * but escaping defensively guards future additions like "n.b."
 * or "warning?" from going wrong.
 *
 * `gi` flags: case-insensitive (`i`) + global so test() and exec()
 * can both walk the string. We only use test() in the predicate -
 * the formatter doesn't need the match positions today.
 */
const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
function escapeRegex(s: string): string {
  return s.replace(ESCAPE_RE, "\\$&");
}

const WARNING_RE = new RegExp(
  "\\b(?:" +
    NOTE_WARNING_KEYWORDS.map((k) =>
      // Multi-word phrase: replace literal whitespace with \s+ so
      // "do  not" (double space) and "do\tnot" (tab) also match.
      // Escape each individual word for regex safety, THEN join.
      k
        .split(/\s+/)
        .map((w) => escapeRegex(w))
        .join("\\s+"),
    ).join("|") +
    ")\\b",
  "gi",
);

/**
 * Predicate: does the clip's note contain a warning keyword?
 * Returns false for missing/empty/non-string notes (cheap early
 * exit so the per-row scan in the palette is O(K * M) for K
 * keywords and M chars, only when the note exists).
 *
 * The single combined regex makes this O(M) per call regardless
 * of keyword count - one walk of the note, no per-keyword loop.
 *
 * Pure: deterministic; same input -> same output.
 */
export function hasNoteWarning(note: unknown): boolean {
  if (typeof note !== "string") return false;
  if (note.length === 0) return false;
  // Reset lastIndex defensively - the regex is module-scoped, and
  // the `g` flag means stateful exec(). test() respects lastIndex
  // too, so without reset a second call could miss a match.
  WARNING_RE.lastIndex = 0;
  return WARNING_RE.test(note);
}

/**
 * Find which keyword (case-folded to its canonical list entry)
 * triggered the warning. Returns null when no match. Used by the
 * palette tooltip so the row's hover label can show WHICH keyword
 * tripped the tint ("Warning: staging") rather than a generic
 * "this clip is caveated".
 *
 * Walks the keyword list in declaration order and returns the FIRST
 * match. Multi-word phrases are tested first via the combined regex
 * for efficiency, then matched against each keyword to identify
 * which one fired - this avoids re-walking the note text for each
 * keyword separately.
 *
 * Returns the canonical form (lowercase, as in NOTE_WARNING_KEYWORDS)
 * so the caller can render a consistent label regardless of whether
 * the user wrote "PROD" or "prod" or "Prod".
 */
export function firstWarningKeyword(note: unknown): string | null {
  if (typeof note !== "string") return null;
  if (note.length === 0) return null;
  // Walk the combined regex to find ANY match first - cheap path
  // when there's no warning at all.
  WARNING_RE.lastIndex = 0;
  if (!WARNING_RE.test(note)) return null;
  // We have a match somewhere; figure out which keyword. Per-keyword
  // test() is O(M) each, but we only reach this branch when there
  // IS a match, so the total is bounded by O(K * M) in the worst
  // case (every keyword tests, only the last matches). Acceptable
  // given the palette is rendered on user gesture.
  for (const kw of NOTE_WARNING_KEYWORDS) {
    // Build a per-keyword regex once per call. Cheap (small string,
    // no flag combos), bounded by NOTE_WARNING_KEYWORDS.length.
    const pattern = kw
      .split(/\s+/)
      .map((w) => escapeRegex(w))
      .join("\\s+");
    const re = new RegExp("\\b" + pattern + "\\b", "i");
    if (re.test(note)) return kw;
  }
  // Defensive fallback: combined regex matched but no individual
  // keyword did. Shouldn't happen given the combined regex is built
  // from the same keyword list, but a future tweak to either side
  // could create drift. Return null so the caller treats this as
  // "no warning" rather than crashing.
  return null;
}

/**
 * Build the hover-tooltip text for a warning-tinted palette row.
 * Format: "Warning: <keyword> — check the note before pasting"
 *
 * Returns empty string when no warning is detected (caller hides
 * the tooltip / leaves the default row tooltip in place).
 *
 * The wording is deliberate: "check the note" reminds the user
 * the tail below the row is where the caveat lives, not "this
 * clip is broken" which would be misleading.
 */
export function formatNoteWarningTooltip(note: unknown): string {
  const kw = firstWarningKeyword(note);
  if (!kw) return "";
  return `Warning: ${kw} — check the note before pasting`;
}

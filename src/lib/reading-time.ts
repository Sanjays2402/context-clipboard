/**
 * Reading-time estimate for the detail content-stats breadcrumb.
 *
 * The breadcrumb already tells you how BIG a clip is (chars / words /
 * lines / bytes). For a long-form text clip — a captured article, a wall
 * of release notes, a meeting transcript — the question after "how big?"
 * is "how long to read?". A 1,200-word capture reads in ~6 min; that's the
 * difference between "skim now" and "save for later". This appends a "~6
 * min read" tail to the breadcrumb so the at-a-glance line answers both.
 *
 * Pure — no DOM. The breadcrumb formatter calls readingTimeLabel(words)
 * and joins the tail; content-stats owns the figures.
 *
 * Design decisions:
 *   - 200 wpm — the standard average adult silent-reading pace used by
 *     Medium / most "min read" badges. Round UP (a 210-word clip is "1
 *     min", a 250-word clip is "2 min") so the estimate never undersells.
 *   - The tail only earns its place above a floor: a 30-word clip reading
 *     "<1 min" is noise. We gate at 60 words (~18 s) so the badge appears
 *     only when "how long?" is a real question. Below that -> null and the
 *     breadcrumb stays size-only.
 *   - Code clips, JSON, config — anything word-light — fall under the floor
 *     naturally, so the badge self-selects to prose without a kind check.
 */

/** Words-per-minute reading pace (standard ~200 for silent prose). */
const WPM = 200;

/** Below this word count the badge is hidden — too short to be a "read". */
const MIN_WORDS = 60;

/**
 * "~6 min read" for `words` worth of prose, or null when below the 60-word
 * floor (too short to need an estimate). Minutes round UP so the figure
 * never undersells; a non-finite / negative count yields null.
 */
export function readingTimeLabel(words: number): string | null {
  if (!Number.isFinite(words) || words < MIN_WORDS) return null;
  const mins = Math.max(1, Math.ceil(words / WPM));
  return `~${mins} min read`;
}

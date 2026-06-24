/**
 * Pure helper for the Cmd+K "Find hashtags in notes" command.
 *
 * Aggregates `#hashtag` tokens across an array of clips into a
 * top-N report so the user knows what's HIDING in their notes
 * before running the bulk "Tag from notes" action.
 *
 * Why this exists:
 *   - tag-from-notes (the bulk action) PROMOTES hashtags into
 *     structured tags. But the user doesn't always know what
 *     hashtags they've left across their notes - some are stale
 *     experiment markers, some are legitimate, some are noise.
 *   - The discovery command surfaces the distribution: "you have
 *     #staging in 8 clips, #wip in 5, #review-q3 in 2" so the
 *     user can decide whether to promote them all or whether
 *     #wip is just signal-pollution they want to wipe instead.
 *   - Closes the loop the OTHER direction from tag-from-notes
 *     (which converts notes → tags). Discovery answers "what
 *     would I be converting?" before the user commits.
 *
 * Pure: no IO, no DOM. Caller (popup) feeds the visible/wide
 * clip set and renders the toast or list. Returns a sorted
 * report so the caller doesn't need to know about hashtag
 * grammar - same MAX_TAGS_PER_NOTE cap as tag-from-notes via
 * the shared extractHashtagsFromNote helper.
 */

import { extractHashtagsFromNote } from "./tag-from-notes";

export interface HashtagDiscoveryCandidate {
  id?: string;
  note?: unknown;
  tags?: unknown;
}

export interface HashtagDiscoveryEntry {
  /** Canonical lowercase hashtag (no leading `#`). */
  tag: string;
  /** Number of clips whose note contained this hashtag. */
  clipCount: number;
  /**
   * Whether this hashtag is ALREADY in the structured tag list of
   * EVERY clip whose note carries it. When true, the user already
   * promoted it (or had a structured tag with the same name from
   * the start) - the entry surfaces but is flagged as "already
   * tagged" so the user doesn't waste a Tag-from-notes run.
   *
   * When false (the default for most entries), at least one clip
   * carries the hashtag in its note WITHOUT a matching structured
   * tag - i.e. a bulk Tag-from-notes run would do work for it.
   */
  alreadyTagged: boolean;
}

export interface HashtagDiscoveryReport {
  /** Total clips scanned (including those with no notes / no hashtags). */
  scanned: number;
  /** Clips that had at least one extractable hashtag. */
  clipsWithHashtags: number;
  /** Distinct hashtags found. */
  distinctTags: number;
  /**
   * Sorted entries — descending by clipCount, then ascending by
   * tag name as tie-breaker (so output is deterministic). Capped
   * by the caller via opts.topN when set.
   */
  entries: HashtagDiscoveryEntry[];
}

/**
 * Scan the provided clip array for hashtags in notes and return
 * a sorted distribution. Defensive: empty / non-array input
 * returns an empty report.
 *
 * `topN` limits the entries returned (the most-frequent N). The
 * scanned/distinct counts always reflect the full set so the
 * caller can show "showing 10 of 23 tags" honestly.
 *
 * Pure: no side effects, deterministic for the same input.
 */
export function discoverHashtagsInNotes<T extends HashtagDiscoveryCandidate>(
  clips: T[] | null | undefined,
  opts: { topN?: number } = {},
): HashtagDiscoveryReport {
  const report: HashtagDiscoveryReport = {
    scanned: 0,
    clipsWithHashtags: 0,
    distinctTags: 0,
    entries: [],
  };
  if (!Array.isArray(clips)) return report;
  const topN =
    typeof opts.topN === "number" &&
    Number.isFinite(opts.topN) &&
    opts.topN > 0
      ? Math.floor(opts.topN)
      : Infinity;

  // Per-tag tally: clipCount + whether every clip carrying the tag
  // in its note ALSO has it in the structured tag list (=> already
  // tagged everywhere it would be promoted).
  const tally = new Map<
    string,
    { clipCount: number; allAlreadyTagged: boolean }
  >();

  for (const c of clips) {
    report.scanned++;
    if (!c) continue;
    const extracted = extractHashtagsFromNote(c.note);
    if (extracted.length === 0) continue;
    report.clipsWithHashtags++;
    // Normalise structured tags to lowercase for the comparison.
    const existing = new Set<string>();
    if (Array.isArray(c.tags)) {
      for (const t of c.tags) {
        if (typeof t === "string") existing.add(t.trim().toLowerCase());
      }
    }
    // Per hashtag in this clip's note: bump tally; flip
    // allAlreadyTagged off if this particular clip DOESN'T have
    // the corresponding structured tag.
    const seenInThisClip = new Set<string>();
    for (const tag of extracted) {
      if (seenInThisClip.has(tag)) continue;
      seenInThisClip.add(tag);
      const prev = tally.get(tag);
      const taggedHere = existing.has(tag);
      if (!prev) {
        tally.set(tag, { clipCount: 1, allAlreadyTagged: taggedHere });
      } else {
        prev.clipCount++;
        if (!taggedHere) prev.allAlreadyTagged = false;
      }
    }
  }

  report.distinctTags = tally.size;

  // Sort: descending by clipCount, ascending by tag name for ties.
  // Deterministic so the test + the user both see the same order.
  const sorted: HashtagDiscoveryEntry[] = Array.from(tally.entries()).map(
    ([tag, v]) => ({
      tag,
      clipCount: v.clipCount,
      alreadyTagged: v.allAlreadyTagged,
    }),
  );
  sorted.sort((a, b) => {
    if (a.clipCount !== b.clipCount) return b.clipCount - a.clipCount;
    return a.tag.localeCompare(b.tag);
  });

  report.entries = sorted.slice(0, topN);
  return report;
}

/**
 * Build the toast label summarising the discovery report. Adapts
 * to:
 *   - empty / no-hashtags result → "No hashtags found in notes"
 *   - 1 distinct tag → "Found #x in N clips"
 *   - 2-3 distinct → "Found #x, #y, #z (3 tags across N clips)"
 *   - 4+ distinct → "Found N hashtags (top: #x, #y, #z)"
 *
 * Caller decides whether to also surface the full list (we keep
 * the toast tight so the user can act on the headline; the report
 * itself is available for a richer UI if needed later).
 *
 * Pure: deterministic for the same report.
 */
export function formatHashtagDiscoveryToast(
  report: HashtagDiscoveryReport,
): string {
  if (!report || report.distinctTags === 0 || report.entries.length === 0) {
    return "No hashtags found in notes";
  }
  const entries = report.entries;
  const clipsWith = report.clipsWithHashtags;
  if (entries.length === 1) {
    const noun = entries[0].clipCount === 1 ? "clip" : "clips";
    return `Found #${entries[0].tag} in ${entries[0].clipCount} ${noun}`;
  }
  if (entries.length <= 3) {
    const list = entries.map((e) => `#${e.tag}`).join(", ");
    const noun = clipsWith === 1 ? "clip" : "clips";
    return `Found ${list} (${entries.length} tags across ${clipsWith} ${noun})`;
  }
  // 4+ distinct: lead with the headline count, list the top 3 as
  // a hint so the user gets the most-frequent at a glance without
  // an arbitrarily long toast. The remaining tags are still in
  // report.entries for callers that want to render them.
  const top3 = entries.slice(0, 3).map((e) => `#${e.tag}`).join(", ");
  return `Found ${report.distinctTags} hashtags (top: ${top3})`;
}

/**
 * Hover-tooltip / palette hint for the Cmd+K command. Adapts to
 * the SCAN-TIME state of the visible clip set so the user sees
 * "Find hashtags hiding in your notes (8 found across 12 clips)"
 * BEFORE clicking. Same selection-shape-only approach as the
 * tag-from-notes button title - tooltip's job is to invite the
 * action and give a meaningful preview.
 *
 * Pre-computed report so the caller doesn't need to re-scan.
 */
export function formatHashtagDiscoveryHint(
  report: HashtagDiscoveryReport,
): string {
  if (!report || report.scanned === 0) {
    return "Find hashtags hiding in your notes";
  }
  if (report.distinctTags === 0) {
    return "No hashtags in any visible note";
  }
  const tagNoun = report.distinctTags === 1 ? "hashtag" : "hashtags";
  const clipNoun = report.clipsWithHashtags === 1 ? "clip" : "clips";
  return `${report.distinctTags} ${tagNoun} across ${report.clipsWithHashtags} ${clipNoun}`;
}

/**
 * Build the per-tag filter palette action: when the user picks a
 * specific hashtag from the discovery result, the palette runs a
 * search-query injection so the list filters to clips whose note
 * carries that hashtag.
 *
 * Why a dedicated palette action per hashtag (vs one "Pick from
 * report" command)?
 *   - The user already knows which hashtags they're interested in
 *     after seeing the discovery toast. Surfacing each top-N
 *     hashtag as its own palette row lets them keyboard-pick the
 *     one they want in two chords (Cmd+K, type tag, Enter).
 *   - The alternative — a modal picker — adds a screen surface for
 *     what's fundamentally a one-decision action. Palette rows
 *     are the same UX shape as every other filter command so the
 *     pattern is consistent.
 *
 * The action filters by searching for the literal `#<tag>` text
 * in the note body. We DO NOT auto-promote — the discovery action
 * is for SEEING what's there, not for committing to a promotion
 * decision. The user can run Tag-from-notes after filtering if
 * that's what they want.
 *
 * Result shape: `{ searchOp, label, hint }` so the popup wiring
 * can plug into the existing PaletteAction shape without dragging
 * UI concerns into the pure module.
 *
 * Pure: deterministic for the same entry.
 */
export interface HashtagFilterAction {
  /** Operator string to inject into the search box. */
  searchOp: string;
  /** Palette row label (single-line, no overflow). */
  label: string;
  /** Palette row hint (subtitle line, optional but recommended). */
  hint: string;
  /** Keywords for fuzzy-matching in the palette. */
  keywords: string;
}

/**
 * Generate a per-hashtag palette action from a discovery entry.
 *
 * Search operator: `is:hashtags note:#<tag>` would be more
 * specific, but the parser doesn't have a `note:<text>` operator.
 * Instead we use the free-text search needle, which already
 * matches note content (preview/title/url/nearbyText/tags/ocrText
 * all join into the haystack). The literal `#<tag>` substring is
 * unique enough that the false-positive rate is acceptable —
 * matches the same affordance as the `tag:<name>` operator for
 * structured tags.
 *
 * Defensive: empty / non-entry input returns undefined so the
 * caller can skip the row cleanly.
 *
 * Pure: deterministic.
 */
export function hashtagFilterActionFor(
  entry: HashtagDiscoveryEntry | null | undefined,
): HashtagFilterAction | undefined {
  if (!entry || typeof entry.tag !== "string" || entry.tag.length === 0) {
    return undefined;
  }
  const tag = entry.tag;
  const clipCount = Math.max(0, Math.floor(Number(entry.clipCount) || 0));
  const noun = clipCount === 1 ? "clip" : "clips";
  // The search operator combines:
  //   - `is:hashtags` to scope the result to clips with inline tags
  //     (filters out prose-only noted clips + the no-note set)
  //   - free-text `#<tag>` so the haystack join matches the literal
  //     token. The hashtag grammar guarantees a unique substring
  //     (no foo#bar conflation because the leader set excludes
  //     mid-token punctuation), so this scan is precise.
  const searchOp = `is:hashtags #${tag}`;
  const alreadyTaggedFlag = entry.alreadyTagged ? " (already structured)" : "";
  const label = `Filter to clips with #${tag} in notes (${clipCount} ${noun})${alreadyTaggedFlag}`;
  const hint = entry.alreadyTagged
    ? `#${tag} is already a structured tag in every clip — running this filter shows the inline duplicates`
    : `Show only clips whose note contains #${tag} — promotion candidate via Tag-from-notes`;
  const keywords = `hashtag #${tag} ${tag} filter find note inline ${entry.alreadyTagged ? "structured already" : "promote candidate ready"}`;
  return { searchOp, label, hint, keywords };
}

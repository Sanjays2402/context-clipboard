/**
 * Note length-counter model — shared by the detail note editor and the
 * note composer.
 *
 * The detail-view note editor shows a live "N / 2,000" char counter that
 * turns red once the draft exceeds the cap (because the sanitizer slices
 * to CLIP_NOTE_MAX_LEN on save, so anything over that is content the user
 * is about to LOSE). The note COMPOSER — the modal that authors a brand-
 * new note — grew a token pill and a caution-warning banner but never
 * grew that length readout, so a user typing a long note in the composer
 * had no warning they were about to be truncated until they reopened the
 * saved clip in detail and saw the red counter there. The one surface
 * where you're MOST likely to overrun (a fresh, unbounded note) was the
 * one with no gauge.
 *
 * This module owns the PURE counter: the "N / cap" label grammar + the
 * over-cap verdict, against the same CLIP_NOTE_MAX_LEN the sanitizer
 * enforces. Both the detail editor and the composer call it, so the two
 * counters read identically and can't drift on the cap or the formatting.
 * No DOM — the popup writes the label into its element + toggles the
 * over-cap class.
 *
 * Design decisions:
 *   - Length is the raw `string.length` (UTF-16 code units), NOT a
 *     code-point count, because that's exactly what sanitizeClipNote's
 *     `.slice(0, CLIP_NOTE_MAX_LEN)` measures — the counter must predict
 *     the SAME truncation the save path applies, so it counts the same
 *     units. (The detail editor already counted this way; this preserves
 *     that contract.)
 *   - The cap is read from lib/clip-note (CLIP_NOTE_MAX_LEN), the single
 *     source of truth, so a future cap change moves both counters + the
 *     sanitizer together.
 *   - `overCap` is STRICTLY greater-than (len > cap), matching the
 *     sanitizer: a note of exactly the cap length survives whole, so it's
 *     not flagged. Only an over-length draft — which WILL lose its tail —
 *     turns red.
 *   - A graduated AMBER "near cap" tier sits just below the red over-cap
 *     band, the way a well-built form field warns you BEFORE you overrun,
 *     not only at the moment you already have. `nearCap` fires once the
 *     draft crosses NEAR_CAP_RATIO of the cap (90% by default, i.e. 1,800
 *     of 2,000) and STAYS true through the over-cap band — but `tier`
 *     resolves to the single most-urgent state ("over" wins over "near"),
 *     so the caller paints exactly one colour. The amber gives the user a
 *     runway: "you're getting close" before "you just lost your tail".
 *   - `tier` is the single source of truth for which colour to paint:
 *       "normal" → muted (plenty of room)
 *       "near"   → amber (>= 90%, not yet over)
 *       "over"   → red   (> cap; the tail will be sliced on save)
 *     so the popup toggles one class off `tier` instead of juggling two
 *     booleans. `overCap` + `nearCap` stay exposed for callers that want
 *     the raw predicates (and for back-compat with the existing wiring).
 *   - Numbers are grouped with commas ("1,240 / 2,000") for legibility at
 *     a glance, mirroring the detail editor's toLocaleString rendering
 *     but with a deterministic en-US grouping so headless tests + every
 *     locale read identically.
 *   - Defensive: a non-string / nullish draft counts as length 0, so the
 *     composer paints "0 / 2,000" on open rather than throwing.
 */

import { CLIP_NOTE_MAX_LEN } from "./clip-note";

/**
 * Fraction of the cap at which the counter flips to the amber "near"
 * tier. 0.9 → the last 10% of the budget reads amber (1,800 of 2,000),
 * giving the user a visible runway before the red over-cap band. Chosen
 * to mirror the "you're almost out of room" feel of a good form field —
 * early enough to act on, late enough not to cry wolf at half-full.
 */
export const NEAR_CAP_RATIO = 0.9;

/** Which colour band the counter should paint — the single urgency verdict. */
export type NoteCountTier = "normal" | "near" | "over";

export interface NoteCountState {
  /** Draft length in UTF-16 code units (what the sanitizer slices on). */
  length: number;
  /** The hard cap (CLIP_NOTE_MAX_LEN) — surfaced so the caller needn't import it. */
  max: number;
  /** True when length > cap, i.e. the draft will lose its tail on save. */
  overCap: boolean;
  /**
   * True once the draft reaches NEAR_CAP_RATIO of the cap (default 90%)
   * AND is not yet over it — the amber "getting close" band. Stays a raw
   * predicate (it does NOT include the over-cap region) so a caller can
   * ask "is this in the warn zone but still safe?" directly; `tier` is the
   * place to look for the mutually-exclusive paint decision.
   */
  nearCap: boolean;
  /**
   * The single most-urgent paint band: "over" (red) wins over "near"
   * (amber) wins over "normal" (muted). The popup toggles ONE class off
   * this so the two booleans can never paint two colours at once.
   */
  tier: NoteCountTier;
  /**
   * Fill fraction for a progress-bar gauge, in [0, 1]. `length / cap`
   * clamped so the bar never overflows its track: a draft AT or OVER the
   * cap reads a full bar (1), an empty draft an empty one (0). This is the
   * visceral runway cue that pairs with the numeric `label` — the same
   * `tier` colours the bar (muted -> amber -> red) so the gauge and the
   * counter can never disagree. Driving the width from the shared state
   * (not a popup recompute) keeps the bar, the colour, and the number in
   * lock-step. A degenerate / non-finite cap yields 0 (no misleading fill).
   */
  ratio: number;
  /** Ready-to-render label, e.g. "1,240 / 2,000". */
  label: string;
}

/**
 * Compute the note char-counter state for a draft. Pure — the caller
 * reads `tier` to pick the colour class (or the `overCap` / `nearCap`
 * predicates) and writes `label` into the counter element. Mirrors the
 * detail note editor's counter exactly (same cap, same units, same
 * strictly-over-cap flag) so the composer and the detail editor never
 * disagree — and now both gain the graduated amber warning for free.
 */
export function noteCountState(
  draft: string | null | undefined,
  max: number = CLIP_NOTE_MAX_LEN,
): NoteCountState {
  const length = typeof draft === "string" ? draft.length : 0;
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : CLIP_NOTE_MAX_LEN;
  const overCap = length > cap;
  // Amber threshold: ceil so a tidy cap (2,000 * 0.9 = 1,800) flips
  // exactly at 1,800, and a fractional product rounds UP into the amber
  // band rather than firing a char early. Never below 1 so a degenerate
  // cap can't make every empty draft read "near".
  const nearThreshold = Math.max(1, Math.ceil(cap * NEAR_CAP_RATIO));
  // nearCap is the raw "in the warn zone, still safe" predicate — it does
  // NOT extend into the over-cap region (that's `overCap`'s job). `tier`
  // collapses the two into one mutually-exclusive paint decision.
  const nearCap = !overCap && length >= nearThreshold;
  const tier: NoteCountTier = overCap ? "over" : nearCap ? "near" : "normal";
  // Progress-bar fill, clamped to [0, 1]: a draft at/over the cap reads a
  // full bar (never overflows the track), an empty draft an empty one. A
  // degenerate cap (<= 0 / non-finite — already coerced to CLIP_NOTE_MAX_LEN
  // above, so cap is always positive here) would still divide safely, but
  // guard anyway so a future change can't emit NaN width.
  const ratio = cap > 0 ? Math.min(1, Math.max(0, length / cap)) : 0;
  return {
    length,
    max: cap,
    overCap,
    nearCap,
    tier,
    ratio,
    label: `${groupThousands(length)} / ${groupThousands(cap)}`,
  };
}

/**
 * Group an integer with commas: 1240 -> "1,240". Deterministic en-US so
 * the counter reads identically headless + in every locale (the detail
 * editor uses toLocaleString, which is locale-dependent; this keeps the
 * shared helper stable). Mirrors the grouping in the bulk-copy /
 * content-stats helpers.
 */
function groupThousands(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const digits = Math.abs(Math.trunc(n)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

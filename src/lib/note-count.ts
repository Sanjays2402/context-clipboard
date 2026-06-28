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
 *   - Numbers are grouped with commas ("1,240 / 2,000") for legibility at
 *     a glance, mirroring the detail editor's toLocaleString rendering
 *     but with a deterministic en-US grouping so headless tests + every
 *     locale read identically.
 *   - Defensive: a non-string / nullish draft counts as length 0, so the
 *     composer paints "0 / 2,000" on open rather than throwing.
 */

import { CLIP_NOTE_MAX_LEN } from "./clip-note";

export interface NoteCountState {
  /** Draft length in UTF-16 code units (what the sanitizer slices on). */
  length: number;
  /** The hard cap (CLIP_NOTE_MAX_LEN) — surfaced so the caller needn't import it. */
  max: number;
  /** True when length > cap, i.e. the draft will lose its tail on save. */
  overCap: boolean;
  /** Ready-to-render label, e.g. "1,240 / 2,000". */
  label: string;
}

/**
 * Compute the note char-counter state for a draft. Pure — the caller
 * writes `label` into its counter element and toggles an over-cap class
 * when `overCap` is true. Mirrors the detail note editor's counter
 * exactly (same cap, same units, same strictly-over-cap flag) so the
 * composer and the detail editor never disagree.
 */
export function noteCountState(
  draft: string | null | undefined,
  max: number = CLIP_NOTE_MAX_LEN,
): NoteCountState {
  const length = typeof draft === "string" ? draft.length : 0;
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : CLIP_NOTE_MAX_LEN;
  return {
    length,
    max: cap,
    overCap: length > cap,
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

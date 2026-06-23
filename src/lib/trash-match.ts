/**
 * Pure helper for the trash-row hover-preview affordance.
 *
 * When a clip is trashed, the user may have already re-captured the
 * same content (a re-copy after the trash, or the trashed clip was
 * a duplicate that already had a live twin). In that case purging
 * the trash entry is RISK-FREE — the content survives in the live
 * store. Surfacing this fact in the hover-tooltip ("Live re-capture
 * exists from 2h ago — safe to purge") removes the "what if I lose
 * this forever?" friction from trash housekeeping.
 *
 * Inverse case: when no live re-capture exists, the tooltip should
 * say so too ("No live re-capture — purging this is permanent")
 * so the user knows to weigh the decision. Either way the user
 * gets a TRUTHFUL preview of consequence at hover-cost.
 *
 * Pure: no DOM, no IDB. Caller hands us the trashed clip + the
 * full live clip list (already loaded for the daily list); we
 * scan by hash and shape the tooltip string.
 */

export interface TrashMatchableClip {
  id: string;
  /** Cheap content hash (djb2) — same field on ClipItem + TrashedClip. */
  hash?: string;
  /** Recency stamp on the LIVE clip. Used to compose the "X ago" tail. */
  lastSeenAt?: number;
  /** Preview text — surface in the tooltip so the user recognises the match. */
  preview?: string;
  content?: string;
  /**
   * Optional per-clip free-form note. When present on the TRASHED
   * clip, formatTrashRecaptureTooltip appends a "Note: ..." tail to
   * either tooltip shape — the note is the user's commentary on
   * *this specific clip*, which is high-signal context for "do I
   * actually want to lose this?" decisions at trash-housekeeping
   * time. Notes ride trash via the existing TrashedClip extends
   * ClipItem path (db.ts:trashClip spreads the whole item), so the
   * field is already preserved through trash + restore round-trips.
   */
  note?: string;
}

/**
 * Find the most-recently-seen live clip whose hash matches the
 * trashed clip's hash. Returns null when no match exists or when
 * the trashed clip has no hash (legacy clips trashed before djb2
 * hashing shipped — extremely rare, but defensive).
 *
 * Why "most-recently-seen"? A user can re-capture the same content
 * multiple times in a session; the latest copy is the most relevant
 * "this is alive elsewhere" evidence. Tie-breaking by lastSeenAt
 * desc gives the freshest match.
 *
 * Pure single-pass scan — O(N) over live clips. Cheap at the
 * typical 500-clip cap, so calling this once per trash-row render
 * is fine without memoization.
 */
export function findLiveRecaptureForTrash<T extends TrashMatchableClip>(
  trashedHash: string | undefined,
  liveClips: T[],
): T | null {
  if (typeof trashedHash !== "string" || trashedHash.length === 0) return null;
  if (!Array.isArray(liveClips)) return null;
  let best: T | null = null;
  let bestAt = -Infinity;
  for (const c of liveClips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (typeof c.hash !== "string" || c.hash !== trashedHash) continue;
    const at =
      typeof c.lastSeenAt === "number" && Number.isFinite(c.lastSeenAt)
        ? c.lastSeenAt
        : -Infinity;
    if (at > bestAt) {
      bestAt = at;
      best = c;
    }
  }
  return best;
}

/**
 * Format the hover-tooltip text for a trash row. Three shapes:
 *
 *   - match found: "Live re-capture exists — N{m,h,d} ago. Safe to purge."
 *     Optionally tails with a short preview snippet when the live
 *     clip carries one.
 *   - no match: "No live re-capture — purging this is permanent."
 *   - either case + the TRASHED clip carries a non-empty note: the
 *     tooltip gets an extra "Note: <summary>" line appended. The
 *     note is the highest-signal context the user has about THIS
 *     specific clip — if they wrote "be careful, staging only" on
 *     it, that text should reach them at the moment they're about
 *     to permanently lose the clip. The note rides via the
 *     `trashed` argument; the optional liveNote tail isn't surfaced
 *     because the live clip's note (if any) belongs to the live
 *     clip's future, not the trashed clip's history.
 *
 * Defensive against bad inputs — non-finite lastSeenAt falls back
 * to "exists" without an age tail; non-string note silently
 * dropped.
 *
 * Pure: no clock fixation. Caller passes `now` for tests.
 */
export function formatTrashRecaptureTooltip(opts: {
  match: TrashMatchableClip | null;
  /**
   * The trashed clip itself, used to surface its note (if any) in
   * the tooltip tail. Optional for back-compat — callers that
   * don't pass it get the original 2-shape (match/no-match)
   * tooltip without any note context.
   */
  trashed?: TrashMatchableClip | null;
  now?: number;
  previewPeek?: number;
  /** Cap on the note summary length in the tooltip tail. */
  notePeek?: number;
}): string {
  const match = opts.match;
  const trashed = opts.trashed ?? null;
  const noteTail = formatNoteTail(trashed, opts.notePeek);
  let head: string;
  if (!match) {
    head = "No live re-capture — purging this is permanent.";
  } else {
    const now =
      typeof opts.now === "number" && Number.isFinite(opts.now)
        ? opts.now
        : Date.now();
    const previewPeek =
      typeof opts.previewPeek === "number" &&
      Number.isFinite(opts.previewPeek) &&
      opts.previewPeek > 0
        ? Math.floor(opts.previewPeek)
        : 60;
    const at =
      typeof match.lastSeenAt === "number" && Number.isFinite(match.lastSeenAt)
        ? match.lastSeenAt
        : NaN;
    if (Number.isFinite(at)) {
      head = `Live re-capture exists — ${formatShortAge(now - at)}. Safe to purge.`;
    } else {
      head = "Live re-capture exists — safe to purge.";
    }
    const peekSource = match.preview || match.content || "";
    if (typeof peekSource === "string" && peekSource.trim().length > 0) {
      const flat = peekSource.trim().replace(/\s+/g, " ");
      const cut =
        flat.length <= previewPeek
          ? flat
          : flat.slice(0, previewPeek).replace(/\s+\S*$/, "") + "…";
      head = `${head}\n"${cut}"`;
    }
  }
  return noteTail ? `${head}\n${noteTail}` : head;
}

/**
 * Build the "Note: <summary>" tail for a trashed clip's tooltip.
 * Returns empty string when the clip has no usable note — caller
 * should test the result and skip the join.
 *
 * Cap defaults to 80 chars (short enough to keep the tooltip from
 * spilling off-screen on small popups). Newlines in the note
 * collapse to single spaces so the tail stays single-line.
 *
 * Defensive against bad inputs — non-string / missing / empty
 * notes → "".
 */
function formatNoteTail(
  trashed: TrashMatchableClip | null,
  notePeek?: number,
): string {
  if (!trashed) return "";
  const raw = trashed.note;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  const peek =
    typeof notePeek === "number" && Number.isFinite(notePeek) && notePeek > 0
      ? Math.floor(notePeek)
      : 80;
  const flat = trimmed.replace(/\s+/g, " ");
  if (flat.length <= peek) return `Note: ${flat}`;
  // Word-boundary trim inside the peek window so we don't chop
  // mid-word. Falls back to hard slice when no whitespace exists
  // (one giant word).
  const cut = flat.slice(0, peek);
  const lastSpace = cut.lastIndexOf(" ");
  const truncated =
    lastSpace > peek * 0.6 ? cut.slice(0, lastSpace) + "…" : cut + "…";
  return `Note: ${truncated}`;
}

/**
 * Short relative-age formatter, kept local so this module stays a
 * leaf (no util.ts dep — util imports a lot of unrelated code and
 * pulling it in here would slow popup boot). Maps:
 *
 *   < 60s   → "just now"
 *   < 1h    → "Nm ago"
 *   < 24h   → "Nh ago"
 *   < 7d    → "Nd ago"
 *   ≥ 7d    → "N weeks ago"
 *
 * Defensive against negatives (clock skew) → "just now".
 */
function formatShortAge(diffMs: number): string {
  if (!Number.isFinite(diffMs)) return "recently";
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 7 * 86_400_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  return `${Math.floor(diffMs / (7 * 86_400_000))} weeks ago`;
}

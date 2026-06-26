/**
 * Day-run selection helper for the clip-list day-group dividers.
 *
 * The list paints sticky day-group headers ("Today · 6", "Yesterday",
 * "Mon Jun 22") before the first clip of each calendar-day run (see
 * lib/day-group). Those headers carry a volume count — and that count
 * is exactly a selectable unit: "select everything from today" is a
 * natural one-tap triage gesture (then bulk-pin / lock / tag / export
 * the day). Clicking the divider should grab the whole run.
 *
 * This module is the pure id-collector behind that gesture: given the
 * ordered clip list, the run's start index, and the run length (both
 * already on the header element as data attributes), it returns the
 * stable clip ids in that contiguous run. No DOM, no selection Set
 * mutation — the popup owns the actual `selectedIds` writes; keeping
 * the slice math here means the bounds handling is exercised headless.
 *
 * Design decisions:
 *   - The run is a CONTIGUOUS slice [start, start+count) of the
 *     already-sorted+filtered list — the same window the header's count
 *     was computed over (computeDayHeaderInfos counts forward until the
 *     day key changes). So passing the header's own start+count back in
 *     reproduces exactly the rows under that divider.
 *   - Returns ids (not clips) because that's what the selection Set
 *     keys on; the popup turns them into highlights via render().
 *   - Defensive: a nullish list, a non-integer / out-of-range start, or
 *     a non-positive count yields [] rather than throwing inside a click
 *     handler. The end is clamped to the list length so a stale count
 *     (list re-rendered shorter between paint and click) still returns
 *     the rows that ARE there.
 */

export interface DayRunClip {
  id: string;
}

/**
 * Collect the clip ids in the contiguous run [startIndex,
 * startIndex+count) of `clips`. Powers click-to-select-run on a
 * day-group divider: the header knows where its run starts and how many
 * clips it spans, so the divider can select its whole day in one tap.
 *
 * Defensive against nullish/short lists and bad indices — yields the
 * ids that actually exist in range (clamped), or [] when there's
 * nothing selectable.
 */
export function dayRunClipIds(
  clips: ReadonlyArray<DayRunClip | null | undefined> | null | undefined,
  startIndex: number,
  count: number,
): string[] {
  if (!Array.isArray(clips) || clips.length === 0) return [];
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= clips.length) {
    return [];
  }
  if (!Number.isFinite(count) || count <= 0) return [];
  const end = Math.min(clips.length, startIndex + Math.trunc(count));
  const out: string[] = [];
  for (let i = startIndex; i < end; i++) {
    const c = clips[i];
    if (c && typeof c.id === "string" && c.id !== "") out.push(c.id);
  }
  return out;
}

/**
 * Decide whether clicking a day-run divider should SELECT the run or
 * DESELECT it. The gesture is a toggle: if every clip in the run is
 * already selected, the click clears them (so a second tap on "Today"
 * undoes the select); otherwise it adds the whole run (filling in any
 * not-yet-selected members). Mirrors how a "select all" checkbox flips
 * based on whether everything's already checked.
 *
 * Returns "deselect" only when the run is non-empty AND every id is
 * already in `selected`; otherwise "select". An empty run yields
 * "select" (a no-op the caller can short-circuit).
 *
 * This is the PLAIN-click behaviour. A Shift+click ADDS the run without
 * ever deselecting (see `dayRunModifierAction`) so the user can build a
 * cross-day selection — "Today" then Shift+"Yesterday" — without the
 * second tap clearing if it happened to be all-selected already.
 */
export function dayRunToggleAction(
  runIds: ReadonlyArray<string>,
  selected: ReadonlySet<string>,
): "select" | "deselect" {
  if (!Array.isArray(runIds) || runIds.length === 0) return "select";
  const allSelected = runIds.every((id) => selected.has(id));
  return allSelected ? "deselect" : "select";
}

/**
 * Resolve the day-run divider action given whether the user held the
 * ADD modifier (Shift):
 *   - modifier held  -> always "select" (ADD the run to the existing
 *     selection; never deselect). This makes the divider an additive
 *     cross-day gesture: click "Today", Shift+click "Yesterday", and
 *     now both days are selected even if Yesterday was already fully
 *     selected (a plain click there would have cleared it).
 *   - modifier off   -> the plain toggle (`dayRunToggleAction`): select
 *     the run, or clear it if it was already all-selected.
 *
 * Pure precedence resolver so the popup's click handler stays a thin
 * dispatch and the "Shift = add-only" rule is exercised headless.
 */
export function dayRunModifierAction(
  runIds: ReadonlyArray<string>,
  selected: ReadonlySet<string>,
  addModifier: boolean,
): "select" | "deselect" {
  if (addModifier) return "select";
  return dayRunToggleAction(runIds, selected);
}

/**
 * The ids in `runIds` that are NOT yet in `selected` — the net-new
 * additions a "select" action would make. Lets the caller surface an
 * honest "Added N" toast (vs "Selected N") for a Shift+add that overlaps
 * an existing selection: clicking a run where 2 of 6 were already picked
 * reports "Added 4", not "Selected 6". Defensive against nullish inputs.
 */
export function dayRunAddedCount(
  runIds: ReadonlyArray<string> | null | undefined,
  selected: ReadonlySet<string> | null | undefined,
): number {
  if (!Array.isArray(runIds) || runIds.length === 0) return 0;
  const sel = selected instanceof Set ? selected : new Set<string>();
  let n = 0;
  for (const id of runIds) if (!sel.has(id)) n++;
  return n;
}

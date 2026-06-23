/**
 * Pure helper for the Cmd+K "Note every clip from this host" command.
 *
 * Companion to `host-pin.ts` and `host-lock.ts` (both shipped earlier
 * ticks) with the same active-tab anchoring + www-strip + case-
 * insensitive matching shape. The verb is "note" (apply or replace a
 * free-form text annotation) instead of pin/lock; the SOURCE truth bit
 * is the per-clip `note?: string` field on ClipItem (delegated to
 * lib/clip-note's `hasClipNote` predicate so the gate stays consistent
 * across the search filter, the detail-view paint, the bulk-bar editor,
 * and now the host-scoped triage command).
 *
 * Use case: "every clip I captured from `staging.example.com` is
 * potentially destined for re-test before promotion — leave the same
 * caveat on all of them in one shot." Same workflow pattern as host-
 * pin ("every clip from this site goes to the top") and host-lock
 * ("every clip from this site is irreplaceable"); the note layer adds
 * the *prose* axis to that family — pin = sort affinity, lock = delete
 * gate, note = commentary.
 *
 * Overwrite contract:
 *   - The action OVERWRITES the existing note on every matching clip.
 *     Same rationale as the bulk-bar variant (lib/bulk-note.ts):
 *     partial-merge for prose ("append your new caveat to the old
 *     one") creates unreadable franken-notes. The label SHOWS the
 *     replace-count so the user sees consequences before clicking.
 *   - An empty/whitespace input deletes existing notes on the
 *     selection. Same contract as detail-view save-empty and the
 *     bulk-bar's empty-input path.
 *
 * Sanitisation: uses `sanitizeClipNote()` from lib/clip-note so the
 * stored value matches what the detail-view editor would write for
 * the same input string — single source of truth. A 5000-char paste
 * gets sliced to 2000, control-chars stripped, empty→undefined.
 *
 * Pure: no DOM, no IDB. Caller owns the IDB write loop + the toast.
 * Mirror of host-lock.ts module shape exactly so future maintainers
 * can find the file by analogy.
 */

import { hasClipNote, sanitizeClipNote } from "./clip-note";

/** Minimal structural type — id + (optional) note + source.url. */
export interface HostNotable {
  id: string;
  note?: string;
  source?: { url?: string };
}

function normaliseHost(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/^www\./, "");
}

function hostFromUrl(u: unknown): string {
  if (typeof u !== "string" || u.length === 0) return "";
  try {
    const url = new URL(u);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Return ids of clips that match `host`. Does NOT pre-filter on note
 * presence — the action OVERWRITES (or clears) any existing note, so
 * "already noted" clips still participate in the loop. The matched
 * count = total surface area; the label decomposes it into created /
 * replaced / cleared via `planHostNote` below.
 *
 * Order-preserving so the apply loop runs in the user's daily-list
 * order. Defensive against null/non-array clips, malformed entries.
 */
export function idsToNoteForHost<T extends HostNotable>(
  host: string,
  clips: T[],
): string[] {
  const target = normaliseHost(host);
  if (!target) return [];
  if (!Array.isArray(clips)) return [];
  const out: string[] = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    out.push(c.id);
  }
  return out;
}

/**
 * Predicate: how many clips would the host-note command touch? Same
 * matching rules as `idsToNoteForHost` — kept separate so the palette
 * label can call this WITHOUT allocating an id array on every render.
 *
 * Returns 0 when there's no host, no clips, or no matches. Pure
 * single-pass scan over `clips`.
 */
export function matchedClipsForHostNote<T extends HostNotable>(
  host: string,
  clips: T[],
): number {
  const target = normaliseHost(host);
  if (!target) return 0;
  if (!Array.isArray(clips)) return 0;
  let n = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    n++;
  }
  return n;
}

export interface HostNotePlan {
  /** Selection size (= ids passed in that matched the host). */
  total: number;
  /** Clips whose note will be CREATED (no prior note). */
  created: number;
  /** Clips whose note will be REPLACED (had a prior non-empty note). */
  replaced: number;
  /** Clips whose existing note will be CLEARED (empty input + had a note). */
  cleared: number;
  /** Clips where the action would no-op (currentSan === finalValue). */
  unchanged: number;
  /** Post-sanitise final note value (undefined when input empties). */
  finalValue: string | undefined;
}

/**
 * Project what the host-note command WOULD do given the active host +
 * the current clip set + the raw input. Used by the toast formatter
 * (truthful "N replaced" copy), the optional confirm dialog before
 * the apply, and the palette label/hint shape.
 *
 * Mirrors `planBulkNote` from lib/bulk-note.ts exactly — the only
 * difference is the input filter (host scope instead of selectedIds
 * scope). Same sanitiseClipNote pipeline so created/replaced/cleared/
 * unchanged numbers agree with what the user sees in the bulk path.
 */
export function planHostNote<T extends HostNotable>(
  host: string,
  clips: T[],
  rawInput: unknown,
): HostNotePlan {
  const finalValue = sanitizeClipNote(rawInput);
  const plan: HostNotePlan = {
    total: 0,
    created: 0,
    replaced: 0,
    cleared: 0,
    unchanged: 0,
    finalValue,
  };
  const target = normaliseHost(host);
  if (!target) return plan;
  if (!Array.isArray(clips)) return plan;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    plan.total++;
    const hadNote = hasClipNote(c);
    const current = typeof c.note === "string" ? c.note : undefined;
    const currentSan = sanitizeClipNote(current);
    if (currentSan === finalValue) {
      plan.unchanged++;
      continue;
    }
    if (finalValue === undefined) {
      if (hadNote) plan.cleared++;
      else plan.unchanged++;
      continue;
    }
    if (hadNote) plan.replaced++;
    else plan.created++;
  }
  return plan;
}

/**
 * Palette label + hint matrix for the host-note command. Same 4-shape
 * grammar as `formatLockFromHostLabel`:
 *
 *   - No host (chrome:// / about:): "Note every clip from this site"
 *     (greyed) + "No site context — open this on a normal http(s) tab".
 *   - Host known + 0 matched: "Note every clip from github.com" +
 *     "No clips captured from this site yet" (greyed).
 *   - Host known + N matched + N already noted with the SAME proposed
 *     content (rare; almost never relevant at label-time because we
 *     don't know the proposed text yet): "Note every clip from
 *     github.com" + base hint (available).
 *   - Host known + N matched: "Note N clips from github.com" +
 *     "Same note on every capture — orthogonal to pin / lock"
 *     (available).
 *
 * Pure: no DOM, no localisation. The popup decides which of these to
 * surface based on the matched count.
 */
export interface NoteFromHostLabel {
  label: string;
  hint: string;
  /** True when the command should be available (matched > 0). */
  available: boolean;
}

export function formatNoteFromHostLabel(opts: {
  host: string;
  matched: number;
}): NoteFromHostLabel {
  const host = normaliseHost(opts.host);
  const matched = Math.max(0, Math.floor(Number(opts.matched) || 0));
  if (!host) {
    return {
      label: "Note every clip from this site",
      hint: "No site context — open this on a normal http(s) tab",
      available: false,
    };
  }
  if (matched === 0) {
    return {
      label: `Note every clip from ${host}`,
      hint: "No clips captured from this site yet",
      available: false,
    };
  }
  const noun = matched === 1 ? "clip" : "clips";
  return {
    label: `Note ${matched} ${noun} from ${host}`,
    hint:
      "Same note on every capture — overwrites existing notes (mirrors bulk-bar)",
    available: true,
  };
}

/**
 * Post-action toast for the host-note command. Mirrors
 * `formatBulkNoteToast` from lib/bulk-note shape-for-shape so the
 * user gets identical confirmation copy whether they triggered the
 * action from bulk-bar or from this host-scoped command.
 *
 *   - total === 0 →                "No clips from <host>"
 *   - all unchanged →              "All N from <host> already match" (1 → "Already matches")
 *   - clearing N notes →           "Cleared N notes from <host>"
 *   - pure create →                "Noted N clips from <host>"
 *   - pure replace →               "Replaced N notes from <host>"
 *   - mixed create + replace →     "Noted N clips from <host> (M replaced)"
 */
export function formatHostNoteToast(
  host: string,
  plan: HostNotePlan,
): string {
  const target = normaliseHost(host);
  const total = Math.max(0, Math.floor(Number(plan.total) || 0));
  if (total === 0) return target ? `No clips from ${target}` : "No matching clips";
  const created = Math.max(0, Math.floor(Number(plan.created) || 0));
  const replaced = Math.max(0, Math.floor(Number(plan.replaced) || 0));
  const cleared = Math.max(0, Math.floor(Number(plan.cleared) || 0));
  const changed = created + replaced + cleared;
  const fromHost = target ? ` from ${target}` : "";
  if (changed === 0) {
    return total === 1 ? "Already matches" : `All ${total}${fromHost} already match`;
  }
  if (plan.finalValue === undefined) {
    const noun = cleared === 1 ? "note" : "notes";
    return `Cleared ${cleared} ${noun}${fromHost}`;
  }
  if (created > 0 && replaced > 0) {
    const noun = created === 1 ? "clip" : "clips";
    return `Noted ${created} ${noun}${fromHost} (${replaced} replaced)`;
  }
  if (replaced > 0) {
    const noun = replaced === 1 ? "note" : "notes";
    return `Replaced ${replaced} ${noun}${fromHost}`;
  }
  const noun = created === 1 ? "clip" : "clips";
  return `Noted ${created} ${noun}${fromHost}`;
}

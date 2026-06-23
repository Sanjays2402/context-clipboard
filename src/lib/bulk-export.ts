/**
 * Pure helpers for "Export selected" from the bulk-bar.
 *
 * Different from the existing Settings panel Export (which uses
 * exportAll + the export filter) in a few ways:
 *
 *   1. Source = the user's selection set, not the full clip store.
 *      No global filter pass, no settings/audit/search-history fields.
 *      Just the clips themselves, in selection order.
 *
 *   2. Designed for cherry-picking. Common workflow: select 3 clips
 *      I want to share with a friend → bulk-bar Export → drop the
 *      JSON into a chat → they paste it into Settings → Import to
 *      get the 3 clips on their end. Importing back works because
 *      we shape the envelope to match `importAll`'s contract (clips
 *      array + version + exportedAt), so the Import path's normal
 *      hash-dedup + id-dedup kicks in.
 *
 *   3. No encryption, no other side-channels. JSON-only by design —
 *      the encryption path lives in the Settings export for full
 *      backups; cherry-pick exports are typically transient and
 *      adding the passphrase ceremony here would just be friction.
 *
 * Pure: no DOM, no IDB, no clipboard touch. The popup caller
 * (bulk-bar handler) does the actual blob create + download.
 */

/**
 * Minimal shape — just needs a string `id`. Caller passes the whole
 * ClipItem (or any record); we treat the rest as opaque and round-
 * trip it untouched. Kept structural so the function accepts both
 * test fixtures (plain `{id, ...}`) and the real ClipItem type
 * without an extra cast.
 */
export interface BulkExportClip {
  id: string;
}

/**
 * Envelope payload — the clips array is type-erased to `unknown[]`
 * intentionally. The bulk export round-trips whatever shape the
 * caller hands us; the only enforced field is `id` per element via
 * the `BulkExportClip` constraint on `buildBulkExportEnvelope<T>`.
 */
export interface BulkExportEnvelope {
  version: number;
  clips: unknown[];
  exportedAt: number;
  /**
   * Marker so the JSON's provenance is obvious at a glance ("this
   * was a bulk-bar cherry-pick", vs `send-to-json` for the single-
   * clip envelope from the detail-view Send-to row, vs no marker
   * for a full Settings export). Helpful for support questions
   * and for power-users skimming a JSON file before importing.
   */
  source: "bulk-export";
  /** Selection size at export time — informational, not gating. */
  selectionSize: number;
}

/**
 * Build the export envelope from a selection of ClipItem-shaped
 * records. Defensive in the same shape as jsonEnvelopeForClip:
 *
 *   - Non-array input → null (nothing to export).
 *   - Empty array → null (no clips means an empty envelope, which
 *     would be a confusing thing to drop into a chat — bail honestly).
 *   - Entries without a string `id` are silently filtered (matches
 *     the rest of the codebase's defensive posture; an upstream
 *     re-render hiccup shouldn't crash the export).
 *
 * `version` defaults to 1 — same conservative default as
 * jsonEnvelopeForClip. The popup caller is encouraged to override
 * with the live DB_VERSION when it has access; the pure builder
 * can't reach IDB constants without dragging the db module into
 * a leaf module.
 *
 * Selection order is preserved (the bulk-bar selection has a
 * meaningful order — daily-list order, or the user's pick order
 * across renders), so the import preserves whatever order the
 * user curated.
 */
export function buildBulkExportEnvelope<T extends BulkExportClip>(
  clips: T[],
  opts: { version?: number; exportedAt?: number } = {},
): BulkExportEnvelope | null {
  if (!Array.isArray(clips)) return null;
  const cleaned: T[] = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    cleaned.push(c);
  }
  if (cleaned.length === 0) return null;
  const version =
    typeof opts.version === "number" && Number.isFinite(opts.version) && opts.version > 0
      ? Math.floor(opts.version)
      : 1;
  const exportedAt =
    typeof opts.exportedAt === "number" && Number.isFinite(opts.exportedAt)
      ? opts.exportedAt
      : Date.now();
  return {
    version,
    clips: cleaned,
    exportedAt,
    source: "bulk-export",
    selectionSize: cleaned.length,
  };
}

/**
 * Serialize the envelope as a pretty-printed JSON string (2-space
 * indent — same as the Settings export). Returns null when the
 * envelope itself couldn't be built (mirrors jsonEnvelopeForClip
 * caller contract).
 */
export function bulkExportJson<T extends BulkExportClip>(
  clips: T[],
  opts: { version?: number; exportedAt?: number } = {},
): string | null {
  const env = buildBulkExportEnvelope(clips, opts);
  if (!env) return null;
  return JSON.stringify(env, null, 2);
}

/**
 * Compose the suggested download filename for the bulk export.
 * Shape mirrors the Settings export
 * (`context-clipboard-YYYY-MM-DD.json`) but tags the bulk variant
 * so a user with both files in their Downloads folder can tell
 * them apart. Caller passes the count so the filename's "-Nclips"
 * tail surfaces "exactly N clips were in this batch".
 *
 * Defensive against bad counts (NaN/negative/non-finite → 0) and
 * bad date input (non-Date → new Date()).
 */
export function bulkExportFilename(opts: { count: number; now?: Date }): string {
  const c = Math.max(0, Math.floor(Number(opts.count) || 0));
  const d = opts.now instanceof Date && !isNaN(opts.now.getTime()) ? opts.now : new Date();
  const iso = d.toISOString().slice(0, 10);
  return `context-clipboard-${iso}-${c}clips-bulk.json`;
}

/**
 * Compose the post-export toast message. Singular/plural noun
 * grammar matches the rest of the popup ("Exported 1 clip" /
 * "Exported 3 clips").
 *
 * Returns a different shape when ALL eligible clips were exported
 * vs when some were dropped (defensive cleanup filtered bad
 * entries):
 *   - clean: "Exported N clips"
 *   - partial: "Exported N of M clips (M-N skipped)"
 *
 * In practice the partial case should never fire — the bulk-bar
 * selection is constrained to live store ids — but the honest
 * reporting matters when it does.
 */
export function formatBulkExportToast(opts: {
  exported: number;
  selected: number;
}): string {
  const exported = Math.max(0, Math.floor(Number(opts.exported) || 0));
  const selected = Math.max(0, Math.floor(Number(opts.selected) || 0));
  if (exported === 0) return "Nothing to export";
  const noun = exported === 1 ? "clip" : "clips";
  if (exported === selected || selected === 0) {
    return `Exported ${exported} ${noun}`;
  }
  const skipped = Math.max(0, selected - exported);
  return `Exported ${exported} of ${selected} ${noun} (${skipped} skipped)`;
}

/**
 * Minimal structural shape for the tag filter — needs id + tags.
 * Kept separate from BulkExportClip so the tag filter can operate
 * on the same selection list without forcing callers to type-narrow.
 */
export interface BulkExportTaggedClip extends BulkExportClip {
  tags?: unknown;
}

/**
 * Filter a selection of clips to those carrying a specific tag.
 * Used by the bulk-bar "Export selected with tag X" dropdown:
 * lets the user cherry-pick by category from a wider selection
 * without breaking the existing all-selected default.
 *
 * Empty / whitespace tag filter → returns the input untouched
 * (signal: "no tag filter, export everything selected").
 *
 * Tag matching is case-insensitive + trimmed on both sides
 * (matches the rest of the codebase's tag handling — see
 * util.normaliseTag pattern + db.updateTags trim). Clips with a
 * non-array `tags` field are treated as having zero tags
 * (defensive — same as the existing search.applyQuery tag gate).
 *
 * Pure: no allocation for the tag-needle (lowercased once before
 * the loop). Preserves input order so the existing bulk-export
 * envelope's selection-order contract holds.
 */
export function filterClipsByTag<T extends BulkExportTaggedClip>(
  clips: T[],
  tag: string | null | undefined,
): T[] {
  if (!Array.isArray(clips)) return [];
  const needle = typeof tag === "string" ? tag.trim().toLowerCase() : "";
  if (!needle) return clips.slice(); // no filter
  const out: T[] = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (!Array.isArray(c.tags)) continue;
    let hit = false;
    for (const t of c.tags) {
      if (typeof t !== "string") continue;
      if (t.trim().toLowerCase() === needle) {
        hit = true;
        break;
      }
    }
    if (hit) out.push(c);
  }
  return out;
}

/**
 * Compose the per-tag bulk-export toast. Surfaces the tag in the
 * grammar so the user sees what filter was applied. Two variants:
 *
 *   - hit count > 0: "Exported 3 of 8 selected (tag: secrets)"
 *   - hit count === 0: "No selected clips tagged 'secrets'"
 *
 * Defensive against bad numeric input. Empty-tag input falls back
 * to the non-tag toast (caller branches accordingly — this helper
 * assumes a real tag was supplied).
 */
export function formatBulkExportTagToast(opts: {
  exported: number;
  selected: number;
  tag: string;
}): string {
  const exported = Math.max(0, Math.floor(Number(opts.exported) || 0));
  const selected = Math.max(0, Math.floor(Number(opts.selected) || 0));
  const tag = (typeof opts.tag === "string" ? opts.tag : "").trim();
  if (!tag) {
    // Caller fell through to the tag path with no tag — be honest.
    return formatBulkExportToast({ exported, selected });
  }
  if (exported === 0) {
    return `No selected clips tagged "${tag}"`;
  }
  const noun = exported === 1 ? "clip" : "clips";
  if (exported === selected) {
    return `Exported ${exported} ${noun} (tag: ${tag})`;
  }
  return `Exported ${exported} of ${selected} selected ${noun} (tag: ${tag})`;
}

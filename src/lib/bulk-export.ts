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
 * Group an integer with commas: 1240 -> "1,240". Deterministic en-US.
 * Local copy (this leaf module stays dependency-free). Used for the
 * clip count in the export toasts.
 */
function groupThousandsLocal(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const digits = Math.abs(Math.trunc(n)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Byte formatter for the export receipt — mirrors the storage panel +
 * bulk-storage-delta grammar so "4.2 MB" reads identically across the
 * UI. The bulk-export JSON is UTF-8, so the caller measures the byte
 * length of the serialized string (not its code-point length) and hands
 * it here.
 *
 *   < 1 KB  -> "742 B"
 *   < 1 MB  -> "12.3 KB"
 *   < 1 GB  -> "4.2 MB"
 *   >= 1 GB -> "1.07 GB"
 *
 * Defensive: a non-finite / negative byte count reads "0 B".
 */
export function formatExportBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.floor(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * UTF-8 byte length of a string — the on-disk size of the exported
 * JSON. Uses TextEncoder when available (it always is in the extension
 * runtime + Node), with a defensive fallback that counts code units for
 * the rare environment without it. A nullish input is 0 bytes.
 */
export function utf8ByteLength(s: string | null | undefined): number {
  if (typeof s !== "string" || s.length === 0) return 0;
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(s).length;
  }
  // Fallback: manual UTF-8 byte tally (surrogate-pair aware).
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // high surrogate — the pair encodes to 4 bytes
      i++; // skip the low surrogate
    } else bytes += 3;
  }
  return bytes;
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
 * When a positive `bytes` is supplied (the UTF-8 size of the JSON that
 * was actually written), a " - <size>" receipt tail is appended so the
 * completion toast carries the same on-disk weight the user can verify
 * in their Downloads folder — the same pre/post parity the bulk COPY
 * toasts give with their char total. Omitted (no tail) when bytes is 0 /
 * absent so the zero-clip + legacy callers read unchanged.
 *
 * In practice the partial case should never fire — the bulk-bar
 * selection is constrained to live store ids — but the honest
 * reporting matters when it does.
 */
export function formatBulkExportToast(opts: {
  exported: number;
  selected: number;
  bytes?: number;
}): string {
  const exported = Math.max(0, Math.floor(Number(opts.exported) || 0));
  const selected = Math.max(0, Math.floor(Number(opts.selected) || 0));
  if (exported === 0) return "Nothing to export";
  const noun = exported === 1 ? "clip" : "clips";
  const head =
    exported === selected || selected === 0
      ? `Exported ${groupThousandsLocal(exported)} ${noun}`
      : `Exported ${groupThousandsLocal(exported)} of ${groupThousandsLocal(selected)} ${noun} (${groupThousandsLocal(Math.max(0, selected - exported))} skipped)`;
  return appendBytesTail(head, opts.bytes);
}

/**
 * Append a " \u2014 <size>" byte-receipt tail to an export toast when a
 * positive byte count is supplied. Shared by both export toast paths so
 * the tag-filtered and unfiltered receipts read identically. A nullish /
 * zero / non-finite byte count yields the head unchanged.
 */
function appendBytesTail(head: string, bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return head;
  return `${head} \u2014 ${formatExportBytes(bytes)}`;
}

/**
 * Compose the bulk "Export selected" BUTTON hover title — the pre-commit
 * preview that mirrors the post-export toast's byte receipt, closing the
 * pre/post parity loop the COPY paths already have (their hover shows the
 * char + byte figures; export only showed bytes AFTER the download).
 *
 * The caller serializes the visible selection (optionally tag-filtered to
 * match the live input) once and hands us the resulting clip count + the
 * UTF-8 byte size of that JSON, so the hover promises exactly what a click
 * would write. Grammar tiers mirror the toast helpers:
 *
 *   count > 0, no tag:   "Export 3 selected clips as JSON (4.2 KB)"
 *   count > 0, with tag: "Export 3 selected clips tagged 'secrets' as JSON (4.2 KB)"
 *   count 0,   with tag: "No selected clips tagged 'secrets' to export"
 *   count 0,   no tag:   "Export selected clips as JSON"  (defensive — the
 *                        bulk bar is hidden at an empty selection)
 *
 * The " (<size>)" tail is appended only when a positive byte count is
 * supplied, so a not-yet-computed / empty serialization reads cleanly
 * without a "(0 B)" stub. Singular/plural noun grammar matches the toasts.
 */
export function formatBulkExportButtonTitle(opts: {
  count: number;
  bytes?: number;
  tag?: string;
}): string {
  const count = Math.max(0, Math.floor(Number(opts.count) || 0));
  const tag = (typeof opts.tag === "string" ? opts.tag : "").trim();
  if (count === 0) {
    if (tag) return `No selected clips tagged "${tag}" to export`;
    return "Export selected clips as JSON";
  }
  const noun = count === 1 ? "clip" : "clips";
  const head = tag
    ? `Export ${groupThousandsLocal(count)} selected ${noun} tagged "${tag}" as JSON`
    : `Export ${groupThousandsLocal(count)} selected ${noun} as JSON`;
  return appendSizeParen(head, opts.bytes);
}

/**
 * Append a " (<size>)" parenthetical to the export button title when a
 * positive byte count is supplied. Parenthetical (not the toast's em-dash
 * tail) because a button title reads better with the size in parens —
 * "Export 3 clips as JSON (4.2 KB)". Nullish / zero / non-finite → head
 * unchanged.
 */
function appendSizeParen(head: string, bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return head;
  return `${head} (${formatExportBytes(bytes)})`;
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
  bytes?: number;
}): string {
  const exported = Math.max(0, Math.floor(Number(opts.exported) || 0));
  const selected = Math.max(0, Math.floor(Number(opts.selected) || 0));
  const tag = (typeof opts.tag === "string" ? opts.tag : "").trim();
  if (!tag) {
    // Caller fell through to the tag path with no tag — be honest.
    return formatBulkExportToast({ exported, selected, bytes: opts.bytes });
  }
  if (exported === 0) {
    return `No selected clips tagged "${tag}"`;
  }
  const noun = exported === 1 ? "clip" : "clips";
  const head =
    exported === selected
      ? `Exported ${groupThousandsLocal(exported)} ${noun} (tag: ${tag})`
      : `Exported ${groupThousandsLocal(exported)} of ${groupThousandsLocal(selected)} selected ${noun} (tag: ${tag})`;
  return appendBytesTail(head, opts.bytes);
}

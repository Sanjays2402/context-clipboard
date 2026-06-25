export type ClipKind = "text" | "image" | "link";

export interface ClipSource {
  url?: string;
  title?: string;
  /** Surrounding text or alt text for images. */
  nearbyText?: string;
  favicon?: string;
}

export interface ClipItem {
  id: string;
  kind: ClipKind;
  /** For text/link: the text. For image: the data URL (image/png or original mime). */
  content: string;
  /** Optional preview/snippet for UI. */
  preview?: string;
  /** Image mime, when kind=image. */
  mime?: string;
  /** Source context. */
  source: ClipSource;
  pinned: boolean;
  createdAt: number;
  /** Last time this clip was seen / re-copied. Used by dedup. */
  lastSeenAt: number;
  /** How many times this exact content was copied. */
  hitCount: number;
  /** Tags (auto + manual). */
  tags: string[];
  /** Approximate size in bytes for storage tracking. */
  bytes: number;
  /** Cheap content hash for dedup. */
  hash: string;
  /** Optional OCR'd text from an image clip. */
  ocrText?: string;
  /** Image pixel width (kind=image only). */
  width?: number;
  /** Image pixel height (kind=image only). */
  height?: number;
  /** True when content has been manually redacted (or captured under auto-redact). */
  redacted?: boolean;
  /**
   * When the user manually redacts a clip, we stash the original here so they
   * can unmask. When the clip was captured under auto-redact (no original
   * ever stored), this stays undefined and redaction becomes one-way.
   */
  originalContent?: string;
  /**
   * True when the clip's content contains `{{tokens}}` and should be
   * expanded against live tab/date context at copy time. Set on ingest;
   * cleared by re-ingest if the body changes.
   */
  template?: boolean;
  /**
   * Optional Unix-ms deadline. When set and `Date.now() >= expiresAt`,
   * opportunistic GC moves the clip to trash so it disappears from the
   * live list without the user lifting a finger. Pinned clips ignore
   * their expiry (pinning is an explicit "keep this" intent).
   */
  expiresAt?: number;
  /**
   * Archive bit. Archived clips stay in IDB (and stay pinned if they
   * were pinned) but are hidden from the default popup list — they
   * surface only when the user types `is:archived` or visits the
   * archive view. Useful for "cold pins": a snippet you want to keep
   * forever but don't want cluttering the daily list.
   *
   * Additive flag — undefined = not archived. Lives at the clip layer
   * (no IDB schema bump). Trash always wins (archiving an already-
   * trashed clip is impossible; it's not in the live store).
   */
  archived?: boolean;
  /**
   * "Ask before deleting" lock. Orthogonal to pin: a pinned clip can
   * still be deleted with a single click (pin survives the auto-prune
   * cap but doesn't gate the user's own delete intent), while a locked
   * clip requires an explicit confirm in EVERY delete path — row
   * delete, keyboard `Delete`, bulk-bar trash, and right-click menu.
   *
   * Why distinct from `pinned`?
   *   - Pin = "keep this in the daily list" (sort affinity + survives
   *     prune). Some users pin a lot — the side effect of "extra
   *     confirm" would be noise.
   *   - Lock = "ask before I throw this away". Reserved for genuinely
   *     irreplaceable clips: a security token, an exact phrasing
   *     drafted over multiple revisions, anything where an accidental
   *     Delete would actually hurt. Should be rare; the confirm is
   *     non-noisy precisely because the flag isn't blanket-applied.
   *
   * Soft-delete to trash still happens after the user confirms —
   * locked is about INTENT, not retention. The 7-day trash safety net
   * still applies on top.
   *
   * Additive flag — undefined = not locked. No IDB schema bump.
   */
  locked?: boolean;
  /**
   * Unix-ms stamp recorded when the lock bit transitioned from
   * `!== true` to `true` (manual `toggleLock`, idempotent
   * `setLocked(true)`, or ingest under `autoLock`). Cleared back to
   * `undefined` when the lock comes off, so a future re-lock starts
   * the clock fresh — the value answers "when did I decide this is
   * irreplaceable?" not "when have I EVER locked this", which is
   * the question the user actually asks.
   *
   * Surfaced in detail-view as a "Locked since <date>" breadcrumb
   * so the user can see the lock-trail without flipping to the
   * audit panel. Additive optional field — undefined for clips
   * that were never locked, or that were last unlocked.
   */
  lockedAt?: number;
  /**
   * Free-form per-clip note — orthogonal to tags (structured +
   * searchable), template (machine-substitutable), and source/
   * nearbyText (capture-time context). The note is the *user's*
   * commentary on the clip itself: "this looks identical to that
   * one but actually came from the staging branch — be careful",
   * "use this when onboarding new hires only", "this template
   * assumes the user is already logged in".
   *
   * Survives copy + re-capture (dedup never overwrites the note
   * — see background.ts ingest path) and round-trips through
   * import/export untouched. Sanitised via
   * `lib/clip-note.sanitizeClipNote()`: trimmed, capped at 2,000
   * chars, control-chars stripped, empty → undefined (so deleted
   * notes free their tiny storage footprint).
   *
   * Additive optional field — undefined for clips that were never
   * noted, or whose note was deleted. The `is:noted` search
   * operator + the detail-view note row both gate on
   * `hasClipNote()` so the empty-string case can never paint a
   * row with no text.
   */
  note?: string;
  /**
   * Unix-ms stamp recorded when `note` was last written (created
   * OR updated) — the answer to "when did I leave this caveat?",
   * which is the question the user actually asks when reviewing
   * their annotated clips.
   *
   * Stamped by `db.setClipNote()` on every WRITE that actually
   * changes the note value (the no-op fast path doesn't bump the
   * stamp — re-saving the same text shouldn't refresh "noted
   * recency"). Cleared back to `undefined` when the note is
   * deleted (setClipNote(undefined)), so a future fresh note
   * starts the clock from zero — same contract as `lockedAt`
   * around lock/unlock transitions.
   *
   * Surfaced in detail-view as a "Noted <X ago>" breadcrumb
   * (formatNoteUpdatedSince in lib/note-updated-since.ts) and
   * powers the Cmd+K "Show recently noted" command's chronology
   * window — same 7d default as recently-locked.
   *
   * Additive optional field — undefined for clips that were
   * never noted, or whose note was deleted, OR clips that were
   * noted before this stamp shipped (legacy: still noted, but
   * we can't tell WHEN, so they correctly fall out of "recently
   * noted" by definition).
   */
  noteUpdatedAt?: number;
  /**
   * Per-clip word-wrap override for the detail body.
   *
   * The detail-view body has a global wrap toggle (persisted in the
   * `detail_wrap` meta row) that defaults to wrap-on. But a single
   * wide clip — a TSV table, a log line, a column-aligned config —
   * often wants the OPPOSITE of whatever the user's global default is:
   * they keep wrap ON for prose generally, but this one wide thing
   * should scroll horizontally so its columns stay aligned. Forcing
   * them to flip the global every time they open that clip (and flip
   * it back after) is the papercut this field kills.
   *
   *   - undefined -> follow the global default (the common case).
   *   - true      -> always wrap THIS clip, regardless of the global.
   *   - false     -> always nowrap THIS clip, regardless of the global.
   *
   * Set by a plain click on the detail wrap button (which now stores a
   * per-clip override); cleared back to undefined by Alt-clicking the
   * button (the clip goes back to following the global default). The
   * effective wrap is resolved by `lib/wrap-pref.effectiveWrap`.
   *
   * Additive optional field — undefined for every clip that has never
   * been explicitly wrapped/unwrapped in detail. Round-trips through
   * import/export untouched (harmless UI hint; never affects content).
   */
  wrapOverride?: boolean;
}

export interface SearchQuery {
  q?: string;
  kind?: ClipKind | "all";
  pinnedOnly?: boolean;
  tag?: string;
  limit?: number;
}

/**
 * Sort modes for the popup list. `recent` (lastSeenAt desc) is the
 * historical default and stays the cron-baseline behavior. The others
 * are user-pickable in the footer dropdown and persisted in the
 * `list_sort` meta row so the popup re-opens to whatever they last
 * chose.
 */
export type SortMode =
  | "recent" // lastSeenAt desc — surface fresh activity at the top
  | "oldest" // lastSeenAt asc  — archaeology mode
  | "hits"   // hitCount desc   — your most-used clips
  | "size"   // bytes desc      — biggest payloads first
  | "alpha"; // preview/content lowercase asc — find by name

export const SORT_MODES: SortMode[] = ["recent", "oldest", "hits", "size", "alpha"];

export interface Settings {
  maxUnpinned: number;
  dedupWindowMs: number;
  captureCopyEvents: boolean;
  captureImagesOnCopy: boolean;
  enableAutoTags: boolean;
  enableOcr: boolean;
  enableInPagePalette: boolean;
  enableFieldSuggestions: boolean;
  /** When true, the toolbar icon opens the side panel instead of a popup (Chrome only). */
  enableSidePanel: boolean;
  /** Auto-redact PII (emails/phones/cards) in newly captured text clips. */
  autoRedactPii: boolean;
  /**
   * Anti-shoulder-surf: when true, every clip preview + image thumb +
   * detail body renders blurred by default and only reveals on hover /
   * focus. Doesn't touch the data — it's a CSS treatment, so unlocking
   * a single clip is as cheap as moving the mouse.
   */
  blurPreviews: boolean;
  /**
   * Compact-row list mode: shrink each clip row to ~36px so 30+ fit on a
   * single popup screen. Hides the tag chip row + the thumb dimensions
   * pill, single-lines the preview, and trims the thumbnail to 28px.
   * Pure CSS — no data is dropped, just the row chrome.
   */
  compactRows: boolean;
  /**
   * Row density for the clip list — a three-step scale that supersedes
   * the lone `compactRows` boolean: "comfortable" (the roomy default),
   * "cozy" (a trimmer middle tier — tighter padding + margins, keeps
   * the tag row + full thumb), and "compact" (the dense 28px-thumb mode
   * `compactRows` used to be the only way to reach).
   *
   * `compactRows` is kept MIRRORED to this (compact <-> true) for
   * backward compatibility: the palette quick-toggle, import/export
   * round-trip, and any legacy reader still work off the boolean while
   * the radio drives the tri-state. On load, an absent/old `density`
   * is migrated from the boolean (see lib/density.resolveDensity).
   *
   * Additive optional field — undefined on settings objects saved
   * before this shipped; resolveDensity() falls back to the boolean.
   */
  density?: "comfortable" | "cozy" | "compact";
  /**
   * Privacy audit retention — how many recent privacy actions to keep
   * in the ring buffer (Settings → Privacy audit panel). Each entry is
   * tiny (~80 bytes), so the storage cost is negligible even at 100.
   * Defaults to 30 (the original hard-coded cap). Allowed values are
   * 10 / 30 / 60 / 100; anything else snaps to 30 on load.
   *
   * Lowering the value AFTER entries exist trims the log on the next
   * append; raising it just grows it on the next append (we never
   * back-fill — past actions stay gone once they fall off).
   */
  privacyAuditRetention: 10 | 30 | 60 | 100;
  /** Hostnames where capture is disabled. */
  blockList: string[];
  /** If non-empty, capture ONLY on these hostnames. */
  allowList: string[];
  theme: "auto" | "dark" | "light";
}

export const DEFAULT_SETTINGS: Settings = {
  maxUnpinned: 500,
  dedupWindowMs: 60_000,
  captureCopyEvents: true,
  captureImagesOnCopy: true,
  enableAutoTags: true,
  enableOcr: false,
  enableInPagePalette: true,
  enableFieldSuggestions: true,
  enableSidePanel: false,
  autoRedactPii: false,
  blurPreviews: false,
  compactRows: false,
  density: "comfortable",
  privacyAuditRetention: 30,
  blockList: [],
  allowList: [],
  theme: "auto",
};

/** Valid retention sizes for the privacy audit ring buffer. */
export const PRIVACY_AUDIT_RETENTION_OPTIONS = [10, 30, 60, 100] as const;

export interface FieldMapEntry {
  /** `${host}::${fieldKey}` */
  id: string;
  host: string;
  fieldKey: string;
  clipId: string;
  /** Last value pasted (snippet) for display + fallback. */
  preview: string;
  /** How many times we've matched this field. */
  count: number;
  updatedAt: number;
}

export interface ClipUpdate {
  ocrText?: string;
  tags?: string[];
}

/**
 * A named query the user can recall with one click. Persisted in the
 * `meta` store under key `saved_searches`. The `query` is the same string
 * the user types into the search box (operators included), so applying
 * a saved search is just `searchEl.value = s.query`.
 */
export interface SavedSearch {
  /** Stable id; we use it for delete/apply and as React-style key. */
  id: string;
  /** Human label shown in the chip strip. */
  name: string;
  /** Raw search string — same grammar as `parseQuery`. */
  query: string;
  createdAt: number;
}

/**
 * Per-site capture rule. Applied during ingest in `background.ts`. Rules
 * are matched against `hostFrom(source.url)`; the first rule whose
 * `hostPattern` matches wins. Patterns are exact hostnames or `*.example`
 * wildcards (one leading `*.` allowed — no full glob).
 *
 * `skipCapture` short-circuits ingest entirely (more granular than the
 * existing block-list because the user opts in to rules per host). The
 * other booleans layer on top of a normal capture.
 */
export interface SiteRule {
  id: string;
  /** Host or `*.host` pattern. */
  hostPattern: string;
  /** Extra tags to apply on capture (lowercased, deduped). */
  autoTags?: string[];
  /** Pin the clip on capture. */
  autoPin?: boolean;
  /**
   * Lock the clip on capture — flips the per-clip "ask before
   * deleting" bit (`locked: true`) before the clip lands in IDB.
   * Layered the same way `autoPin` is: sticky on the dedup path
   * (we never unlock a clip the user has explicitly locked, even
   * if the rule is later changed), and applied alongside the
   * existing redact/scrub/tag pipeline.
   *
   * Use case: sites where every capture is irreplaceable by
   * default — a partner portal with one-time tokens, a draft URL
   * with secrets, a private snippet hub. The user wants the
   * confirm-on-delete gate up front, without having to remember
   * to lock each clip manually after capture.
   *
   * Orthogonal to `autoPin` (the typical "lock + pin for safety"
   * setup needs both checked) and orthogonal to `autoRedact` (lock
   * is about delete-intent, redact is about content). When all
   * three pile on, the ingested clip carries `pinned:true`,
   * `locked:true`, `redacted:true`, and any `customPatterns` are
   * applied on top — matching how the runtime composes the rule
   * effects.
   */
  autoLock?: boolean;
  /** Force PII auto-redact for this site regardless of the global toggle. */
  autoRedact?: boolean;
  /** Don't capture anything from this site at all. */
  skipCapture?: boolean;
  /**
   * Strip source URL/title/nearby-context/favicon on capture. Different
   * from skipCapture in that the CONTENT is kept — useful for sites
   * where the snippets matter but the page metadata is sensitive (a
   * partner portal, a private repo, a draft URL with a secret token).
   * Tags + auto-redact still apply BEFORE the scrub, so a
   * `redacted,scrubbed` clip is the typical outcome.
   *
   * Applied after dedup/tags/redact so the existing capture pipeline
   * stays untouched on hosts without this flag. The resulting clip
   * carries the `scrubbed` tag the same way the per-clip scrub
   * affordance does.
   */
  autoScrubOrigin?: boolean;
  /**
   * Extra redaction regexes to apply to text captures from this site,
   * on top of the built-in PII patterns. Each entry is a JS regex source
   * (no slashes/flags); the runtime compiles each with `gi` and replaces
   * matches with `[redacted]`. Invalid entries are skipped silently at
   * apply time so a bad pattern can't break capture.
   *
   * Bounded — `applyCustomPatterns()` caps the loop to keep ingest fast
   * even if a user pastes 50 patterns in.
   */
  customPatterns?: string[];
  createdAt: number;
}

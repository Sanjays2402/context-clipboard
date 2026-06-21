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
  blockList: [],
  allowList: [],
  theme: "auto",
};

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

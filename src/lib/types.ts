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
}

export interface SearchQuery {
  q?: string;
  kind?: ClipKind | "all";
  pinnedOnly?: boolean;
  tag?: string;
  limit?: number;
}

export interface Settings {
  maxUnpinned: number;
  dedupWindowMs: number;
  captureCopyEvents: boolean;
  captureImagesOnCopy: boolean;
  enableAutoTags: boolean;
  enableOcr: boolean;
  enableInPagePalette: boolean;
  enableFieldSuggestions: boolean;
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

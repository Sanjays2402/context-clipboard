export type ClipKind = "text" | "image" | "link";

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
  source: {
    url?: string;
    title?: string;
    /** Surrounding text or alt text for images. */
    nearbyText?: string;
    favicon?: string;
  };
  pinned: boolean;
  createdAt: number;
  /** Tags (auto + manual). */
  tags: string[];
  /** Approximate size in bytes for storage tracking. */
  bytes: number;
}

export interface SearchQuery {
  q?: string;
  kind?: ClipKind | "all";
  pinnedOnly?: boolean;
  limit?: number;
}

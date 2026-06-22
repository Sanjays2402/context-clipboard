/**
 * Site-rule row hover preview.
 *
 * When a site rule's clip count badge shows "12 clips" the user has no
 * way to see WHAT got captured — they have to click through to filter
 * the live list. The hover preview surfaces the last 3 matching clips
 * inline (host, preview, kind glyph, lastSeenAt) so a long-running
 * rule's effect is visible at a glance.
 *
 * This module is the pure planner. It takes a rules list + clips list
 * (same data the existing `usagesForRules` walks) and returns a per-
 * rule map of {clipId, kind, preview, host, lastSeenAt}[] capped at 3
 * entries (most-recent first by `lastSeenAt`). The popup renders the
 * result into a hover tooltip / dropdown attached to the usage badge.
 *
 * Why a pure module: the matching logic shares semantics with
 * usagesForRules (first-rule-wins ordered matching), but the result
 * shape is different. We don't extend usagesForRules to carry the
 * preview slice because that's a much larger payload and most callers
 * only want the count. Two pure helpers, one IDB read shared by both.
 */

import type { ClipItem, SiteRule } from "./types";

export interface RulePreviewClip {
  /** Stable clip id — used as the React-style key when rendering. */
  clipId: string;
  /** Clip kind for the inline glyph. */
  kind: "text" | "image" | "link";
  /** Truncated preview text (or "Image" for image clips). Cap 80 chars. */
  preview: string;
  /** Hostname of the source URL (matched host, post-www-strip). */
  host: string;
  /** lastSeenAt unix-ms — used for the "X ago" hover label. */
  lastSeenAt: number;
  /** True when the clip is pinned — caller marks the preview row. */
  pinned: boolean;
}

export interface RulePreviewOptions {
  /** Max entries to keep per rule (default 3). */
  limit?: number;
  /** Hostname extractor — caller passes hostFrom so this module
   *  stays free of URL/parsing imports. */
  hostFrom: (url: string | undefined) => string;
  /** Host-pattern matcher — caller passes matchesHostPattern for the
   *  same isolation reason. */
  matchesHostPattern: (pattern: string, host: string) => boolean;
}

/**
 * Build the per-rule preview map. For each rule, collects the top-N
 * matching clips by lastSeenAt desc.
 *
 * Matches mirror the ingest's first-rule-wins semantics — a clip
 * counts for the first rule whose hostPattern matches. So a clip
 * captured under `*.github.com` won't double-show under a later
 * `docs.github.com` rule even if both technically match. This keeps
 * the preview consistent with `usagesForRules`.
 *
 * Defensive against:
 *   - empty rules array (returns empty map)
 *   - empty clips array (returns empty map)
 *   - clips without source.url (skipped — no host to match)
 *   - rules with no matches (absent from the map; caller treats as 0)
 */
export function previewClipsForRules(
  rules: SiteRule[],
  clips: ClipItem[],
  opts: RulePreviewOptions,
): Map<string, RulePreviewClip[]> {
  const out = new Map<string, RulePreviewClip[]>();
  if (!Array.isArray(rules) || rules.length === 0) return out;
  if (!Array.isArray(clips) || clips.length === 0) return out;
  // Defensive limit: coerce non-finite (NaN/Infinity) and non-positive
  // values to 1. Fractional values floor.
  const rawLimit = opts.limit;
  const safeLimit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.max(1, Math.floor(rawLimit))
      : 3;
  const limit = safeLimit;
  // Bucket clips per rule via first-match-wins. Single linear scan,
  // cheap enough for the 5000-clip window the popup pulls.
  for (const c of clips) {
    const url = c.source?.url;
    const host = opts.hostFrom(url);
    if (!host) continue;
    for (const r of rules) {
      if (opts.matchesHostPattern(r.hostPattern, host)) {
        const previewText =
          c.kind === "image"
            ? c.preview || "Image"
            : c.preview || c.content || "";
        const truncated =
          previewText.length > 80
            ? previewText.slice(0, 79) + "…"
            : previewText;
        const entry: RulePreviewClip = {
          clipId: c.id,
          kind: c.kind,
          preview: truncated.replace(/\s+/g, " ").trim(),
          host,
          lastSeenAt: c.lastSeenAt || 0,
          pinned: !!c.pinned,
        };
        const list = out.get(r.id);
        if (list) {
          list.push(entry);
        } else {
          out.set(r.id, [entry]);
        }
        break; // first-match-wins
      }
    }
  }
  // Sort each bucket lastSeenAt desc + cap to limit.
  for (const [id, list] of out) {
    list.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    if (list.length > limit) {
      out.set(id, list.slice(0, limit));
    }
  }
  return out;
}

/**
 * Format the hover-card title for a rule preview. "Last 3 of 12
 * captured" reads more honestly than just "Recent" — the user knows
 * what proportion they're seeing.
 *
 * Returns null when the preview is empty (caller hides the card).
 */
export function formatPreviewCardTitle(
  totalCount: number,
  previewLength: number,
): string | null {
  if (!Number.isFinite(previewLength) || previewLength <= 0) return null;
  if (!Number.isFinite(totalCount) || totalCount <= 0) return null;
  if (previewLength >= totalCount) {
    return totalCount === 1
      ? "1 captured"
      : `All ${totalCount} captured`;
  }
  return `Last ${previewLength} of ${totalCount} captured`;
}

/**
 * Format a single preview row's hover tooltip — full preview text
 * (not the 80-char truncation) plus the time-ago hint. The popup
 * already trims the visible preview; this restores the full text
 * for the tooltip so power users can read everything without
 * navigating away.
 */
export function formatPreviewRowTooltip(
  fullPreview: string,
  timeAgoLabel: string,
): string {
  const text = fullPreview && fullPreview.length > 200
    ? fullPreview.slice(0, 199) + "…"
    : fullPreview || "";
  return text ? `${text}\n${timeAgoLabel}` : timeAgoLabel;
}

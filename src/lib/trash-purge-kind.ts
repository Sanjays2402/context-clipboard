/**
 * Trash purge-by-kind selection.
 *
 * The trash "Empty" button is all-or-nothing: it deletes every trashed
 * clip, image and text alike. That's the right default for most cases
 * but it's the wrong tool when storage pressure is mostly from a few
 * huge images and the user wants to keep their text safety net intact
 * (or vice versa: they want to keep recently trashed images for
 * re-fetch and only purge the text clutter).
 *
 * This module is the pure planner. It takes a `TrashedClip[]` list and
 * a kind filter and returns:
 *
 *   - the IDs to purge (everything matching the filter)
 *   - a count + total-bytes summary for the confirm prompt
 *   - a per-kind breakdown so the button label can say e.g.
 *     "Empty images (12 · 8.4 MB)"
 *
 * No IO. The caller (popup) drives the actual delete via the existing
 * trash transaction primitives in lib/db.
 */

import type { TrashedClip } from "../lib/db";
import type { ClipKind } from "./types";

export type TrashPurgeKind = ClipKind | "all";

export interface TrashKindCount {
  /** Number of trashed clips of this kind. */
  count: number;
  /** Sum of bytes — defensive: only counts finite >= 0 numbers. */
  bytes: number;
}

export interface TrashKindBreakdown {
  text: TrashKindCount;
  image: TrashKindCount;
  link: TrashKindCount;
  all: TrashKindCount;
}

/**
 * Summarize the trash by clip kind. Defensive against missing `kind`
 * (treated as "text" — historical default), non-number/negative bytes
 * (skipped), and non-array input (returns the zero shape).
 */
export function summarizeTrashByKind(items: unknown): TrashKindBreakdown {
  const zero: TrashKindCount = { count: 0, bytes: 0 };
  const out: TrashKindBreakdown = {
    text: { ...zero },
    image: { ...zero },
    link: { ...zero },
    all: { ...zero },
  };
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<TrashedClip>;
    const k = item.kind === "image" || item.kind === "link" ? item.kind : "text";
    const b = item.bytes;
    const safeBytes =
      typeof b === "number" && Number.isFinite(b) && b > 0 ? b : 0;
    out[k].count += 1;
    out[k].bytes += safeBytes;
    out.all.count += 1;
    out.all.bytes += safeBytes;
  }
  return out;
}

/**
 * Plan the purge: return the IDs to delete + a summary for the confirm
 * prompt. `kind="all"` matches everything (degenerates to a full purge).
 *
 * Defensive: malformed entries (missing id, non-string id) are skipped
 * rather than producing undefined IDs in the IDB delete loop. Empty
 * trash returns an empty plan rather than throwing — the caller can
 * gate on `count === 0` and skip the confirm.
 */
export function planTrashPurge(
  items: unknown,
  kind: TrashPurgeKind,
): { ids: string[]; count: number; bytes: number; kind: TrashPurgeKind } {
  const out = { ids: [] as string[], count: 0, bytes: 0, kind };
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<TrashedClip>;
    if (typeof item.id !== "string" || item.id.length === 0) continue;
    const k =
      item.kind === "image" || item.kind === "link" ? item.kind : "text";
    if (kind !== "all" && k !== kind) continue;
    const b = item.bytes;
    const safeBytes =
      typeof b === "number" && Number.isFinite(b) && b > 0 ? b : 0;
    out.ids.push(item.id);
    out.count += 1;
    out.bytes += safeBytes;
  }
  return out;
}

/**
 * Format the confirm-prompt message. Singular/plural agreement built
 * in. The kind appears as a user-facing label (singular for the
 * button — "image" — even though the count may be plural — "5 images").
 */
export function formatPurgeConfirm(
  plan: { count: number; bytes: number; kind: TrashPurgeKind },
): string {
  if (plan.count === 0) {
    return `Nothing trashed${plan.kind === "all" ? "" : ` (no ${plan.kind} clips in trash)`}`;
  }
  const noun =
    plan.kind === "all"
      ? `clip${plan.count === 1 ? "" : "s"}`
      : `${plan.kind} clip${plan.count === 1 ? "" : "s"}`;
  const size = plan.bytes > 0 ? ` (~${formatBytesHint(plan.bytes)} freed)` : "";
  return `Permanently delete ${plan.count} ${noun}${size}? Other trash stays restorable.`;
}

/**
 * Format the button label so the user sees the count + freed-bytes at
 * a glance ("Empty images (12 · 8.4 MB)"). Returns null when the kind
 * has zero entries — the caller hides the button in that case to keep
 * the trash bar tidy.
 */
export function formatPurgeButtonLabel(
  breakdown: TrashKindBreakdown,
  kind: TrashPurgeKind,
): string | null {
  const slot = breakdown[kind];
  if (!slot || slot.count === 0) return null;
  let verb: string;
  if (kind === "all") verb = "Empty trash";
  else if (kind === "image") verb = "Empty images";
  else if (kind === "text") verb = "Empty text";
  else verb = "Empty links";
  const size = slot.bytes > 0 ? ` · ${formatBytesHint(slot.bytes)}` : "";
  return `${verb} (${slot.count}${size})`;
}

/**
 * Tiny bytes formatter. Mirrors the storage-delta module's tiers but
 * is kept local so this pure module has no cross-module run-time
 * imports beyond types. KB/MB/GB use 1024 base (consistent with the
 * rest of the app's storage UI).
 */
function formatBytesHint(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

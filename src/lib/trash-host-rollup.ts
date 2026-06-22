/**
 * Trash host-rollup grouper.
 *
 * The trash list is rendered flat (newest deletedAt first) so the user
 * can scan recent removals at a glance — that's the right primary view
 * because most people land in trash to undo a single accidental delete.
 *
 * But the trash is ALSO where forget-host dumps land. After a misclicked
 * "Forget github.com", the panel fills with 17 nearly-identical rows
 * from the same domain. A "Restore all from host" affordance per host
 * lets the user reverse that bulk operation with one click.
 *
 * `groupTrashByHost` returns a host-keyed summary that the popup can
 * render as a compact chip strip above the row list. Pure — no DOM,
 * no IDB — so it's testable + reusable from any caller that has the
 * trash list loaded.
 *
 * Only hosts with `minCount` matching trash rows surface (default 2
 * so a single-row host doesn't get a redundant "Restore 1" chip — the
 * row itself already has a Restore button). Hosts are sorted by count
 * desc so the biggest cluster reads first; ties keep the order they
 * were seen (insertion order).
 */

import { hostFrom } from "./util";

export interface TrashHostBucket {
  /** Normalised hostname — lowercased, `www.` stripped. */
  host: string;
  /** Number of trashed rows whose source.url maps to this host. */
  count: number;
  /** Newest deletedAt across the bucket — used to surface freshest first when ties. */
  newestDeletedAt: number;
}

interface TrashedLike {
  source?: { url?: string };
  deletedAt: number;
}

export function groupTrashByHost<T extends TrashedLike>(
  trash: T[],
  minCount = 2,
): TrashHostBucket[] {
  if (trash.length === 0) return [];
  const buckets = new Map<string, TrashHostBucket>();
  for (const t of trash) {
    const host = hostFrom(t.source?.url);
    if (!host) continue;
    const hit = buckets.get(host);
    if (hit) {
      hit.count++;
      if (t.deletedAt > hit.newestDeletedAt) hit.newestDeletedAt = t.deletedAt;
    } else {
      buckets.set(host, {
        host,
        count: 1,
        newestDeletedAt: t.deletedAt,
      });
    }
  }
  // Surface only hosts with >= minCount rows; below that, the per-row
  // Restore button is already the right affordance.
  const out = Array.from(buckets.values()).filter((b) => b.count >= minCount);
  // Sort by count desc, then newestDeletedAt desc so a big stale
  // cluster doesn't bury a small fresh one when they have the same
  // count (deterministic + intuitive).
  out.sort(
    (a, b) =>
      b.count - a.count ||
      b.newestDeletedAt - a.newestDeletedAt ||
      a.host.localeCompare(b.host),
  );
  return out;
}

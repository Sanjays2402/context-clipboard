/**
 * Pure helper: find the most-recent forget-host audit entry.
 *
 * `forgetHost(hostname)` soft-deletes every clip from a host (an
 * easy-to-fire bulk action that's often regretted within seconds).
 * The corresponding privacy audit entry carries the host in its
 * `host` field with `kind: "forget-host"` and an empty clipId. This
 * helper scans the audit ring (newest-first by convention) and
 * returns the first match, along with how long ago it happened.
 *
 * The "Show last forgotten host" Cmd+K command uses this to offer a
 * one-tap rescue: surface the host name + age, then route through
 * the existing `restoreAllFromHost` bulk-restore path.
 *
 * Returns `null` when the audit ring is empty OR has no forget-host
 * entries.
 */

import type { PrivacyAuditEntry } from "./db";

export interface ForgottenHostInfo {
  /** The hostname that was forgotten. Already normalized (lowercased, www-stripped) at audit-write time. */
  host: string;
  /** When the forget happened (Unix-ms). */
  at: number;
  /** Stable audit entry id (so the caller can reference the underlying receipt). */
  entryId: string;
  /** Detail tail from the audit row — e.g. "from 4 clips". */
  detail?: string;
}

/**
 * Walk the audit list (newest-first) and return the first
 * forget-host entry. Returns null when none exists.
 *
 * We require a non-empty `host` field — defensive against future
 * audit writers that might emit a forget-host kind without the host
 * (the existing code always populates it, but a malformed import
 * shouldn't crash).
 */
export function findLastForgottenHost(
  entries: PrivacyAuditEntry[],
): ForgottenHostInfo | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  for (const e of entries) {
    if (e.kind !== "forget-host") continue;
    const host = (e.host || "").trim();
    if (!host) continue;
    return {
      host,
      at: e.at,
      entryId: e.id,
      detail: e.detail,
    };
  }
  return null;
}

/**
 * Pretty short age — "5m ago" / "2h ago" / "3d ago" / "just now".
 * Pure / deterministic when `now` is injected. Used by the palette
 * label so the user sees how stale the offer is before committing.
 */
export function formatAge(at: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - at);
  if (delta < 30_000) return "just now";
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/**
 * Detail-view → audit-scope jumper preconditions.
 *
 * Pure helpers behind the "Show audit history" button on the detail
 * header. They decide WHETHER the jump should fire and what label /
 * hint the button (and the future Cmd+K mirror) should show. The
 * actual side-effects (openSettings, setAuditClipScope) live in the
 * popup where DOM + IDB are reachable.
 *
 * Why a separate module? So the same "is this clip jumpable, and
 * what does the audit ring already know about it?" question is
 * answered identically by:
 *   - the detail-header click handler (must skip when detailId null),
 *   - the future Cmd+K command (must show \"available: false\" when
 *     no clip is open),
 *   - any future right-click row-menu mirror.
 *
 * Keeping the logic in one pure module means a unit test can lock
 * down the contract without standing up a popup.
 */
export interface AuditJumpPrecheck {
  /** When true, the caller should pivot the audit panel. */
  canJump: boolean;
  /**
   * The clipId to scope to. Empty string when canJump=false — the
   * caller MUST treat empty as "no-op", never pass it forward as
   * a scope (an empty scope would land on the global ring, which
   * is misleading).
   */
  clipId: string;
  /**
   * Pre-count of matching audit rows for the target clip across the
   * current ring. Caller can surface this in a tooltip / hint so the
   * user knows up-front whether the jump will land somewhere useful
   * (\"No actions on this clip yet — opens an empty panel\").
   *
   * Zero is a VALID precheck result — we still allow the jump so the
   * user gets a visible \"0 of N\" empty-state pill instead of a
   * silent no-op. Honesty beats hiding the button.
   */
  matchingCount: number;
}

/** Minimum shape we need from a privacy audit entry. */
export interface AuditEntryShape {
  clipId?: string;
}

/**
 * Decide whether the detail-view jumper should fire AND how many
 * matches the target clip already has in the audit ring.
 *
 * - `detailId` empty / null / non-string → canJump=false, count=0.
 * - `detailId` set + `entries` not an array → canJump=true (the
 *   jumper still works without a ring), count=0.
 * - `detailId` set + entries scanned → canJump=true, count=#matches.
 *
 * Never throws — defensive against undefined/null inputs so a stale
 * call site or unusual audit-ring shape can't break the detail
 * header (the button is a navigation cue; a render crash would be
 * worse than a no-op).
 */
export function precheckAuditJump(
  detailId: string | null | undefined,
  entries: unknown,
): AuditJumpPrecheck {
  if (typeof detailId !== "string" || !detailId.trim()) {
    return { canJump: false, clipId: "", matchingCount: 0 };
  }
  const id = detailId.trim();
  let count = 0;
  if (Array.isArray(entries)) {
    for (const raw of entries) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as AuditEntryShape;
      if (typeof entry.clipId === "string" && entry.clipId === id) count++;
    }
  }
  return { canJump: true, clipId: id, matchingCount: count };
}

/**
 * Tooltip / hint string for the jumper button (or palette command),
 * given a precheck. Caller decides where to place it — the popup
 * sets it as `title` on the icon button, the palette uses it as
 * `hint` under the command label.
 *
 * Empty string when canJump=false (caller hides the affordance).
 */
export function describeAuditJump(p: AuditJumpPrecheck): string {
  if (!p.canJump) return "";
  if (p.matchingCount === 0) {
    return "No audit actions on this clip yet — opens an empty scope";
  }
  if (p.matchingCount === 1) {
    return "Scope the audit panel to this clip's 1 action";
  }
  return `Scope the audit panel to this clip's ${p.matchingCount} actions`;
}

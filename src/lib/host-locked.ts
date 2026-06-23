/**
 * Pure helper for the `is:hostlocked` search operator.
 *
 * `is:locked` (existing) gates on `c.locked === true` — the per-clip
 * lock bit. `is:hostlocked` (new) is the cross-store join: it gates
 * on whether the clip's HOST has a site-rule with `autoLock: true`,
 * regardless of whether THIS specific clip carries the per-clip
 * `locked` bit yet.
 *
 * Why it's worth its own operator:
 *
 *   - "Show me every clip that WILL be locked on next re-capture" —
 *     useful right after enabling autoLock on a host to verify the
 *     rule is targeting what you expect.
 *   - "Show me clips from hosts I've configured for auto-lock but
 *     which somehow ended up unlocked" — pairs with `is:unlocked` for
 *     a cleanup audit ("AND is:unlocked" surfaces drift).
 *   - "Show me hosts I've protected" — pairs with `is:noted` /
 *     `is:redacted` for the irreplaceable-and-annotated set.
 *
 * The operator describes RULE intent, not the clip's current state:
 *   - A clip whose host has autoLock=true → matches `is:hostlocked`
 *     even if the clip itself is `locked: false` (a manual unlock).
 *   - A clip with `locked: true` but whose host has NO autoLock rule
 *     (user manually locked one-off) → does NOT match `is:hostlocked`
 *     (use `is:locked` for that).
 *
 * Why first-match-wins matters here:
 *   - Site rules are evaluated in list order; the first matching
 *     hostPattern wins (matches background ingest semantics +
 *     countClipsForRules). A clip on `docs.github.com` matched by
 *     `*.github.com` (autoLock=false) followed by `docs.github.com`
 *     (autoLock=true) does NOT match `is:hostlocked` — the first
 *     rule wins and it doesn't carry the bit. That's the same
 *     semantics ingest applies, so the filter and the runtime can't
 *     drift apart.
 *
 * Pure: no IO, no DOM. Caller passes the rules + clips arrays
 * (popup already has both in memory) and we project the predicate.
 */

import { matchesHostPattern } from "./db";
import { hostFrom } from "./util";
import type { SiteRule, ClipItem } from "./types";

/**
 * Build a predicate `(clip) => boolean` that returns true iff the
 * clip's host is governed by a site rule whose first-match-wins
 * outcome carries `autoLock: true`.
 *
 * Returns `() => false` when there are no rules at all (cheap fast
 * path — applyQuery will just empty the result set, which matches
 * the user's intent: "show clips whose host has autoLock" → no
 * rules means no matches).
 *
 * Caches `Set<string>` of host-strings that resolve to autoLock-true
 * vs autoLock-false vs unknown, so applying to N clips is O(N) plus
 * one tiny hash lookup per clip rather than O(N × rules) regex
 * walks. The cache is closure-scoped so each call to
 * buildHostLockedPredicate gets a fresh one (no global state).
 *
 * Defensive against null/non-array rules, malformed entries
 * (missing hostPattern, missing url) — they're treated as "no
 * matching rule" and the clip falls out.
 */
export function buildHostLockedPredicate<
  T extends { source?: { url?: string } },
>(rules: SiteRule[] | null | undefined): (clip: T) => boolean {
  if (!Array.isArray(rules) || rules.length === 0) {
    return () => false;
  }
  // Filter to rules with a real hostPattern. We KEEP rules that
  // don't have autoLock so first-match-wins is honoured (a
  // non-autoLock rule that wins prevents a later autoLock rule
  // from matching the same host — same semantics as ingest).
  const ordered = rules.filter(
    (r) =>
      r &&
      typeof r.hostPattern === "string" &&
      r.hostPattern.length > 0,
  );
  if (ordered.length === 0) return () => false;
  // host -> "yes" (first rule says autoLock=true), "no" (first rule
  // says autoLock=false), or absent (no rule matched). undefined
  // entries skip the cache so a malformed clip doesn't pollute it.
  const cache = new Map<string, boolean>();
  const probeHost = (host: string): boolean => {
    if (!host) return false;
    const cached = cache.get(host);
    if (cached !== undefined) return cached;
    for (const r of ordered) {
      if (matchesHostPattern(r.hostPattern, host)) {
        const verdict = r.autoLock === true;
        cache.set(host, verdict);
        return verdict;
      }
    }
    cache.set(host, false);
    return false;
  };
  return (clip: T): boolean => {
    if (!clip || !clip.source) return false;
    const host = hostFrom(clip.source.url);
    if (!host) return false;
    return probeHost(host);
  };
}

/**
 * Count how many clips would match `is:hostlocked` given the live
 * rules + clips. Used by the empty-state hint + the Cmd+K palette
 * label so the user sees the in-scope set size before flipping the
 * operator on.
 *
 * Same predicate as `buildHostLockedPredicate` — single source of
 * truth. Defensive against bad input.
 */
export function countHostLockedClips<
  T extends { source?: { url?: string } },
>(rules: SiteRule[] | null | undefined, clips: T[] | null | undefined): number {
  if (!Array.isArray(clips) || clips.length === 0) return 0;
  const pred = buildHostLockedPredicate<T>(rules);
  let n = 0;
  for (const c of clips) if (pred(c)) n++;
  return n;
}

/**
 * Resolve the set of distinct hosts that currently carry an
 * autoLock-true verdict under first-match-wins. Used by the
 * Cmd+K palette command to surface "Filter to clips from N
 * autoLock'd hosts" with a meaningful count vs a bare label.
 *
 * Empty when no rules carry autoLock=true OR no rule applies to
 * any clip in the current store.
 *
 * Pure: no IO. Caller passes rules + clips, we walk once.
 */
export function autoLockedHostsForClips<
  T extends { source?: { url?: string } },
>(
  rules: SiteRule[] | null | undefined,
  clips: T[] | null | undefined,
): string[] {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  if (!Array.isArray(clips) || clips.length === 0) return [];
  const pred = buildHostLockedPredicate<T>(rules);
  const hosts = new Set<string>();
  for (const c of clips) {
    if (!pred(c)) continue;
    const host = hostFrom(c?.source?.url);
    if (host) hosts.add(host);
  }
  return Array.from(hosts).sort();
}

// Re-export so popup wiring doesn't need a second import.
export type { ClipItem };

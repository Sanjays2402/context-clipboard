/**
 * Pure helpers for the host-rule operator family:
 *
 *   - `is:hostpinned`    → clip's host has a rule with `autoPin: true`
 *   - `is:hostredacted`  → clip's host has a rule with `autoRedact: true`
 *   - `is:hostscrubbed`  → clip's host has a rule with `autoScrubOrigin: true`
 *
 * Companion to `lib/host-locked.ts` (`is:hostlocked` for autoLock) — same
 * cross-store join shape (site_rules × clips), same first-match-wins
 * semantics, same predicate-cache pattern. Different flag per operator.
 *
 * Why a family vs three separate modules?
 *
 *   - The matching logic is byte-identical (host normalisation,
 *     first-match-wins traversal, per-host verdict cache). Only the
 *     rule-field check differs — extracting the predicate by a
 *     callback keeps the three operators DRY without forcing each
 *     of the four (incl. host-locked) to live in a single file.
 *   - Each is a distinct USER concept (\"which clips will be pinned
 *     on re-capture?\" vs \"which sites am I redacting?\" vs \"which
 *     sites have origin-scrub?\"), so they deserve distinct search
 *     operators + Cmd+K commands.
 *   - host-locked existed first and shipped its own module — keeping
 *     it standalone (one file per operator) was the right call when
 *     we only had one. Now that we have three more, the shared shape
 *     belongs in this file. host-locked stays where it is for
 *     historical reasons + because its sanity file is already 100%
 *     green; touching it just to share a 30-line helper would be
 *     churn for no benefit.
 *
 * Same caveats as host-locked:
 *
 *   - First-match-wins. A clip on `docs.github.com` matched by
 *     `*.github.com` (autoPin=false) followed by `docs.github.com`
 *     (autoPin=true) does NOT match `is:hostpinned` — the first
 *     rule wins and it doesn't carry the bit. Matches ingest
 *     semantics + countClipsForRules exactly.
 *
 *   - Rule presence ≠ per-clip bit. `is:hostpinned` answers \"is
 *     this from a site I've CONFIGURED for auto-pin?\" — the clip
 *     itself may carry `pinned: false` if the user later manually
 *     unpinned it. Combining `is:hostpinned is:pinned` surfaces
 *     alignment (rule-pinned and currently-pinned); combining with
 *     `-is:pinned` (when we have negation) would surface drift.
 *
 * Pure: no IO, no DOM. Caller passes the rules + clips arrays
 * (popup already has both in memory) and we project the predicate.
 */

import { matchesHostPattern } from "./db";
import { hostFrom } from "./util";
import type { SiteRule } from "./types";

/** Which rule flag the operator gates on. */
export type HostRuleFlag = "autoPin" | "autoRedact" | "autoScrubOrigin";

/**
 * Build a predicate `(clip) => boolean` that returns true iff the
 * clip's host is governed by a site rule whose first-match-wins
 * outcome carries `flag === true` (where `flag` is `autoPin`,
 * `autoRedact`, or `autoScrubOrigin`).
 *
 * Generic over flag so the three operators (`is:hostpinned`,
 * `is:hostredacted`, `is:hostscrubbed`) share one implementation.
 * `is:hostlocked` (in lib/host-locked.ts) was already standalone
 * when this was added; rewriting it to share would be churn — same
 * algorithm, lives in two places by deliberate choice.
 *
 * Returns `() => false` when there are no rules at all (cheap fast
 * path — applyQuery will just empty the result set, which matches
 * the user's intent: \"show clips whose host has autoPin\" → no
 * rules means no matches).
 *
 * Per-host verdict cache (Map<string, boolean>) so applying to N
 * clips is O(N) plus one tiny hash lookup per clip rather than
 * O(N × rules) regex walks. Cache is closure-scoped so each call
 * gets a fresh one (no global state).
 *
 * Defensive against null/non-array rules, malformed entries
 * (missing hostPattern, missing url) — they're treated as \"no
 * matching rule\" and the clip falls out.
 */
export function buildHostRulePredicate<
  T extends { source?: { url?: string } },
>(
  rules: SiteRule[] | null | undefined,
  flag: HostRuleFlag,
): (clip: T) => boolean {
  if (!Array.isArray(rules) || rules.length === 0) {
    return () => false;
  }
  // Filter to rules with a real hostPattern. We KEEP rules that
  // don't carry the flag so first-match-wins is honoured (a
  // non-flagged rule that wins prevents a later flagged rule
  // from matching the same host — same semantics as ingest).
  const ordered = rules.filter(
    (r) =>
      r &&
      typeof r.hostPattern === "string" &&
      r.hostPattern.length > 0,
  );
  if (ordered.length === 0) return () => false;
  const cache = new Map<string, boolean>();
  const probeHost = (host: string): boolean => {
    if (!host) return false;
    const cached = cache.get(host);
    if (cached !== undefined) return cached;
    for (const r of ordered) {
      if (matchesHostPattern(r.hostPattern, host)) {
        // Strict `=== true` so a truthy non-boolean (legacy import,
        // hand-edited JSON) doesn't accidentally surface here. Mirror
        // of host-locked.ts's autoLock check.
        let verdict = false;
        if (flag === "autoPin") verdict = r.autoPin === true;
        else if (flag === "autoRedact") verdict = r.autoRedact === true;
        else if (flag === "autoScrubOrigin") verdict = r.autoScrubOrigin === true;
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
 * Count how many clips match the given flag-based predicate.
 * Used by the empty-state hint + the Cmd+K palette label so the
 * user sees the in-scope set size before flipping the operator on.
 *
 * Defensive against bad input. Single source of truth — uses
 * buildHostRulePredicate so the count + the filter agree.
 */
export function countHostRuleClips<
  T extends { source?: { url?: string } },
>(
  rules: SiteRule[] | null | undefined,
  clips: T[] | null | undefined,
  flag: HostRuleFlag,
): number {
  if (!Array.isArray(clips) || clips.length === 0) return 0;
  const pred = buildHostRulePredicate<T>(rules, flag);
  let n = 0;
  for (const c of clips) if (pred(c)) n++;
  return n;
}

/**
 * Resolve the distinct set of hosts that currently carry the given
 * flag's verdict under first-match-wins. Used by the Cmd+K palette
 * label to surface \"Filter to clips from N autoPin'd hosts\" with a
 * meaningful host count alongside the clip count.
 *
 * Empty when no rules carry the flag OR no rule applies to any
 * clip in the current store.
 *
 * Pure: no IO. Walks once.
 */
export function flaggedHostsForClips<
  T extends { source?: { url?: string } },
>(
  rules: SiteRule[] | null | undefined,
  clips: T[] | null | undefined,
  flag: HostRuleFlag,
): string[] {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  if (!Array.isArray(clips) || clips.length === 0) return [];
  const pred = buildHostRulePredicate<T>(rules, flag);
  const hosts = new Set<string>();
  for (const c of clips) {
    if (!pred(c)) continue;
    const host = hostFrom(c?.source?.url);
    if (host) hosts.add(host);
  }
  return Array.from(hosts).sort();
}

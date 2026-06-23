// site-rules-io.ts — serialize / parse / merge per-site capture rules.
//
// Why a separate module from the bigger export bundle (lib/export.ts)?
// Site rules are a setting users want to copy between machines on their
// own — "I built up 12 rules over a month, paste them onto the laptop"
// — without dragging clips/audit/settings along for the ride. A small,
// focused JSON blob the user can paste into a textarea is a much nicer
// shape for that workflow than reusing the whole import dialog.
//
// Pure module: no DOM, no IDB. The popup serializes via this, hands
// the string to the user (copy-to-clipboard + textarea), and parses
// pasted text right back. Tests at .cron-state/sanity-site-rules-io.mjs.
//
// Hard rules:
//   - Versioned envelope (`{version:1,rules:[...]}`) so future shape
//     changes can branch on `version` and an old export keeps working.
//   - Defensive parse: drop any rule whose `hostPattern` is blank, too
//     long (>200ch), contains whitespace, or fails the same wildcard
//     contract `matchesHostPattern` enforces. Bad rows are silently
//     skipped — never throw on import because one rogue entry shouldn't
//     poison a 30-rule paste.
//   - Strip metadata that doesn't belong (ids regenerated on merge so
//     two devices don't collide; createdAt becomes the import time on
//     fresh-merged rows so the user can see what's new).
//   - Merge modes: `merge` (additive — incoming wins on hostPattern
//     collision so the user's edits propagate) and `replace` (wipe
//     existing, take incoming verbatim — explicit "use the other
//     machine's set").

import type { SiteRule } from "./types";

/** Versioned envelope shape. Exported for callers that want to type-check. */
export interface SiteRulesBundle {
  version: 1;
  /** Capture time (ms since epoch). Informational. */
  exportedAt: number;
  /** Source marker so future tooling can tell where the bundle came from. */
  source: "context-clipboard-site-rules";
  rules: SerializedRule[];
}

/**
 * On-wire rule shape — drops `id` (regenerated on merge) and `createdAt`
 * (preserves cross-device ordering by tossing local timestamps). Everything
 * else round-trips lossless.
 */
export interface SerializedRule {
  hostPattern: string;
  autoTags?: string[];
  autoPin?: boolean;
  autoLock?: boolean;
  autoRedact?: boolean;
  skipCapture?: boolean;
  autoScrubOrigin?: boolean;
  customPatterns?: string[];
}

const MAX_RULES = 200;
const MAX_HOST_LEN = 200;
const MAX_PATTERN_LEN = 200;
const MAX_TAG_LEN = 40;
const MAX_TAGS_PER_RULE = 20;
const MAX_PATTERNS_PER_RULE = 50;

/**
 * Build the canonical bundle for export. Pure transform: takes the
 * live `SiteRule[]` from `listSiteRules()`, drops local-only metadata
 * (`id`, `createdAt`), normalises the rule body, returns the envelope
 * ready for `JSON.stringify`.
 *
 * The serialized rules preserve the user's original list order so a
 * round-trip on the same device doesn't shuffle first-match-wins
 * priority. We deliberately don't sort alphabetically here — order is
 * meaningful (it's the dispatch order ingest uses).
 */
export function serializeRules(rules: SiteRule[]): SiteRulesBundle {
  return {
    version: 1,
    source: "context-clipboard-site-rules",
    exportedAt: Date.now(),
    rules: rules.map(normaliseForExport),
  };
}

/**
 * Pretty-printed JSON ready for the clipboard / textarea. 2-space
 * indent so a user can paste it into a chat / gist / readme and have
 * it read sensibly. Kept under one helper so the popup never builds
 * the JSON string by hand.
 */
export function stringifyRules(rules: SiteRule[]): string {
  return JSON.stringify(serializeRules(rules), null, 2);
}

function normaliseForExport(r: SiteRule): SerializedRule {
  const out: SerializedRule = { hostPattern: r.hostPattern };
  if (r.autoTags && r.autoTags.length) {
    out.autoTags = r.autoTags
      .map((t) => (t || "").trim())
      .filter(Boolean)
      .slice(0, MAX_TAGS_PER_RULE);
    if (out.autoTags.length === 0) delete out.autoTags;
  }
  if (r.autoPin) out.autoPin = true;
  if (r.autoLock) out.autoLock = true;
  if (r.autoRedact) out.autoRedact = true;
  if (r.skipCapture) out.skipCapture = true;
  if (r.autoScrubOrigin) out.autoScrubOrigin = true;
  if (r.customPatterns && r.customPatterns.length) {
    out.customPatterns = r.customPatterns
      .map((p) => (p || "").trim())
      .filter(Boolean)
      .slice(0, MAX_PATTERNS_PER_RULE);
    if (out.customPatterns.length === 0) delete out.customPatterns;
  }
  return out;
}

/**
 * Parse + validate a JSON string into a list of clean `SerializedRule`
 * rows. Never throws — invalid bundles surface as an `{ok:false}` result
 * with a short reason so the popup can toast it. Drops any individual
 * rule that fails the per-row validators; an unrecoverable bundle (bad
 * JSON, wrong envelope, wrong version) returns `ok:false` instead.
 *
 * Bounded — we cap at MAX_RULES on the way in to keep a malicious
 * paste from filling IDB with a million rows. Per-rule field caps mirror
 * what the live form would accept.
 */
export interface ParseResult {
  ok: boolean;
  reason?: string;
  rules?: SerializedRule[];
  /** How many incoming rows we dropped because they failed validation. */
  dropped?: number;
}

export function parseRulesJson(text: string): ParseResult {
  if (!text || !text.trim()) {
    return { ok: false, reason: "empty" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid JSON" };
  }
  // Accept either the full envelope OR a bare array of rules — the
  // latter is what a user might cobble together by hand. Bare arrays
  // get wrapped in a synthetic envelope so the downstream merge is
  // identical.
  let raw: unknown;
  if (Array.isArray(parsed)) {
    raw = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as SiteRulesBundle).rules)
  ) {
    const env = parsed as SiteRulesBundle;
    if (env.version !== 1) {
      return { ok: false, reason: `unsupported version (${String(env.version)})` };
    }
    raw = env.rules;
  } else {
    return { ok: false, reason: "missing rules array" };
  }
  const incoming = raw as unknown[];
  const clean: SerializedRule[] = [];
  let dropped = 0;
  for (const row of incoming) {
    if (clean.length >= MAX_RULES) {
      dropped += incoming.length - clean.length;
      break;
    }
    const r = validateRule(row);
    if (r) clean.push(r);
    else dropped++;
  }
  return { ok: true, rules: clean, dropped };
}

/**
 * Per-row validator. Mirrors the live form's contract:
 *   - `hostPattern` non-empty, ≤200ch, no whitespace, lowercased
 *   - exactly zero or one leading `*.` (no full glob)
 *   - booleans cast to true booleans (drop truthy strings/numbers so a
 *     hand-rolled paste doesn't accidentally set every flag)
 *   - tags + patterns trimmed, capped, blanks dropped
 *   - regex patterns compile cleanly (else dropped silently — same
 *     contract as `upsertSiteRule`)
 *
 * Returns `null` to signal "drop this row". Pure — no IDB, no DOM.
 */
function validateRule(raw: unknown): SerializedRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const hostRaw = typeof r.hostPattern === "string" ? r.hostPattern : "";
  const host = hostRaw.trim().toLowerCase();
  if (!host || host.length > MAX_HOST_LEN) return null;
  if (/\s/.test(host)) return null;
  // Strip leading `*.` once if present; reject `**` / multiple `*` /
  // any other glob shape so the pattern matches what `matchesHostPattern`
  // actually understands.
  if (host.startsWith("*.")) {
    const tail = host.slice(2);
    if (!tail || tail.includes("*")) return null;
  } else if (host.includes("*")) {
    return null;
  }
  const out: SerializedRule = { hostPattern: host };
  if (Array.isArray(r.autoTags)) {
    const tags = r.autoTags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= MAX_TAG_LEN);
    if (tags.length) out.autoTags = tags.slice(0, MAX_TAGS_PER_RULE);
  }
  if (r.autoPin === true) out.autoPin = true;
  if (r.autoLock === true) out.autoLock = true;
  if (r.autoRedact === true) out.autoRedact = true;
  if (r.skipCapture === true) out.skipCapture = true;
  if (r.autoScrubOrigin === true) out.autoScrubOrigin = true;
  if (Array.isArray(r.customPatterns)) {
    const pats = r.customPatterns
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim())
      .filter((p) => {
        if (!p || p.length > MAX_PATTERN_LEN) return false;
        try {
          new RegExp(p, "gi");
          return true;
        } catch {
          return false;
        }
      });
    if (pats.length) out.customPatterns = pats.slice(0, MAX_PATTERNS_PER_RULE);
  }
  return out;
}

/**
 * Merge incoming serialised rules into an existing live ruleset.
 *
 * Modes:
 *   - `merge`: keep every existing rule; for each incoming row, if a
 *     rule with the same `hostPattern` exists, the incoming wins
 *     (replace in place, preserve original id + createdAt so list
 *     order doesn't shuffle); otherwise append with a fresh id and
 *     `createdAt = now`. This is the "I edited rules on laptop, paste
 *     onto desktop, no surprises" path.
 *   - `replace`: throw out every existing rule, take only the incoming
 *     set. Each row gets a fresh id + `createdAt = now`. Order
 *     preserved from the bundle.
 *
 * Returns a fresh array (input arrays are NOT mutated) plus a per-row
 * tally (added/updated/skipped) so the popup can toast a meaningful
 * "+3 added, 2 updated" message.
 */
export interface MergeResult {
  next: SiteRule[];
  added: number;
  updated: number;
  /** Existing rules removed because they're in `replace` mode and not in incoming. */
  removed: number;
}

export type MergeMode = "merge" | "replace";

export function mergeRules(
  existing: SiteRule[],
  incoming: SerializedRule[],
  mode: MergeMode,
  now: number = Date.now(),
): MergeResult {
  if (mode === "replace") {
    const next = incoming.map((r, i) => liveRuleFrom(r, now + i));
    return {
      next,
      added: next.length,
      updated: 0,
      removed: existing.length,
    };
  }
  // Merge: walk existing first to preserve order, replace in place
  // when an incoming hostPattern matches; then append the leftover
  // incoming rules at the end.
  const incByHost = new Map<string, SerializedRule>();
  for (const r of incoming) incByHost.set(r.hostPattern, r);
  let updated = 0;
  const out: SiteRule[] = [];
  const touched = new Set<string>();
  for (const ex of existing) {
    const inc = incByHost.get(ex.hostPattern);
    if (inc) {
      // Replace in place but preserve original id + createdAt so the
      // historical position + ordering stay stable.
      out.push({ ...liveRuleFrom(inc, ex.createdAt), id: ex.id });
      touched.add(ex.hostPattern);
      updated++;
    } else {
      out.push(ex);
    }
  }
  let added = 0;
  let stamp = now;
  for (const inc of incoming) {
    if (touched.has(inc.hostPattern)) continue;
    out.push(liveRuleFrom(inc, stamp));
    stamp += 1; // ensure unique createdAt ordering for back-to-back additions
    added++;
  }
  return { next: out, added, updated, removed: 0 };
}

/**
 * Lift a serialised row into a live SiteRule with a fresh id. Pure —
 * no IDB write here; the caller (`addSiteRulesFromBundle` etc.) is
 * responsible for persisting.
 */
function liveRuleFrom(r: SerializedRule, createdAt: number): SiteRule {
  return {
    id: `sr_${createdAt.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    hostPattern: r.hostPattern,
    autoTags: r.autoTags,
    autoPin: !!r.autoPin,
    autoLock: !!r.autoLock,
    autoRedact: !!r.autoRedact,
    skipCapture: !!r.skipCapture,
    autoScrubOrigin: !!r.autoScrubOrigin,
    customPatterns: r.customPatterns,
    createdAt,
  };
}

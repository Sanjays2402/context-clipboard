/**
 * Fuzzy command palette — action definitions + matcher.
 *
 * Purely declarative + pure helpers; all side-effecting `run` handlers
 * live in popup.ts where they have access to DOM + state. We keep the
 * matcher local so it can be unit-tested without DOM, and so the popup
 * code stays focused on UI wiring.
 *
 * The fuzzy matcher is intentionally simple: case-insensitive
 * substring + acronym + sequential-letter scoring. Good enough at the
 * 30-40 actions this palette will ever carry; not worth pulling in
 * fzf/junegunn algorithms for that.
 */

export interface PaletteAction {
  /** Stable id (used as DOM key + memo). */
  id: string;
  /** Human label shown in the row. */
  label: string;
  /** One-line description shown beneath. Empty = no subtitle. */
  hint?: string;
  /** Section header, e.g. "Filter", "Bulk", "Export". */
  group: string;
  /** Optional keyboard shortcut hint (rendered on the right of the row). */
  shortcut?: string;
  /**
   * Optional searchable extra string (synonyms, internal name) — not
   * displayed but boosts matches. e.g. action "Toggle pinned filter"
   * with keywords "is:pinned only".
   */
  keywords?: string;
  /** Side-effecting handler. Returns a Promise so callers can await. */
  run: () => void | Promise<void>;
  /** When false, the action is filtered out of the palette (e.g. trash empty). */
  available?: boolean;
}

export interface PaletteMatch {
  action: PaletteAction;
  /** Higher = better. */
  score: number;
  /** Character offsets in the label that matched, for bolding. */
  hits: number[];
}

/**
 * Compute a fuzzy match score + the matching char offsets for one
 * action against one needle. Returns null when the needle's characters
 * can't be found in order in the label/keywords/hint.
 *
 * Scoring tilts toward:
 *   - exact substring matches (huge bonus)
 *   - matches at word boundaries (acronym-style)
 *   - shorter labels (cheaper to read = preferred when tied)
 */
export function scoreAction(a: PaletteAction, needle: string): PaletteMatch | null {
  const n = needle.trim().toLowerCase();
  if (!n) {
    return { action: a, score: 1, hits: [] };
  }
  const label = a.label;
  const labelLower = label.toLowerCase();
  // Searchable haystack — labels first so its hits count for highlighting.
  const haystacks: { text: string; weight: number }[] = [
    { text: labelLower, weight: 1 },
    { text: (a.keywords || "").toLowerCase(), weight: 0.6 },
    { text: (a.hint || "").toLowerCase(), weight: 0.4 },
    { text: a.group.toLowerCase(), weight: 0.3 },
  ];

  // 1) substring shortcut — strongest signal.
  let score = 0;
  let hits: number[] = [];
  const idx = labelLower.indexOf(n);
  if (idx >= 0) {
    score += 200 - idx * 2; // prefer hits near the start
    if (idx === 0 || /\s/.test(labelLower[idx - 1])) score += 40; // word-boundary
    for (let i = 0; i < n.length; i++) hits.push(idx + i);
  } else {
    // Try in other haystacks too — match found without label hits stays
    // pickable but doesn't highlight.
    let bestOther = 0;
    for (const h of haystacks.slice(1)) {
      const j = h.text.indexOf(n);
      if (j >= 0) bestOther = Math.max(bestOther, (180 - j * 2) * h.weight);
    }
    score += bestOther;
  }

  // 2) sequential-letter scan on the label, even if substring missed.
  if (hits.length === 0) {
    let cursor = 0;
    let runHits: number[] = [];
    let lastIsBoundary = true;
    let local = 0;
    for (let i = 0; i < n.length; i++) {
      const ch = n[i];
      const found = labelLower.indexOf(ch, cursor);
      if (found < 0) {
        runHits = [];
        local = 0;
        break;
      }
      runHits.push(found);
      // Word-boundary bonus
      const prev = found === 0 ? " " : labelLower[found - 1];
      if (/\W/.test(prev)) local += 6;
      else local += 1;
      // Tight clusters score better than gaps
      if (found === cursor) local += 2;
      cursor = found + 1;
      lastIsBoundary = /\W/.test(prev);
    }
    if (runHits.length === n.length) {
      score += local + (lastIsBoundary ? 4 : 0);
      hits = runHits;
    }
  }

  if (score <= 0) return null;
  // Length penalty so equally-scored actions prefer the shorter label.
  score -= Math.floor(labelLower.length / 8);
  return { action: a, score, hits };
}

/**
 * Score every action against `needle` and return the top results in
 * descending order. Unavailable actions are filtered out. Pass an
 * empty needle to get every available action in declaration order
 * (the palette opens with this on first render).
 */
export function rankActions(actions: PaletteAction[], needle: string): PaletteMatch[] {
  const out: PaletteMatch[] = [];
  for (const a of actions) {
    if (a.available === false) continue;
    const m = scoreAction(a, needle);
    if (m) out.push(m);
  }
  out.sort((a, b) => b.score - a.score || a.action.label.localeCompare(b.action.label));
  return out;
}

/**
 * Highlight HTML for a label: returns the label with `<b>` tags around
 * the matched character offsets. Caller is expected to have already
 * HTML-escaped the label.
 */
export function highlightLabel(escapedLabel: string, hits: number[]): string {
  if (hits.length === 0) return escapedLabel;
  // hits are offsets in the ORIGINAL (pre-escape) string. Since
  // escapeHtml only expands a handful of chars to longer sequences,
  // building a parallel char-mapping is overkill — we walk the original
  // label by codepoint and emit the escape inline. Caller passes the
  // raw label and we escape it ourselves here.
  // (We accept the escapedLabel param for callsite symmetry but ignore
  // it; the real input is the raw label embedded in `hits` indices.)
  return escapedLabel; // overridden by callers that need raw bolding
}

/**
 * Render bolded label HTML from raw label + hit offsets in raw chars.
 * HTML-escapes safely while wrapping matched chars in `<b>`.
 */
export function boldedLabel(rawLabel: string, hits: number[]): string {
  if (hits.length === 0) return escape(rawLabel);
  const set = new Set(hits);
  let out = "";
  let inBold = false;
  for (let i = 0; i < rawLabel.length; i++) {
    const want = set.has(i);
    if (want && !inBold) {
      out += "<b>";
      inBold = true;
    } else if (!want && inBold) {
      out += "</b>";
      inBold = false;
    }
    out += escapeChar(rawLabel[i]);
  }
  if (inBold) out += "</b>";
  return out;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => escapeChar(c));
}

function escapeChar(c: string): string {
  switch (c) {
    case "&":
      return "&amp;";
    case "<":
      return "&lt;";
    case ">":
      return "&gt;";
    case '"':
      return "&quot;";
    case "'":
      return "&#39;";
    default:
      return c;
  }
}

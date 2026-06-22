/**
 * Live {{token}} counter for the note composer.
 *
 * The composer's textarea may hold a template body — `Hi from
 * {{host}} on {{date}}` — and the user benefits from seeing, in
 * real time, how many tokens will expand on copy. A small inline
 * pill under the textarea reports two numbers:
 *
 *   - PLACEHOLDERS: how many `{{...}}` occurrences exist in the
 *     body (a body with `{{date}} {{date}}` has 2 placeholders).
 *   - UNIQUE: how many DISTINCT token names (case-insensitive,
 *     same as the templates.ts expander). `{{date}} {{date}}` has
 *     1 unique. Useful when the user wants to see how many real
 *     variables they're depending on.
 *
 * Pure module — no DOM, no IO. The popup wires the result into a
 * `<span class="note-template-pill">` and toggles its hidden state
 * based on whether the body has at least one valid token.
 *
 * Grammar matches src/lib/templates.ts so the counter agrees with
 * the eventual expander — no false positives on `{{}}` (empty
 * name), `{{1bad}}` (starts with digit), or `{{x` (unclosed). Both
 * `{{name}}` and `{{name|fallback}}` forms are recognised.
 */

/**
 * Token grammar copy of src/lib/templates.ts:
 *
 *   - Opens with `{{`.
 *   - Optional whitespace.
 *   - Name MUST start with a letter, then letters/digits/`_`/`-`.
 *   - Optional pipe + fallback (anything up to closing `}}`, no
 *     nested tokens).
 *   - Optional whitespace.
 *   - Closes with `}}`.
 *
 * Defined as a fresh RegExp per call so `lastIndex` state doesn't
 * leak between invocations — matters because the composer calls
 * this on every keystroke.
 */
function makeTokenRegex(): RegExp {
  return /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*(?:\|([^}]*?))?\s*\}\}/g;
}

export interface TokenCount {
  /** Total {{...}} placeholders in the body (duplicates count). */
  placeholders: number;
  /** Distinct token names (case-insensitive). */
  unique: number;
  /**
   * Sorted, lowercased list of unique token names. Used for the
   * pill's hover tooltip ("date, host, url"). Capped server-side
   * (caller decides), but the counter returns ALL names so a
   * popup-side `.slice(0, N).join(", ") + "…"` works.
   */
  names: string[];
}

/**
 * Count placeholders + unique token names in `body`. Defensive
 * against null/undefined/non-string — returns the zero shape.
 *
 * Pure; no side effects. Stateless RegExp so safe to call from a
 * keydown handler without race conditions.
 */
export function countTemplateTokens(body: unknown): TokenCount {
  const zero: TokenCount = { placeholders: 0, unique: 0, names: [] };
  if (typeof body !== "string" || body.length === 0) return zero;
  const re = makeTokenRegex();
  let placeholders = 0;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    placeholders++;
    const name = (m[1] || "").toLowerCase();
    if (name) seen.add(name);
  }
  if (placeholders === 0) return zero;
  const names = Array.from(seen).sort();
  return { placeholders, unique: names.length, names };
}

/**
 * Format the live pill label.
 *
 *   - 0 tokens → null (caller hides the pill).
 *   - 1 unique, 1 placeholder → "1 token: date"
 *   - 1 unique, N placeholders → "1 token × 3" (single var used 3×)
 *   - N unique, M placeholders → "3 tokens · 5 placeholders"
 *
 * Why differentiate? Templates with one repeated token vs many
 * distinct tokens reveal different design intents — a chat snippet
 * with `{{user}} said {{user}}` is one thing; `{{date}} {{host}}
 * {{user}}` is another. Users iterating on a template benefit from
 * knowing which axis is growing.
 */
export function formatTokenPillLabel(count: TokenCount): string | null {
  if (count.placeholders === 0) return null;
  const unique = count.unique;
  const total = count.placeholders;
  if (unique === 0) {
    // Shouldn't happen for valid grammar (parser only counts named
    // tokens) but guard anyway.
    return null;
  }
  if (unique === 1) {
    if (total === 1) return `1 token: ${count.names[0]}`;
    return `1 token × ${total}`;
  }
  // Multiple unique. If placeholders == unique, no need for the
  // second number; otherwise show both.
  if (total === unique) {
    return `${unique} tokens`;
  }
  return `${unique} tokens · ${total} placeholders`;
}

/**
 * Tooltip variant — spells out the token names for hover. Capped
 * at `maxNames` so a body with 30 unique tokens doesn't produce a
 * scrollable tooltip; everything past the cap turns into "+N more".
 *
 * Returns null when there are no tokens (matches formatTokenPillLabel
 * so the caller can treat them as a pair).
 */
export function formatTokenPillTooltip(
  count: TokenCount,
  maxNames: number = 8,
): string | null {
  if (count.placeholders === 0) return null;
  if (count.unique === 0) return null;
  const cap = Math.max(1, Math.floor(maxNames));
  const visible = count.names.slice(0, cap);
  const rest = count.unique - visible.length;
  const namesPart = visible.join(", ") + (rest > 0 ? ` + ${rest} more` : "");
  // Always include the raw numbers so the tooltip is self-contained
  // (the user might not be hovering the pill — they might be reading
  // the tooltip in a screenshot).
  const numbersPart =
    count.unique === count.placeholders
      ? `${count.unique} unique token${count.unique === 1 ? "" : "s"}`
      : `${count.unique} unique · ${count.placeholders} placeholders`;
  return `${numbersPart} (${namesPart}) — will expand on copy`;
}

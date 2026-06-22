/**
 * Audit-panel chip-strip label rendering.
 *
 * Pure helpers for converting bucket counts into the user-facing
 * chip label + tooltip. Pulled out of popup.ts so the formatting
 * decisions are testable and consistent across:
 *
 *   - The visible chip text ("Redact (12)")
 *   - The hover tooltip ("Redact · 12 actions · 38% of visible ring")
 *   - The "All" chip's behaviour (no percentage on itself — it IS
 *     100% — but the bucket count is shown)
 *
 * No DOM, no IO. Caller injects the windowed count + bucket counts.
 *
 * Format choices:
 *   - Parens around the bucket count so the chip reads as
 *     "label (count)" — explicit count visual instead of the
 *     historical dim-em-superscript that some users missed.
 *   - Percentage rounded to the nearest integer when the bucket
 *     has at least one entry; zero buckets are omitted by the
 *     popup-side filter before this helper is called, but we
 *     defensively handle zero anyway (returns "0%").
 *   - Total chips always present (e.g. "All" is always rendered)
 *     so the user can see the global total even when every bucket
 *     is at 0 — a quirk that can happen mid-clear.
 */

export interface AuditChipLabelInput {
  /** The visible chip name — "All", "Redact", "Scrub", etc. */
  label: string;
  /** This bucket's row count after windowing/scoping (>= 0). */
  count: number;
  /** Total visible ring after windowing/scoping (>= bucket count). */
  total: number;
  /** True for the "All" chip — suppresses percentage in tooltip. */
  isAll?: boolean;
}

export interface AuditChipLabel {
  /** Inner HTML-safe label text shown on the chip. */
  text: string;
  /** Tooltip / title attribute shown on hover. */
  title: string;
}

/**
 * Round half-to-even — same behaviour as Number.prototype.toFixed
 * but explicit so it's easier to reason about for tests. We use it
 * for the percentage; rounding errors of ±1pp are fine for a
 * sub-label glance.
 */
function roundPct(num: number, denom: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(denom)) return 0;
  if (denom <= 0) return 0;
  const raw = (num / denom) * 100;
  // Math.round; we don't need banker's rounding for a glance UI.
  return Math.round(raw);
}

/**
 * Format the chip's visible label and tooltip.
 *
 * - "All" chip: `All (N)` text, no percentage in tooltip (it would
 *   always say 100%). Tooltip reads `All · N actions in this view`.
 * - Bucket chip: `Redact (12)` text, tooltip `Redact · 12 actions ·
 *   38% of visible ring`.
 * - Zero-bucket: still produces a label (caller filters those out
 *   before rendering, but the helper handles it defensively).
 *
 * No HTML escaping is performed — callers pass already-safe text.
 */
export function formatAuditChipLabel(input: AuditChipLabelInput): AuditChipLabel {
  const label = String(input.label || "").trim();
  const count = Math.max(0, Math.floor(Number(input.count) || 0));
  const total = Math.max(0, Math.floor(Number(input.total) || 0));
  const isAll = !!input.isAll;

  const text = `${label} (${count})`;

  if (isAll) {
    const noun = count === 1 ? "action" : "actions";
    return {
      text,
      title: `${label} · ${count} ${noun} in this view`,
    };
  }

  // Bucket chip — include percentage of the visible ring so the user
  // sees the distribution at a glance. Zero-total guard keeps the
  // tooltip honest ("0% of 0" reads as nonsense — say "no actions"
  // instead).
  if (total === 0 || count === 0) {
    return {
      text,
      title: `${label} · no actions in this view`,
    };
  }
  const pct = roundPct(count, total);
  const noun = count === 1 ? "action" : "actions";
  return {
    text,
    title: `${label} · ${count} ${noun} · ${pct}% of visible ring`,
  };
}

/**
 * Convenience for the popup's existing render path. Takes the chip
 * spec list + counts and returns the rendered <span>/<em> innerHTML
 * with the new "(N)" format. Keeps the DOM-string assembly in one
 * place so future format tweaks live in this module.
 *
 * Returns the inner HTML for the chip body — the caller wraps it
 * in <button class="audit-chip"> with the data-filter attribute.
 *
 * The `<span>` carries the label text (no count); the `<em>` keeps
 * the dimmed count for visual hierarchy. Tooltip carries the full
 * spelled-out frequency context.
 */
export function buildAuditChipBody(
  input: AuditChipLabelInput,
  escapeHtml: (s: string) => string,
): { bodyHtml: string; title: string } {
  const { text: _text, title } = formatAuditChipLabel(input);
  // Split the rendered text back into label and (count) parts so we
  // can keep the existing visual hierarchy (label in span, count in
  // em). The format guarantee from formatAuditChipLabel is "label
  // (count)" with a literal space + parens.
  const label = String(input.label || "").trim();
  const count = Math.max(0, Math.floor(Number(input.count) || 0));
  return {
    bodyHtml:
      `<span>${escapeHtml(label)}</span>` +
      `<em>(${count})</em>`,
    title,
  };
}

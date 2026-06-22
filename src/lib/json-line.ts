/**
 * "Copy as JSON line" — single-line minified JSON envelope for a clip.
 *
 * Companion to `jsonEnvelopeForClip` (which produces a 2-space pretty
 * envelope suitable for paste into the Import dialog). This variant
 * collapses the same shape onto ONE line with no whitespace, which is
 * what terminal / log / structured-output workflows actually want:
 *
 *   - `echo '...' | jq ...` doesn't care about indentation but DOES
 *     care about embedded newlines (a multi-line clip would break the
 *     shell-quoted argument unless the envelope itself is single-line).
 *   - Tools like `fzf`, `grep`, `cat -A`, `jsonl` viewers all assume
 *     one JSON value per line.
 *   - Pasting into a chat thread / Slack codeblock is far less ugly
 *     when the envelope is one line versus 30 lines of `{\n  "v": 1`.
 *
 * Pure module — same constraints as send-to.ts. The popup wires this
 * into the "Copy as JSON line" send-to row.
 *
 * Newline policy: the clip's CONTENT may contain newlines (multi-line
 * snippets, code blocks, notes). JSON.stringify already escapes those
 * to `\n` literals so the envelope itself stays single-line — no
 * additional content massaging needed. We just have to make sure the
 * STRINGIFY call doesn't pretty-print.
 */

import type { ClipForJson } from "./send-to";

/**
 * Build a one-line minified JSON envelope. Returns undefined for clips
 * with no payload (mirrors `jsonEnvelopeForClip`'s gate) so the send-to
 * row hides cleanly instead of copying an envelope with empty `clips[0]`.
 *
 * Shape matches the pretty variant EXCEPT:
 *   - No whitespace (JSON.stringify without indent argument).
 *   - `source` marker reads "send-to-json-line" so a support thread can
 *     tell at a glance which variant was used.
 *
 * Both envelopes round-trip through importAll identically — the
 * marker is documentation, not a behavioural signal.
 */
export function jsonLineEnvelopeForClip(c: ClipForJson): string | undefined {
  const hasBody = !!(c.content && c.content.length > 0);
  if (!hasBody) return undefined;
  const payload = c.full ?? {
    id: c.id,
    kind: c.kind,
    content: c.content,
    preview: c.preview,
    source: c.source,
  };
  const envelope = {
    version: 1,
    clips: [payload],
    exportedAt: Date.now(),
    /**
     * Distinct marker so we can tell at a glance whether a 1-clip
     * JSON came from the pretty variant or the line variant. Same
     * shape otherwise — both import cleanly.
     */
    source: "send-to-json-line" as const,
  };
  return JSON.stringify(envelope);
}

/**
 * True if the produced envelope is genuinely single-line. The clip's
 * content may contain literal newlines, but JSON.stringify escapes
 * those to `\n` so the envelope itself should stay on one row. This
 * helper exists primarily for tests — the popup doesn't need to
 * re-validate; it trusts the builder.
 *
 * Defensive against null/undefined/empty — those count as "not a
 * valid envelope", returns false (a `null` payload would have been
 * skipped by jsonLineEnvelopeForClip anyway, so this just guards
 * the contract).
 */
export function isSingleLine(s: string | null | undefined): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  return !/\r|\n/.test(s);
}

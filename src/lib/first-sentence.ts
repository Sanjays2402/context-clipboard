/**
 * "Copy first sentence" send-to row — the prose sibling of first-line.
 *
 * For a captured article / paragraph / release note, the lead SENTENCE
 * is the summary the user wants to quote or paste as a TL;DR — not the
 * whole wall, and not "line 1" (prose wraps, so the first line is an
 * arbitrary cut). This row extracts the first sentence: text up to and
 * including the first sentence-ending `.`/`!`/`?` followed by whitespace
 * or end-of-body, with a few guards so initials/abbreviations don't cut
 * it short.
 *
 * Pure: no IO, no DOM. The popup writes the result.
 *
 * Design decisions:
 *   - IMAGE clips return undefined (data-URL body — no prose).
 *   - Empty / whitespace-only bodies return undefined — nothing to take.
 *   - Newlines normalise to spaces first so a sentence wrapped across
 *     two lines is still ONE sentence (the prose-vs-line distinction
 *     from first-line).
 *   - We only surface the row when there's MORE than one sentence — if
 *     the whole body IS one sentence, plain Copy already covers it and a
 *     "first sentence" that equals the body is clutter (mirrors first-
 *     line hiding for single-line clips).
 *   - A trailing `.` after a 1-char token (an initial like "J.") doesn't
 *     end the sentence — too short to be a real terminator — so we keep
 *     scanning. Conservative, not perfect: the goal is a useful lead, not
 *     a linguistics engine.
 */

export interface SentenceClip {
  kind: "text" | "image" | "link";
  content: string;
}

/** First sentence of `body`, or null when there isn't a clean second one. */
export function firstSentenceOf(body: string): string | null {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat === "") return null;
  // Walk to the first terminator (. ! ?) that's followed by a space or EOL
  // and isn't preceded by a single-letter "initial". end = index AFTER the
  // terminator.
  let end = -1;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === "." || ch === "!" || ch === "?") {
      const next = flat[i + 1];
      const atEnd = next === undefined;
      const beforeSpace = next === " ";
      if (!atEnd && !beforeSpace) continue;
      // Guard: a lone "X." initial / abbrev — skip if the token just
      // before the dot is a single letter and there's more text after.
      if (ch === "." && !atEnd) {
        const before = flat.slice(0, i);
        if (/(^|\s)[A-Za-z]$/.test(before)) continue;
      }
      end = i + 1;
      break;
    }
  }
  if (end < 0) return null; // no terminator → whole body is one sentence
  const sentence = flat.slice(0, end).trim();
  // Hide when the first sentence IS the whole body (one-sentence clip).
  if (sentence.length >= flat.length) return null;
  return sentence;
}

/**
 * First-sentence payload for a clip, or undefined for images / empty
 * bodies / single-sentence clips so the send-to row hides.
 */
export function firstSentenceForClip(c: SentenceClip | null | undefined): string | undefined {
  if (!c || c.kind === "image") return undefined;
  const body = typeof c.content === "string" ? c.content : "";
  return firstSentenceOf(body) ?? undefined;
}

/**
 * Last sentence of `body`, or null when there isn't a clean separate
 * one. The conclusion / CTA / sign-off twin of firstSentenceOf: split
 * the body into sentences and take the final non-empty one. Same flatten
 * (newlines → spaces) and single-letter-initial guard so the two agree on
 * sentence boundaries. Returns null when the body is one sentence (the
 * last IS the whole body — plain Copy covers it).
 */
export function lastSentenceOf(body: string): string | null {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat === "") return null;
  const ends: number[] = []; // index AFTER each terminator
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === "." || ch === "!" || ch === "?") {
      const next = flat[i + 1];
      const atEnd = next === undefined;
      if (!atEnd && next !== " ") continue;
      if (ch === "." && !atEnd) {
        const before = flat.slice(0, i);
        if (/(^|\s)[A-Za-z]$/.test(before)) continue;
      }
      ends.push(i + 1);
    }
  }
  // No interior boundary → one sentence; or only a single terminator at
  // the very end → still one sentence. Need a cut BEFORE the final text.
  const cut = ends.length >= 2 ? ends[ends.length - 2] : ends.length === 1 && ends[0] < flat.length ? ends[0] : -1;
  if (cut < 0) return null;
  const sentence = flat.slice(cut).trim();
  if (sentence === "" || sentence.length >= flat.length) return null;
  return sentence;
}

/**
 * Last-sentence payload for a clip, or undefined for images / empty /
 * single-sentence clips so the send-to row hides — gate pairs with
 * firstSentenceForClip so the two surface together for multi-sentence prose.
 */
export function lastSentenceForClip(c: SentenceClip | null | undefined): string | undefined {
  if (!c || c.kind === "image") return undefined;
  const body = typeof c.content === "string" ? c.content : "";
  return lastSentenceOf(body) ?? undefined;
}

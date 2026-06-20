/**
 * Smart search-string parser.
 *
 * Lets the user type filters inline in the search box, e.g.:
 *
 *   foo bar kind:image host:github.com tag:code is:pinned before:7d
 *
 * Supported operators:
 *   - kind:text|image|link
 *   - host:<hostname>           (matches `hostFrom(source.url)` exactly)
 *   - tag:<tagname>             (repeatable — every tag must be present)
 *   - is:pinned|redacted|ocr    (repeatable)
 *   - before:<duration>         (older than N — e.g. before:7d, before:2h)
 *   - after:<duration>          (newer than N)
 *
 * Anything left over is the free-text needle (matched against
 * preview/content/title/url/nearbyText/tags/ocrText).
 *
 * All matching is local; nothing leaves the device.
 */
import type { ClipItem, ClipKind } from "./types";
import { hostFrom } from "./util";

export interface ParsedQuery {
  freeText: string;
  kind?: ClipKind;
  host?: string;
  tags: string[];
  pinnedOnly: boolean;
  redactedOnly: boolean;
  ocrOnly: boolean;
  /** Unix ms — only clips older than this. */
  before?: number;
  /** Unix ms — only clips newer than this. */
  after?: number;
}

const TOKEN_RE = /\S+/g;
const DURATION_RE = /^(\d+)([smhdw])$/;

function parseDuration(s: string): number | null {
  const m = DURATION_RE.exec(s.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const mult =
    unit === "s"
      ? 1_000
      : unit === "m"
        ? 60_000
        : unit === "h"
          ? 3_600_000
          : unit === "d"
            ? 86_400_000
            : 7 * 86_400_000;
  return n * mult;
}

export function parseQuery(raw: string): ParsedQuery {
  const out: ParsedQuery = {
    freeText: "",
    tags: [],
    pinnedOnly: false,
    redactedOnly: false,
    ocrOnly: false,
  };
  const leftover: string[] = [];
  const now = Date.now();
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(raw)) !== null) {
    const tok = m[0];
    const colon = tok.indexOf(":");
    if (colon <= 0 || colon === tok.length - 1) {
      leftover.push(tok);
      continue;
    }
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1);
    if (key === "kind") {
      const k = val.toLowerCase();
      if (k === "text" || k === "image" || k === "link") out.kind = k;
      else leftover.push(tok);
    } else if (key === "host") {
      out.host = val.toLowerCase().replace(/^www\./, "");
    } else if (key === "tag") {
      const t = val.trim();
      if (t) out.tags.push(t);
    } else if (key === "is") {
      const v = val.toLowerCase();
      if (v === "pinned") out.pinnedOnly = true;
      else if (v === "redacted") out.redactedOnly = true;
      else if (v === "ocr") out.ocrOnly = true;
      else leftover.push(tok);
    } else if (key === "before") {
      const d = parseDuration(val);
      if (d != null) out.before = now - d;
      else leftover.push(tok);
    } else if (key === "after") {
      const d = parseDuration(val);
      if (d != null) out.after = now - d;
      else leftover.push(tok);
    } else {
      leftover.push(tok);
    }
  }
  out.freeText = leftover.join(" ").trim();
  return out;
}

/**
 * Apply a parsed query to an array of clips. Designed to run on the result of
 * `listClips({ limit: large })` — operates on the already-loaded list so we
 * don't fork the IDB query layer for what is fundamentally a UI concern.
 *
 * `extraPinnedOnly` lets the existing "pinned-only" toggle stack with
 * `is:pinned` (logical AND).
 */
export function applyQuery(
  clips: ClipItem[],
  q: ParsedQuery,
  opts: { extraPinnedOnly?: boolean; extraTag?: string | null; extraKind?: ClipKind | "all" } = {},
): ClipItem[] {
  const needle = q.freeText.toLowerCase();
  const pinnedOnly = q.pinnedOnly || !!opts.extraPinnedOnly;
  const kind = q.kind ?? (opts.extraKind && opts.extraKind !== "all" ? opts.extraKind : undefined);
  const extraTag = opts.extraTag ? opts.extraTag.trim() : null;
  return clips.filter((c) => {
    if (pinnedOnly && !c.pinned) return false;
    if (kind && c.kind !== kind) return false;
    if (q.host && hostFrom(c.source.url) !== q.host) return false;
    if (q.redactedOnly && !c.redacted) return false;
    if (q.ocrOnly && !c.ocrText) return false;
    if (q.before != null && c.lastSeenAt >= q.before) return false;
    if (q.after != null && c.lastSeenAt <= q.after) return false;
    for (const t of q.tags) if (!c.tags.includes(t)) return false;
    if (extraTag && !c.tags.includes(extraTag)) return false;
    if (needle) {
      const hay = [
        c.preview || c.content,
        c.source.title,
        c.source.url,
        c.source.nearbyText,
        c.tags.join(" "),
        c.ocrText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/** Human-readable summary of a parsed query, for status hints. */
export function describeQuery(q: ParsedQuery): string {
  const bits: string[] = [];
  if (q.kind) bits.push(q.kind);
  if (q.host) bits.push(`@${q.host}`);
  for (const t of q.tags) bits.push(`#${t}`);
  if (q.pinnedOnly) bits.push("pinned");
  if (q.redactedOnly) bits.push("redacted");
  if (q.ocrOnly) bits.push("ocr");
  if (q.before) bits.push("older");
  if (q.after) bits.push("recent");
  return bits.join(" · ");
}

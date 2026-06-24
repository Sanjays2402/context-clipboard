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
import { hasClipNote } from "./clip-note";
import { extractHashtagsFromNote } from "./tag-from-notes";

export interface ParsedQuery {
  freeText: string;
  kind?: ClipKind;
  host?: string;
  tags: string[];
  pinnedOnly: boolean;
  redactedOnly: boolean;
  ocrOnly: boolean;
  /** Only template clips ({{tokens}}) when true. */
  templateOnly: boolean;
  /**
   * Inverse of `templateOnly`. When true, only clips WITHOUT a
   * `{{token}}` template body match. Useful for filtering noisy
   * snippet/template libraries down to plain, ready-to-paste
   * captures (e.g. "show me everything that's NOT a template").
   * Mutually-exclusive with `templateOnly` by definition; if both
   * flags are set the result is always empty (the parser preserves
   * the user's intent so they see the empty result explicitly
   * rather than silently dropping one operator).
   */
  noTemplate: boolean;
  /** Only clips with an `expiresAt` set when true. */
  expiringOnly: boolean;
  /**
   * Surface archived clips. When false (the default), `applyQuery`
   * drops archived rows so the daily list stays uncluttered. When
   * the user types `is:archived` this flips on and we INCLUDE
   * archived rows AND require the bit, giving them an archive-only
   * view.
   */
  archivedOnly: boolean;
  /**
   * Parity twin of `kind:link`. The other `is:` operators
   * (pinned/redacted/template/expiring/archived) read as
   * "predicate of the clip"; `kind:` reads as "what is the
   * clip". For link clips both forms make sense and users
   * routinely mis-remember which family they belong to — so we
   * accept `is:link` as a synonym (no `is:text` / `is:image`
   * mirrors, since both already have their own first-class
   * filter chips in the popup row and `kind:` is the natural
   * spelling there). Setting this flag is equivalent to
   * `kind: "link"` AT APPLY TIME. Parser keeps the two
   * representations distinct so `kind:image is:link` ends up
   * impossible (intentional — see applyQuery's intersection
   * logic).
   */
  linkOnly: boolean;
  /**
   * Surface clips carrying the "ask before deleting" lock bit.
   * Joins the `is:` family alongside pinned/redacted/template/
   * expiring/archived/link so users with the new per-clip lock
   * affordance (shipped last tick) can audit "what have I marked
   * irreplaceable?" in one keystroke. Pure predicate filter —
   * `c.locked === true` is the gate (strict, mirrors db.toggleLock
   * + clip-lock.partitionLocked so a truthy non-boolean never
   * accidentally surfaces here).
   */
  lockedOnly: boolean;
  /**
   * Inverse of `lockedOnly`. When true, only clips WITHOUT the
   * lock bit match. Useful for the "what should I lock?" review
   * pass: after auditing `is:locked` clips, flipping to
   * `is:unlocked tag:irreplaceable` (or similar) surfaces the
   * candidates for the new lock. Mutually-exclusive with
   * `lockedOnly` by definition; if both flags are set the result
   * is always empty (parser preserves intent — same contract as
   * `is:template is:notemplate`). Strict gate: `c.locked !== true`
   * matches everything except the explicit `true` bit, including
   * `undefined`, `false`, or a truthy non-boolean (which would
   * also fail the `is:locked` strict check, so semantics stay
   * consistent end-to-end).
   */
  unlockedOnly: boolean;
  /**
   * Surface clips carrying a non-empty free-form `note` (the
   * detail-view textarea field). Joins the `is:` family alongside
   * pinned/redacted/template/expiring/archived/link/locked/unlocked
   * so the user can review every clip they've annotated in one
   * keystroke — the natural workflow for "did I leave a caveat I
   * should re-read?" Audit pass.
   *
   * Strict gate via `hasClipNote(c)` (lib/clip-note.ts): `typeof
   * c.note === "string"` AND `c.note.trim().length > 0`. Mirrors
   * the sanitizer's empty contract so a clip with an accidentally
   * empty-string note (shouldn't happen — setClipNote deletes the
   * field on empty — but defensive) doesn't accidentally surface
   * here. Predicate is the same one renderNoteRow uses to decide
   * the Clear-button visibility, so the search filter and the
   * detail-view paint can never disagree.
   */
  notedOnly: boolean;
  /**
   * Inverse of `notedOnly`. When true, only clips WITHOUT a non-empty
   * `note` field match. Useful for the "what should I annotate?"
   * review pass — after auditing `is:noted` clips, flipping to
   * `is:nonoted host:<x>` (or `is:nonoted is:locked` for the
   * "irreplaceable but uncommented" set) surfaces the candidates that
   * deserve a caveat. Mutually-exclusive with `notedOnly` by
   * definition; if both flags are set the result is always empty
   * (parser preserves intent — same contract as
   * `is:template is:notemplate` and `is:locked is:unlocked`).
   *
   * Strict gate: `!hasClipNote(c)` — matches every clip where the
   * note isn't a non-empty trimmed string, which is the exact
   * complement of the `is:noted` gate. Together the two operators
   * partition the clip space: every clip passes exactly one of
   * `is:noted` / `is:nonoted`, and the AND of both is always empty.
   */
  nonotedOnly: boolean;
  /**
   * Surface clips whose `note` contains at least one extractable
   * `#hashtag` token (same grammar as bulk Tag-from-notes /
   * Cmd+K hashtag discovery). Implies `is:noted` (a clip with no
   * note can't have inline hashtags) but is STRICTER — `is:noted`
   * surfaces every annotated clip; `is:hashtags` surfaces only the
   * subset whose annotation carries promotable inline tags.
   *
   * Why a dedicated operator (vs `is:noted` + a content needle
   * search for "#")?
   *   - Free-text `#` would match any literal hash in note text,
   *     URL fragments, code snippets, etc. The hashtag grammar
   *     (word-boundary, leading punctuation set, char class) is
   *     a tight gate the tag-from-notes / hashtag-discovery
   *     primitives already enforce — surfacing it as a parsable
   *     operator means the search filter and the promote actions
   *     agree on what counts as a hashtag.
   *   - This is the "candidates for Tag-from-notes" view —
   *     filtering down to clips where running the bulk action
   *     would actually DO work. Pair with `host:<x>` for
   *     per-site cleanup passes, or with `is:notenewer:7d` for
   *     "what hashtags did I write THIS week that I should
   *     promote?".
   *
   * Composition: gate is `extractHashtagsFromNote(c.note).length >
   * 0`. Same single source of truth as Tag-from-notes promotion
   * — if a clip surfaces under `is:hashtags`, running
   * Tag-from-notes on it WILL find at least one hashtag. Doesn't
   * distinguish "would promote" vs "already structured" — that's
   * the discovery report's job; this operator just gates on
   * hashtag presence.
   */
  hashtagsOnly: boolean;
  /**
   * Inverse of `hashtagsOnly`. When true, only clips whose `note`
   * is empty OR has no extractable `#hashtag` tokens match. The
   * complement is over the NOTE-hashtag axis: clips with notes
   * containing only prose pass, clips without notes pass, clips
   * with hashtag-bearing notes fail.
   *
   * Useful for filtering OUT the messy "still-tagging-inline"
   * tail: `is:noted is:nohashtags` surfaces the "clean" noted
   * subset (real prose annotation, no inline tag pollution).
   *
   * Mutually-exclusive with `hashtagsOnly`: a clip's note either
   * has hashtags or it doesn't. Combined the result is always
   * empty by AND-semantics — same intent contract as `is:noted
   * is:nonoted`.
   */
  noHashtags: boolean;
  /**
   * Surface clips whose HOST is governed by a site rule with
   * `autoLock: true` under first-match-wins ingest semantics.
   * Distinct from `is:locked` (per-clip bit) — answers "will this
   * be locked on next re-capture?" / "is this from a site I've
   * configured for auto-lock?".
   *
   * The actual predicate is built outside the parser (in
   * lib/host-locked.ts) because it needs the live `SiteRule[]`
   * list from IDB. The parser just flips the flag; applyQuery's
   * caller passes a `hostLockedPredicate` via opts when the flag
   * is set. When the predicate isn't supplied at apply-time
   * (e.g. a test calling applyQuery with stub data and no rules),
   * the gate falls open — the flag becomes a no-op rather than
   * silently empty-ing the result set, which would be misleading.
   * The popup always passes one when the flag is set.
   *
   * Mutually-orthogonal with `is:locked` and `is:unlocked` — they
   * gate on different things (rule presence vs current clip bit),
   * so combining them is meaningful: `is:hostlocked is:unlocked`
   * surfaces drift ("hosts I've configured for auto-lock but
   * which somehow have unlocked clips"), and `is:hostlocked
   * is:locked` surfaces alignment ("locked clips from configured
   * hosts").
   */
  hostLockedOnly: boolean;
  /**
   * Surface clips whose HOST is governed by a site rule with
   * `autoPin: true` (under first-match-wins). Companion to
   * `hostLockedOnly` — same cross-store join shape, different
   * rule flag. Answers "is this from a site I've configured to
   * auto-pin every capture?" — useful for verifying a freshly-
   * added rule, or auditing the rules-vs-state alignment when
   * paired with `is:pinned` (alignment) / `is:unlocked`-style
   * negation (drift) — though we don't have a generic negation
   * operator yet, `is:hostpinned tag:not-pinned` works as a hack.
   *
   * Predicate is supplied via `opts.hostPinnedPredicate` at apply
   * time (same fall-open contract as hostLockedPredicate).
   */
  hostPinnedOnly: boolean;
  /**
   * Surface clips whose HOST is governed by a site rule with
   * `autoRedact: true`. Same shape as the other host-rule
   * operators. Answers "is this from a site where I've set
   * privacy auto-redact?" — useful for review passes ("am I
   * actually capturing the right level of redaction on
   * sensitive sites?") and for the "I added a rule, did it
   * stick?" verification flow.
   *
   * Combined with `is:redacted`: alignment view. Combined with
   * a hypothetical "not redacted" filter: drift view (rule
   * says redact, clip wasn't redacted — usually means the rule
   * was added AFTER the clip landed, since ingest is the only
   * place autoRedact applies).
   */
  hostRedactedOnly: boolean;
  /**
   * Surface clips whose HOST is governed by a site rule with
   * `autoScrubOrigin: true`. Same shape as the other host-rule
   * operators. Answers "is this from a site where I've set the
   * origin-scrub rule?" — for the workflow where the user wants
   * to verify which sites are configured to strip source URL/
   * title/nearbyText on capture (so the clip content survives
   * but the page metadata doesn't leak).
   */
  hostScrubbedOnly: boolean;
  /**
   * Lower bound on the length of `c.note` (trimmed) when set.
   * Triggered by `is:notelonger:N` — surfaces clips whose note is
   * STRICTLY longer than N characters (>=N+1). Implies `is:noted`
   * (a clip without a note has length 0, which never satisfies
   * `> N` for N >= 0). Useful for finding the essay-length notes
   * the user wrote ages ago and might want to revisit / trim.
   *
   * `is:notelonger:0` is equivalent to `is:noted`. Negative N is
   * normalized to 0 (so `is:notelonger:-5` matches every noted
   * clip). The exact length is measured POST-sanitize (trim +
   * control-char strip) to match what's actually stored.
   *
   * When both `noteLongerThan` and `noteShorterThan` are set the
   * filter is AND-semantics: the note must be > longer AND <
   * shorter. With contradictory bounds (e.g. longer=100,
   * shorter=10) the result is empty — same intent contract as
   * `is:noted is:nonoted`.
   */
  noteLongerThan?: number;
  /**
   * Upper bound on the length of `c.note` (trimmed) when set.
   * Triggered by `is:noteshorter:N` — surfaces clips whose note
   * is STRICTLY shorter than N characters (<=N-1). Implies
   * `is:noted` (a clip without a note has no note to be "shorter
   * than N" — the filter is about the note's length, not its
   * absence; use `is:nonoted` for absence). Useful for finding
   * the one-word reminders / sticky-note style notes the user
   * wants to triage into proper tags.
   *
   * `is:noteshorter:0` matches nothing (no note has length < 0).
   * Pairing with `is:noted` is implicit — we require a note to
   * exist BEFORE measuring its length, so an absent note never
   * satisfies the filter even with a generous `is:noteshorter:
   * 10000` bound.
   */
  noteShorterThan?: number;
  /**
   * Unix ms — only clips whose `noteUpdatedAt` stamp is NEWER
   * than this threshold. Triggered by `is:notenewer:<duration>`
   * (e.g. `is:notenewer:7d` -> notes written/updated in the last
   * 7 days). Duration grammar is the same `Nd`/`Nh`/`Nw`/`Nm`/`Ns`
   * shape `before:` and `after:` already accept.
   *
   * Why a dedicated operator (vs `is:noted after:7d`)?
   *   - `after:` gates on `lastSeenAt` (re-copy recency), NOT on
   *     `noteUpdatedAt` (annotation-decision recency). A clip
   *     noted last month then re-copied today would surface in
   *     `is:noted after:1d` but isn't a recently-noted clip.
   *   - The Cmd+K "Show recently noted" command already uses this
   *     chronology axis internally; surfacing it as a parsable
   *     operator lets the user write `is:notenewer:30d` directly
   *     in the search box instead of being limited to the 7-day
   *     default the palette command picks.
   *
   * Implies `is:noted` AND that `noteUpdatedAt` is a finite number
   * — clips noted before the breadcrumb shipped have a note but
   * no stamp, so they correctly fall out of "newer than Nd" by
   * definition (we can't tell WHEN they were noted).
   */
  noteNewerThan?: number;
  /**
   * Unix ms — only clips whose `noteUpdatedAt` stamp is OLDER
   * than this threshold. Triggered by `is:noteolder:<duration>`.
   * Companion to `noteNewerThan` — same chronology axis, opposite
   * direction. Useful for the "what stale caveats might be wrong
   * now?" review pass: `is:noteolder:90d` surfaces notes that
   * haven't been touched in 3 months and might describe a state
   * the codebase has since moved past.
   *
   * Combined with `noteNewerThan`: a band-pass filter. e.g.
   * `is:noteolder:7d is:notenewer:30d` -> notes touched between
   * 7 and 30 days ago (last month's annotation decisions, not
   * this week's). Contradictory bounds (older=10d AND newer=5d)
   * yield an empty set by AND-semantics — same intent contract as
   * `is:notelonger:100 is:noteshorter:10`.
   *
   * Implies `is:noted` AND a finite noteUpdatedAt — legacy unstamped
   * notes can't satisfy "older than Nd" because we can't tell WHEN.
   */
  noteOlderThan?: number;
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
    templateOnly: false,
    noTemplate: false,
    expiringOnly: false,
    archivedOnly: false,
    linkOnly: false,
    lockedOnly: false,
    unlockedOnly: false,
    notedOnly: false,
    nonotedOnly: false,
    hashtagsOnly: false,
    noHashtags: false,
    hostLockedOnly: false,
    hostPinnedOnly: false,
    hostRedactedOnly: false,
    hostScrubbedOnly: false,
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
      else if (v === "template") out.templateOnly = true;
      else if (v === "notemplate") out.noTemplate = true;
      else if (v === "expiring") out.expiringOnly = true;
      else if (v === "archived") out.archivedOnly = true;
      else if (v === "link") out.linkOnly = true;
      else if (v === "locked") out.lockedOnly = true;
      else if (v === "unlocked") out.unlockedOnly = true;
      else if (v === "noted") out.notedOnly = true;
      else if (v === "nonoted") out.nonotedOnly = true;
      else if (v === "hashtags") out.hashtagsOnly = true;
      else if (v === "nohashtags") out.noHashtags = true;
      else if (v === "hostlocked") out.hostLockedOnly = true;
      else if (v === "hostpinned") out.hostPinnedOnly = true;
      else if (v === "hostredacted") out.hostRedactedOnly = true;
      else if (v === "hostscrubbed") out.hostScrubbedOnly = true;
      else if (v.startsWith("notelonger:") || v.startsWith("noteshorter:")) {
        // `is:notelonger:N` / `is:noteshorter:N` — parse N as a
        // non-negative integer. Bad numerics (NaN, decimals, sign,
        // non-digits) fall through to leftover so the user sees
        // their typo as plain text rather than getting silently
        // dropped or applied with a coerced value.
        const colonInVal = v.indexOf(":");
        const op = v.slice(0, colonInVal);
        const raw = v.slice(colonInVal + 1);
        // Strict integer parse — no decimals, no signs, no whitespace.
        // Number(raw) would accept "1.5", " 3 ", "+5", etc; we want a
        // tight grammar so the operator's contract is obvious.
        if (!/^\d+$/.test(raw)) {
          leftover.push(tok);
        } else {
          const n = Math.max(0, parseInt(raw, 10));
          if (!Number.isFinite(n)) {
            leftover.push(tok);
          } else if (op === "notelonger") {
            out.noteLongerThan = n;
          } else {
            out.noteShorterThan = n;
          }
        }
      } else if (v.startsWith("notenewer:") || v.startsWith("noteolder:")) {
        // `is:notenewer:<duration>` / `is:noteolder:<duration>` —
        // duration grammar (`7d`, `2h`, `30m`, `1w`, `45s`) parsed
        // by the existing parseDuration helper for consistency with
        // `before:` and `after:`. Invalid duration string (typo,
        // empty, missing unit) falls through to leftover so the
        // user sees their mistake.
        //
        // Stored as absolute Unix-ms threshold (now - duration) so
        // applyQuery does a straight comparison without re-doing
        // arithmetic per clip.
        const colonInVal = v.indexOf(":");
        const op = v.slice(0, colonInVal);
        const rawDur = v.slice(colonInVal + 1);
        const d = parseDuration(rawDur);
        if (d == null) {
          leftover.push(tok);
        } else if (op === "notenewer") {
          out.noteNewerThan = now - d;
        } else {
          out.noteOlderThan = now - d;
        }
      } else leftover.push(tok);
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
  opts: {
    extraPinnedOnly?: boolean;
    extraTag?: string | null;
    extraKind?: ClipKind | "all";
    /**
     * Predicate returning true when the clip's host is governed
     * by a site-rule whose first-match-wins outcome carries
     * `autoLock: true`. Used by `is:hostlocked`. When the flag is
     * set on the parsed query but the caller didn't supply a
     * predicate (no rules loaded yet / a test calling applyQuery
     * with stub data and no site-rules access), the gate falls
     * open — the flag becomes a no-op rather than silently
     * empty-ing the result set, which would be misleading. The
     * popup always passes one when the flag is set.
     */
    hostLockedPredicate?: (c: ClipItem) => boolean;
    /**
     * Predicate returning true when the clip's host is governed
     * by a site-rule whose first-match-wins outcome carries
     * `autoPin: true`. Used by `is:hostpinned`. Same fall-open
     * contract as `hostLockedPredicate` when missing.
     */
    hostPinnedPredicate?: (c: ClipItem) => boolean;
    /**
     * Predicate returning true when the clip's host is governed
     * by a site-rule whose first-match-wins outcome carries
     * `autoRedact: true`. Used by `is:hostredacted`. Same
     * fall-open contract.
     */
    hostRedactedPredicate?: (c: ClipItem) => boolean;
    /**
     * Predicate returning true when the clip's host is governed
     * by a site-rule whose first-match-wins outcome carries
     * `autoScrubOrigin: true`. Used by `is:hostscrubbed`. Same
     * fall-open contract.
     */
    hostScrubbedPredicate?: (c: ClipItem) => boolean;
  } = {},
): ClipItem[] {
  const needle = q.freeText.toLowerCase();
  const pinnedOnly = q.pinnedOnly || !!opts.extraPinnedOnly;
  // `is:link` is a synonym for `kind: "link"`. When the user mixes a
  // conflicting explicit kind (e.g. `kind:image is:link`), the two
  // filters AND — a clip needs BOTH to match. Since no clip is both
  // `image` AND `link`, that combo returns an empty set by design
  // (matches the same intent contract as `is:template is:notemplate`
  // and surfaces the user's contradiction explicitly rather than
  // silently dropping one operator).
  const kind = q.kind ?? (opts.extraKind && opts.extraKind !== "all" ? opts.extraKind : undefined);
  const extraTag = opts.extraTag ? opts.extraTag.trim() : null;
  return clips.filter((c) => {
    if (pinnedOnly && !c.pinned) return false;
    if (kind && c.kind !== kind) return false;
    if (q.linkOnly && c.kind !== "link") return false;
    // `is:locked` — strict `=== true` so a truthy non-boolean
    // (e.g. a stray `locked: 1` from an older import) doesn't
    // accidentally surface here. Matches the gate clip-lock.ts and
    // db.toggleLock both apply on the write side, so user-facing
    // semantics stay consistent end-to-end.
    if (q.lockedOnly && c.locked !== true) return false;
    // `is:unlocked` — inverse strict check. Matches every clip where
    // the lock bit ISN'T explicitly `true`: undefined, false, or a
    // truthy non-boolean (which the strict `is:locked` gate also
    // rejects, so the two operators are exact complements over the
    // is-locked semantic — no clip ever passes both, no clip ever
    // fails both). When combined with `is:locked` the set is empty
    // by AND-semantics — same intent contract as `is:template
    // is:notemplate`, surfacing the user's contradiction explicitly.
    if (q.unlockedOnly && c.locked === true) return false;
    // `is:noted` — predicate gate via hasClipNote(). Mirrors the
    // detail-view note-row's Clear-button visibility predicate so
    // the filter + the paint can never disagree. Pure type-check +
    // trim — a clip whose note was deleted (setClipNote(undefined))
    // correctly falls out of the noted set on the next read.
    if (q.notedOnly && !hasClipNote(c)) return false;
    // `is:nonoted` — exact complement of `is:noted`. A clip passes
    // this when `hasClipNote(c)` is false: missing note, empty
    // string, whitespace-only, or wrong type. Combined with
    // `is:noted` the AND-semantics empty the result set by
    // construction — same intent contract as `is:template
    // is:notemplate` / `is:locked is:unlocked`.
    if (q.nonotedOnly && hasClipNote(c)) return false;
    // `is:hashtags` / `is:nohashtags` — gate over inline `#hashtag`
    // tokens in the note. Composes extractHashtagsFromNote so the
    // search filter, the Tag-from-notes promotion, and the Cmd+K
    // hashtag-discovery report all agree on what counts as a
    // hashtag (single source of truth). A clip with no note returns
    // [] from the extractor, which means:
    //   - `is:hashtags` filters it out (no extractable tokens)
    //   - `is:nohashtags` passes it (no hashtag-bearing prose)
    // So `is:hashtags` implies `is:noted` but `is:nohashtags` does
    // NOT imply `is:nonoted` — prose-only notes pass `is:nohashtags`
    // because they have no inline tag pollution.
    if (q.hashtagsOnly || q.noHashtags) {
      const tags = extractHashtagsFromNote(c.note);
      if (q.hashtagsOnly && tags.length === 0) return false;
      if (q.noHashtags && tags.length > 0) return false;
    }
    // `is:notelonger:N` / `is:noteshorter:N` — measure the note
    // length AFTER trim (same length the editor + breadcrumb see),
    // gate strictly (`>` / `<`). A clip with no note has trimmed
    // length 0, which never satisfies `> N` for N >= 0 — so
    // `is:notelonger` implicitly requires `is:noted`. For
    // `is:noteshorter` we ALSO require the note to exist (length
    // < N with no note would otherwise accidentally include every
    // clip when N >= 1, which contradicts the user's intent —
    // they typed an operator about NOTE length, not its absence;
    // use `is:nonoted` for absence).
    if (q.noteLongerThan != null) {
      if (!hasClipNote(c)) return false;
      const len = typeof c.note === "string" ? c.note.trim().length : 0;
      if (len <= q.noteLongerThan) return false;
    }
    if (q.noteShorterThan != null) {
      if (!hasClipNote(c)) return false;
      const len = typeof c.note === "string" ? c.note.trim().length : 0;
      if (len >= q.noteShorterThan) return false;
    }
    // `is:notenewer:<duration>` / `is:noteolder:<duration>` —
    // chronology gates over `noteUpdatedAt`. Both require the clip
    // to (a) have a usable note via hasClipNote, AND (b) carry a
    // finite noteUpdatedAt stamp. Clips noted before the breadcrumb
    // shipped (legacy: still noted, no stamp) correctly fall out of
    // both filters by definition — we can't tell WHEN, so they
    // can't satisfy "newer/older than Nd".
    //
    // notenewer: pass iff stamp >= threshold (recent notes)
    // noteolder: pass iff stamp <= threshold (stale notes)
    //
    // Combining the two with non-overlapping thresholds yields an
    // empty set by AND-semantics (same intent contract as
    // `is:notelonger:100 is:noteshorter:10`). Overlapping thresholds
    // (older=30d, newer=7d) yield the intersection band — notes
    // touched between 7 and 30 days ago.
    if (q.noteNewerThan != null) {
      if (!hasClipNote(c)) return false;
      if (typeof c.noteUpdatedAt !== "number" || !Number.isFinite(c.noteUpdatedAt))
        return false;
      if (c.noteUpdatedAt < q.noteNewerThan) return false;
    }
    if (q.noteOlderThan != null) {
      if (!hasClipNote(c)) return false;
      if (typeof c.noteUpdatedAt !== "number" || !Number.isFinite(c.noteUpdatedAt))
        return false;
      if (c.noteUpdatedAt > q.noteOlderThan) return false;
    }
    // `is:hostlocked` — cross-store join via the supplied
    // predicate. Gate falls open when the predicate wasn't
    // supplied so a test calling applyQuery without rules access
    // doesn't silently empty the result set (a misleading
    // failure mode). The popup always supplies one when the flag
    // is set, so the user-facing behaviour stays correct.
    if (q.hostLockedOnly && opts.hostLockedPredicate) {
      if (!opts.hostLockedPredicate(c)) return false;
    }
    // `is:hostpinned` / `is:hostredacted` / `is:hostscrubbed` —
    // same cross-store join shape as `is:hostlocked`, different
    // rule flag. Each predicate is supplied by the popup when the
    // corresponding flag is set; the fall-open behavior (no
    // predicate → no-op gate) mirrors hostLockedPredicate so test
    // callers without site-rules access don't accidentally empty
    // the result set.
    if (q.hostPinnedOnly && opts.hostPinnedPredicate) {
      if (!opts.hostPinnedPredicate(c)) return false;
    }
    if (q.hostRedactedOnly && opts.hostRedactedPredicate) {
      if (!opts.hostRedactedPredicate(c)) return false;
    }
    if (q.hostScrubbedOnly && opts.hostScrubbedPredicate) {
      if (!opts.hostScrubbedPredicate(c)) return false;
    }
    if (q.host && hostFrom(c.source.url) !== q.host) return false;
    if (q.redactedOnly && !c.redacted) return false;
    if (q.ocrOnly && !c.ocrText) return false;
    if (q.templateOnly && !c.template) return false;
    if (q.noTemplate && c.template) return false;
    if (q.expiringOnly && typeof c.expiresAt !== "number") return false;
    // Archive bit: by default we DROP archived clips from the list so
    // the user's daily view stays clean. `is:archived` flips that —
    // we then REQUIRE the bit, giving an archive-only view.
    if (q.archivedOnly) {
      if (!c.archived) return false;
    } else if (c.archived) {
      return false;
    }
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
  if (q.templateOnly) bits.push("template");
  if (q.noTemplate) bits.push("not-template");
  if (q.expiringOnly) bits.push("expiring");
  if (q.archivedOnly) bits.push("archived");
  if (q.linkOnly) bits.push("link");
  if (q.lockedOnly) bits.push("locked");
  if (q.unlockedOnly) bits.push("unlocked");
  if (q.notedOnly) bits.push("noted");
  if (q.nonotedOnly) bits.push("not-noted");
  if (q.hashtagsOnly) bits.push("hashtags");
  if (q.noHashtags) bits.push("no-hashtags");
  if (q.hostLockedOnly) bits.push("hostlocked");
  if (q.hostPinnedOnly) bits.push("hostpinned");
  if (q.hostRedactedOnly) bits.push("hostredacted");
  if (q.hostScrubbedOnly) bits.push("hostscrubbed");
  if (q.noteLongerThan != null) bits.push(`note>${q.noteLongerThan}`);
  if (q.noteShorterThan != null) bits.push(`note<${q.noteShorterThan}`);
  if (q.noteNewerThan != null) bits.push("note-recent");
  if (q.noteOlderThan != null) bits.push("note-stale");
  if (q.before) bits.push("older");
  if (q.after) bits.push("recent");
  return bits.join(" · ");
}

/**
 * Pure URL builders for the detail-view "Send to..." sub-menu.
 *
 * Each builder takes a `ClipItem`-shaped record and returns either
 * a URL/string to act on, or undefined when the action doesn't make
 * sense for that clip (e.g. there's no source URL to share, the clip
 * isn't a link, etc.).
 *
 * No IO, no DOM. The popup wires these into anchor href/onclick and
 * handles the actual navigation / clipboard write. Keeping them pure
 * lets us unit-test the URL math without standing up a browser.
 */

import type { ClipItem } from "./types";
import { detectCodeLang } from "./util";
import { exportFenceLang } from "./lang-override";
import { tableRowForClip } from "./table-row";
import { jsonLineEnvelopeForClip } from "./json-line";
import { curlCommandForClip } from "./curl-command";
import { noteAsMarkdownBlockquote } from "./note-markdown";
import { clipAndNoteAsMarkdown } from "./clip-note-markdown";
import { curlWithNoteCommentForClip } from "./curl-note-comment";
import { clipWeightSummary, clipWeightSummaryMarkdown } from "./clip-weight";
import { clipAsBlockquote } from "./clip-blockquote";
import { firstLineOf } from "./first-line";
import { lastLineOf } from "./last-line";

export interface SendableClip {
  id: string;
  kind: ClipItem["kind"];
  content: string;
  preview?: string;
  source: ClipItem["source"];
  /**
   * Optional per-clip free-form note. When present + non-empty,
   * the "Copy note as Markdown" send-to row surfaces a `> note`
   * blockquote for paste-into-docs workflows where the user wants
   * the caveat to ride along with the content. Hidden otherwise.
   * Mirrors ClipItem.note shape; pure module note-markdown.ts
   * owns the gate + formatting via hasClipNote.
   */
  note?: string;
  /**
   * Optional per-clip force-language override (ClipItem.langOverride —
   * a pinned syntax-tinting language id, or the "none" forced-off
   * sentinel). When present it steers the "Copy as fenced code" send-to
   * row's fence language so the user's hand-correction rides along into
   * the paste, mirroring how copy-as-Markdown honors it. Resolved via
   * lang-override.exportFenceLang; undefined falls back to detectCodeLang
   * exactly as before.
   */
  langOverride?: string;
}

/**
 * Open the clip's source URL in a new tab. Returns undefined when
 * the clip has no fetchable http(s) source (scrubbed clips, manual
 * notes, etc.). Data: / chrome: / file: URLs are excluded — those
 * either can't open in a tab or would leak local paths.
 */
export function urlForOpenSource(c: SendableClip): string | undefined {
  const u = c.source?.url;
  if (!u) return undefined;
  if (!/^https?:\/\//i.test(u)) return undefined;
  return u;
}

/**
 * Google-search the clip's content. Caps the query at 200 chars so
 * we don't fire absurdly long URLs that some browsers refuse. Returns
 * undefined for images (binary content) and for empty payloads.
 */
export function urlForGoogleSearch(c: SendableClip): string | undefined {
  if (c.kind === "image") return undefined;
  const raw = (c.content || "").trim();
  if (!raw) return undefined;
  const q = raw.slice(0, 200);
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/**
 * Search the clip's content *site-scoped* to its source host. Returns
 * undefined when there's no host (scrubbed) or no body to search. Same
 * 200-char cap as the global Google search.
 *
 * Example: a clip captured from docs.github.com → searches Google with
 * `site:docs.github.com "..."`.
 */
export function urlForSiteSearch(c: SendableClip): string | undefined {
  if (c.kind === "image") return undefined;
  const u = c.source?.url;
  if (!u) return undefined;
  let host = "";
  try {
    host = new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
  if (!host) return undefined;
  const raw = (c.content || "").trim();
  if (!raw) return undefined;
  const q = `site:${host} ${raw.slice(0, 180)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/**
 * Compose a new email with the clip's content as the body. Subject
 * defaults to the source title (or a short preview) so the inbox
 * makes sense at a glance. Returns undefined when there's nothing
 * to send (image content can't go in an email body, and a body-only
 * mailto: with no body is useless).
 */
export function mailtoForClip(c: SendableClip): string | undefined {
  if (c.kind === "image") return undefined;
  const body = (c.content || "").trim();
  if (!body) return undefined;
  // Default subject: source title, or the first line of the body
  // trimmed to a sensible width. Avoid line-wrapping issues by
  // collapsing newlines.
  const titleSubject = (c.source?.title || "").replace(/\s+/g, " ").trim();
  const fallbackSubject = (c.preview || body)
    .split(/\n/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const subject = (titleSubject || fallbackSubject || "Clipping").slice(0, 120);
  // mailto: bodies have an implementation-defined length limit (~2 KB
  // in most clients). Cap at 1500 to be safe — anything longer would
  // get truncated by the mail client anyway, and the user can paste
  // the full content if they need it.
  const cappedBody = body.slice(0, 1500);
  return (
    `mailto:?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(cappedBody)}`
  );
}

/**
 * Build a Markdown link string for this clip — `[title](url)`. For
 * link clips, the body IS the URL; for text/image clips with a
 * source URL we wrap their preview as the link text. Returns
 * undefined when there's nothing linkable (no URL, no title to use
 * as anchor text).
 *
 * Used by "Copy as Markdown link" so a user reading a docs page and
 * capturing a snippet can drop a self-citing reference into their
 * notes app with one click.
 */
export function markdownLinkForClip(c: SendableClip): string | undefined {
  let url = "";
  let title = "";
  if (c.kind === "link") {
    url = (c.content || "").trim();
    title = (c.source?.title || c.preview || url).replace(/[\[\]]/g, "").trim();
  } else {
    url = (c.source?.url || "").trim();
    if (!url) return undefined;
    const candidate =
      c.source?.title ||
      (c.preview || c.content || "").split(/\n/)[0].slice(0, 80) ||
      url;
    title = candidate.replace(/[\[\]]/g, "").trim();
  }
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  if (!title) title = url;
  // Escape closing parens in the URL so Markdown parsers don't
  // truncate the link prematurely.
  const safeUrl = url.replace(/\)/g, "%29");
  return `[${title}](${safeUrl})`;
}

/**
 * Markdown-fenced code block for the clip's content. For code-shaped
 * text we detect the language so the fence carries the right tag
 * (` ```python `, ` ```ts `, etc.). Image / empty clips return
 * undefined.
 *
 * Used by "Copy as fenced code" — common workflow for sharing a
 * snippet in a chat / PR comment without re-typing the fence.
 */
export function fencedCodeForClip(c: SendableClip): string | undefined {
  if (c.kind === "image") return undefined;
  const body = (c.content || "").trim();
  if (!body) return undefined;
  // Honor the per-clip force-language override (exportFenceLang) so a
  // clip the user pinned to a language exports with that fence tag — and
  // a clip forced "off" emits a bare ``` fence. No override falls back
  // to detectCodeLang exactly as before.
  const lang = exportFenceLang(c.langOverride, detectCodeLang(body));
  return "```" + lang + "\n" + body + "\n```";
}

/**
 * Serialize this clip as a single-clip JSON envelope shaped like a
 * one-entry `exportAll` bundle — same field names, same versioning.
 * Importing the result with the normal Import button puts the clip
 * back into IDB exactly as it was (id-dedup hits if it's still there,
 * otherwise it inserts cleanly).
 *
 * Why an envelope instead of just the bare ClipItem? Because the bare
 * shape isn't valid input for `importAll` — it expects `{ clips: [...] }`
 * with a version stamp. Wrapping at the source means "Copy as JSON" →
 * paste into Import dialog "just works" with no manual reshaping.
 *
 * Image clips are SUPPORTED here even though most other send-to
 * actions skip them — the JSON carries the data URL inline (same as
 * exportAll). Users who want to share a single image clip with a
 * friend on the same extension can copy → paste → import in one go.
 *
 * The clip's stored ClipItem is what we serialise. Caller passes the
 * full ClipItem (not just SendableClip) via the `full` field on the
 * extended ClipForJson shape — keeping the pure module DOM/IDB-free
 * while still letting the popup hand us a complete object.
 */
export interface ClipForJson extends SendableClip {
  /**
   * The full ClipItem record (or any object) — we round-trip it
   * untouched inside the envelope. Caller is expected to pass the
   * stored ClipItem so the JSON is import-compatible.
   */
  full?: unknown;
}

/**
 * "Copy as plain text (strip tokens)" — for template clips, return
 * the raw token-literal body without expansion. Useful for editing
 * a snippet template offline (paste into your notes app, tweak the
 * `{{tokens}}`, then re-import) and for sharing the TEMPLATE itself
 * vs the expanded value.
 *
 * Only meaningful for clips whose body contains at least one
 * `{{token}}` placeholder — non-template clips would be identical
 * to the default Copy action, so we hide the row entirely (returns
 * undefined). Image and empty clips also return undefined.
 *
 * Pure: no expansion, no clipboard touch, no IO. The popup caller
 * does the actual clipboard write.
 */
const TEMPLATE_TOKEN_PROBE = /\{\{[a-zA-Z][\w]*(?:\|[^}]{0,80})?\}\}/;

export function rawTextForClip(c: SendableClip): string | undefined {
  if (c.kind === "image") return undefined;
  const body = c.content || "";
  if (!body) return undefined;
  // Only surface this row for actual template clips — for plain text
  // it would duplicate the default Copy and clutter the menu.
  if (!TEMPLATE_TOKEN_PROBE.test(body)) return undefined;
  return body;
}

/**
 * "Copy URL only" — for any clip with an http(s) source URL, return
 * just the URL with no body. Useful for sharing the page the snippet
 * came from (not the snippet itself) — common workflow: capture a
 * paragraph from an article, then later want to send just the link
 * so the recipient can read the full piece.
 *
 * Different from "Copy as Markdown link" (which produces
 * `[title](url)` and is best for notes apps) — this is the bare URL
 * for paste into a chat / search box / address bar.
 *
 * For link clips, the body IS the URL, so we return `c.content`.
 * For text/image clips with a source URL, we return `source.url`.
 * Returns undefined when there's no http(s) URL to share — keeping
 * the row off the menu so the user doesn't see a dead action.
 */
export function urlOnlyForClip(c: SendableClip): string | undefined {
  // Link clips carry the URL in content — same shape as urlForOpenSource
  // (which uses source.url) but for link clips the BODY is the URL.
  if (c.kind === "link") {
    const raw = (c.content || "").trim();
    if (!raw) return undefined;
    if (!/^https?:\/\//i.test(raw)) return undefined;
    return raw;
  }
  // For text/image clips we copy the source URL when available.
  const u = (c.source?.url || "").trim();
  if (!u) return undefined;
  if (!/^https?:\/\//i.test(u)) return undefined;
  return u;
}

/**
 * "Copy domain" — just the bare host of the clip's source URL, with a
 * leading "www." trimmed (e.g. "docs.github.com", "stackoverflow.com").
 * Distinct from "Copy URL only" (full URL incl. path + query): when the
 * user wants to remember WHERE a snippet came from without the deep-link
 * noise — citing a source in a doc, allow-listing a host, eyeballing
 * provenance. Link clips read the host from the body URL; text/image clips
 * from source.url. Returns undefined for non-http(s) / scrubbed / hostless
 * clips so the row hides — mirrors urlOnlyForClip's availability shape.
 */
export function domainForClip(c: SendableClip): string | undefined {
  const raw =
    c.kind === "link" ? (c.content || "").trim() : (c.source?.url || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return undefined;
  let host = "";
  try {
    host = new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
  return host || undefined;
}

export function jsonEnvelopeForClip(c: ClipForJson): string | undefined {
  // Envelope requires a payload — if the clip has nothing to put inside
  // (empty content AND no source AND not an image with data URL), skip.
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
    // version: we're shaping like exportAll which carries the DB
    // version. Keep it conservative — version 1 means "you have to
    // accept whatever the importer's current DB version is". The
    // popup-side caller is encouraged to override this with the
    // live DB_VERSION when it has access; the pure builder can't
    // reach DB constants without dragging IDB into this module.
    version: 1,
    clips: [payload],
    exportedAt: Date.now(),
    /**
     * Marker so we can tell at a glance that this bundle came from
     * a "Copy as JSON" action vs a full Export — useful for support
     * questions ("how did this user end up with a 1-clip JSON?").
     */
    source: "send-to-json" as const,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Build the full set of send-to actions for a given clip. Caller
 * filters by `available` before rendering so each row in the menu
 * is actually invokable.
 *
 * Stable shape:
 *   id        — unique per row, used as data-act / React key
 *   label     — visible row label
 *   hint      — sub-label (optional)
 *   kind      — `nav` opens a URL in a new tab; `copy` writes a
 *                string to the clipboard. Callers handle each.
 *   payload   — the URL or string to act on (undefined ⇒ unavailable)
 */
export interface SendAction {
  id: string;
  label: string;
  hint?: string;
  /**
   * - `nav`        → open URL in a new normal tab (active by default)
   * - `copy`       → write the payload string to the clipboard
   * - `incognito`  → open URL in a new private/incognito window
   * - `bg-tab`     → open URL in a new tab WITHOUT stealing focus
   *                  (chrome.tabs.create with active:false)
   */
  kind: "nav" | "copy" | "incognito" | "bg-tab";
  payload?: string;
  available: boolean;
}

/**
 * "Open in private / incognito window" — same URL math as urlForOpenSource,
 * but the caller routes the URL through chrome.windows.create({ incognito: true })
 * instead of chrome.tabs.create. We keep the math here so the unit tests
 * cover the same availability rules (no http(s) → no incognito), and so
 * the popup just looks at action.kind === "incognito" to pick the
 * routing path.
 *
 * Returns undefined when there's no openable http(s) source (scrubbed,
 * note, file:/data: URLs, etc.) — same shape as urlForOpenSource.
 */
export function urlForIncognitoOpen(c: SendableClip): string | undefined {
  return urlForOpenSource(c);
}

/**
 * "Open in new background tab" — same URL math again, but the popup
 * routes through chrome.tabs.create({ active: false }) so the new
 * tab loads in the background without stealing focus from the popup.
 *
 * Why a separate row? When the user has 10+ link clips in the
 * detail-view's "Similar clips" pane (or just wants to triage a list
 * of citations), the default open-source action steals focus and
 * forces them back to the popup for each one. Background-tab opens
 * stack them up and let the user keep reading / picking. Common
 * pattern in research workflows.
 *
 * Same availability rules as urlForOpenSource — no http(s) URL, no
 * row. Tab activation is a UI concern, not a URL concern, so we just
 * delegate to the existing builder.
 */
export function urlForBackgroundTabOpen(c: SendableClip): string | undefined {
  return urlForOpenSource(c);
}

export function buildSendActions(c: ClipForJson): SendAction[] {
  const open = urlForOpenSource(c);
  const incognito = urlForIncognitoOpen(c);
  const bgTab = urlForBackgroundTabOpen(c);
  const google = urlForGoogleSearch(c);
  const site = urlForSiteSearch(c);
  const mail = mailtoForClip(c);
  const mdLink = markdownLinkForClip(c);
  const fence = fencedCodeForClip(c);
  const rawText = rawTextForClip(c);
  const urlOnly = urlOnlyForClip(c);
  // Bare host of the source URL (www. trimmed), e.g. "docs.github.com" —
  // provenance without the deep-link noise. Hidden for hostless clips.
  const domain = domainForClip(c);
  const tableRow = tableRowForClip(c);
  const json = jsonEnvelopeForClip(c);
  const jsonLine = jsonLineEnvelopeForClip(c);
  const curl = curlCommandForClip(c);
  // Combined `curl '...' # note` for clips with BOTH a curlable URL
  // AND a non-empty note. Distinct row from the standalone cURL so
  // the menu surfaces the "with caveat" variant only when it's
  // actually meaningful (note exists). Hides when either side is
  // missing - no dimmed half-broken combo row.
  const curlNote = curlWithNoteCommentForClip(c);
  // Per-clip note → Markdown blockquote. Hidden when the clip has
  // no note (no row to dim out — keeps the menu tight when there's
  // nothing to send). Pure pipeline: hasClipNote gate + line-by-
  // line `> ` prefix; multi-line notes survive intact so paragraph
  // breaks reach the recipient's doc.
  const noteMd = noteAsMarkdownBlockquote(c);
  // Combined fenced-code + blockquote payload for the new "Copy clip
  // + note as Markdown" row. Hides when EITHER the body is unusable
  // (image kind, empty content) OR the note isn't present —
  // dedicated single-purpose rows cover those cases without dimmed
  // half-broken combo rows. Same gate predicates as the standalone
  // rows so the combined row never lies about what's available.
  const clipNoteCombo = clipAndNoteAsMarkdown(c);
  // Single-clip "copy weight" — chars + UTF-8 bytes ("1,240 chars ·
  // 1.2 KB"). Mirrors the bulk copy/export byte receipts for ONE clip:
  // the detail content-stats breadcrumb shows chars/words/lines but no
  // byte figure, and bytes are what matter when pasting into a size-
  // bounded target. Hidden for images (data-URL noise) + empty bodies
  // via clipWeightSummary's null gate — no dimmed dead row.
  const weight = clipWeightSummary(c);
  // Markdown variant of the weight summary — same figures, bold numbers
  // ("**1,240** chars · **198** words · **1.2** KB") for doc/issue/PR paste,
  // mirroring the content-stats Markdown stat-line. Same null gate as the
  // plain weight row so the two surface/hide in lock-step.
  const weightMd = clipWeightSummaryMarkdown(c);
  // Body-as-blockquote: every line prefixed `> ` for quoting a snippet
  // into a doc / PR / chat. Hidden for images + empty bodies. Sibling of
  // the note-md row (which quotes the NOTE); this quotes the CONTENT.
  const quote = clipAsBlockquote(c);
  // First (non-blank) line of a multi-line clip — the heading / signature
  // / subject the user often wants alone. Hidden for images, empty, and
  // single-line clips (plain Copy already covers those).
  const firstLine = firstLineOf(c);
  // Last (non-blank) line of a multi-line clip — the closing total, sign-off,
  // trailing URL, or final prompt the user wants alone. Same gate as first-line
  // (hidden for images, empty, single-line) so the two end-rows pair together.
  const lastLine = lastLineOf(c);
  return [
    {
      id: "open-source",
      label: "Open source URL",
      hint: "New tab",
      kind: "nav",
      payload: open,
      available: !!open,
    },
    {
      id: "open-incognito",
      label: "Open in private window",
      hint: "Incognito tab",
      kind: "incognito",
      payload: incognito,
      available: !!incognito,
    },
    {
      // Background-tab open: same URL as open-source, but the popup
      // routes through chrome.tabs.create({ active: false }) so the
      // new tab loads without stealing focus. Useful for triaging
      // multiple link clips in a row (similar-clips panel, a list of
      // citations) without bouncing back to the popup each time.
      id: "open-bg-tab",
      label: "Open in background tab",
      hint: "New tab, no focus steal",
      kind: "bg-tab",
      payload: bgTab,
      available: !!bgTab,
    },
    {
      id: "site-search",
      label: "Search this site",
      hint: "site:host on Google",
      kind: "nav",
      payload: site,
      available: !!site,
    },
    {
      id: "google",
      label: "Search Google",
      kind: "nav",
      payload: google,
      available: !!google,
    },
    {
      id: "email",
      label: "Compose email",
      hint: "mailto: with body",
      kind: "nav",
      payload: mail,
      available: !!mail,
    },
    {
      id: "md-link",
      label: "Copy as Markdown link",
      hint: "[title](url)",
      kind: "copy",
      payload: mdLink,
      available: !!mdLink,
    },
    {
      id: "url-only",
      label: "Copy URL only",
      hint: "just the page URL",
      kind: "copy",
      payload: urlOnly,
      available: !!urlOnly,
    },
    {
      // Bare source host, "www." trimmed. Lighter than the full URL: cite
      // provenance, allow-list a site, or glance at where a snippet came
      // from without the path/query noise. Hidden for hostless clips.
      id: "domain",
      label: "Copy domain",
      hint: "docs.github.com",
      kind: "copy",
      payload: domain,
      available: !!domain,
    },
    {
      // Build a single-line `curl '...'` for the clip's http(s) URL.
      // URL single-quoted via shellSingleQuote so query strings,
      // fragments, and `$`/backtick chars survive paste into a POSIX
      // shell. Defaults to a bare GET — no -L, no -O, no extra flags —
      // so it's safe to pipe to head/jq without surprising side effects.
      // Hidden when the clip has no shareable http(s) URL (data: /
      // file: / chrome: / about: / scrubbed clips).
      id: "curl",
      label: "Copy as cURL",
      hint: "curl 'https://...'",
      kind: "copy",
      payload: curl,
      available: !!curl,
    },
    {
      // Composite cURL + per-clip note as shell comment. Same URL
      // math as the standalone cURL row (byte-identical first half),
      // with the note appended as ` # <note>` so the caveat rides
      // with the request when the user pastes into a runbook / PR
      // comment / chat. Multi-line notes collapsed to single line
      // (shell `#` comments are line-scoped; a newline would
      // TERMINATE the comment and turn note text into an executable
      // shell command). Hidden when EITHER the URL is unshareable
      // OR the note is missing/empty - both single-purpose rows
      // (curl, note-md) still cover those cases.
      id: "curl-note",
      label: "Copy as cURL with note comment",
      hint: "curl '...' # note",
      kind: "copy",
      payload: curlNote,
      available: !!curlNote,
    },
    {
      id: "fenced-code",
      label: "Copy as fenced code",
      hint: "```lang...```",
      kind: "copy",
      payload: fence,
      available: !!fence,
    },
    {
      // Body as a Markdown blockquote (`> ` per line) — for quoting a
      // captured paragraph into a doc / PR / chat as an attributed quote.
      // The prose sibling of fenced-code (code) and the body-side mirror
      // of note-md (which quotes the note). Hidden for images + empty.
      id: "quote",
      label: "Copy as quote",
      hint: "> blockquote of the body",
      kind: "copy",
      payload: quote,
      available: !!quote,
    },
    {
      id: "raw-text",
      label: "Copy as plain text",
      hint: "strip {{tokens}}",
      kind: "copy",
      payload: rawText,
      available: !!rawText,
    },
    {
      // First non-blank line only — the heading / signature / subject of a
      // multi-line clip. Hidden for single-line clips (plain Copy already
      // gives the line) + images + empty bodies. Saves a copy-then-trim.
      id: "first-line",
      label: "Copy first line",
      hint: "line 1 of a multi-line clip",
      kind: "copy",
      payload: firstLine ?? undefined,
      available: !!firstLine,
    },
    {
      // Last non-blank line only — the closing total, sign-off, trailing URL,
      // or final prompt. End-of-clip mirror of first-line; same gate (hidden
      // for single-line clips, images, empty bodies) so the two surface/hide
      // together. Saves a copy-then-scroll-to-bottom-and-trim.
      id: "last-line",
      label: "Copy last line",
      hint: "final line of a multi-line clip",
      kind: "copy",
      payload: lastLine ?? undefined,
      available: !!lastLine,
    },
    {
      // Format a single-line tabular body (TSV / CSV) as a
      // Markdown table row: `| col1 | col2 | col3 |`. Surfaces
      // only when looksLikeTableRow detects a delimiter — plain
      // sentences and multi-line bodies stay out of the menu.
      id: "table-row",
      label: "Copy as table row",
      hint: "| cell | cell | cell |",
      kind: "copy",
      payload: tableRow,
      available: !!tableRow,
    },
    {
      id: "json",
      label: "Copy as JSON",
      hint: "single-clip envelope",
      kind: "copy",
      payload: json,
      available: !!json,
    },
    {
      // Minified single-line companion to the pretty JSON row above.
      // Same envelope shape, no whitespace. Right place for terminal
      // / jsonl / chat-paste workflows where a 30-line pretty block
      // is the wrong tool. Hidden when there's no payload (mirrors
      // the pretty variant's gate).
      id: "json-line",
      label: "Copy as JSON line",
      hint: "single-line minified",
      kind: "copy",
      payload: jsonLine,
      available: !!jsonLine,
    },
    {
      // "Copy note as Markdown" — wraps the clip's free-form note as
      // a `> ` blockquote so the user pasting a clip into a doc /
      // chat / PR can include the caveat ("staging only", "needs
      // login", etc) alongside the content. Hidden for un-noted
      // clips so the menu stays tight (no dimmed dead row). Multi-
      // line notes preserve paragraph breaks; each line gets its
      // own `> ` so CommonMark / GFM renderers paint the whole
      // block as a single continuous quote.
      id: "note-md",
      label: "Copy note as Markdown",
      hint: "> blockquote of the per-clip note",
      kind: "copy",
      payload: noteMd,
      available: !!noteMd,
    },
    {
      // "Copy clip + note as Markdown" — composite of fenced-code
      // body + blockquote note. Common workflow: dropping a snippet
      // into a PR / doc / chat where the recipient needs BOTH the
      // code AND the caveat that goes with it ("this is the staging
      // token format, not production"). The two halves come from
      // the same pure modules the standalone rows use, so the
      // combined output is byte-identical to what the user would
      // get from running both rows back-to-back. Hides when either
      // side is missing — no dimmed half-broken row.
      id: "clip-note-md",
      label: "Copy clip + note as Markdown",
      hint: "fenced code + > blockquote",
      kind: "copy",
      payload: clipNoteCombo,
      available: !!clipNoteCombo,
    },
    {
      // "Copy weight (chars + bytes)" — the WYSIWYG payload IS the
      // summary string ("1,240 chars · 1.2 KB"), so clicking the row
      // copies exactly what its weight reads. chars = code points
      // (content-stats), bytes = UTF-8 (same helper the bulk receipts
      // use) so every weight figure in the UI counts identically. Hidden
      // for images + empty bodies via clipWeightSummary's null gate.
      id: "weight",
      label: "Copy weight (chars + words + bytes)",
      hint: "1,240 chars \u00b7 198 words \u00b7 1.2 KB",
      kind: "copy",
      payload: weight ?? undefined,
      available: !!weight,
    },
    {
      // "Copy weight as Markdown" — the bold-number sibling of the weight
      // row, mirroring content-stats' Markdown stat-line ("**1,240** chars
      // · **198** words · **1.2** KB") so the figure renders bold in a doc /
      // issue / PR. Same null gate as the plain row (clipWeightSummary), so
      // both surface together for text/link clips and hide together for
      // images + empty bodies.
      id: "weight-md",
      label: "Copy weight as Markdown",
      hint: "**1,240** chars \u00b7 198 words \u00b7 1.2 KB",
      kind: "copy",
      payload: weightMd ?? undefined,
      available: !!weightMd,
    },
  ];
}

/**
 * Promote the most-recently-used action to the top of the list so the
 * user's muscle memory pays off — if they almost always pick "Copy as
 * Markdown link", every Send-to menu should put it first. Stable for
 * everything else (we never re-shuffle the rest of the menu).
 *
 * Pure function. Pass `lastId` from `getSendToLast()` and we'll do
 * the rest. Unknown / empty / unavailable ids no-op (we never want to
 * surface a disabled row at the top — the user can't act on it).
 *
 * Returns a NEW array; the input is untouched. Same `SendAction[]`
 * shape so the popup renderer doesn't care whether it's the natural
 * order or the bumped order.
 */
export function reorderSendActionsByLast(
  actions: SendAction[],
  lastId: string,
): SendAction[] {
  if (!lastId) return actions.slice();
  const idx = actions.findIndex((a) => a.id === lastId);
  if (idx < 0) return actions.slice();
  // Never bump an unavailable action to the top — that would mislead
  // the user (they'd see their favourite action at #1, greyed out,
  // and have to scroll past it). Leave the order alone in that case.
  if (!actions[idx].available) return actions.slice();
  const next = actions.slice();
  const [hit] = next.splice(idx, 1);
  next.unshift(hit);
  return next;
}

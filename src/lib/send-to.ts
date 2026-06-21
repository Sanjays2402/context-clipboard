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

export interface SendableClip {
  id: string;
  kind: ClipItem["kind"];
  content: string;
  preview?: string;
  source: ClipItem["source"];
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
  const lang = detectCodeLang(body) ?? "";
  return "```" + lang + "\n" + body + "\n```";
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
  kind: "nav" | "copy";
  payload?: string;
  available: boolean;
}

export function buildSendActions(c: SendableClip): SendAction[] {
  const open = urlForOpenSource(c);
  const google = urlForGoogleSearch(c);
  const site = urlForSiteSearch(c);
  const mail = mailtoForClip(c);
  const mdLink = markdownLinkForClip(c);
  const fence = fencedCodeForClip(c);
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
      id: "fenced-code",
      label: "Copy as fenced code",
      hint: "```lang...```",
      kind: "copy",
      payload: fence,
      available: !!fence,
    },
  ];
}

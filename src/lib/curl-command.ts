/**
 * "Copy as cURL" — single-line `curl 'https://example.com'` for any
 * clip with an http(s) URL we can act on.
 *
 * Why a separate module instead of a couple of lines in send-to.ts?
 * Three reasons:
 *
 *   1. The URL → cURL transform has subtle shell-quoting rules. A bare
 *      `curl https://github.com/foo?q=bar` works for most URLs, but
 *      anything with `&`, `'`, `$`, or backticks needs proper quoting,
 *      and the wrong escape (double-quote when the URL has a `$`)
 *      silently produces a different request. Centralising the math
 *      here means the unit tests catch every corner once.
 *
 *   2. Shape parity with the other "Copy as ..." rows: pure module,
 *      one default export, defensive guards so send-to can stay
 *      declarative.
 *
 *   3. Future variants (curl with method, with headers, with `-O`)
 *      can land in this file without bloating send-to.ts.
 *
 * For link clips the body IS the URL; for text/image clips with a
 * source URL we use that. Anything without an http(s) URL returns
 * undefined so the send-to row stays hidden — copying an empty curl
 * command would be a footgun.
 */

import type { ClipForJson } from "./send-to";

/**
 * Extract the http(s) URL the user would `curl`. Mirrors
 * `urlOnlyForClip` from send-to.ts but kept inline so this module
 * stays a leaf — no cyclic imports.
 *
 * Returns null when there's no shareable URL (scrubbed clips,
 * data:/file:/chrome: schemes, notes with no source). Pure; safe to
 * call repeatedly from tests.
 */
function shareableUrl(c: { kind: string; content: string; source?: { url?: string } }): string | null {
  if (c.kind === "link") {
    const raw = (c.content || "").trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return null;
    return raw;
  }
  const u = (c.source?.url || "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return u;
}

/**
 * Quote a URL for use inside a single-quoted shell argument.
 *
 * Single-quoting in POSIX shells (bash/zsh/sh on Linux + macOS) is
 * the simplest safe wrapper: nothing inside is interpreted EXCEPT a
 * literal `'`, which can't appear inside single quotes at all. The
 * workaround is the well-known `'\''` close-reopen-escape-reopen
 * sequence — splits the single-quoted string, inserts a literal
 * single quote, then resumes single-quoting:
 *
 *   abc'def  →  'abc'\''def'
 *
 * Why not double-quote? Double quotes still interpret `$`, backticks,
 * and `\\`. A URL with `?q=$user` in a double-quoted curl arg would
 * silently expand `$user` to the empty string and request the wrong
 * URL. Single quotes are predictably literal.
 *
 * Why not URL-encode the bad chars? Because the user is the one
 * doing the encoding upstream (the captured URL is already correct
 * for the page they were on). Re-encoding here would corrupt URLs
 * that intentionally carry decoded query strings (`?q=hello world`,
 * `#section title`) — even though such URLs are technically
 * non-canonical, browsers accept them and many APIs return them in
 * Location headers. Shell-quoting preserves the URL byte-for-byte.
 *
 * Caller is expected to have already validated the URL is http(s).
 */
export function shellSingleQuote(s: string): string {
  // Replace each single quote with the close-reopen-escape sequence.
  // The String.replace with a literal `'` argument is hand-checked
  // (no special regex chars to escape) and explicit so a reader can
  // see what we're doing.
  const escaped = s.split("'").join("'\\''");
  return `'${escaped}'`;
}

/**
 * Build a one-line `curl` command for the clip's shareable URL.
 *
 * Defaults:
 *   - GET request (no `-X` flag — `curl <url>` is GET by default).
 *   - No headers, no body, no `-O` (output filename), no `-L`
 *     (follow redirects). Keep it minimal so the user can pipe
 *     to `| head` / `| jq` without unwanted side effects.
 *   - URL single-quoted so query strings (`?q=bar&foo=1`) and
 *     fragments survive paste into any POSIX-ish shell.
 *
 * Returns undefined when there's no shareable URL — the send-to row
 * hides cleanly instead of copying a half-formed command.
 *
 * Shape: `curl 'https://example.com/path?q=1'`
 *
 * The leading `curl ` is part of the payload so the user can paste
 * straight into a terminal. No newline at the end — terminal pastes
 * usually want the cursor on the same line so the user can append
 * flags before pressing Enter (e.g. `... | jq .`).
 */
export function curlCommandForClip(c: ClipForJson): string | undefined {
  const url = shareableUrl(c);
  if (!url) return undefined;
  return `curl ${shellSingleQuote(url)}`;
}

/**
 * True when `curlCommandForClip` would emit a non-empty command for
 * this clip. Mirrors the gate the popup uses to decide whether to
 * render the send-to row. Kept as a separate helper so tests can
 * assert the predicate without re-running the full builder.
 */
export function canCurlClip(c: ClipForJson): boolean {
  return curlCommandForClip(c) !== undefined;
}

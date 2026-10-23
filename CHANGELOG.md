# Changelog

All notable changes to Context Clipboard. The version lives in `package.json`; the build stamps it into both browser manifests.

## Unreleased

### Changed
- **Redesigned popup.** A compact header leaves twice as many clips in view. Each row gets a colored monogram for its source site (no favicons are fetched) and stays on one line of metadata. Row actions float in on hover, and code previews render in monospace.
- Quieter pinned rows and day headers, a one-line footer with a `?` shortcuts button, and a selection bar that fits the popup.
- The detail view's toolbar no longer runs off-screen. Prose renders in the UI typeface, and the clip facts sit in a compact label/value grid.
- A friendly "no results" screen with starter operators replaces the wall of ~40 operators. The cheatsheet uses a single column, and settings are a grouped list.
- The in-page palette uses the same site monograms instead of emoji.

### Fixed
- Prose sentences containing a comma were treated as CSV rows (`is:csv`, the Tabular chip, "Copy as CSV row").
- JavaScript `export function` snippets were detected as shell.
- The settings footer showed a hard-coded old version.
- The Auto-OCR toggle is disabled with a note while OCR is unavailable.
- **"Copy as CSV row" kept quoted cells intact.** A row like `"Smith, John",42` used to split into three broken cells and re-escape them as `"""Smith","John""",42`. Comma rows now follow RFC 4180 quoting. The TSV row, the Markdown table row and bulk "Copy selected as CSV" are fixed the same way.
- **CSV export can no longer carry spreadsheet formulas.** Clip text, page titles and nearby text come from arbitrary web pages. Exported cells that start with `=`, `+`, `-`, `@`, tab or CR now get a leading `'`, so a planted `=HYPERLINK(...)` doesn't run when the file is opened in Excel or Sheets (CWE-1236).
- The extension manifests reported `0.6.2` while the release was `0.6.3`.

### Added
- `npm run package` builds store-ready zips without sourcemaps.
- `npm test` / `npm run check` run the whole test suite, and CI runs it on Linux and Windows for every push and pull request.

## 0.6.3

- **ISO dates in search.** `before:` / `after:` accept calendar dates as well as relative durations: `before:2026-09-01`, `after:2026-01-01T00:00`. Invalid dates (e.g. `2026-02-30`) fall back to free text instead of matching the wrong clips.

## 0.6.2

- **Per-clip privacy redaction.** The shield in the clip detail view masks emails, phone numbers, Luhn-valid card numbers, US SSNs, JWTs and common API tokens (`sk-`, `ghp_`, `AIza`, Slack `xoxb-`, ...). The original is kept locally so you can unmask later.
- **Capture-time auto-redact.** Settings › "Auto-redact PII in captured text." When on, the original is never stored. Redaction is one-way and the unmask button is disabled with a hint.
- A **`redacted` tag** is added automatically so you can filter to scrubbed clips.

## 0.6.1

- **Encrypted exports.** Settings › "Encrypt export with passphrase" wraps the JSON backup in an AES-GCM-256 envelope. Salt and IV are random per export; the key is derived from your passphrase with PBKDF2-SHA256 (250k iterations). Import detects encrypted files and prompts for the passphrase.

## 0.6.0

- **Side panel mode.** A Settings toggle opens the clipboard in Chrome's side panel instead of a popup.
- **Bulk select and actions.** Cmd/Ctrl+click clips to select, then pin, tag or delete in one go. `X` toggles selection on the active clip; `Esc` clears it.
- Chrome Web Store groundwork: LICENSE, PRIVACY.md and per-permission justifications in `docs/store-listing.md`.

## 0.5.0

- **Smart field suggestions.** When you focus the same input on the same site, a chip offers the clip you pasted there last time.
- **Glass UI.** Frosted surfaces, ambient color blobs, cubic-bezier easing.
- **Phosphor-style SVG icons** replace emoji.

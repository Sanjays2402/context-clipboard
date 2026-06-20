# context-clipboard autoship state

This file is the cron loop's only memory between ticks. Keep it short and
truthful. Roadmap items are intentionally chunky — each is a vertical slice
worth shipping, NOT scaffolding. Anything cosmetic-only doesn't belong here.

## Branch

- **Working branch:** `feature/autoship` (off `main`, never merged automatically)
- **Cron identity:** `Cake (cron) <51058514+Sanjays2402@users.noreply.github.com>`
- **No tags. No PRs. No release artifacts.** Just commits on the feature branch.

## Hard invariants (never violate)

- Local-only data. Zero outbound network for clip content.
- Manifest V3. No remote-hosted code, no `eval`-style hacks.
- Privacy posture intact: redaction / allow-block lists / one-way auto-redact.
- TypeScript strict; `tsc --noEmit` + `npm run build` must be green before push.
- Dark-first popup design language. No emoji in extension chrome.

## Architecture at a glance (read before changing)

- `src/background.ts` — MV3 service worker. RPC bus, context menus, side panel,
  ingest + dedup, command shortcut, field-suggestion routing, TTL GC, trash GC.
- `src/content.ts` — copy capture + in-page palette + field-suggestion chip,
  all shadow-DOM isolated.
- `src/popup/popup.ts` — list/detail/settings/bulk UI. Talks to `lib/db` directly
  and to background via `cc-rpc` for cross-store ops (export/import/redact/
  forget-host/TTL).
- `src/lib/db.ts` — IndexedDB (`context-clipboard`, version 4). Stores: `clips`,
  `meta`, `field_map`, `trash`. Use `clipsTx`/`metaTx`/`fieldsTx`/`trashTx`
  helpers.
- `src/lib/util.ts` — hashing, autoTag, redaction regexes (PII + secrets).
- `src/lib/types.ts` — `ClipItem`, `Settings`, `FieldMapEntry`. ClipItem now
  carries optional `template` + `expiresAt` (schema-additive).
- `src/lib/search.ts` — inline-operator parser + applyQuery. Operators:
  kind/host/tag/before/after + is:{pinned,redacted,ocr,template,expiring}.
- `src/lib/templates.ts` — pure `{{token}}` expander. Tokens: date/time/
  datetime/iso/year/month/day/weekday/host/url/title/clipboard/uuid, with
  `|fallback` syntax.
- `src/lib/export.ts` — Markdown + CSV serializers.
- `src/lib/crypto.ts` — AES-GCM-256 envelopes for encrypted export.
- `src/lib/icons.ts` — Phosphor-style inline SVGs (mono-stroke).

## Roadmap (queue — top is next)

Status: ` ` open / `~` in-progress / `x` shipped

### Search & navigation
- [ ] Recent-host quick filter strip (top 5 hosts as toggle pills)  <!-- partially covered by quick chips, still keep -->
- [ ] Jump to host: typing `g github` in search jumps to first github clip

### Capture & enrichment
- [ ] Collections / folders (manual buckets, per-clip multi-membership)
- [ ] Manual quick-tag dropdown when adding notes

### Pasting & flow
- [ ] Paste-stack mode: queue N clips, paste them in order across multiple inputs
- [ ] In-page palette: pin pinned clips at top, dim images you can't paste into text
- [ ] In-page palette: copy as markdown shortcut (`Shift+Enter`)
- [ ] In-page palette: filter by kind (chip strip inside overlay)

### Privacy & security
- [ ] Vault-lock: encrypt IndexedDB at rest with passphrase (session unlock)
- [ ] Custom-pattern test field — paste sample text, see what would redact

### Data lifecycle
- [ ] Smart dedup across `lastSeenAt` window groups (right now only same-hash)
- [ ] Image auto-recapture: rule-based scheduled re-fetch for tracked images

### UI polish (real, not cosmetic)
- [ ] Inline diff for re-captured clips (show what changed vs previous copy)
- [ ] Per-collection storage breakdown (when collections ship)
- [ ] Per-site rule edit (click a row to load it back into the form)

### Shipped (autoship)
- [x] Smart search operators (kind/host/tag/is/before/after) — `c407d53`
- [x] Soft-delete trash with 7-day restore — `1a306bc`
- [x] Quick-filter pill row (pinned / redacted / OCR / images / 24h / top hosts) — `9183ea8`
- [x] Export as Markdown + CSV — `47f75d9`
- [x] Image dimensions + byte size in list/detail/export — `76fb6e7`
- [x] Toast Undo for delete (single/bulk/detail/keyboard) — `62608cf`
- [x] Detail prev/next clip arrows + `[` `]` keys with position pill — `909c903`
- [x] Forget host: bulk soft-delete every clip from a hostname — `248f18a`
- [x] Snippet templates: `{{date}} {{host}} {{url}}` expansion on copy — `6df6a33`
- [x] Per-clip TTL with auto-expiry to trash — `def72c1`
- [x] Saved searches / smart folders (named queries as chips) — `72b7ed7`
- [x] Per-site capture rules (auto-tag/pin/redact/skip) — `97f584c`
- [x] Reveal-once mode for redacted clips (10s with countdown) — `7f37ed1`
- [x] Export filter (pinned / tag / date range / skip images) — `656d25e`
- [x] Result count breakdown when filtering — `ad3b2a1`
- [x] Search-match highlight in previews + detail body — `ec7fb3f`
- [x] Recent search history (5 ghost chips, auto-tracked, debounced) — `f01d4fc`
- [x] Keyboard cheatsheet overlay (press `?`) — `6a033f0`
- [x] Storage breakdown — text / image / link / OCR / trash segments — `82a97a0`
- [x] Select all filtered (footer btn + bulk-bar toggle + Cmd/Ctrl+A) — `54a2c1a`
- [x] Cmd/Ctrl+K command palette — fuzzy action launcher — `1c3fb04`
- [x] List sort options (recent/oldest/hits/size/A-Z) — `3d2bce9`
- [x] Anti-shoulder-surf blur (hover-to-reveal previews) — `7b57e89`
- [x] Import dedup by content hash with merge — `57d3fa4`
- [x] Omnibox `cc` keyword for quick capture + recall — `74201a6`
- [x] Pin all filtered / Unpin all filtered (via Cmd+K palette) — `1c3fb04`
- [x] Clear all filters (single action via Cmd+K) — `1c3fb04`
- [x] Tag all filtered (palette command, union-merge) — `7fcbae8`
- [x] Per-site custom redaction patterns (user-defined regex list) — `a2bc0af`
- [x] Image re-fetch from source URL with dim refresh — `8688224`
- [x] Collapsible long nearby context (show more / less) — `d161fe7`
- [x] Right-click "Paste from Context Clipboard" on editable fields — `757c95e`

## Tick log

(One line per tick. Newest at top.)

<!-- TICKS BELOW -->

- **2026-06-20 15:22 PT** — 5/5 shipped. Tag all filtered: palette
  command, union-merge across visible window with idempotent skip-
  count + 25-clip confirm guard (7fcbae8). Per-site custom redaction
  patterns: new `customPatterns: string[]` on SiteRule, applied
  AFTER built-in PII during ingest with 32-pattern + 200-char caps,
  per-line validation in the settings textarea, and `regex ×N` badge
  on the rule row (a2bc0af, 15/15 applyCustomPatterns sanity pass).
  Image re-fetch button in detail header: new `refetchImage` RPC pulls
  fresh data URL from source URL, re-runs dim probe, swaps detail body
  in place + spinner CSS animation while inflight (8688224, new
  refresh icon). Collapsible long nearby context (>360 chars) with
  "Show more (+N)" / "Show less" toggle backed by `data-full` cache,
  expanded view caps at 280px (d161fe7). Right-click "Paste from
  Context Clipboard" on editable fields — fourth contextMenu entry
  with `editable` scope, reuses existing palette message, content
  script's `pick()` now directly inserts into focused editable
  fields (757c95e). tsc + chrome/firefox builds green.
- **2026-06-20 10:00 PT** — 5/5 shipped. Cmd/Ctrl+K command palette
  with fuzzy matcher, action groups (Navigate/Capture/Privacy/Filter/
  Bulk/Sort/Export), and contextual `available` flags (1c3fb04, 11/11
  palette sanity). Footer sort dropdown with five modes
  (recent/oldest/hits/size/alpha), persisted in IDB meta, integrated
  into the palette (3d2bce9, 13/13 sort sanity). Anti-shoulder-surf
  blur — `blurPreviews` setting + body-level CSS blur with hover-to-
  reveal, accent badge in the header (7b57e89). Import dedup-by-hash
  with hitCount/tag/pin merging on collision; toast surfaces
  `Imported N (X merged · Y already present)` (57d3fa4, 14/14 dedup
  sanity against an in-process IDB shim). Omnibox `cc` keyword for
  address-bar quick capture + autocomplete recall of past omnibox
  notes (74201a6). tsc + chrome/firefox builds green; 11 template +
  11 export + 9 highlight + 13 sort + 11 palette + 14 import-dedup
  sanity pass.
- **2026-06-20 06:58 PT** — 5/5 shipped. Search-needle highlight in previews
  + detail (ec7fb3f, 9/9 sanity), recent search history as auto-tracked
  ghost chips with 900ms debounce (f01d4fc), keyboard cheatsheet overlay
  on `?` with four grouped sections (6a033f0), segmented storage breakdown
  by clip kind with colored legend (82a97a0), select-all-filtered with
  footer pill + bulk-bar toggle + Cmd/Ctrl+A shortcut (54a2c1a). tsc +
  chrome/firefox builds green; 11/11 export-filter + 9/9 highlight sanity
  pass.
- **2026-06-20 03:27 PT** — 5/5 shipped. Saved searches as chips with one-click
  apply (72b7ed7), per-site capture rules with host or `*.host` patterns and
  auto-tag/pin/redact/skip effects (97f584c), reveal-once for redacted clips
  with 10s countdown and snap-back (7f37ed1), export filter with pinned/tag/
  date-range/skip-images and live hint (656d25e), filtered count breakdown
  in the footer (ad3b2a1). tsc + chrome/firefox builds green; 11/11 export
  filter sanity checks pass.
- **2026-06-19 22:19 PT** — 5/5 shipped. Toast Undo for delete (62608cf),
  detail prev/next nav with `[`/`]` (909c903), Forget host (248f18a),
  snippet templates with `{{tokens}}` (6df6a33), per-clip TTL with
  opportunistic GC (def72c1). tsc + chrome/firefox builds green;
  11/11 template sanity checks + 13/13 search sanity checks pass.
- **2026-06-19 21:30 PT** — first tick. Bootstrapped STATE + feature/autoship.
  Shipped 5/5: smart search operators (c407d53), soft-delete trash (1a306bc),
  quick-filter pills (9183ea8), Markdown+CSV export (47f75d9), image dims
  (76fb6e7). tsc + chrome/firefox builds green; 15/15 search sanity tests
  pass.

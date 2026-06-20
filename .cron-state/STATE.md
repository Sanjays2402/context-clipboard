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
- [ ] Fuzzy command palette in popup (`Cmd+K`: actions like "Pin all images", "Clear redacted only")
- [ ] Jump to host: typing `g github` in search jumps to first github clip

### Capture & enrichment
- [ ] Collections / folders (manual buckets, per-clip multi-membership)
- [ ] Image: link back to original `srcUrl` clearly, with re-fetch button
- [ ] Bigger paragraph context: collapse/expand long nearby text
- [ ] Manual quick-tag dropdown when adding notes
- [ ] Capture from address bar (`omnibox` keyword: `cc <text>` jumps to a note)

### Pasting & flow
- [ ] Paste-stack mode: queue N clips, paste them in order across multiple inputs
- [ ] In-page palette: pin pinned clips at top, dim images you can't paste into text
- [ ] In-page palette: copy as markdown shortcut (`Shift+Enter`)
- [ ] Right-click menu on text input: "Paste from Context Clipboard"

### Privacy & security
- [ ] Vault-lock: encrypt IndexedDB at rest with passphrase (session unlock)
- [ ] Custom redaction patterns (user-defined regex list per site rule)
- [ ] Anti-shoulder-surf: blur previews until hover (toggle)

### Data lifecycle
- [ ] Smart dedup across `lastSeenAt` window groups (right now only same-hash)
- [ ] Import merge strategy: dedup by hash on import
- [ ] Bulk re-tag from search (apply tag to every clip in current filter)
- [ ] Pin-all-filtered: one-click pin every clip in current view (mirror of bulk-delete-all)
- [ ] Sort options for the list (oldest first, by hit count, by size)

### UI polish (real, not cosmetic)
- [ ] Inline diff for re-captured clips (show what changed vs previous copy)
- [ ] Per-collection storage breakdown (when collections ship)

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

## Tick log

(One line per tick. Newest at top.)

<!-- TICKS BELOW -->

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

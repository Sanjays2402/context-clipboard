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
- [ ] Saved-search auto-import (a saved search becomes a smart folder pill at the top of the list when active)
- [ ] Detail-view "similar clips" panel (same host OR shared tags, top 5)

### Capture & enrichment
- [ ] Collections / folders (manual buckets, per-clip multi-membership)
- [ ] Manual quick-tag dropdown when adding notes
- [ ] Capture into a chosen collection at copy time (depends on collections)
- [ ] Auto-detect language / lang-specific code-fence for code clips (md export, copy-as-md)
- [ ] Link-preview enrichment: fetch og:title / og:image at capture time for kind=link

### Pasting & flow
- [ ] Paste-stack mode: queue N clips, paste them in order across multiple inputs
- [ ] In-page palette: recent-first ordering when no query (vs server order)
- [ ] In-page palette: per-host suggestion ranking (boost clips captured on the same host as the active tab)
- [ ] Detail-view "Send to..." sub-menu (compose new email / open in editor / share sheet)

### Privacy & security
- [ ] Vault-lock: encrypt IndexedDB at rest with passphrase (session unlock)
- [ ] Per-host scrub rule (auto-scrub origin on every capture from this host)
- [ ] Audit log of redact / scrub / forget operations (last 30 actions)

### Data lifecycle
- [ ] Image auto-recapture: rule-based scheduled re-fetch for tracked images
- [ ] "Find duplicates" panel — list groups w/o auto-merging (review before action)
- [ ] Clip archive mode: pinned-but-hidden state for very-cold pins
- [ ] "Empty trash older than 24h" quick action (between empty-all and 7d retention)

### UI polish (real, not cosmetic)
- [ ] Inline diff for re-captured clips (show what changed vs previous copy)
- [ ] Per-collection storage breakdown (when collections ship)
- [ ] List virtualization for >500 clips (perf)
- [ ] Compact-row toggle (shrink each row to 36px so 30+ fit on one screen)
- [ ] "Pinned hits" sparkline in detail (last 30 days of hitCount, ASCII)

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
- [x] Per-site rule edit (click row to load into form) — `737e947`
- [x] In-page palette kind-filter chips + 1-4 number keys — `0d473fc`
- [x] In-page palette: pinned-first with pin-dot + dashed divider — `0d473fc`
- [x] In-page palette: Shift+Enter / Shift+Click pastes as Markdown — `0d473fc`
- [x] In-page palette: dim image rows when target is editable field — `0d473fc`
- [x] Jump-to-host search command (`g <prefix>` + Enter) — `58b599f`
- [x] Live pattern-test panel inside the rule form — `e056689`
- [x] Smart dedup across windows (palette command, soft-delete losers) — `b2babea`
- [x] Quick-capture from system clipboard (popup button + palette) — `61a9e4f`
- [x] Per-clip "scrub origin" — drop URL/title/context, keep content — `3ce089c`
- [x] Retroactive PII auto-redact for existing clips — `1e13e0b`
- [x] Clip-row right-click menu (pin/copy-md/forget-host/select shortcuts) — `b762904`
- [x] In-page palette remembers last-typed query across opens — `15f227c`

## Tick log

(One line per tick. Newest at top.)

<!-- TICKS BELOW -->

- **2026-06-20 21:03 PT** — 5/5 shipped. Quick-capture from system
  clipboard: new clipboard icon between save-search + note opens
  navigator.clipboard.read (images first, text fallback), tags the
  captured row `quick-capture` by re-reading top-of-list, fails
  loud on empty / no-permission / unsupported with a one-line
  toast; also surfaces in Cmd+K palette as "Capture from system
  clipboard" (61a9e4f). Adds clipboardRead to chrome+firefox
  manifests + three new icons (clipboard/eraser/globe). Per-clip
  "scrub origin": new eraser btn in detail header wipes
  source.url/title/nearbyText/favicon while keeping content +
  tags + pin + OCR; confirms with concrete loss ("permanently
  removes URL + title + context"); tags scrubbed; idempotent;
  re-opens detail to repaint cleared meta rows (3ce089c).
  Retroactive PII auto-redact: "Redact existing" btn in Settings
  + palette "Redact PII in every existing clip" walks every text
  clip, redacts ones with PII via the same redactPii pipeline as
  on-capture but REVERSIBLE (stashes originalContent — data is on
  disk anyway, no privacy cost); inline pre-count for confirm
  ("Redact 14 clips?"); "No PII found" toast when scan is clean
  (1e13e0b, 9/9 retro-redact sanity). Clip-row right-click menu:
  popup-side context menu with copy/copy-md/open/pin-toggle/
  select-toggle/tag/filter-host/forget-host/trash; state-aware
  labels (Pin <-> Unpin, Add <-> Remove from selection); host
  items hide on scrubbed clips; position-clamped to viewport;
  closes on outside click / Esc / scroll / blur; ~80 lines new
  CSS matches palette card visual; cheatsheet picks up new
  Right-click row (b762904). In-page palette remembers last
  query: lib/db gains get/setPaletteLastQuery (single meta row,
  trimmed + 200-char cap, empty clears); background reads it on
  every cc-open-palette dispatch (context-menu + Cmd+Shift+V);
  content pre-fills input + select-alls so first keystroke
  replaces; closePalette fires-and-forgets cc-rpc setPaletteQuery
  to persist; works in side-panel mode too (15f227c, 9/9 palette
  last-query sanity vs in-process IDB shim). tsc + chrome/firefox
  builds green; 11 template + 9 retro-redact + 9 palette-last-q +
  11 export + crypto + redact sanity all pass. Roadmap topped up
  (+11 fresh items across search/capture/paste/privacy/data/
  polish).
- **2026-06-20 17:51 PT** — 5/5 shipped. Per-site rule edit: click a
  row to pre-fill the form, "Update rule" button + Cancel pill +
  accent border on the active row; deleting the in-edit rule resets
  the form (737e947). In-page palette overhaul (single commit, three
  roadmap items): kind-filter chip strip with live counts + 1-4
  number-key shortcuts, pinned clips float to the top with an accent
  pin-dot and dashed divider, Shift+Enter / Shift+Click pastes as
  Markdown (text → fenced block when multiline, link → MD link, image
  → ![alt](url)); image rows dim when launch target is a text field
  (0d473fc). Jump-to-host search: typing `g github` and hitting Enter
  opens the first matching clip in detail; tier order exact > starts-
  with > contains, pinned nudge inside each tier, recency tie-break;
  cheatsheet row + placeholder hint updated (58b599f, 14/14 jump
  sanity). Live pattern-test panel in the rule form: collapsible
  <details> with sample-text textarea + red-highlighted result, hit
  count + invalid-pattern footer, runs on every keystroke in either
  textarea; new pure `findCustomPatternHits` helper returns non-
  overlapping merged ranges (e056689, 23/23 pattern-hits sanity).
  Smart dedup across windows: Cmd+K → "Merge duplicate clips by
  content" groups every clip by hash, survivor = most-recently-seen,
  inherits union of tags + sum of hitCount + OR pinned + earliest
  createdAt; losers soft-deleted via the standard trash path; confirm
  dialog with concrete numbers (b2babea, 25/25 merge-dupes sanity).
  tsc + chrome/firefox builds green; 14 jump + 23 pattern-hits + 25
  merge-dupes + 11 export + 9 highlight + 14 import-dedup + 11
  palette + 13 sort sanity all pass.
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

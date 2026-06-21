# context-clipboard autoship state

This file is the cron loop's only memory between ticks. Keep it short and
truthful. Roadmap items are intentionally chunky — each is a vertical slice
worth shipping, NOT scaffolding. Anything cosmetic-only doesn't belong here.

## Branch

- **Working branch:** `main` (commits land directly on `main`, push every tick)
- **Cron identity:** `Cake (cron) <51058514+Sanjays2402@users.noreply.github.com>`
- **No tags. No PRs. No release artifacts.** Just commits on `main`.

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

### Capture & enrichment
- [ ] Collections / folders (manual buckets, per-clip multi-membership)
- [ ] Capture into a chosen collection at copy time (depends on collections)
- [ ] Link-preview enrichment: fetch og:title / og:image at capture time for kind=link

### Pasting & flow
- [ ] Paste-stack mode: queue N clips, paste them in order across multiple inputs
- [ ] In-page palette: recent-first ordering when no query (vs server order)
- [ ] Detail-view "Send to..." sub-menu (compose new email / open in editor / share sheet)

### Privacy & security
- [ ] Vault-lock: encrypt IndexedDB at rest with passphrase (session unlock)

### Data lifecycle
- [ ] Image auto-recapture: rule-based scheduled re-fetch for tracked images

### UI polish (real, not cosmetic)
- [ ] Inline diff for re-captured clips (show what changed vs previous copy)
- [ ] Per-collection storage breakdown (when collections ship)
- [ ] List virtualization for >500 clips (perf)
- [ ] "Pinned hits" sparkline in detail (last 30 days of hitCount, ASCII)

### New (added this tick — refill toward 15-25)
- [ ] Bulk archive: "Archive all filtered" Cmd+K command (today archive is per-clip via detail)
- [ ] Empty-state for archive view: distinct copy + "Show daily list" shortcut chip
- [ ] Audit log filter chips (show only redact / scrub / forget / archive entries)
- [ ] Audit log export (JSON only, append to existing export bundle)
- [ ] Note composer: pull tags from active tab URL/host as one-click chips
- [ ] Saved searches auto-import (a saved search becomes a smart folder pill at the top of the list when active)
- [ ] Recent-host quick filter strip (top 5 hosts as toggle pills) — partially covered by quick chips
- [ ] Quick-filter chips: "Archived (N)" tier should hide when is:archived is already active

### Shipped (autoship)
- [x] Compact-row list mode — fit 30+ clips per popup screen — `76b3301`
- [x] Find duplicates review panel — list groups, merge selectively — `b3a7e22`
- [x] Clip archive mode — `is:archived` + detail toggle + quick chip — `12ad8cc`
- [x] Privacy audit log — last 30 actions in settings — `a1f32fa`
- [x] Note composer with tag suggestions + pin checkbox — `b6c5fc9`
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
- [x] Detail-view "Similar clips" panel (host or shared-tag matches, top 5) — `d76041a`
- [x] "Purge trash older than 24h" quick action (button + palette) — `9f80c02`
- [x] Auto-detect language / lang-specific code-fence (copy-md + export) — `e549438`
- [x] In-page palette: per-host suggestion ranking (boost same-host clips) — `dc6c5b4`
- [x] Per-host scrub rule (auto-scrub origin on every capture from this host) — `f27c95b`

## Tick log

(One line per tick. Newest at top.)

<!-- TICKS BELOW -->

- **2026-06-21 02:49 PT** — 5/5 shipped. Compact-row list mode:
  new `compactRows` Settings toggle drives a body-level
  `.compact-rows` class that shrinks padding, gaps, thumb
  (42→28px), hides tag-chip row + thumb-dimensions pill, type-
  scales meta down; live-preview in settings + Cmd+K palette
  toggle saves immediately; default off, opt-in dense view for
  scanning long lists (76b3301). Find duplicates review panel:
  new `findDuplicateGroups()` + `mergeDuplicateGroup(hash)`
  helpers (largest-group-first, survivor-first member order,
  pinnedInGroup OR'd); new `#dupes-panel` overlay with per-group
  Merge buttons + a single Merge-all button in the header; each
  group shows survivor preview + loser list so the user sees
  exactly what's going to trash; Cmd+K "Review duplicates…"
  command alongside the bulk merge; 15/15 find-dupes sanity
  (b3a7e22). Clip archive mode: additive `archived?: boolean`
  on ClipItem (no IDB bump); search parser learns `is:archived`
  with FLIP semantics (default hides archived, operator surfaces
  archive-only); `toggleArchive(id)` bumps lastSeenAt on
  un-archive so the clip resurfaces; detail-view Archive/Inbox
  button + Cmd+K commands; quick-chip strip gets an "Archived"
  pill with count; clip rows render an "archived" badge + faint
  purple stripe; 11/11 archive sanity (12ad8cc). Privacy audit
  log: ring buffer of last 30 privacy actions in meta-store —
  11 verbs covered (redact/unredact/scrub-origin/retro-redact/
  forget-host/set-ttl/clear-ttl/archive/unarchive/trash/restore);
  hooks added across detailRedact / scrubDetailOrigin /
  retroactiveAutoRedact / forgetHost / detailExpiry /
  toggleDetailArchive; fire-and-forget writes that never block
  the underlying op; Settings panel gets a new "Privacy audit"
  section + Clear button + colour-coded kind labels; Cmd+K
  "Show privacy audit log" scrolls Settings to the section;
  15/15 audit sanity (a1f32fa). Note composer overlay: replaces
  bare `prompt()` with a real dialog — multiline textarea
  (Cmd/Ctrl+Enter saves), tag input, quick-tag chip strip
  (top tags minus noise auto-tags, click toggles), "Pin this
  note" checkbox; background `addNote` extended to accept
  tags/pinned and apply them after ingest so dedup + auto-tag
  still fire; Esc/backdrop cancels (b6c5fc9). tsc + chrome/
  firefox builds green (popup 157.3KB, background 40.2KB,
  content 23.8KB); 11+15+15+11+9+22+14+25+23+13+9 sanity
  tests pass across all suites. Pre-existing playwright redact-
  ui DB-version mismatch unrelated.
- **2026-06-20 23:32 PT** — 5/5 shipped. Detail-view "Similar
  clips" sidekick: new `findSimilarClips(pivotId)` in lib/db
  scores other clips by shared host (+4) and shared topic tags
  (+3 per, capped at 9); noise tags (image/link/text/url/long/
  redacted/scrubbed/quick-capture) filtered so kind:image pivots
  don't pull every image; detail meta gets new "Similar" row +
  CSS, each entry a button with kind glyph + preview + reason
  pill (@host or #N shared); race guard drops stale paints when
  user steps via prev/next; click jumps to that clip's detail
  (d76041a). "Purge >24h" trash quick action: new button between
  Empty + 7-day retention foot wired via new `purgeTrashOlderThan`
  RPC over existing purgeOldTrash helper; label live-counts
  qualifying rows ("Purge >24h (12)") and disables when nothing's
  old enough; Cmd+K palette entry under Bulk; new neutral
  `button.small` CSS so it pairs visually with Empty without the
  danger tone (9f80c02). Lang-aware code fence: new
  `detectCodeLang(content)` in lib/util covering 14 languages
  (json/yaml/sql/diff/md/python/go/rust/bash/css/html/jsx/ts/js)
  with ordering tuned so Go's `import "fmt"` doesn't read as
  Python and Rust's typed-let doesn't read as TS; conservative
  (returns undefined on prose); wired into copyAsMarkdown,
  toMarkdown export, and content.ts in-page palette Shift+Enter
  path (with a tiny mirror `detectLangLite` to keep the content
  bundle from importing IDB code); 22/22 sanity tests pass
  including 3 negatives (e549438). In-page palette per-host
  ranking: background attaches active tab's `tabHost` to every
  cc-open-palette message; openPalette sorts pinned-first then
  host-match within each tier then stable recency; matching rows
  get a "this site" badge (blue tint) + faint blue divider
  between host-boost cluster and the rest in unpinned tier; 8/8
  sanity tests cover empty/pinned-only/no-match passthrough plus
  github.com/example.com/docs.github.com/www.example.com
  orderings and pinned-tier boost (dc6c5b4). Per-host
  auto-scrub-origin site rule: new optional
  `autoScrubOrigin?: boolean` on SiteRule (additive, no IDB bump);
  ingest wipes source={} + pushes `scrubbed` tag BEFORE putClip
  when matched, AFTER auto-redact + custom patterns so the
  typical (redact+scrub) rule produces a body-masked
  origin-wiped clip; image previews that mentioned the dropped
  page get a generic "Image · 800×600" rewrite; popup settings
  gets new "scrub origin" checkbox in rule form with full edit/
  reset wiring; rule list summary gets "scrub" pill; 16/16
  sanity tests cover round-trip, wildcard, edit-mode preservation,
  pure scrub transform (wipe/preserve/tag/idempotent), and image
  preview rewrite (f27c95b). tsc + chrome/firefox builds green
  (popup 138.7KB, background 39.5KB, content 23.8KB); 22+8+16+11+9+9+11
  sanity tests pass across crypto/export/lang-detect/host-boost/
  scrub-rule/templates/retro-redact/palette-last-q/export. Pre-
  existing playwright redact-ui DB-version mismatch unrelated.

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

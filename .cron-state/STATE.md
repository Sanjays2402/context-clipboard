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
- [ ] Saved searches auto-import (a saved search becomes a smart folder pill at the top of the list when active)
- [ ] Recent-host quick filter strip (top 5 hosts as toggle pills) — partially covered by quick chips
- [x] Quick-filter chips: "Archived (N)" tier should hide when is:archived is already active — `b73a934`
- [x] Empty-state for archive view: distinct copy + "Show daily list" shortcut chip — `b73a934`
- [x] Audit log group-by-day rollup (collapse same-day entries into a single row) — `fabfb98`
- [x] Audit log: per-entry "show me the clip" jump (clipId already in the row, just wire detail open) — `7d3cf61`
- [x] Send-to: add "Open in private/incognito window" row (chrome.windows.create with incognito flag) — `fa72405`
- [x] Send-to: add "Copy as JSON" row (single-clip envelope, mirror exportAll shape) — `9c8aea5`
- [x] Bulk archive: confirm dialog should preview the first 3 clips so the user knows what's about to vanish — `c4da145`
- [x] Note composer: remember "Pin" checkbox state across opens (per-session, no IDB) — `edeed31`
- [ ] Note composer: focus survives quick-tag chip click (already works, but verify on Firefox)
- [x] Detail "Send to…": remember last-picked action so re-open puts it first — `09b0a07`
- [x] Export bundle: include search history alongside audit log — `e7017f3`
- [x] Per-host capture rule edit panel: show "X clips captured under this rule" stat — `9ce47b9`
- [ ] In-page palette: hostBoost should also apply to keywords (title + nearbyText matches from same host get the bump)
- [ ] Detail-view: add a thin "Copies in the last 30 days" sparkline (already on roadmap but worth flagging)

### New (added this tick — refill, 5+ open items)
- [x] Send-to: keyboard navigation inside the menu (↑↓ to step, Enter to fire, Tab focuses first row) — `9f74676`
- [ ] Site-rule row: hover preview of last 3 clips that matched (mini-thumbs)
- [ ] Search history: "pin a recent query" — promote to saved search in one click
- [ ] Audit row: long-press / right-click for "Forget this action" (drop just this entry from the ring)
- [x] Detail Send-to: "Copy as plain text (strip tokens)" — explicit non-templated copy for template clips — `31bef7a`
- [x] Site-rule row: show "last matched X ago" alongside the clip count — `081603f`
- [x] Settings: Privacy audit retention slider (10 / 30 / 60 / 100 entries) — currently hard-coded at 30 — `66aabec`
- [ ] Per-host capture rule: regex pattern test panel should also show what `applyCustomPatterns` would do to a real captured clip from that host (not just a textarea)
- [ ] Import: surface `historyMerged` in a per-section breakdown card (audit, history, clips) instead of just the toast
- [ ] Audit log: filter by clipId so clicking a clip's row in audit pre-filters to its action history

### New (added this tick — refill toward 15-25)
- [ ] Detail Send-to: "Copy as table row" (Markdown table row) for tabular text clips
- [ ] Per-clip lock: a clip can be marked "ask before deleting" (independent of pin)
- [ ] Bulk-bar: live storage delta — "Free 4.2 MB" when delete is the bulk action
- [ ] List drag-to-reorder for pinned clips (manual order within the pinned tier)
- [ ] In-page palette: keyboard shortcut to copy-as-Markdown without modifier (Tab → Enter sequence)
- [x] Detail: copy URL only (strip body, just `c.source.url`) — common workflow for sharing the page, not the snippet — `40a581c`
- [ ] Settings: per-kind retention (text vs image, separate maxUnpinned)
- [ ] Note composer: paste an image directly (drop on textarea creates an image clip with the note as preview)

### New (added this tick — 2026-06-21 15:48 PT refill)
- [ ] Audit row long-press: drop just this entry from the ring (single-entry forget)
- [ ] Settings: per-kind retention (text vs image, separate maxUnpinned)
- [ ] Bulk-bar storage delta: "Free 4.2 MB" hint when delete is the bulk action (popup-only, uses bytes per selected clip)
- [ ] Cmd+K palette: "Jump to next archived clip" — cycles through is:archived results without leaving daily view
- [ ] Site-rule row: hover preview of last 3 clips that matched (mini-thumbs)
- [ ] Per-clip lock: a clip can be marked "ask before deleting" (independent of pin)
- [ ] In-page palette: copy-URL-only with `Alt+Enter` (mirrors detail send-to)
- [ ] Detail-view: copy-as-table-row for clips where content looks tab/comma-separated
- [ ] Saved search: rename inline by clicking the chip label (no `prompt()` dance)
- [ ] Trash row: "Restore + pin" combo button — one click to bring back AND mark important
- [ ] Per-site rule: import/export the rule set (JSON snippet, paste into another device)

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
- [x] Bulk archive: "Archive/Unarchive all filtered" Cmd+K commands — `5b35feb`
- [x] Audit log filter chips (Redact/Scrub/Lifecycle/Host/TTL buckets) — `d7b7e1a`
- [x] Audit log round-trips through JSON export bundle (additive, capped, dedup-by-id) — `91ce7ec`
- [x] Note composer pulls tags from active tab URL+host (host-first, deduped) — `ced3d02`
- [x] Detail-view "Send to…" sub-menu (open/search/site/email/md-link/fence) — `8db76f3`
- [x] Send-to: "Copy as JSON" single-clip envelope (importAll-compatible) — `9c8aea5`
- [x] Send-to: "Open in private window" row with graceful fallback — `fa72405`
- [x] Audit log row click → jump to live / trash / "gone" — `7d3cf61`
- [x] Per-site rule clip-count badge (clickable → host: filter) — `9ce47b9`
- [x] Export bundle includes search history (round-trips Recent chips) — `e7017f3`
- [x] Send-to: keyboard navigation (↑↓/Home/End/Tab trap/type-ahead/Esc) — `9f74676`
- [x] Send-to: remember last-picked action, float it to top with dot cue — `09b0a07`
- [x] Send-to: "Copy as plain text" — strip-tokens row for template clips — `31bef7a`
- [x] Privacy audit retention slider (10/30/60/100) — was hard-coded 30 — `66aabec`
- [x] Bulk-archive confirm previews first 3 clips + "+N more" tail — `c4da145`
- [x] Audit log day-rollup — Today/Yesterday/older groups with fold — `fabfb98`
- [x] Send-to: "Copy URL only" — bare http(s) URL, no body — `40a581c`
- [x] Site-rule row: "last matched X ago" tail alongside clip count — `081603f`
- [x] Note composer: per-session "Pin" checkbox memory — `edeed31`
- [x] Archive view: distinct empty-state + chip-hide redundancy fix — `b73a934`

## Tick log

(One line per tick. Newest at top.)

<!-- TICKS BELOW -->

- **2026-06-21 15:48 PT** — 5/5 shipped. Audit day-rollup: new pure
  `src/lib/audit-rollup.ts` with `groupAuditByDay(entries, now?)` +
  `labelForDay(date, now)` + `totalAuditEntries(groups)`; buckets by
  local-day key (NOT toISOString — UTC-based slicing would split
  midnight-adjacent local entries across two groups in late tz
  offsets), preserves newest-first within each day, sorts groups by
  date desc so a shuffled import (non-monotonic audit timestamps) still
  lands newest-day-first; labels read "Today" / "Yesterday" / "Wed,
  May 18" (or "Wed, May 18 2024" when the year differs — covers
  archaeology + clock-skew), Intl.DateTimeFormat with toDateString
  fallback for exotic envs; defaultOpen hint = Today+Yesterday so
  recent activity stays one click away while older days fold; popup
  `renderAudit` splits into thin filter pass + new
  `renderAuditGroupsHtml` emitting `<div.audit-day>` containers with
  `<button.audit-day-head>` headers carrying chevron + label + count;
  per-day collapse in module-scope `Map<key, bool>` override (NOT IDB —
  collapse is a glance, resets on popup close, matches auditFilter
  chip behaviour); auditList click handler grows leading
  `button.audit-day-head` branch that reads wasOpen from DOM + flips
  the override; CSS uppercase tracked headers, accent-tinted chevron
  when open, hover/focus-visible feedback, indented rows under each
  header; 36/36 audit-rollup sanity covers empty/today-only/mixed
  buckets/sort-desc-on-shuffled/midnight-local-day-boundary/year-
  rollover-label/totalAuditEntries-math/single-entry/labelForDay
  direct probes (fabfb98). Send-to "Copy URL only": new pure
  `urlOnlyForClip(c)` in lib/send-to — link clips return c.content
  (the body IS the URL), text/image clips return c.source.url, both
  validate http(s); undefined for scrubbed/empty-link/non-http(s)
  schemes (data:/file:/chrome:/mailto:)/whitespace-only; new
  `SendAction id="url-only"` between md-link and fenced-code so the
  copy-variants cluster reads md-link / url-only / fenced-code /
  raw-text / json; distinct from md-link (which gives
  `[title](url)`) and from open-source (which navigates) — this is
  the bare URL for paste into chat / search box; send-to sanity grew
  to 111/111 with 17 new url-only cases (40a581c). Site-rule
  "last matched X ago": new `usagesForRules(rules, clips)` in
  lib/db returns `Map<id, {count, lastMatchedAt}>` in one scan
  (max of c.lastSeenAt across attributable clips, same first-match-
  wins semantics as countClipsForRules); kept countClipsForRules
  untouched for backwards-compat — usagesForRules is opt-in;
  popup renderSiteRules switches to usagesForRules, each badge
  grows a softer "last 3d ago" tail right after "12 clips" with
  hover title popping the full timestamp; "unused" muted variant
  unchanged for zero-match rules; drops the now-unused
  countClipsForRules import; CSS .rule-usage-ago — 60% opacity italic;
  rule-count sanity grew to 28/28 with 15 new usagesForRules cases —
  multi-clip max-math/empty-rules/empty-clips/absent-when-zero/no-
  host-skip/first-match-wins parity/max-not-last-iterated (081603f).
  Note composer per-session pin memory: new module-scope
  `notePinSticky` bool; openNoteComposer reads it into the checkbox
  on every open (replaces hard-coded false); saveNoteFromComposer
  stamps on save (happy path); pin-checkbox `change` listener stamps
  on every explicit toggle so a check-then-cancel cycle still sticks
  (intent matters even when draft was abandoned); per spec — NO IDB
  write, popup-close is the reset boundary (matches the audit
  day-collapse model from this same tick) (edeed31). Archive view
  empty-state + redundant chip fix: renderQuickChips wraps the
  Archived push in a `hasOp("is:archived")` guard so the chip stays
  out of the strip while the user is already in archive view (where
  it would just toggle them back out, same visual weight as the
  other filter chips — confusing); render() branches on
  parsed.archivedOnly when currentClips is empty — distinct copy
  ("No archived clips yet." vs "...match this filter.") + new
  `<button.empty-action>` "Show daily list" pill that strips
  is:archived from the search box via whitespace-bound regex (mirrors
  toggleSearchOp's pass so adjacent ops survive); listEl click
  handler grows leading branch for the exit-archive button; CSS
  .empty.archive-empty (softer text-secondary tone) + .empty-action
  (pill-shaped, accent-tinted hover, focus-visible ring); no
  separate sanity test — render-path branching + chip-visibility
  guard covered by tsc + existing archive sanity (b73a934). tsc +
  chrome/firefox builds green (popup 188.7KB +4.9 vs last tick,
  background 44.5KB, content 23.8KB); ALL 21 sanity suites pass —
  514 total checks (11 archive + 20 audit-export + 30 audit-filter
  + 21 audit-retention + 36 audit-rollup + 30 bulk-preview + 32
  context-tags + 11 export + 15 find-dupes + 9 highlight + 27
  history-export + 14 import-dedup + 14 jump + 25 merge-dupes + 11
  palette + 23 pattern-hits + 15 privacy-audit + 28 rule-count + 18
  send-to-reorder + 111 send-to + 13 sort); 16 script tests pass too
  (templates + export + lang-detect + retro-redact + site-rule-scrub
  + palette-host-boost + palette-last-query + redact + crypto +
  popup-encrypt). Pre-existing playwright redact-ui DB-version
  mismatch unrelated.

- **2026-06-21 12:13 PT** — 5/5 shipped. Send-to keyboard nav:
  auto-focus first row on menu open so muscle-memory ↓/Enter
  works without a Tab dance; ArrowDown/Up step with wrap-around,
  Home/End jump to first/last, Tab/Shift+Tab cycle inside the
  menu (focus trap — closing via outside-click already worked
  but Tab used to strand the user on page chrome behind a still-
  open dropdown), type-ahead single-letter focuses next row whose
  label starts with that letter (case-insensitive, wraps, repeated
  presses cycle through same-letter rows, skipped under modifier
  so Cmd+F/Ctrl+R aren't intercepted), Esc restores focus to
  trigger; Enter handled natively (it's a <button>); all keys
  preventDefault+stopPropagation inside the menu so popup-level
  j/k/?/Cmd+K don't fire while steering (9f74676). Send-to remember
  last-picked action: new `get/setSendToLast` meta row in lib/db
  (single key, 32-char id cap, fire-and-forget writes); new pure
  `reorderSendActionsByLast(actions, lastId)` in lib/send-to.ts —
  bumps matching row to index 0, stable for everything else,
  no-op for empty/unknown/unavailable ids (never bump a disabled
  row); openSendMenu awaits getSendToLast and reorders before
  availability filter; click handler stamps setSendToLast BEFORE
  the action fires so a misbehaving incognito/nav path doesn't
  drop the muscle-memory bit; visual cue — `.send-row-recent`
  class + 6px accent dot before label + "Most-recent send-to
  action" tooltip; 18/18 send-to-reorder sanity covers empty /
  first-row / middle-bump / unknown id / array immutability /
  unavailable-skip / double-bump idempotency / image clip matrix
  (09b0a07). Send-to "Copy as plain text" (strip tokens): new pure
  `rawTextForClip(c)` in lib/send-to.ts — returns body unchanged
  for template clips only (kind text + non-empty + at least one
  `{{token}}` placeholder via self-contained TEMPLATE_TOKEN_PROBE
  regex matching `{{name}}` or `{{name|fallback}}` shape), hidden
  on non-template/image/empty so it doesn't duplicate default Copy;
  row sits between fenced-code and json so "copy variants" cluster
  reads tight (md-link/fenced-code/raw-text/json); send-to sanity
  grew to 94/94 with 7 new template-cases (31bef7a). Privacy audit
  retention slider: additive `Settings.privacyAuditRetention:
  10|30|60|100` (default 30, junk values snap to 30 on load); new
  hard ceiling `PRIVACY_AUDIT_MAX = 100`; new `getPrivacyAuditCap()`
  in lib/db reads settings + snaps to allowed quartet;
  `appendPrivacyAuditEntry` + importAll's audit-merge both slice
  to live cap; new exported `trimPrivacyAuditToCap()` shrinks
  oversized log immediately when user lowers slider (without it
  a 100→10 lower-and-stop wouldn't shrink until next append),
  returns drop count for toast; new `<select id="audit-retention">`
  in audit header (10/30/60/100); foot text "Last 30 privacy
  actions" → "Last <N>" from live span; empty-state ("No redact
  actions in the last 30") reads live cap too; live save on
  change writes setting + trims + repaints + toasts ("Audit
  retention set to 10 (trimmed 21)" when lower drops entries);
  21/21 audit-retention sanity covers default/raise/lower/junk/
  no-op/boundary/each-quartet end-to-end (66aabec). Bulk-archive
  confirm previews first 3 clips: refactor into new pure
  `src/lib/bulk-preview.ts` with `buildBulkPreviewMessage(verb,
  totalCount, sample, opts?)` + `truncatePreview(c, max)` —
  multi-line confirm reads "Archive 47 clips? / / First 3: /
    • Hello world / • function foo() {/ • Image · 800×600 / +
  44 more", singular when count=1, defensive on count=0; pulls
  from targets list (only the clips that will flip), not the
  broader filtered window; previewMax 60 + sampleSize 3 by
  default, both opt-overridable; reused-ready for tag-all/pin-
  all/forget-host bulk paths; 30/30 bulk-preview sanity covers
  singular/plural heads + fallback chain + whitespace collapse +
  ellipsis boundary + custom opts + multi-line flatten + empty-
  body fallback + +N tail math (c4da145). tsc + chrome/firefox
  builds green (popup 183.8KB +5.9 vs last tick, background
  44.5KB, content 23.8KB); ALL 20 sanity suites pass — 456 total
  checks (11 archive + 20 audit-export + 30 audit-filter + 21
  audit-retention + 30 bulk-preview + 32 context-tags + 11 export
  + 15 find-dupes + 9 highlight + 27 history-export + 14 import-
  dedup + 14 jump + 25 merge-dupes + 11 palette + 23 pattern-hits +
  15 privacy-audit + 13 rule-count + 18 send-to-reorder + 94
  send-to + 13 sort); 16 script tests pass too (templates + export
  + lang-detect + retro-redact + site-rule-scrub + palette-host-
  boost + palette-last-query + redact + crypto + popup-encrypt).
  Pre-existing playwright redact-ui DB-version mismatch unrelated.

- **2026-06-21 08:57 PT** — 5/5 shipped. Send-to JSON envelope:
  new pure `jsonEnvelopeForClip` + `ClipForJson` shape on
  send-to.ts; popup passes the full ClipItem via the `full`
  override so hitCount/pinned/tags/hash/archived round-trip
  through importAll cleanly; envelope mirrors exportAll
  fields (version/clips/exportedAt) + a `source:"send-to-json"`
  marker; image clips supported (data URL lives in content);
  empty clips drop the row (no payload = no envelope); paste
  into Import dialog "just works" (9c8aea5). Send-to Open
  in private window: new `urlForIncognitoOpen` (mirrors
  open-source availability) + "incognito" kind on SendAction;
  popup routes via `api.windows.create({ incognito: true })`
  with two-tier fallback — chrome.tabs.create when the extension
  isn't allowed in incognito (most common — Chrome's per-extension
  opt-in), window.open as last resort, with honest toast
  "Opened in a normal tab — private mode unavailable" so the
  user knows what happened; row sits right after open-source
  for muscle memory (fa72405). Audit log row jump: every audit
  entry with a clipId now renders as a <button> instead of a
  <div>; click → live store lookup → openDetail() (handles
  archived clips fine), else trash store lookup → action-toast
  with Restore button (4.5s, matches undo dwell) + smooth-scroll
  trash section into view, else "Clip is gone — only the audit
  row remains" toast; non-clip rows (forget-host with clipId="")
  stay as <div>; CSS resets native button chrome + adds
  accent-tinted hover/focus-visible/active feedback only on
  .jumpable rows so the affordance is obvious without overloading
  static rows (7d3cf61). Per-site rule clip-count badge: new
  pure `countClipsForRules(rules, clips)` in lib/db — mirrors
  background `findSiteRuleFor` first-match-wins semantics, caches
  host-per-clip so inner loop stays O(rules) not O(rules*parse),
  returns Map<ruleId,number> with absent rules implicitly 0;
  popup renderSiteRules now does one `listClips({limit:5000})`
  + counts; "N clips" badge with tabular-num formatting renders
  to the right of behavior pills, clickable to `host:<pattern>`
  filter (wildcards strip leading `*.`), "unused" muted variant
  when count=0 (italic, non-clickable, informational); distinct
  .rule-usage CSS palette so the telemetry pill reads different
  from the rule-badge behavior pills; 13/13 rule-count sanity
  covers empty/wildcard/exact/order-matters/first-match-starves-
  second/bare-wildcard-rejection/map-absent-when-zero/apex match
  (9ce47b9). Export bundle includes search history: additive
  `searchHistory?: string[]` on exportAll (snapshot via .slice,
  omitted when empty), import union-merges by trimmed string
  with imported entries FIRST (point of restoration is the
  backup's recent queries top the chip row on the new device),
  same SEARCH_HISTORY_MAX (5) cap as the live push path,
  defensive shape validation drops non-string/empty/whitespace
  entries, new `historyMerged` field on importAll return shape;
  popup import toast picks up the new count (`+ N searches`
  bit) and refreshSearchHistory + renderSearchHistory fire on
  non-zero merge so the Recent strip repaints without a manual
  popup re-open; 27/27 history-export sanity covers export
  attach/omit + import union math + cap enforcement (10→5)
  + defensive validation + whitespace trim before dedup +
  round-trip idempotency + missing-field graceful no-op +
  historyMerged-stays-typed-number (e7017f3). tsc + chrome/
  firefox builds green (popup 177.5KB, background 44.3KB,
  content 23.8KB); ALL 17 sanity suites pass — 362 total
  checks (11 archive + 20 audit-export + 30 audit-filter +
  32 context-tags + 11 export + 15 find-dupes + 9 highlight
  + 27 history-export + 14 import-dedup + 14 jump + 25
  merge-dupes + 11 palette + 23 pattern-hits + 15 privacy-
  audit + 13 rule-count + 79 send-to + 13 sort); 16 script
  tests pass too (templates + export + lang-detect + retro-
  redact + site-rule-scrub + palette-host-boost + palette-
  last-query + redact + crypto + popup-encrypt). Pre-existing
  playwright redact-ui DB-version mismatch unrelated.

- **2026-06-21 05:58 PT** — 5/5 shipped. Bulk archive/unarchive
  all filtered: new `archiveAllFiltered(boolean)` mirrors
  `pinAllFiltered` shape — targets only clips that don't match
  the desired state, confirms above 25, fires per-clip
  privacy-audit entries; two new Cmd+K palette commands (Bulk
  group) gated on whether any unarchived/archived clips are
  visible; archiving leaves lastSeenAt alone for archive
  view's recency-order, unarchiving bumps it so resurfaced
  clips top the daily list (5b35feb). Audit log filter chips:
  six bucket pills in Settings (All / Redact / Scrub /
  Lifecycle / Host / TTL) over the audit ring; chip strip
  hides when empty, zero-count chips drop out, active-click
  snaps back to All; stale-filter guard auto-snaps to All
  when the chosen bucket goes to zero (so a cleared entry
  can't strand the panel empty); summary line reflects active
  filter ("5 of 18" vs "18 actions"); 30/30 audit-filter
  sanity covers bucket mapping + count math + coverage of
  every PrivacyAuditKind variant (forward-compat tripwire)
  (d7b7e1a). Audit log in JSON export bundle: exportAll()
  attaches `privacyAudit` (newest-first, omitted when empty);
  importAll() union-merges by id, drops unknown/invalid
  shapes (defensive against forward-compat exports), sorts by
  `at`, caps at PRIVACY_AUDIT_MAX (30); import return shape
  gains `auditMerged`, popup toast surfaces it + re-renders
  the Settings audit section; 20/20 audit-export sanity
  covers export attach/omit, dedup-by-id on re-import,
  shape validation, 35→30 cap behavior, round-trip
  idempotency, and missing-field backwards compatibility
  (91ce7ec). Note composer pulls tags from active tab:
  new pure `src/lib/context-tags.ts` —
  `tagFromHost` strips www + handles 2-part TLDs
  (.co.uk/.com.au/.ac.jp/…), drops localhost noise;
  `tagsFromUrl` tokenizes path, drops PATH_STOP
  (index/html/page/…), pure-numeric / hex-id / 16-char
  base64-ish / >24-char tokens, dedupes + caps;
  `contextTagsForTab` combines host-first, deduped; composer
  strip now has two segments — "From this tab" (blue chips)
  and "Recent" (existing top-tag history, overlap-pruned);
  graceful fallback when tab access fails (chrome:// /
  extension pages); 32/32 context-tags sanity covers
  host normalisation, URL token extraction, every edge
  case + combined builder (ced3d02). Detail-view "Send
  to…" sub-menu: new pure `src/lib/send-to.ts` —
  6 builders (open source / Google / site-search /
  mailto / Markdown link / fenced code) with per-clip
  availability rules (scrubbed clips drop md-link, images
  drop google/fence, empty clips drop body-driven actions,
  non-http(s) URLs never open as nav); new floating
  dropdown anchored under detail action row, closes on
  Esc/outside-click/item-click/detail-close, re-opens
  fresh each time so action availability tracks the
  current clip; mailto opens via api.tabs.create (FF
  fallback via window.open); copy actions write via
  navigator.clipboard with toast; Cmd+K "Send open clip
  to…" surfaces the same menu; 45/45 send-to sanity
  covers every builder against 5 fixture clip shapes,
  encoding caps (200-char Google / 1500-char mailto),
  www-stripping, paren escaping in md-links, auto-lang
  detection, and the buildSendActions availability matrix
  (8db76f3). tsc + chrome/firefox builds green (popup
  171.9KB, background 42.6KB, content 23.8KB); ALL 16
  sanity suites pass: 11 archive + 20 audit-export +
  30 audit-filter + 32 context-tags + 11 export +
  15 find-dupes + 9 highlight + 14 import-dedup +
  14 jump + 25 merge-dupes + 11 palette + 23 pattern-hits +
  15 privacy-audit + 45 send-to + 13 sort + 11 templates +
  22 lang-detect + 8 palette-host-boost + 9 retro-redact +
  9 palette-last-q + 16 site-rule-scrub + crypto + redact +
  popup-encrypt. Pre-existing playwright redact-ui
  DB-version mismatch unrelated.

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

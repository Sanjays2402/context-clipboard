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
- [x] Search history: "pin a recent query" — promote to saved search in one click — `3281c91`
- [x] Audit row: long-press / right-click for "Forget this action" (drop just this entry from the ring) — `0915171`
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
- [x] Saved search: rename inline by clicking the chip label (no `prompt()` dance) — `5c702c9`
- [x] Trash row: "Restore + pin" combo button — one click to bring back AND mark important — `f33d812`
- [x] Per-site rule: import/export the rule set (JSON snippet, paste into another device) — `d3b2207`

### New (added this tick — 2026-06-21 18:48 PT refill)
- [x] Audit log: filter by clipId so clicking a clip's row in audit pre-filters to its action history — `7af49fe`
- [x] Saved-search chip: drag-to-reorder so frequent ones float left — `4361a8e`
- [ ] In-page palette: "open sidepanel" affordance for tab-switching workflows (Chrome-only)
- [ ] Settings: per-kind retention split (text vs image, separate maxUnpinned)
- [x] Trash row: "Restore everything from this host" — bulk-restore counterpart to forget-host — `b5ca001`
- [ ] Detail-view: per-clip retention overlay (TTL countdown banner when expiresAt is near)
- [ ] Bulk-bar: "Move to collection…" once collections ship (placeholder until then)
- [x] Cmd+K palette: "Open my last saved search" (most-recent-applied) — `24676b8`
- [x] Site-rule form: paste a sample URL → auto-populate hostPattern field — `e0d41dd`
- [x] Audit panel: "Last 7 days" / "Last 30 days" filter alongside the bucket chips — `7af49fe`
- [ ] In-page palette: live token-counter when typing a {{template}} clip body

### New (added this tick — 2026-06-21 21:51 PT refill)
- [x] Detail-view: per-clip retention overlay (TTL countdown banner when expiresAt is near, soft-red below 1h) — `9097d19`
- [ ] In-page palette: live token-counter when typing a {{template}} clip body (count placeholders, show inline pill)
- [ ] In-page palette: "open sidepanel" affordance for tab-switching workflows (Chrome-only, falls back gracefully on FF)
- [ ] Settings: per-kind retention split (text vs image — separate `maxUnpinnedText` / `maxUnpinnedImage` so image-heavy users can free space without trashing snippets)
- [ ] Site-rule form: per-rule "test against active tab" — auto-fill the host + tags from the focused tab's URL
- [x] Search: `is:notemplate` operator (inverse of `is:template`) so the user can filter template-free clips — `795c401`
- [ ] Detail-view: per-clip "Show audit history" jumper — opens settings + scopes audit to this clipId (mirror of alt-click from audit, but starting from the clip)
- [ ] Bulk-bar: "Tag selected → palette tag picker" — opens a chip-grid of the user's top tags for one-click bulk-tagging
- [ ] Search-history chip: drag-to-reorder for the Recent strip (same model as saved-searches; promote frequent ones)
- [x] Cmd+K palette: "Show last forgotten host" — quick path to bulk-restore-from-host for the most-recent forget-host audit entry — `9bfabc5`
- [x] Audit panel: download-as-JSON button (exports just the audit log, not the full bundle, for privacy receipts) — `4bca469`

### New (added this tick — 2026-06-22 01:04 PT refill)
- [x] Bulk-bar: live storage delta — "Free 4.2 MB" when delete is the bulk action (popup-only, uses bytes per selected clip) — `c6cf99f`
- [x] Detail-view: per-clip "Show audit history" jumper — clip → audit scoped to this clipId (mirror of alt-click from audit, starting from the clip side) — `542f879`
- [ ] In-page palette: live token-counter when typing a {{template}} body — inline pill counts placeholders so the user sees what'll expand
- [ ] Settings: per-kind retention split — `maxUnpinnedText` + `maxUnpinnedImage` so image-heavy users can free space without trashing snippets
- [x] Search-history chip: drag-to-reorder for the Recent strip (same DnD model as saved-searches; promote frequent ones) — `632f11d`
- [ ] Bulk-bar: "Tag selected → palette tag picker" — chip-grid of user's top tags for one-click bulk-tagging
- [ ] Site-rule form: per-rule "test against active tab" — auto-fill host + tags from the focused tab's URL
- [ ] Detail-view: per-clip "Pinned hits" sparkline — last 30 days of hitCount as ASCII bars (roadmap-already-listed but worth doing)
- [x] Cmd+K palette: "Jump to next archived clip" — cycles through is:archived results without leaving daily view — `100ec2a`
- [x] In-page palette: copy-URL-only with Alt+Enter (mirrors detail send-to) — `fe5b273`
- [ ] Per-clip lock: a clip can be marked "ask before deleting" (independent of pin)
- [ ] Note composer: paste an image directly (drop on textarea creates an image clip with the note as preview)
- [ ] Audit row long-press: drop just this entry from the ring (covered by right-click — left here as touch-screen affordance)
- [ ] Trash: "Empty just images" / "Empty just text" filter on the trash purge to free quota without losing everything
- [ ] Detail: "Re-capture from URL" — for link/text clips with an http(s) source, re-fetch the title + nearbyText and refresh the preview
- [ ] Site-rule row: hover preview of last 3 clips that matched (mini-thumbs)
- [x] Detail send-to: "Copy as table row" (Markdown table row) for tabular text clips — `a8f7f79`

### New (added this tick — 2026-06-22 05:03 PT refill)
- [ ] Settings: per-kind retention split — `maxUnpinnedText` + `maxUnpinnedImage` (image-heavy users free space without trashing snippets)
- [x] In-page palette: live `{{token}}` counter pill while typing a template body — `2fc067b` (in note composer, not palette)
- [ ] Bulk-bar: "Tag selected → palette tag picker" — chip-grid of user's top tags for one-click bulk-tagging
- [ ] Site-rule form: per-rule "test against active tab" — auto-fill host + tags from the focused tab's URL
- [ ] Per-clip lock: a clip can be marked "ask before deleting" (independent of pin)
- [ ] Detail: "Re-capture from URL" — for link/text clips with an http(s) source, re-fetch title + nearbyText, refresh preview
- [x] Trash: "Empty just images" / "Empty just text" filter on trash purge — free quota without losing everything — `36e519f`
- [ ] Detail-view: per-clip "Pinned hits" sparkline — last 30 days of hitCount as ASCII bars
- [ ] Note composer: paste an image directly (drop on textarea creates an image clip with the note as preview)
- [x] Site-rule row: hover preview of last 3 clips that matched (mini-thumbs) — `4491d2c`
- [ ] Bulk-bar: "Move to collection…" once collections ship (placeholder until then)
- [ ] In-page palette: "open sidepanel" affordance for tab-switching workflows (Chrome-only, falls back gracefully on FF)
- [x] Quick-capture: paste an arbitrary URL → builds a link clip immediately (mirror of the system-clipboard quick-capture but for URLs typed/pasted in the popup) — `3e32c02`
- [x] Detail: "Open all similar clips" — opens detail-view for the top similar result with prev/next nav inheriting the similar set — `eda786d`
- [x] Cmd+K palette: "Jump to prev archived clip" — companion to next-archived, cycles in reverse — `ae8279b`
- [x] Audit panel: per-bucket totals on the chip strip — chip labels like "Redact (12)" / "Trash (8)" so the user sees the distribution at a glance — `a612de8`
- [x] Detail send-to: "Copy as JSON line" — single-line minified JSON envelope for terminal / log piping (vs the multi-line pretty JSON we already have) — `3cd162b`

### New (added this tick — 2026-06-22 12:15 PT refill)
- [ ] Settings: per-kind retention split — `maxUnpinnedText` + `maxUnpinnedImage` (image-heavy users free space without trashing snippets) — recurring
- [ ] Detail-view: per-clip "Pinned hits" sparkline — last 30 days of hitCount as ASCII bars — recurring
- [ ] Note composer: paste an image directly (drop on textarea creates an image clip with the note as preview) — recurring
- [x] Per-clip lock: a clip can be marked "ask before deleting" (independent of pin) — `fe54bb9`
- [ ] Bulk-bar: "Move to collection…" once collections ship (placeholder until then) — recurring
- [ ] Detail: "Re-capture from URL" — for link/text clips with an http(s) source, re-fetch title + nearbyText, refresh preview — recurring
- [ ] Site-rule form: per-rule "test against active tab" — auto-fill host + tags from the focused tab's URL — recurring
- [x] In-page palette: "open sidepanel" affordance for tab-switching workflows (Chrome-only, falls back gracefully on FF) — `2d75a6f`
- [ ] Bulk-bar: "Tag selected → palette tag picker" — chip-grid of user's top tags for one-click bulk-tagging — recurring
- [ ] Audit log: "Mark as resolved" pill — let the user dismiss noise (e.g. test redacts) so the ring stays signal-only
- [x] Detail send-to: "Copy as cURL" — for link clips with http(s) URL, emit a one-line `curl <url>` (defaulting GET; respect query string) — `812b47a`
- [x] Search: `is:link` operator (we have kind:link but not the parity with is:pinned/is:redacted/is:template/is:archived family) — `f27a649`
- [ ] In-page palette: pinned-bias slider in settings (default 1.5×; user can tune the boost)
- [ ] Trash row: "Restore + tag with restore-batch:YYYY-MM-DD" so post-restore review is filterable
- [ ] Settings: enable/disable each Cmd+K command via checkboxes (declutter the palette for users who don't use a feature)
- [ ] Site rules: "Suggest from top hosts" — popup proposes rules for hosts with 10+ captures but no rule yet
- [ ] Detail send-to: "Open similar clips in new tabs" — bulk open all kind=link similar matches at once
- [x] Cmd+K palette: "Pin every clip from active tab's host" — one-shot triage — `9a13dd4`

### New (added this tick — 2026-06-22 15:22 PT refill)
- [ ] Audit log: "Mark as resolved" pill — let the user dismiss noise (e.g. test redacts) so the ring stays signal-only — recurring
- [ ] Settings: per-kind retention split — `maxUnpinnedText` + `maxUnpinnedImage` — recurring
- [ ] Detail-view: per-clip "Pinned hits" sparkline — last 30 days of hitCount as ASCII bars — recurring
- [ ] Note composer: paste an image directly (drop on textarea creates an image clip with the note as preview) — recurring
- [ ] Bulk-bar: "Tag selected → palette tag picker" — chip-grid of user's top tags for one-click bulk-tagging — recurring
- [ ] Detail: "Re-capture from URL" — for link/text clips with an http(s) source, re-fetch title + nearbyText, refresh preview — recurring
- [ ] Site-rule form: per-rule "test against active tab" — auto-fill host + tags from the focused tab's URL — recurring
- [ ] In-page palette: pinned-bias slider in settings (default 1.5×; user can tune the boost) — recurring
- [ ] In-page palette: live `{{token}}` counter pill when typing a template body in the palette search input (mirrors note composer)
- [x] Bulk-bar: lock/unlock selected — flip the `locked` bit on a batch in one click (companion to per-clip lock that just shipped) — `7a75ad8`
- [x] Cmd+K: "Lock all from active host" — companion to pin-from-host for "this site has irreplaceable snippets, mark them all" — `864fd69`
- [x] Detail send-to: "Open in new background tab" (chrome.tabs.create with active:false) — for triaging many link clips — `fb2020d`
- [ ] Quick-capture: paste an image directly (system clipboard image → new image clip) — companion to URL composer
- [ ] Site rules: "Suggest from top hosts" — popup proposes rules for hosts with 10+ captures but no rule yet
- [ ] Audit panel: hover-preview the clip on each row (mini-thumb tooltip) — see WHAT the action was about without jumping
- [x] Bulk-bar: "Export selected" → JSON with just the visible/selected clips (vs the global export-with-filter) — `1cacba4`
- [ ] In-page palette: keyboard shortcut to copy-as-Markdown without modifier (Tab → Enter sequence)
- [ ] Detail-view: "Add note" button — append a free-form note that survives copy/re-capture (clip-attached commentary)
- [x] Search: `is:locked` operator — surface every clip carrying the new lock bit — `19c38fc`
- [ ] Trash row: hover-preview matching clip from the live store if a re-capture exists (so the user knows it's safe to purge)

### New (added this tick — 2026-06-22 19:00 PT refill)
- [ ] Audit log: "Mark as resolved" pill — recurring
- [ ] Settings: per-kind retention split — recurring
- [ ] Detail-view: per-clip "Pinned hits" sparkline — recurring
- [ ] Note composer: paste an image directly — recurring
- [ ] Bulk-bar: "Tag selected → palette tag picker" — recurring
- [ ] Detail: "Re-capture from URL" — recurring
- [ ] Site-rule form: per-rule "test against active tab" — recurring
- [ ] In-page palette: pinned-bias slider in settings — recurring
- [ ] In-page palette: live token-counter in palette search input — recurring
- [ ] Quick-capture: paste an image directly (system clipboard image → new image clip) — recurring
- [ ] Site rules: "Suggest from top hosts" — recurring
- [ ] Audit panel: hover-preview the clip on each row — recurring
- [ ] In-page palette: keyboard shortcut to copy-as-Markdown without modifier (Tab → Enter sequence) — recurring
- [ ] Detail-view: "Add note" button — recurring
- [ ] Trash row: hover-preview matching clip from the live store if a re-capture exists — recurring
- [ ] Cmd+K: "Lock selected" hotkey when bulk-bar is open (companion to the new bulk-lock button — needs a one-key binding so power users don't hover)
- [ ] Detail send-to: "Open all background tabs from similar clips" — bulk variant of the new bg-tab action; opens every kind=link similar match in background tabs
- [ ] Bulk-bar: "Lock + pin selected" combo button — one click for clips you want to both keep at top AND require confirm-on-delete
- [ ] Search: `is:unlocked` operator (parity twin of `is:locked`) — useful for "what should I lock?" review pass after a is:locked audit
- [ ] Bulk export: tag-filter dropdown — "Export selected, only clips tagged X" so the user can cherry-pick by category from a wider selection
- [ ] Per-host rule: "lock by default" bit — every capture from this host auto-locks (parity with `autoPin` + `autoRedact`)
- [ ] Audit log row: "Restore last lock" — for unlocked-via-bulk entries, one-click undo to re-lock just that clip
- [ ] Detail-view: lock-state breadcrumb in the meta row ("Locked since YYYY-MM-DD" — first time you set the bit, so audit-trail is visible)

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
- [x] Saved-search chip: inline rename via double-click (Enter / Esc / Tab / blur) — `5c702c9`
- [x] Audit row: right-click to forget a single entry (privacy scalpel) — `0915171`
- [x] Trash row: "Restore + pin" combo icon button (hides when already pinned) — `f33d812`
- [x] Search history: hover-pin + right-click to promote a Recent query to saved-search — `3281c91`
- [x] Site rules: portable JSON Import / Export (merge or replace) — `d3b2207`
- [x] Audit panel: clip-scope filter (Alt-click a row to scope to that clip) — `7af49fe`
- [x] Audit panel: time-window dropdown (All / 7d / 30d) — `7af49fe`
- [x] Saved-search chips: HTML5 drag-to-reorder — `4361a8e`
- [x] Trash: bulk-restore strip — chips per host with 2+ rows — `b5ca001`
- [x] Cmd+K palette: "Open my last saved search" (mirrors send-to last-action) — `24676b8`
- [x] Site-rule form: paste-URL auto-extract host + wildcard suggest — `e0d41dd`
- [x] Search: `is:notemplate` operator (inverse of `is:template`) with palette command — `795c401`
- [x] Detail-view: TTL countdown banner above body — expired/imminent(<1h)/soon(<24h) tiers with Keep+Clear buttons — `9097d19`
- [x] Audit panel: Download JSON button — standalone privacy receipt, no clip content — `4bca469`
- [x] Cmd+K palette: "Show last forgotten host" — one-tap rescue from forget-host audit ring — `9bfabc5`
- [x] Bulk-bar: live "Free X MB" storage delta — visible-selected sum with off-filter honesty tail — `c6cf99f`
- [x] Detail-view: "Show audit history" jumper — pivot privacy audit panel to scoped clip-mode from detail header — `542f879`
- [x] Cmd+K palette: "Jump to next archived clip" — cycle archived clips newest-first without flipping list filter — `100ec2a`
- [x] Detail send-to: "Copy as table row" — TSV/CSV body to `| col | col |` Markdown row — `a8f7f79`
- [x] Search-history Recent chips: HTML5 drag-to-reorder — promote frequent queries left — `632f11d`
- [x] In-page palette: Alt+Enter copies URL only — http(s)-gated, system clipboard, mirrors detail send-to — `fe5b273`
- [x] Cmd+K palette: "Jump to prev archived clip" — companion to next-archived, cycles in reverse with wrap on idx 0 — `ae8279b`
- [x] Detail send-to: "Copy as JSON line" — single-line minified envelope for jq/jsonl/chat pastes — `3cd162b`
- [x] Audit chip strip: parenthesized counts ("Redact (12)") + distribution tooltip ("38% of visible ring") — `a612de8`
- [x] Note composer: live {{token}} counter pill — "3 tokens · 5 placeholders" + tooltip listing token names — `2fc067b`
- [x] Trash: per-kind purge — "Empty images (3 · 10.5 MB)" / "Empty text (12 · 4 KB)" with confirm — `36e519f`
- [x] Detail: "Open all (N)" similar-clips traversal — prev/next cycles snapshot stack with "Similar N/M" pill — `eda786d`
- [x] Quick-capture URL composer — type/paste a URL, validates http(s) live, ingests as kind=link clip via new addLink RPC — `3e32c02`
- [x] Site-rule row hover preview — top 3 recent matched clips with click-to-detail + "Last 3 of 12" title — `4491d2c`
- [x] Search: `is:link` operator — parity twin of `kind:link` with parser bit, applyQuery gate, describeQuery surface, palette command, empty-state hint — `f27a649`
- [x] Send-to: "Copy as cURL" — single-line `curl '<url>'` for any clip with http(s) URL, POSIX-safe single-quoting via shellSingleQuote — `812b47a`
- [x] In-page palette: "Open in side panel" Chrome-only affordance — feature-detect probe + cc-rpc openSidePanel handler, hidden on Firefox — `2d75a6f`
- [x] Per-clip lock: "ask before deleting" confirm gate orthogonal to pin — toggleLock + detail icon button + row badge + intercept in all 5 delete paths — `fe54bb9`
- [x] Cmd+K palette: "Pin every clip from active tab's host" — one-shot triage with live label ("Pin 4 clips from github.com" / "All 12 already pinned" / greyed) — `9a13dd4`
- [x] Search: `is:locked` operator — strict ===true gate joins is:pinned/redacted/template/expiring/archived/link family with palette command + empty-state hint — `19c38fc`
- [x] Bulk-bar: lock/unlock selected with intent-adapting button (lock vs lockOpen icon, .active class, hover-title with skip count) + Cmd+K command — `7a75ad8`
- [x] Cmd+K palette: "Lock N clips from <host>" — companion to pin-from-host, shares activeTabHost cache, new host-lock pure module + 4-shape label matrix — `864fd69`
- [x] Detail send-to: "Open in background tab" — chrome.tabs.create({active:false}) row between incognito and site-search, fallback path with toast — `fb2020d`
- [x] Bulk-bar: "Export selected as JSON" — importAll-compatible envelope from selectedIds, separate from Settings → Export, send/arrow icon + Cmd+K + filename includes count — `1cacba4`

## Tick log

(One line per tick. Newest at top.)

<!-- TICKS BELOW -->

- **2026-06-22 19:00 PT** — 5/5 shipped. (1) `is:locked` search
  operator: parity twin joining the is:pinned/redacted/template/
  expiring/archived/link family so users with last tick's per-clip
  lock can audit "what have I marked irreplaceable?" in one
  keystroke. New `lockedOnly: boolean` on ParsedQuery, parser
  branch (`is:locked` only — `is:lock`/`is:locks` fall through to
  freeText so muscle-memory misses don't silently mis-filter),
  strict `=== true` applyQuery gate mirroring db.toggleLock +
  clip-lock.partitionLocked (truthy non-boolean stays out — same
  end-to-end semantic). describeQuery emits "locked", empty-state
  hint updated, new Cmd+K command "Show locked clips" in Filter
  group. 25/25 sanity covers parser/applyQuery/describeQuery +
  archived-default interaction + strict gate (19c38fc). (2)
  Bulk-bar lock/unlock selected: new padlock button between pin
  and tag with bulkPin-style "if-all-then-undo" UX so the same
  mental model carries across pin/lock/archive bulk verbs. When
  entirely locked → unlocks; otherwise → locks (forces every
  entry into the chosen state — per-id toggle would flip mixed
  selections the wrong way). New `db.setLocked(id, bool)`
  idempotent setter alongside toggleLock with fast-path no-op.
  New pure `lib/bulk-lock.ts` with 4 helpers: decideBulkLockIntent
  ("lock"/"unlock"/null), countBulkLockWrites (projected actual
  changes — already-in-state entries skipped), formatBulkLockToast
  (singular/plural + mixed-selection "Locked 3 of 7 clips · 4
  already locked"), formatBulkLockButtonTitle (hover-preview with
  skip count). Button title + icon (lock→lockOpen) + .active class
  refresh every updateBulkBar so hover reveals intent before
  commit. Click handler does its own authoritative read so it
  stays truthful when selection extends past visible filter. New
  Cmd+K "Lock N selected" / "Unlock N selected" command. 42/42
  sanity (7a75ad8). (3) Cmd+K "Lock all from active host":
  companion to last tick's pin-from-host (9a13dd4) with identical
  shape — same active-tab anchoring, www-strip, case-insensitive
  matching, 4-shape label matrix. Use case: "this site has
  irreplaceable snippets, apply ask-before-delete to every
  capture." New pure `lib/host-lock.ts` (idsToLockForHost,
  availableToLockHost, matchedClipsForHostLock,
  formatLockFromHostLabel — all parallel to host-pin). Strict
  ===true skip for already-locked so the command never silently
  unlocks the user's earlier explicit locks. Shared activeTabHost
  cache extended with `activeHostLockable` (single tabs.query +
  shared `wide` ClipItem array per render — no extra IDB read).
  47/47 sanity (864fd69). (4) Send-to "Open in background tab":
  new row between incognito and site-search, routes through
  chrome.tabs.create({active:false}) so the new tab loads without
  stealing focus from the popup — useful for triaging multiple
  link clips in a row (similar-clips panel, citations). New
  `urlForBackgroundTabOpen` builder delegates to urlForOpenSource
  (same http(s) availability rules in one place). New SendAction
  kind discriminator "bg-tab" joins nav/copy/incognito. Popup
  handler covers happy path + api.tabs absent fallback + create
  throw fallback (window.open with informative toast). Bumped
  send-to action count assertion 13→14 in both sanity-send-to
  (+13 new bg-tab checks: URL math across text/scrubbed/chrome/
  data/file/image/note + row availability + row order vs
  incognito + first-three cluster) and sanity-json-line
  (fb2020d). (5) Bulk-bar "Export selected as JSON":
  cherry-pick JSON download, importAll-compatible envelope shape
  ({clips, version, exportedAt, source:"bulk-export",
  selectionSize}). Different from Settings → Export: source =
  selectedIds, JSON-only (no encryption ceremony), no settings/
  audit/searchHistory fields. New pure `lib/bulk-export.ts` with
  4 generic-over-T helpers so both test fixtures and real
  ClipItem pass cleanly: buildBulkExportEnvelope (defensive
  filter, version coerce, exportedAt fallback), bulkExportJson
  (2-space pretty-print), bulkExportFilename
  (`context-clipboard-YYYY-MM-DD-Nclips-bulk.json` so users
  can distinguish from Settings export), formatBulkExportToast
  (clean/partial shapes). Send/arrow icon button in bulk-bar
  between tag and trash. Handler fetches FULL ClipItem records
  via getClip so pinned/locked/tags/hash/hitCount round-trip,
  passes through bulkExportJson with DB_VERSION 4. New Cmd+K
  "Export N selected as JSON" with adaptive label. 63/63
  sanity covers envelope shape + version/exportedAt overrides +
  defensive guards + JSON round-trip (locked/pinned/tags/hash
  preservation) + filename shape + toast shapes + realistic
  5-clip mixed-kinds end-to-end (1cacba4). tsc + chrome/firefox
  builds green (popup 287.0KB +14.2 vs last tick — bulk-export
  module + bulk-lock module + host-lock module + search.ts
  lockedOnly bit + send-to bg-tab row + popup-side click handlers
  + 2 new bulk-bar buttons + 4 new Cmd+K commands; background
  47.2KB unchanged; content 26.9KB unchanged). All 56 sanity
  suites pass — 1732 total checks (added: 25 is-locked + 42
  bulk-lock + 47 host-lock + 13 bg-tab additions + 63 bulk-export
  = 190 new this tick; existing send-to bumped 124→140 includes
  the bg-tab additions). Pushed as 5 separate revertible commits.

- **2026-06-22 15:22 PT** — 5/5 shipped. (1) `is:link` operator: parity
  twin of `kind:link` so users who reach for it out of muscle memory
  from the other `is:*` operators get the same behaviour. New
  `linkOnly: boolean` on ParsedQuery, lowercased match in the existing
  `is:` branch, applyQuery gate after the existing `kind` check.
  Parser keeps kind/linkOnly distinct so pathological combos
  (kind:image is:link → empty by AND-semantics, kind:link is:link →
  idempotent same-set) surface the user's intent honestly. New Cmd+K
  command "Show links only" in Filter group + empty-state hint
  updated to mention `is:link`. 29/29 sanity (f27a649). (2) Send-to
  "Copy as cURL": new pure lib/curl-command.ts with shareableUrl gate
  (link clips use content, text/image use source.url; http(s) only;
  data:/file:/chrome:/about:/javascript:/blob: bail), shellSingleQuote
  wrapper for POSIX safety (close-reopen-escape sequence `'\''` for
  embedded single quotes — preserves URLs with $, backticks, `&`,
  parens, fragments byte-for-byte), curlCommandForClip → `curl '...'`
  one-liner, canCurlClip predicate. New send-to row "Copy as cURL"
  slotted between url-only and fenced-code so URL cluster
  (md-link → url-only → curl) stays adjacent. 46/46 curl-command +
  124/124 send-to sanity (action count 12→13, json-line test count
  also bumped) (812b47a). (3) In-page palette "Open in side panel":
  new shadow-DOM `.sp-open` button next to search input, hidden by
  default. Probe-mode cc-rpc openSidePanel handler in background
  (returns `{ok:true, probed:true}` when sidePanel API present + tab
  anchor available, no actual .open call — gesture-preserving).
  Content script fires probe at palette-open, reveals button on
  positive round-trip; click fires the real (non-probe) RPC inside
  the user's gesture window, closes palette on success. Hidden
  entirely on Firefox (no sidePanel API). 28/28 sanity covers API
  absent / probe / real / windowId fallback / no-context error /
  throw passthrough / probe truthy-falsy coercion / tabId=0 edge
  (2d75a6f). (4) Per-clip lock: new `locked?: boolean` on ClipItem
  (additive flag, no schema bump), `toggleLock(id)` in lib/db.ts
  mirrors togglePin/toggleArchive contract, strict ===true gate so
  truthy non-boolean doesn't accidentally trigger. New pure
  lib/clip-lock.ts with partitionLocked → {locked, unlocked} arrays
  preserving order, formatLockConfirm with 4 shapes (only-unlocked
  → null; 1 locked singular; N locked all; mixed N+M with verb
  agreement "1 clip IS marked" / "2 clips ARE marked"),
  formatLockedClipConfirm with 60-char preview slice + ellipsis +
  whitespace/newline collapse. Detail view: new icon button between
  History and Pin paints lock/lockFilled + .active class. List row:
  subtle inline padlock chip in preview row (12px, opacity 0.85, no
  pill bg — gate, not category). New trashWithLockGuard wraps
  trashWithUndo for all 5 user-initiated delete paths (row, keyboard
  Del, right-click, bulk-bar, detail); bail preserves the whole
  batch including bulk-bar selection (re-snapshot vs liveIds after
  await). 47/47 sanity covers defensive shapes + grammar + 100-clip
  stress with alternating bit (fe54bb9). (5) Cmd+K "Pin every clip
  from active tab's host": new pure lib/host-pin.ts with
  idsToPinForHost (strict pinned===true skip so user's earlier
  explicit pins never silently unpin), availableToPin counted twin,
  matchedClipsForHost (includes pinned for "All N already pinned"
  hint), formatPinFromHostLabel 4-shape (no-host greyed, no-match
  greyed, all-pinned greyed, N-pinnable singular/plural available).
  Module-scope cache `activeTabHost/activeHostMatched/
  activeHostPinnable` refreshed in render() via refreshActiveHostPin
  (single tabs.query + count over already-loaded `wide`, no extra
  IDB read). Palette command in Bulk group via IIFE so label/hint/
  available trio computed atomically; handler re-reads listClips at
  click time so freshly-captured clips join the batch, sequential
  togglePin loop (matches pinAllFiltered), singular/plural toast.
  48/48 sanity covers matching + www-strip both directions + case-
  insensitive + pinned-skip semantics + defensive guards + count
  parity + label matrix + realistic 10-clip ring (9a13dd4). tsc +
  chrome/firefox builds green (popup 272.8KB +11.0 vs last tick —
  search.ts linkOnly bit + curl-command module + clip-lock module +
  host-pin module + detail-lock button + sidepanel content-script
  wiring + new palette commands; background 47.2KB +1.1 —
  openSidePanel RPC handler; content 26.9KB +2.1 — sidepanel
  probe/click + new shadow-DOM header). All 52 sanity suites pass —
  1512 total checks (added: 29 is-link + 46 curl-command + 28
  open-sidepanel + 47 clip-lock + 48 host-pin = 198 new). Pushed as
  5 separate revertible commits.

- **2026-06-22 12:15 PT** — 5/5 shipped + 3 recovered. Last
  tick crashed mid-batch leaving 3 unpushed commits (audit chip
  labels, JSON line, prev archived) plus an in-progress
  template-token-count feature with uncommitted popup wiring.
  Recovered + completed all 4 first, then added 4 more for a
  proper 5-feature batch. (1) Note composer live {{token}}
  counter pill: new pure lib/template-token-count.ts with
  countTemplateTokens(body) -> {placeholders, unique, names},
  formatTokenPillLabel returning "1 token: date" / "1 token × 3"
  (single var reused) / "3 tokens" / "3 tokens · 5 placeholders"
  (multi-unique with reuse), formatTokenPillTooltip ("3 unique
  tokens (date, host, url) — will expand on copy"). Grammar
  mirrors src/lib/templates.ts exactly: empty {{}}, {{1bad}},
  {{#x}}, unclosed all rejected. Pill row hidden via [hidden]
  for plain notes; refreshTemplateTokenPill runs on every
  textarea `input` event (one listener covers typing/paste/cut/
  undo/redo/drag-drop/IME). 55/55 sanity (2fc067b). (2) Trash
  per-kind purge: 2 new buttons in trash header ("Empty images
  (12 · 8.4 MB)" / "Empty text") hidden when zero of that kind.
  New pure lib/trash-purge-kind.ts: summarizeTrashByKind ->
  {text, image, link, all} each with {count, bytes}, defensive
  per-entry coercion (missing kind -> text, NaN/Infinity/negative
  bytes -> 0). planTrashPurge -> {ids, count, bytes, kind} with
  malformed-id skip. formatPurgeConfirm + formatPurgeButtonLabel
  with singular/plural per kind. New db.purgeTrashByIds(ids)
  single-tx batch delete with existence check. 44/44 sanity
  (36e519f). (3) Detail "Open all (N)" similar-clips traversal:
  new pure lib/similar-nav.ts with SimilarNav state shape and
  6 functions (build, step with WRAP, formatPos, formatTraverse
  button, isIn, sync). Hidden when <2 matches. Stack captured
  AS SNAPSHOT at click time (no re-lookup on step) so user
  commits to the rendered set. WRAP semantics for prev/next so
  cycle never "ends". Position pill reads "Similar 2/5" with
  hover-title explaining mode. Exit via Back/Esc/closeDetail
  unconditionally drops nav (session-local by design); navigating
  to a clip NOT in stack via openDetail drops via sync returning
  null; clicking a Similar row inside stack RESYNCS index.
  stepDetail routes through stepSimilarNav when in mode. 52/52
  sanity (eda786d). (4) Quick-capture URL composer: new link
  icon button in header toolbar opens modal mirroring note-
  composer pattern. Pre-fills from clipboard IF current content
  parses as URL (silent on permission deny). Live validation on
  every keystroke: green "host.com/path" / red "Not a valid
  http(s) URL". Enter saves; Esc cancels. New pure lib/url-
  quick-capture.ts: parseQuickCaptureUrl(raw) -> {url, host,
  preview, title} | null with scheme whitelist (only http(s);
  rejects javascript/data/file/chrome/about/blob/ftp/ws/custom),
  schemeless coercion (github.com/foo -> https://github.com/foo;
  scheme detector rejects "example.com:" by anchoring on no-dot-
  before-colon so host:port doesn't misroute), localhost branch,
  title derivation (last path segment, %20 decoded, hyphen->
  space, fallback to host), 80-char cap. buildQuickCaptureTags
  -> ["quick-capture", host] with www-strip + lowercase + trim.
  New background addLink RPC routes through ingest with
  kind="link", content=url, defense-in-depth http(s) re-check.
  67/67 sanity (3e32c02). (5) Site-rule row hover preview:
  new pure lib/rule-preview.ts with previewClipsForRules(rules,
  clips, {limit, hostFrom, matchesHostPattern}) computing top-N
  recent matched clips per rule (first-match-wins matching
  mirrors usagesForRules). Defensive limit (NaN/Infinity/zero/
  negative -> default 3, fractional floors). Per-rule sort
  lastSeenAt desc + cap. Preview 80-char truncation + whitespace
  collapse + "Image" fallback. formatPreviewCardTitle 4-shape
  (null/1-captured/All-N/Last-N-of-M). formatPreviewRowTooltip
  full-preview-200-cap + timeAgo. Popup renderSiteRules paints
  .rule-preview-card sibling div per row; pure CSS reveal via
  .site-rule-row.has-preview:hover (+ :focus-within for keyboard).
  Click routes to closeSettings() + openDetail(clipId). 44/44
  sanity (4491d2c). tsc clean + chrome/firefox builds green
  (popup 261.8KB +23.0 vs last tick — 5 new modules + composer +
  hover-card render path + similar-nav stack + linkComposer
  state machine; background 46.1KB +1.1 — addLink RPC handler;
  content unchanged at 24.8KB). All 47 sanity suites pass —
  1314 total checks (added: 55 template-token-count + 44 trash-
  purge-kind + 52 similar-nav + 67 url-quick-capture + 44 rule-
  preview = 262 new). Recovered features (ae8279b prev-archived,
  3cd162b json-line, a612de8 audit-chip-labels) were already
  committed last tick but never pushed; this tick's gate + push
  ships all 8 together.

- **2026-06-22 05:03 PT** — 5/5 shipped. Detail "Show audit
  history" jumper: new icon button on the detail header (between
  Send-to and Pin) pivots the privacy audit panel into clip-scope
  mode for the open clip — mirror of alt-click from an audit row
  but starting from the clip side. Sequence: close any open
  send-menu, close detail view, openSettings() (which resets
  auditClipScope to null on every boot), THEN setAuditClipScope
  (order matters — opening must complete before pre-set scope
  survives). Zero matches still pivots so the user sees an
  honest "0 of N · clip: ..." rather than a silent no-op. New
  pure lib/detail-audit-jump.ts owns the precheck contract so the
  future Cmd+K + row-menu mirrors answer the same questions
  identically: precheckAuditJump(detailId, entries) →
  {canJump, clipId, matchingCount} defensive against null/
  undefined detailId (canJump=false) + non-array entries
  (canJump=true with count=0); describeAuditJump → tooltip
  variant with singular/plural live-count text. refreshDetail
  HistoryTitle(clipId) runs on every openDetail (cheap, one IDB
  read of small ring), races safely. New history icon (clock +
  counter-clockwise arrow) in icons.ts slotted next to send/
  archive/inbox. 24/24 sanity covers null/undefined/empty/
  whitespace/number/object detailId guards + detailId trim +
  non-array entries fallbacks + count math + defensive entry
  shapes + strict-equality contract + describe variants +
  realistic 30-entry ring counting to 6/30 (542f879). Cmd+K
  "Jump to next archived clip": cycles through archived clips
  newest-first (wraps at end) by OPENING detail-view for each
  next clip — daily-list filter stays put. New pure lib/next-
  archived.ts: archivedClipsSorted (filters to archived===true
  strict boolean — rejects "yes"/1/undefined; sorts lastSeenAt
  desc with id-desc tie-breaker so bulk-archived cycles
  deterministically); nextArchivedClipId (no archived → null;
  no cursor → first; cursor not archived → first; single → that
  one even when IT is cursor; wraps via (idx+1) % length);
  describeArchiveCycle → 3 variants (0/negative/NaN/Infinity →
  no-archived; 1 → singular; N → plural with count). Popup
  cache archivedCount in render() (cheap, filter over wide
  slice), palette command in Navigate group with rich keywords;
  jumpToNextArchived() re-reads listClips at click time (so
  fresh archives aren't missed); toasts position "Archived clip
  3 of 12" for multi-archive cycles. 34/34 sanity covers
  defensive inputs + filter strictness + sort + cycle (empty/
  single/multi/wrap/no-cursor/live-cursor/unknown-cursor/single-
  with-cursor) + describe variants + realistic 10-clip ring
  with 5 archived cycling c0→c2→c4→c6→c8→c0 (100ec2a).
  Detail send-to "Copy as table row": new pure lib/table-row.ts
  with looksLikeTableRow (rejects image/empty/whitespace/multi-
  line/plain-sentence/single-word; accepts tab OR comma); split
  TableCells (tab-first TSV is cleanest signal; otherwise single
  /\s*,\s*/ rule handles "a,b,c"/"a, b, c"/messy "a,b, c"
  identically — the previous two-rule design misrouted mixed
  inputs); escapeCell (defensive null/undefined → ""; escapes
  pipe → \|; collapses internal whitespace; trims outer);
  tableRowForClip → "| cell | cell | cell |" with leading +
  trailing pipes. Wired between raw-text and json in
  buildSendActions so copy-variants cluster stays tight; gates
  on truthy output. 49/49 table-row + 112/112 send-to sanity
  (one count updated: 10 → 11 actions; raw-text → table-row →
  json order asserted) (a8f7f79). Search-history Recent chips
  drag-to-reorder: HTML5 native DnD mirroring saved-searches
  strip; recent-chip rendered draggable=true; four strip-level
  handlers cover dragstart (preventDefault on apply/save
  buttons so inner intent wins; stash searchHistoryDragQuery;
  Firefox-required text/plain payload), dragover (insertion-
  edge cursor.x vs midpoint paint .drop-before/.drop-after),
  drop (build new order from full searchHistory cache rather
  than visible-filtered slice — dedup-vs-saved-search hidden
  chips don't get lost; splice src out, splice in before/after
  dst, persist via reorderSearchHistory; repaint), dragend
  (belt-and-braces visual cleanup). New lib/db.ts
  reorderSearchHistory: defensive against drag races (unknown
  queries pruned, dupes collapsed to first occurrence, missing
  tail-append in original order); non-string entries skipped;
  no-op + 0 IDB writes when order unchanged; null only when
  store empty. pushSearchHistory contract preserved (typed
  query still bumps to position 0 on commit). CSS .recent-
  chip.dragging mirrors saved-search-chip with slightly softer
  tilt (-1deg vs -1.5deg) — Recent strip is lower-priority
  cousin. 24/24 sanity covers empty-store → null + basic swap +
  no-op match + partial reorder + unknown pruning + dupe
  collapse + non-string skip + all-unknown no-op + empty-input
  no-op + single-entry + case-sensitive (GitHub != github) +
  trim NOT applied + operator-query round-trip + drag-to-front
  + drag-to-end + 5-entry full-ring reverse (632f11d). In-page
  palette Alt+Enter copies URL only: new ⌥⏎ modifier mirrors
  detail send-to "Copy URL only". Behavior matrix (kbd + mouse
  identical): ⏎/click → paste; ⇧⏎/shift+click → markdown;
  ⌥⏎/alt+click → copy URL only (alt wins when both held —
  more explicit intent). New closure helpers in content.ts:
  type PickMode = "paste"|"markdown"|"url-only" replaces the
  prior asMarkdown boolean; urlOnlyFor(c) extracts shareable
  URL (link clips: content IS url; text/image: source.url),
  http(s)-gated only (data:/chrome:/file:/about:/javascript:
  bail to null — no accidental local-path leak); trims; returns
  null when no shareable URL. pick() url-only path ALWAYS goes
  to system clipboard, never direct-paste-to-field — user
  reached for ⌥⏎ for clipboard intent specifically.
  Hint footer updated. 29/29 sanity covers link clips (http/
  https/query/fragment/case-insensitive/trim/empty/whitespace/
  data:/file:/chrome:/about:/javascript:/bare-host) + text
  clips (http/https source/trim/no-source/empty-source/
  undefined-url/file:/chrome:) + image clips (source.url
  extracted not data: content; null when source missing) +
  defensive null/undefined content + 3 realistic captures
  (fe5b273). tsc + chrome/firefox builds green (popup 238.7KB
  +9.7 vs last tick — detail-audit-jump + next-archived + table-
  row + history-reorder DB helpers + 3 new icons + DnD strip
  handlers + url-only modifier dispatch; background 45.0KB
  unchanged; content 24.8KB +1.0 — PickMode enum + urlOnlyFor
  + modifier dispatch in keydown+click); ALL 39 sanity suites
  pass — 1051 total checks (11 archive + 33 audit-export-json +
  20 audit-export + 30 audit-filter + 26 audit-forget + 21
  audit-retention + 36 audit-rollup + 30 bulk-preview + 39
  bulk-storage-delta + 32 context-tags + 24 detail-audit-jump +
  11 export + 15 find-dupes + 9 highlight + 27 history-export +
  55 host-pattern + 14 import-dedup + 14 jump + 30 last-
  forgotten-host + 15 last-saved-search + 25 merge-dupes + 34
  next-archived + 24 no-template + 29 palette-url-only + 11
  palette + 23 pattern-hits + 15 privacy-audit + 14 recent-pin
  + 24 reorder-search-history + 28 rule-count + 27 saved-
  search-rename + 29 saved-search-reorder + 18 send-to-reorder
  + 112 send-to + 78 site-rules-io + 13 sort + 49 table-row +
  27 trash-host-rollup + 9 trash-restore-pin + 34 ttl-banner);
  16 script tests pass too. Pre-existing playwright redact-ui
  DB-version mismatch unrelated.

- **2026-06-22 01:04 PT** — 5/5 shipped. is:notemplate
  operator: inverse of is:template, lets the user drop {{token}}
  clips from the view. New ParsedQuery.noTemplate bit; parser
  recognises "is:notemplate" (case-insensitive); applyQuery
  drops clips where template===true; describeQuery surfaces
  "not-template". Both flags can coexist by design — pathological
  is:template AND is:notemplate lands always-empty so the user
  sees their intent reflected (rather than one operator silently
  swallowed). Empty-state hint grows the new op; new Cmd+K
  command "Hide templates (plain clips only)" with rich keyword
  cluster (plain/non-template/strip/without/tokens/raw) for
  discovery. 24/24 sanity covers parse + apply + describe +
  empty-content-template-still-excluded + both-on-empty (795c401).
  TTL countdown banner: new pure lib/ttl-banner.ts with
  computeTtlBanner(clip, now) → {tier, label, detail, expiresAt}
  or null. Four cases: expired (≤0ms, soft-red, "Was due X ago"),
  imminent (<1h, soft-red, "Expires in Xm at HH:MM"), soon
  (1h..24h, accent, "Expires in Xh Ym today at HH:MM"), hidden
  (pinned or no-expiresAt or ≥24h — inline pill is enough).
  `now`-injectable for deterministic tests. formatShort caps at
  two units, formatClock uses Intl with HH:MM fallback. New
  <div id="detail-ttl-banner"> above detail-body with icon +
  label + detail + Keep + Clear-TTL buttons. Keep routes
  through togglePin ("Pinned · TTL paused"), Clear routes
  through setClipExpiry+appendPrivacyAuditEntry so receipt trail
  stays complete. CSS .tier-expired/imminent use rgba red
  surfaces, .tier-soon uses --accent-soft. Slide-in animation
  (translateY -4px→0 over 220ms). 34/34 sanity covers tier
  math + boundary edges (exactly 1h → soon, exactly 24h → null,
  at-deadline → expired) + formatShort (every tier + negative)
  + pinned-wins-when-expired + expiresAt=0 boundary (9097d19).
  Audit Download JSON: new pure lib/audit-export-json.ts with
  buildAuditExport(entries, {retention, now}) → standalone
  envelope (version=1, source="context-clipboard/audit",
  exportedAt, count, retention?, entries). Defensive per-entry
  cleanup strips undefined+empty-string optional fields (host,
  detail) so generated JSON stays tight. stringifyAuditExport
  2-space pretty; auditExportFilename returns
  "context-clipboard-audit-YYYY-MM-DD.json" for natural
  directory sort. New "Download JSON" button between retention
  select + Clear; click handler reads listPrivacyAudit +
  getSettings in parallel, bails honestly on empty ring,
  Blob+anchor download, toast count. Try/catch wraps for IDB
  failure surface. 33/33 sanity covers envelope shape +
  retention guard (0/negative/missing absent) + cleanup
  (undefined+empty-string stripped, populated preserved) +
  input immutability + filename day-boundary + 100-entry
  round-trip + order preservation (4bca469). Cmd+K
  Show-last-forgotten-host: new pure lib/last-forgotten-host.ts
  with findLastForgottenHost(entries) walking the audit ring
  newest-first, returning {host, at, entryId, detail} for the
  first non-empty-host forget-host entry. Defensive against
  non-array input, missing/whitespace-only host, malformed
  entries. formatAge helper renders "just now" / "5m ago" /
  "2h ago" / "3d ago". New module-scope lastForgottenHost
  cache + refreshLastForgottenHost() at popup boot + after
  runForgetHost success (so rescue command surfaces immediately,
  not on next boot). New palette command "Show last forgotten
  host · github.com (5m ago)" in Privacy group, label adapts
  to live state. Run routes through openSettings +
  restoreHostFromTrash (which gracefully handles "audit row
  outlived 7d trash retention" case with toast). All bulk-
  restore confirm + audit + repaint reused, no duplication.
  30/30 sanity covers empty/non-array inputs + no-forget-host
  null + newest-first + malformed-host skipping (empty +
  whitespace + missing) + host trim + trusts-input-order
  contract + mixed-kinds filter + optional detail + formatAge
  math (every tier + clamped-future + boundaries) + realistic
  ring (9bfabc5). Bulk-bar storage delta: new pure
  lib/bulk-storage-delta.ts with sumClipBytes (defensive
  reducer skipping undefined/null/string/NaN/Infinity/negative/
  zero) + formatBytes (B/KB/MB/GB tiers matching popup's
  inline helper) + buildStorageDeltaLabel returning "Free X"
  or null (no point showing "Free 0 B"). New
  <span id="bulk-storage-delta"> in the bulk-bar between
  count + action buttons. updateBulkBar computes
  currentClips ∩ selectedIds (visible-selected subset) — when
  selection spans beyond the filter, label grows
  "Free 4.2 MB · 12 of 47 shown" so the user knows the number
  isn't the whole story. render() now calls updateBulkBar()
  unconditionally so the delta stays truthful as filter
  narrows/widens. CSS .bulk-storage-delta softer than #bulk-count
  (500 vs 600, 11px, 0.78 opacity, subtle rgba pill). 39/39
  sanity covers defensive reducer + formatBytes tiers
  (including negative + non-finite + just-under-boundary at
  KB/MB) + label composer (null-on-zero, all defensive cases) +
  realistic ClipItem end-to-end + cross-check against popup
  formatBytes output (c6cf99f). tsc + chrome/firefox builds
  green (popup 229.0KB +9.5 vs last tick — is:notemplate
  parser + 4 new lib modules + popup wiring + TTL-banner DOM +
  download button + storage-delta span; background 45.0KB
  unchanged; content 23.8KB unchanged); ALL 35 sanity suites
  pass — 922 total checks (11 archive + 33 audit-export-json +
  20 audit-export + 30 audit-filter + 26 audit-forget + 21
  audit-retention + 36 audit-rollup + 30 bulk-preview + 39
  bulk-storage-delta + 32 context-tags + 11 export + 15 find-
  dupes + 9 highlight + 27 history-export + 55 host-pattern +
  14 import-dedup + 14 jump + 30 last-forgotten-host + 15
  last-saved-search + 25 merge-dupes + 24 no-template + 11
  palette + 23 pattern-hits + 15 privacy-audit + 14 recent-
  pin + 28 rule-count + 27 saved-search-rename + 29 saved-
  search-reorder + 18 send-to-reorder + 111 send-to + 78
  site-rules-io + 13 sort + 27 trash-host-rollup + 9 trash-
  restore-pin + 34 ttl-banner); 16 script tests pass too.
  Pre-existing playwright redact-ui DB-version mismatch
  unrelated.

- **2026-06-21 21:51 PT** — 5/5 shipped. Audit panel scope filters:
  new in-memory `auditClipScope: {clipId, preview} | null` +
  `auditWindow: "all" | "7d" | "30d"` flank the existing
  bucket-chip filter so the audit ring narrows along three
  independent axes (clip → window → bucket). Alt-click on a
  jumpable audit row pivots to clip-scope mode INSTEAD of
  jumping (plain click still jumps — modifier opt-in keeps the
  primary flow reversible), pulls a short preview via
  previewForClipId (live → trash → fallback "clip <id-prefix>")
  so the scope pill reads as something the user recognises;
  clip-scope reset to bucket=all so a scoped clip with only
  redact actions doesn't strand a TTL-filtered panel empty;
  new `<select id="audit-window">` in the audit header with
  All / 7d / 30d, applied BEFORE the clip scope via
  `Date.now() - AUDIT_WINDOW_MS[window]` cutoff so the chip
  counts reflect "of these visible rows" rather than the
  global tally; auto-scope-away when the scoped clip × window
  combo lands on zero rows so the panel can't strand the user
  with "nothing here, but stuck in scope"; new
  `<div id="audit-scope">` strip above the chips renders one
  pill per active scope (`clip: Hello world…` ×, `when:
  Last 7 days` ×) each clear-on-click via `data-act`
  routing; summary line stays informative across all three
  layers ("4 of 32" when any scope is active vs "32 actions"
  when global); settings open resets all three filter layers
  (they're a glance, not a preference — re-opening should
  land on the global ring); row title updated to "Show this
  clip · Alt-click to scope · right-click to forget" so the
  new affordance is discoverable; CSS .audit-scope-pill
  mirrors the existing .audit-chip vocab (same border-radius,
  font weight, accent-soft fill) so the two strips read as
  siblings (7af49fe — both clip-scope AND time-window were
  bundled into this commit, mapping to two roadmap items).
  Saved-search drag-to-reorder: HTML5 native DnD, no library;
  `draggable="true"` on every chip except those in rename
  mode (the input would hijack the drag, preventDefault on
  dragstart from data-act="del"/"rename-input"); four
  strip-level listeners cover the whole lifecycle —
  dragstart stashes module-scope `savedSearchDragId`, sets
  text/plain payload (required for Firefox, unused by us),
  adds .dragging visual (40% opacity + 1.5deg tilt + grabbing
  cursor); dragover preventDefaults so drop fires, splits
  hovered chip into halves via cursor x vs midpoint, paints
  3px inset accent on the relevant edge (.drop-before /
  .drop-after) so the landing position is obvious before
  commit, clears stale hints on other chips; drop computes
  permutation (splice src out, splice back in before/after
  dst), persists via new `reorderSavedSearches(orderedIds)`
  in lib/db, re-renders; dragend always wipes visual state
  to catch drop-outside / cancelled drags. New
  reorderSavedSearches: filters input to known ids, deduped,
  preserving intent order; missing ids tail-append in
  original relative order (defensive against stale debounced
  drag); unknown ids silently ignored; no-op + no IDB write
  when resulting order matches existing; returns new list or
  null on empty store. 29/29 saved-search-reorder sanity
  covers swap math + tail preservation on missing + unknown
  pruning + dupe collapse + empty-input no-op + all-unknown
  no-op + query/createdAt/id preservation across reorder +
  single-entry edge + 4-entry round-trip (4361a8e). Trash
  bulk-restore strip: new pure
  `src/lib/trash-host-rollup.ts` with
  `groupTrashByHost(trash, minCount=2)` — default minCount=2
  so single-row hosts don't get redundant chips (per-row
  Restore already covers those); buckets sort by count desc,
  newestDeletedAt desc, then alpha so the biggest fresh
  cluster reads first deterministically; www-strip + lowercase
  via existing hostFrom semantics so www.github.com +
  github.com collapse to one bucket. New
  `restoreAllFromHost(host)` in lib/db mirrors forgetHost's
  normalisation (lowercase + www-strip + trim) — symmetric
  pair to the forget-host destructive path; returns
  {matched, restored} so the caller can distinguish "all
  came back" from "some flaked"; pinned bit preserved by
  restoreClip's existing semantics. Popup `renderTrash` paints
  up to 6 chips above the row list, click flows through a
  single strip-level handler that peeks the count, confirms
  above 5 ("Restore N from <host>? All matching trash rows
  return"), fires the lib helper, repaints trash + live list,
  toasts honestly ("Restored 1 from x", "Restored 8 of 12
  from x" for partial). 27/27 trash-host-rollup sanity covers
  empty/single/pair bucketing + www-strip collapse + count-desc
  + newest-desc tie-break + alpha tertiary + no-url skip +
  custom minCount=1/3 + 50-row count math + duplicate-ts
  count growth + loose-shape tolerance (b5ca001). Cmd+K
  "Open my last saved search": new `LAST_SAVED_SEARCH_KEY`
  meta row in lib/db (64-char id cap, trimmed + null-safe);
  new in-memory mirror `lastSavedSearchId` refreshed at popup
  boot via `await getLastSavedSearchId()` + on every chip
  apply path so the palette open doesn't pay an IDB read per
  render; stamped BEFORE the render in the saved-search click
  handler (fire-and-forget, never block apply on meta write —
  mirrors the send-to last-action pattern); cleared
  synchronously when the underlying chip is deleted (apply-
  handler checks lastSavedSearchId === id, nulls both
  in-memory + IDB); palette command label adapts to live
  state: "Open last saved search · Github issues" with hint
  "Drop `host:github.com is:pinned` into the search box" when
  recent, "Open last saved search" greyed-out unavailable
  when nothing has been applied; run path mirrors the chip
  click (set searchEl.value, stamp, focus, render). 15/15
  last-saved-search sanity covers default-empty + round-trip
  + whitespace trim + 64-char length cap + multi-write
  last-wins + null/undefined coercion + meta isolation
  against send-to-last + palette-last-q + typical chip-id
  (24676b8). Site-rule paste-URL extractor: new pure
  `src/lib/host-pattern.ts` with `looksLikeUrl(input)`
  (http/https/protocol-relative // / host-with-path
  detection, returns false for bare hostnames so they don't
  trigger the rewrite) + `extractHostPattern(input)` (URL
  parse first via new URL(), manual strip-protocol-then-
  authority fallback, www-strip + lowercase + trailing-dot
  normalisation, defensive against non-host schemes —
  data: / file: / chrome: / about: / javascript: /
  view-source: / blob: / moz-extension: bail to empty host
  so accidental data-URL paste doesn't land "data" as the
  rule target). Wildcard math: 3+ label hosts get
  `*.<last two labels>` (docs.github.com → *.github.com);
  IPs + 2-label apexes + single-label hosts (localhost) skip
  the wildcard since it'd be useless; PSL hosts (co.uk /
  com.au) get a known-limited `*.co.uk` — user can override.
  Popup paste handler on rule-host input preventDefaults
  URL-shape pastes, replaces value with extracted host,
  dispatches synthetic input event so downstream listeners
  see the new value, lands caret at end so a follow-up
  keystroke appends; bare-host pastes (github.com) skip the
  rewrite — extractHostPattern detects no URL shape. New
  `<div id="rule-host-suggest">` strip below the input
  paints `Try wildcard: *.github.com` chip whenever the
  extracted host has 3+ labels AND the current input isn't
  already the wildcard; one click swaps in the pattern, chip
  self-hides on next render. loadRuleIntoForm triggers
  renderHostSuggest after loading so mid-edit promotion from
  exact to wildcard is one click; resetRuleForm clears the
  suggest chip alongside the inputs so a Cancel+blank doesn't
  leave a stale hint. CSS .rule-host-suggest-chip uses dashed
  border + accent hover so the suggestion reads as "advisory"
  rather than another field. 55/55 host-pattern sanity covers
  looksLikeUrl shape detection (10 cases) + URL extraction
  (subdomain math + query/hash + PSL + deep subdomain +
  uppercase + protocol-relative + no-protocol-with-path +
  www-strip + port + auth + IPv4 + edge cases + trailing dot
  + plain-text fallthrough + non-host scheme rejection)
  (e0d41dd). tsc + chrome/firefox builds green (popup 219.5KB
  +14.6 vs last tick — audit scope filter UI + drag-to-
  reorder handlers + trash host strip + last-saved-search
  palette + host-pattern paste handler + suggest chip,
  background 45.0KB, content 23.8KB); ALL 31 sanity suites
  pass — 794 total checks (11 archive + 20 audit-export +
  30 audit-filter + 26 audit-forget + 21 audit-retention +
  36 audit-rollup + 30 bulk-preview + 32 context-tags + 11
  export + 15 find-dupes + 9 highlight + 27 history-export +
  55 host-pattern + 14 import-dedup + 14 jump + 15
  last-saved-search + 25 merge-dupes + 11 palette + 23
  pattern-hits + 15 privacy-audit + 14 recent-pin + 28
  rule-count + 27 saved-search-rename + 29
  saved-search-reorder + 18 send-to-reorder + 111 send-to +
  78 site-rules-io + 13 sort + 27 trash-host-rollup + 9
  trash-restore-pin); 16 script tests pass too. Pre-existing
  playwright redact-ui DB-version mismatch unrelated.

- **2026-06-21 18:48 PT** — 5/5 shipped. Saved-search rename inline:
  new `renameSavedSearch(id, name)` in lib/db — trims, rejects
  blank/missing-id, allows case-only and whitespace-only edits on the
  same row (typo fix path), rejects case-insensitive collisions with
  a DIFFERENT entry; preserves id + createdAt + query so the chip
  strip stays in place. Popup: new module-scope `renamingSavedSearchId`
  flips the chip's `<button>` label into an `<input type="text">`
  with current name selected; dblclick on apply-button to enter,
  Enter/Tab commits, Esc cancels, capture-phase blur commits if focus
  drifts; single `commitSavedSearchRename` funnel so the four entry
  paths can't double-toast; CSS `.saved-search-chip.renaming` glows
  accent; CSS.escape polyfill (alphanum + `_` + `-` mapping) for
  older WebViews; sanity 27/27 covers happy path + blank/empty
  rejection + collision math (case-insensitive, post-delete reuse,
  whitespace trim) + long-name round-trip + order stability across
  renames (5c702c9). Audit row right-click forget: new
  `removePrivacyAuditEntry(id)` in lib/db — single IDB write through
  the same meta-row path as `clearPrivacyAudit`, returns true on
  remove / false on missing-id, NO cap-snap (length-1 math, not
  re-trim to retention cap — that's `trimPrivacyAuditToCap`'s job);
  popup: every audit row carries `data-entry-id` (jumpable buttons
  AND non-jumpable forget-host divs); new `contextmenu` listener
  preventDefault on rows, lets native menu through on day-headers
  and gap; confirm dialog quotes the row's kind+subject so the user
  knows what they're erasing; tooltips updated to "Show this clip ·
  right-click to forget" / "Right-click to forget this entry"; sanity
  26/26 covers empty/missing-id no-op + drop-middle/oldest + double-
  forget idempotency + forget-host (no clipId) parity + newest-first
  order preservation across many forgets (0915171). Trash row
  Restore+pin: icon-only second button sits left of the Restore pill,
  hidden when `t.pinned === true` (restore preserves pin, so combo
  would be a no-op for already-pinned clips); click handler uses
  `target.closest("[data-act]")` so SVG-path clicks inside the icon
  still resolve to the button branch; happy path runs `restoreClip`
  → `togglePin`, toasts "Restored + pinned" with an Undo button that
  re-trashes the clip in one shot (one-intent undo); honest partial-
  fail messaging ("Restored — but couldn't pin") when togglePin
  flakes; CSS 26×26 transparent-border button, accent hover; sanity
  9/9 covers the show-when-unpinned / hide-when-pinned visibility
  rule across truthy/falsy/undefined/null pinned values (f33d812).
  Search-history pin: renderSearchHistory emits a composite chip —
  outer `<span>` wraps an apply button + an opacity-0 / width-0 pin
  icon button that reveals on `:hover` / `:focus-within` with a CSS
  fade-in; both inner buttons carry `data-act` so the single
  dispatcher routes by intent; new `saveRecentAsSearch(q)` helper
  reused by hover-pin click AND right-click contextmenu so both
  affordances always behave the same way (parseQuery → first-
  meaningful-token name suggestion, dedup-by-name through existing
  `addSavedSearch`, toast); just-saved query auto-migrates from
  Recent → Saved on next render (renderSearchHistory dedupes against
  saved queries); sanity 14/14 covers dedup math (current + saved)
  + case-sensitive matching + blank filter + order preservation +
  two-button chip shape (3281c91). Site rules import/export: new
  pure `src/lib/site-rules-io.ts` with `serializeRules` (drops
  id+createdAt + falsey flags from envelope), `stringifyRules`
  (2-space pretty-printed JSON), `parseRulesJson` (accepts full
  envelope OR bare array, defensive per-row validator that drops
  blank-host / whitespace-host / `**` / trailing-wildcard / bad-
  regex-pattern / truthy-non-bool flags, returns
  {ok,rules?,dropped?,reason?}, never throws), `mergeRules` (merge:
  incoming wins on hostPattern collision, preserves original id +
  createdAt for stability, appends new at end; replace: wipe + take
  incoming with fresh ids); all bounded (MAX_RULES=200,
  MAX_HOST_LEN=200, MAX_PATTERNS_PER_RULE=50) so a malicious paste
  can't fill IDB; new `replaceSiteRules` bulk-write in lib/db +
  matching RPC action in background so a 30-rule import is one IDB
  roundtrip; popup: two header buttons (Export / Import) under the
  per-site rules title, slide-in IO panel with read-only textarea +
  Copy in export mode, editable textarea + merge/replace radio +
  Apply in import mode; Apply shows honest "+3 added, 2 updated, 1
  dropped" summary; Replace mode confirms before wiping; clipboard
  write uses `navigator.clipboard.writeText` with
  `document.execCommand("copy")` fallback for policy-restricted
  contexts; sanity 78/78 covers serialize shape (no leaks, falsey
  flags omitted) + parse defensive guards (every reject branch +
  7-out-of-10 drop math) + merge mode (collision overrides + id
  preservation + list-order stability + no-collide additive) +
  replace mode (remove math + empty edge cases) + input
  immutability + full flag round-trip (d3b2207). tsc + chrome/
  firefox builds green (popup 204.9KB +16.2 vs last tick — site-
  rules IO panel + 3 inline rename/contextmenu handlers, background
  45.0KB +0.5, content 23.8KB); ALL 26 sanity suites pass — 668
  total checks (11 archive + 20 audit-export + 30 audit-filter + 26
  audit-forget + 21 audit-retention + 36 audit-rollup + 30 bulk-
  preview + 32 context-tags + 11 export + 15 find-dupes + 9
  highlight + 27 history-export + 14 import-dedup + 14 jump + 25
  merge-dupes + 11 palette + 23 pattern-hits + 15 privacy-audit +
  14 recent-pin + 28 rule-count + 27 saved-search-rename + 18
  send-to-reorder + 111 send-to + 78 site-rules-io + 13 sort + 9
  trash-restore-pin); 16 script tests pass too. Pre-existing
  playwright redact-ui DB-version mismatch unrelated.

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

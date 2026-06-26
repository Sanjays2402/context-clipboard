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

### New (added this tick — 2026-06-23 01:46 PT refill)
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
- [ ] Trash row: hover-preview matching live re-capture (image kind too — current text/link match by hash; image-blob-hash variant deferred) — recurring follow-up
- [ ] Cmd+K: "Lock selected" hotkey when bulk-bar is open — recurring
- [ ] Detail send-to: "Open all background tabs from similar clips" — recurring
- [ ] Bulk export: tag-filter dropdown (autocompleter for the input, current ships free-text only)
- [x] Detail-view: per-clip note — show on hover-preview in trash too (closes the loop with this tick's trash-match feature) — `a52fe7f`
- [ ] `is:hostlocked` search operator — surface clips whose host has an autoLock site rule (cross-store join)
- [x] Cmd+K: "Show recently noted" — chronology of last-edited notes (companion to recently-locked) — `634a3b1`
- [x] Bulk-bar: "Add note to selection" — apply a note to N clips in one shot — `ea1b1e4`
- [ ] Note composer pre-fill from active tab `title` — "Captured from <title>" boilerplate that the user can edit/clear
- [x] Search: `is:nonoted` inverse operator — parity twin of `is:noted` for the "what should I annotate?" review pass — `0cd3b12`
- [x] Cmd+K palette: "Show recently locked" — 7d chronology of lock decisions via `lockedAt` (not `lastSeenAt`), live count + freshest-age in label, gates on `is:locked` not lockedAt directly because the search bar can't express that — `5c4ed2e`
- [x] Detail-view: per-clip "Add note" field — free-form user commentary, schema-additive `note?: string`, sanitize+cap+control-strip pure module, auto-save on blur + Cmd/Ctrl+Enter, char-counter with over-cap red flag — `2134bfc`
- [x] Search: `is:noted` operator — joins is: family via hasClipNote() predicate (same gate as detail-view Clear-button visibility), parser branch + applyQuery + describeQuery + Cmd+K + empty-state hint — `72835ca`
- [x] Bulk-bar: "Export selected with tag X" — optional tag filter input between bulk-tag and bulk-export, pure filterClipsByTag (case-insensitive + trimmed) + formatBulkExportTagToast grammar, zero-match toasts honestly without writing file — `87a8e7d`
- [x] Trash row: hover-preview matching live re-capture — pure trash-match module finds latest live clip by hash, formats "Live re-capture exists — Xm/h/d ago. Safe to purge." vs "No live re-capture — purging this is permanent." tooltip surfaced via row `title` attr — `5726170`


### New (added this tick — 2026-06-22 22:14 PT refill)
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
- [ ] Cmd+K: "Lock selected" hotkey when bulk-bar is open (companion to bulk-lock button) — recurring
- [ ] Detail send-to: "Open all background tabs from similar clips" — recurring
- [x] Bulk-bar: "Lock + pin selected" combo button — additive only, lives between bulk-lock and bulk-tag, hides when no clip needs either bit — `4f383ae`
- [x] Search: `is:unlocked` operator (parity twin of `is:locked`) — useful for "what should I lock?" review pass — `0fd089d`
- [ ] Bulk export: tag-filter dropdown — "Export selected, only clips tagged X" so the user can cherry-pick by category from a wider selection
- [x] Per-host rule: "lock by default" bit — every capture from this host auto-locks (parity with autoPin + autoRedact) — `12fa643`
- [ ] Audit log row: "Restore last lock" — for unlocked-via-bulk entries, one-click undo to re-lock just that clip
- [x] Detail-view: lock-state breadcrumb in the meta row ("Locked since YYYY-MM-DD") — `47d43bf`
- [x] Trash row: "Restore + lock" combo button — companion to restore-pin for the "I almost lost this — make it safer" workflow — `5db5bec`
- [ ] Cmd+K: "Lock all from active host" hotkey-binding (host-lock pure module is already in place; needs a fast keybinding)
- [ ] Audit log: track lock + unlock kinds (deferred — current rationale comment says "locking is UX not privacy"; flip would need broader design discussion + UI surfaces)
- [ ] Site-rule row: show "lock" badge alongside pin/redact/scrub badges (already shipped in the badge strip; refining recurring)
- [ ] Detail-view: per-clip "Pinned hits" sparkline — recurring (worth flagging again)
- [ ] Bulk-bar: visible "Lock + pin" hover should preview projected count even when partially actionable — already done via formatBulkLockPinButtonTitle
- [ ] Cmd+K palette: "Show recently locked" — surface clips with lockedAt within last 7 days as a chronology view


### New (added this tick — 2026-06-23 05:24 PT refill)
- [ ] Audit log: "Mark as resolved" pill — recurring
- [ ] Settings: per-kind retention split — recurring (`maxUnpinnedText` + `maxUnpinnedImage`)
- [ ] Detail-view: per-clip "Pinned hits" sparkline — recurring (last 30 days of hitCount as ASCII bars)
- [ ] Note composer: paste an image directly — recurring (drop on textarea creates image clip)
- [ ] Bulk-bar: "Tag selected → palette tag picker" — recurring (chip-grid of user's top tags for one-click bulk-tagging)
- [ ] Detail: "Re-capture from URL" — recurring (for link/text clips with http(s) source, refresh title + nearbyText)
- [ ] Site-rule form: per-rule "test against active tab" — recurring (auto-fill host + tags from focused tab's URL)
- [ ] In-page palette: pinned-bias slider in settings — recurring (default 1.5×; user can tune)
- [ ] In-page palette: live token-counter in palette search input — recurring (mirror of note composer counter)
- [ ] Quick-capture: paste an image directly — recurring (system clipboard image → new image clip)
- [ ] Site rules: "Suggest from top hosts" — recurring (popup proposes rules for hosts with 10+ captures but no rule yet)
- [ ] Audit panel: hover-preview the clip on each row — recurring (mini-thumb tooltip)
- [ ] In-page palette: keyboard shortcut to copy-as-Markdown without modifier — recurring (Tab → Enter sequence)
- [x] `is:hostlocked` search operator — cross-store join surfacing clips whose host has an autoLock site rule, first-match-wins, with Cmd+K command + empty-state hint — `def8a6c`
- [x] Note composer pre-fill from active tab `title` — "Captured from <title>" boilerplate the user can edit/clear before save, with site-suffix stripping + host fallback + no-clobber guard — `28a02fc`
- [ ] Detail-view: "Pinned hits" sparkline — last 30 days of hitCount as ASCII bars under the Locked breadcrumb (roadmap-recurring; worth flagging)
- [ ] Bulk-bar: "Note to selection" tag-extract — after note is set, offer a chip to auto-extract `#hashtag`s from the note text into the clip's tag list
- [x] Detail send-to: "Copy note as Markdown" — single-line `> note text` blockquote for users who paste clips into docs and want the caveat to ride along — `056cbd8`
- [ ] Trash row: hover-preview note tail for the LIVE re-capture too — current tick only surfaces the trashed clip's note; the live twin's note (if any) could surface as "Live note: ..." so the user knows the recovery story has its own commentary
- [ ] Note composer keyboard shortcut: `n` on an active row in the daily list opens detail at the note textarea (focus jumps directly to the textarea — matches `?` cheatsheet for "n = note this clip")
- [x] Cmd+K: "Note all from active host" — companion to pin-from-host / lock-from-host for the workflow "every clip from staging.example.com deserves the same caveat" — `53b42cf`
- [ ] Settings: per-kind note auto-capture — when copying from a configured host, prompt for note inline at capture time (gated behind a per-host site rule + global enable toggle)
- [ ] Audit log: track note-set + note-clear actions in the privacy ring — same rationale as redact-track but for the note family (lets users see "I cleared this note on Tuesday" without scrolling the audit panel manually)
- [x] `is:noteshorter:N` / `is:notelonger:N` — surface clips with notes shorter/longer than N chars (useful for "show me the one-word reminders" vs "show me the essays I left") — `02fe975`
- [ ] Bulk-bar: "Tag from notes" — for each selected clip with a note, extract `#hashtag` tokens from the note text and merge into the clip's tag list (one-click conversion of inline tags to structured)


### New (added this tick — 2026-06-23 10:05 PT refill)
- [ ] Audit log: "Mark as resolved" pill — recurring
- [ ] Settings: per-kind retention split — recurring (`maxUnpinnedText` + `maxUnpinnedImage`)
- [ ] Detail-view: per-clip "Pinned hits" sparkline — recurring (last 30 days of hitCount as ASCII bars)
- [ ] Note composer: paste an image directly — recurring (drop on textarea creates image clip)
- [ ] Detail: "Re-capture from URL" — recurring (for link/text clips with http(s) source, refresh title + nearbyText)
- [ ] Site-rule form: per-rule "test against active tab" — recurring (auto-fill host + tags from focused tab's URL)
- [ ] In-page palette: pinned-bias slider in settings — recurring (default 1.5×; user can tune)
- [ ] In-page palette: live token-counter in palette search input — recurring (mirror of note composer counter)
- [ ] Quick-capture: paste an image directly — recurring (system clipboard image → new image clip)
- [ ] Site rules: "Suggest from top hosts" — recurring (popup proposes rules for hosts with 10+ captures but no rule yet)
- [ ] Audit panel: hover-preview the clip on each row — recurring (mini-thumb tooltip)
- [ ] In-page palette: keyboard shortcut to copy-as-Markdown without modifier — recurring (Tab → Enter sequence)
- [ ] Trash row: hover-preview note tail for the LIVE re-capture too — recurring (current tick only surfaces the trashed clip's note)
- [ ] Note composer keyboard shortcut: `n` on an active row jumps to detail-view note textarea
- [ ] Settings: per-kind note auto-capture — when copying from a configured host, prompt for note inline at capture time (gated behind a per-host site rule + global enable toggle)
- [ ] Audit log: track note-set + note-clear actions in the privacy ring — same rationale as redact-track but for the note family
- [x] Bulk-bar: "Tag from notes" — for each selected clip with a note, extract `#hashtag` tokens from the note text and merge into the clip's tag list — `e4f50da`
- [x] `is:hostlocked` parity: `is:hostredacted` (autoRedact rule), `is:hostpinned` (autoPin rule), `is:hostscrubbed` (autoScrubOrigin rule) — same cross-store join family, surfaces hosts with each rule type for at-a-glance review — `aba7302`
- [ ] Cmd+K: "Note all from active host" — pre-fill the prompt with the active tab's title via buildNotePrefill (already imported) so "Captured from <title>" is one keystroke away across N clips
- [x] Detail send-to: "Copy clip + note as Markdown" — combined paste of fenced-code + blockquote so users sharing a snippet WITH commentary get both in one copy — `c4cdc32`
- [x] Search: `is:notenewer:N` / `is:noteolder:N` — gate on `noteUpdatedAt` chronology (companion to noteshorter/notelonger which gate on length); useful for "what notes did I write in the last week?" without dropping into Cmd+K recently-noted — `15d6b9a`
- [x] In-page palette: surface clip notes inline as a 2nd-line preview when expanded (hover or kbd-active row); today the in-page palette doesn't show note context — `bb510ec`
- [ ] Saved searches: a saved search that uses `is:hostlocked` should refresh its chip count when site-rules change (currently the chip is static — count drifts when the user adds/removes an autoLock rule)
- [ ] Audit panel: filter chip "Note" — bucket the note-set/note-clear actions once that audit-tracking ships (paired with the note-tracking roadmap item above)
- [ ] Detail-view: note's last-edit history — surface the previous N note values (capped, no IDB schema bump; lives in a parallel meta entry) so a user who overwrote a note can recover the old text
- [ ] Bulk-bar: "Append to existing notes" toggle — opt-in to APPEND vs OVERWRITE semantics for the bulk-bar add-note (some users want "and also: production needs review" appended rather than replacing the staging caveat)
- [ ] Note composer: hashtag autocomplete — typing `#` triggers a dropdown of existing tags so users can promote notes-with-hashtags into structured-tagged clips inline
- [ ] Site-rule form: paste-from-clipboard URL → auto-fill hostPattern (extends the existing paste-URL helper to detect URLs in the system clipboard at form-open time)


### New (added this tick — 2026-06-23 17:57 PT refill)
- [ ] Audit log: "Mark as resolved" pill — recurring
- [ ] Settings: per-kind retention split — recurring (`maxUnpinnedText` + `maxUnpinnedImage`)
- [ ] Detail-view: per-clip "Pinned hits" sparkline — recurring
- [ ] Note composer: paste an image directly — recurring
- [ ] Detail: "Re-capture from URL" — recurring
- [ ] Site-rule form: per-rule "test against active tab" — recurring
- [ ] In-page palette: pinned-bias slider in settings — recurring
- [ ] In-page palette: live token-counter in palette search input — recurring
- [ ] Quick-capture: paste an image directly — recurring
- [ ] Site rules: "Suggest from top hosts" — recurring
- [ ] Audit panel: hover-preview the clip on each row — recurring
- [ ] In-page palette: keyboard shortcut to copy-as-Markdown without modifier — recurring
- [ ] Trash row: hover-preview note tail for the LIVE re-capture too — recurring
- [ ] Note composer keyboard shortcut: `n` on an active row jumps to detail-view note textarea
- [ ] Settings: per-kind note auto-capture — recurring
- [ ] Audit log: track note-set + note-clear actions in the privacy ring — recurring
- [ ] Saved searches: `is:hostlocked` / `is:hostpinned` / `is:hostredacted` / `is:hostscrubbed` chip counts should refresh on site-rule edits — recurring
- [ ] Audit panel: filter chip "Note" — bucket note-set/note-clear actions once tracking ships — recurring
- [ ] Detail-view: note's last-edit history — surface previous N note values for recovery
- [ ] Bulk-bar: "Append to existing notes" toggle — opt-in APPEND vs OVERWRITE semantics
- [ ] Note composer: hashtag autocomplete — typing `#` triggers dropdown of existing tags
- [ ] Site-rule form: paste-from-clipboard URL → auto-fill hostPattern at form-open time
- [ ] In-page palette: note tail in HOVER tooltip too (not just inline) for long notes that get ellipsed
- [x] In-page palette: row color hint when note contains warning keywords (`prod`, `production`, `do not`, `caution`) — soft red tint — `b0000a9`
- [x] Cmd+K: "Find hashtags in notes" — surface all distinct hashtags across the visible set so user can see what's hiding in note text before running Tag-from-notes — `da66486`
- [ ] `is:notenewer` / `is:noteolder` saved-search chips — show live count of matches refreshed on render
- [x] Detail send-to: "Copy clip + note as cURL comment" — for link clips with notes, emit `curl '<url>' # <note>` so the caveat rides with the shell command — `901c2f5`
- [ ] Audit panel: filter by note presence — `note-only` chip alongside Redact/Scrub/etc to surface only the noted-clip actions
- [x] Bulk-bar: combined "Tag from notes + clear notes" — for users who want to promote hashtags AND wipe the source text in one action — `491bf7f`
- [x] Detail-view: per-note hashtag-extract preview chip — shows which hashtags WOULD be extracted from this clip's note (one-click promote single clip without going through bulk-bar) — `45e8681`

### Open follow-ups from this tick
- [ ] Note-warning keyword list editable per-site (user can extend with workspace-specific terms like "internal", "beta", company name etc) — extends b0000a9 with a per-host site-rule field
- [x] Cmd+K hashtag-discovery: open a panel listing every tag with click-to-filter — `8d30c7c` shipped the dynamic per-tag palette rows (top-8); full UI panel deferred behind that since palette rows cover the keyboard-pick path
- [ ] Detail promote-chip: surface inline-tag-only mode (`#hashtag` extraction respects an "exclude already-tagged" toggle so users with verbose notes don't see noise)
- [x] Combo tag-from-notes-clear: split into "promote + tag-clear" vs "promote + note-clear" — `2b4eedc` shipped the per-clip promote+strip combo (preserves prose); bulk strip-hashtags `598f678` covers the strip-only side
- [ ] cURL-with-note: settings option for `# note` vs `\\n# note` form (some users prefer leading comment for grep-ability)

### New (added this tick — 2026-06-23 21:38 PT refill)
- [ ] Audit log: "Mark as resolved" pill — recurring
- [ ] Settings: per-kind retention split — `maxUnpinnedText` + `maxUnpinnedImage` — recurring
- [ ] Detail-view: per-clip "Pinned hits" sparkline — recurring (last 30 days of hitCount as ASCII bars)
- [ ] Note composer: paste an image directly — recurring (drop on textarea creates image clip)
- [ ] Detail: "Re-capture from URL" — recurring (for link/text clips with http(s) source, refresh title + nearbyText)
- [ ] Site-rule form: per-rule "test against active tab" — recurring (auto-fill host + tags from focused tab's URL)
- [ ] In-page palette: pinned-bias slider in settings — recurring
- [ ] In-page palette: live token-counter in palette search input — recurring
- [ ] Quick-capture: paste an image directly — recurring
- [ ] Site rules: "Suggest from top hosts" — recurring
- [ ] Audit panel: hover-preview the clip on each row — recurring
- [ ] In-page palette: keyboard shortcut to copy-as-Markdown without modifier — recurring
- [ ] Note composer keyboard shortcut: `n` on an active row jumps to detail-view note textarea — recurring
- [ ] Settings: per-kind note auto-capture — recurring
- [ ] Audit log: track note-set + note-clear actions in the privacy ring — recurring
- [ ] Audit panel: filter chip "Note" — bucket note-set/note-clear actions once tracking ships — recurring
- [ ] Detail-view: note's last-edit history — surface previous N note values for recovery — recurring
- [ ] Bulk-bar: "Append to existing notes" toggle — opt-in APPEND vs OVERWRITE semantics — recurring
- [ ] Note composer: hashtag autocomplete — typing `#` triggers dropdown of existing tags — recurring
- [ ] Site-rule form: paste-from-clipboard URL → auto-fill hostPattern at form-open time — recurring
- [ ] In-page palette: note tail in HOVER tooltip too (not just inline) for long notes that get ellipsed — recurring
- [x] `is:hashtags` / `is:nohashtags` search operators — surface clips whose notes contain (or DON'T contain) #hashtags ready to promote — `22737d9`
- [x] Detail-view: per-clip "Strip N #tags" chip — non-destructive cleanup that REMOVES inline tokens, preserves prose — `6afdd19`
- [x] Bulk-bar: "Strip hashtags from notes" — bulk non-destructive cleanup counterpart — `598f678`
- [x] Detail-view: "Promote N #tags + strip" combo chip — per-clip one-click variant of the bulk Tag-from-notes-clear, preserves prose — `2b4eedc`
- [x] Cmd+K: dynamic per-hashtag filter rows (top 8) — `8d30c7c` keyboard-pick path for discovery
- [ ] Detail promote chip: "exclude already-tagged" toggle — for users with verbose notes that have a mix of promoted + unpromoted hashtags
- [ ] In-page palette: note-tail tooltip should also show warning keyword when `note-warn` row tints — bridge the tint + tooltip
- [ ] Bulk-bar: "Combine: promote + strip selected" — bulk version of the new per-clip promote+strip combo (currently bulk users get Tag-from-notes + Strip-hashtags as two separate buttons)
- [ ] Hashtag panel: full modal UI (current palette-rows cover keyboard pick; a sortable grid panel would help users with 30+ distinct tags they want to scan + group)
- [ ] Settings: keyword list for note-warning tint (currently a hardcoded 24-keyword list; per-user workspace terms like company name, "internal", "beta-only" would extend it)

### Open follow-ups from this tick (2026-06-23 21:38 PT)
- [ ] Promote+Strip combo: a "Promote N #tags + clear note" variant (destructive of prose, mirrors the bulk Tag-from-notes-clear combo exactly) for users who'd rather have the standalone destructive option alongside the new prose-preserving one
- [ ] Bulk Strip-hashtags: storage-delta hint in the bulk-bar (currently the button has no count badge; selected-clip-count + "X tokens to strip" would echo the per-clip chip's grammar)
- [ ] is:hashtags counter chip: live count of `is:hashtags` matches on the quick-filter chip row (alongside Pinned/Redacted/OCR/etc), so users see "Hashtags (12)" at a glance without typing
- [ ] Cmd+K hashtag rows: alpha + count-descending sort toggle (currently fixed count-desc tiebroken alpha; some users want pure alpha for finding a specific tag)
- [ ] hashtag-filter-action: keyword fuzzy-match enhancement so typing the BARE tag (no `#` prefix) surfaces the row (currently keywords carry both forms, but a `match-bare-tag` strict path would speed it up)

### New (added this tick — 2026-06-23 13:46 PT refill)
- [ ] Audit log: "Mark as resolved" pill — recurring
- [ ] Settings: per-kind retention split — recurring (`maxUnpinnedText` + `maxUnpinnedImage`)
- [ ] Detail-view: per-clip "Pinned hits" sparkline — recurring (last 30 days of hitCount as ASCII bars)
- [ ] Note composer: paste an image directly — recurring (drop on textarea creates image clip)
- [ ] Detail: "Re-capture from URL" — recurring (for link/text clips with http(s) source, refresh title + nearbyText)
- [ ] Site-rule form: per-rule "test against active tab" — recurring (auto-fill host + tags from focused tab's URL)
- [ ] In-page palette: pinned-bias slider in settings — recurring
- [ ] In-page palette: live token-counter in palette search input — recurring
- [ ] Quick-capture: paste an image directly — recurring
- [ ] Site rules: "Suggest from top hosts" — recurring
- [ ] Audit panel: hover-preview the clip on each row — recurring
- [ ] In-page palette: keyboard shortcut to copy-as-Markdown without modifier — recurring
- [ ] Trash row: hover-preview note tail for the LIVE re-capture too — recurring
- [ ] Note composer keyboard shortcut: `n` on an active row jumps to detail-view note textarea
- [ ] Settings: per-kind note auto-capture — recurring (gated behind a per-host site rule + global enable toggle)
- [ ] Audit log: track note-set + note-clear actions in the privacy ring — recurring
- [ ] Saved searches: `is:hostlocked` / `is:hostpinned` / `is:hostredacted` / `is:hostscrubbed` chip counts should refresh on site-rule edits — currently static (the host-rule family ships today, so this divergence is now active across 4 operators)
- [ ] Audit panel: filter chip "Note" — bucket the note-set/note-clear actions once that audit-tracking ships
- [ ] Detail-view: note's last-edit history — surface the previous N note values for recovery
- [ ] Bulk-bar: "Append to existing notes" toggle — opt-in APPEND vs OVERWRITE semantics
- [ ] Note composer: hashtag autocomplete — typing `#` triggers a dropdown of existing tags (companion to today's Tag-from-notes — closes the loop the other direction)
- [ ] Site-rule form: paste-from-clipboard URL → auto-fill hostPattern — extends existing paste-URL helper
- [ ] In-page palette: note tail in HOVER tooltip too (not just inline) for long notes that get ellipsed — `title=` attr with the full note text
- [ ] In-page palette: row color hint when note contains warning keywords (`prod`, `production`, `do not`, `caution`) — soft red tint
- [ ] Cmd+K: "Find hashtags in notes" — surface all distinct hashtags across the visible set so user can see what's hiding in note text before running Tag-from-notes
- [ ] `is:notenewer` / `is:noteolder` saved-search chips — show live count of matches refreshed on render (so a `is:notenewer:1h` saved search updates as time passes)
- [ ] Detail send-to: "Copy clip + note as cURL comment" — for link clips with notes, emit `curl '<url>' # <note>` so the caveat rides with the shell command
- [ ] Audit panel: filter by note presence — `note-only` chip alongside Redact/Scrub/etc to surface only the noted-clip actions
- [ ] Bulk-bar: combined "Tag from notes + clear notes" — for users who want to promote hashtags AND wipe the source text in one action (after promotion, the inline `#staging` is redundant with the `tag:staging` chip)
- [ ] Detail-view: per-note hashtag-extract preview chip — shows which hashtags WOULD be extracted from this clip's note (one-click promote single clip without going through bulk-bar)


### New (added this tick — 2026-06-24 21:38 PT refill, FRESH non-hashtag frontend)
Deliberately steering away from the hashtag/note-cleanup cluster that
dominated the last several ticks. These are orthogonal UX gaps.
- [x] Detail content-stats breadcrumb — chars/words/lines under the body — `1c06003`
- [x] Shift+Click range selection in the clip list — `4682392`
- [x] Search inline clear (×) button + Esc-to-clear — `49862e5`
- [x] Bulk "Copy selected" — join N clip bodies to clipboard — `1e36355`
- [x] Detail word-wrap toggle (wrap/nowrap body, persisted) — `d267c36`
- [x] Detail content-stats: click the breadcrumb to copy the count summary (e.g. "1,240 chars · 198 words") for sharing — `7c06937`
- [x] List multi-select: Shift+↑/↓ keyboard range-extend (mirror Shift+Click for keyboard-only users) — `01ee6b4`
- [ ] Search: recent-searches dropdown on focus (show last 5 even before typing, like a browser address bar)
- [x] Bulk "Copy selected as Markdown" — companion to plain Copy, wraps each in its source-cited blockquote — `5a5ef7a`
- [x] Detail word-wrap: per-clip override (a wide-table clip remembers nowrap even when the global default is wrap) — `4656712`
- [ ] Detail: "Copy line N" affordance for multi-line clips — click a line number gutter to copy just that line
- [x] List: hover-to-peek full preview tooltip for clips whose preview is truncated at 140 chars — `25d7fa7`
- [x] Detail body: syntax-aware soft highlighting for detected code clips (lang already detected via detectCodeLang; just tint keywords/strings, no heavy lib) — `e55228d`
- [x] Settings: a "density" radio (comfortable / cozy / compact) replacing the lone compact-rows checkbox — `138c3a2`
- [x] Footer: live keyboard-focus breadcrumb ("row 3 of 28") so keyboard-nav users always know their position — `c35cd17`
- [x] Detail prev/next: wrap-around option (last → first) with a subtle "looped" toast instead of a dead-end — `4724a03`
- [x] List: sticky day-group headers ("Today", "Yesterday", "Mon Jun 22") when sorted by recent — `67a410a`
- [x] Quick-chips: horizontal scroll-shadow affordance when the chip row overflows the popup width — `246019c`
- [x] Detail tags: chip-style tag editor (click an × on each tag instead of comma-editing a raw input) — `e773272`
- [x] Bulk bar: a count-aware "Copy selected" label on hover that previews the joined char total — `c9812b7`

### Open follow-ups from this tick (2026-06-25 03:51 PT)
- [x] Content-stats copy: also offer a "Copy as Markdown stat line" variant (`**1,240** chars · **198** words`) for doc paste — `8e65ea8`
- [ ] Bulk Copy-as-Markdown: a settings toggle for the clip separator (`---` rule vs bare blank line) — some doc targets dislike horizontal rules
- [ ] Shift+↑/↓ range-extend: support reverse-SHRINK (Gmail-style) as an opt-in, vs the current extend-only additive model
- [x] Focus breadcrumb: also surface "N selected" inline when a selection is active (so keyboard users see both position AND selection size) — `78f3995`
- [ ] Quick-chips scroll-shadow: clicking a faded edge (or a chevron affordance) scrolls the strip one page in that direction

### Open follow-ups from this tick (2026-06-25 08:41 PT)
- [ ] List hover-peek: also surface the source URL / title in the peek tail for link clips (currently body-only) so disambiguating two same-host links is one hover
- [ ] Detail-stats Alt-click: mirror the Markdown variant into the Cmd+K palette as an explicit "Copy stats as Markdown" command (keyboard parity with the Alt-click affordance)
- [ ] Bulk Copy char-total: surface the same char total in the post-copy toast ("Copied 3 clips · 1,240 chars") so the receipt matches the pre-commit preview
- [ ] Detail wrap-around: a settings toggle to opt OUT of wrap (restore the dead-end) for users who rely on the disabled-button edge cue
- [ ] Focus breadcrumb selection tail: when selection extends beyond the visible filter window, distinguish "N selected (M visible)" so the keyboard user knows the off-screen overflow

### TICK LOG 2026-06-25 13:50 PT — 5/5 shipped (frontend UX, fresh surfaces)
Steered away from the recent papercut cluster onto five orthogonal UX gaps.
- `67a410a` List: sticky day-group headers (Today / Yesterday / weekday / dated) for time-ordered sorts; pinned tier collapses to one "Pinned" header. Pure lib/day-group, local-time DST-safe bucketing.
- `4656712` Detail: per-clip word-wrap override (sticky, wins over the global default); Alt-click clears to follow global; accent dot telegraph. Additive `wrapOverride` field, global default moved to Cmd+K. Pure lib/wrap-pref.
- `e773272` Detail: chip-style tag editor — each tag a pill with ×, one-click remove; raw input stays the add/edit surface, chips mirror it live. Pure lib/tag-chips (parse/remove/dedupe).
- `e55228d` Detail: soft syntax tinting for detected code clips (strings/comments/keywords/numbers) when no search needle active. Dependency-free lib/code-highlight; XSS-safe (19 runtime checks); search-match still wins while searching.
- `138c3a2` Settings: row-density control (Comfortable / Cozy / Compact) replacing the lone compact checkbox; new cozy middle tier. Backward-compatible — density field mirrored to legacy compactRows bool; migration verified (13 runtime checks). New Cmd+K cycle-density command. Pure lib/density.
Gate: tsc --noEmit clean; chrome + firefox builds green. Pushed 64a13d2..138c3a2.

### Open follow-ups from this tick (2026-06-25 13:50 PT)
- [ ] Day-group headers: also honor the "hits/size/alpha" sorts with a different grouping axis (e.g. host-group headers for non-chronological sorts) instead of a flat list
- [ ] Day-group headers: a settings toggle to disable the dividers for users who prefer the pure flat stream
- [x] Wrap override: surface an `is:wrapoverride` search operator (or a quick way to find clips pinned to their own wrap) for the "what did I override?" review pass — `fcc4316`
- [x] Tag chips: keyboard support — focus a chip + Backspace/Delete removes it (currently mouse-only ×); arrow-key between chips — `4f427bd`
- [ ] Tag chips: drag-to-reorder so the chip order (and thus the comma string) can be rearranged without retyping
- [x] Code tinting: add an operator/punctuation token class (currently only strings/comments/keywords/numbers) — a soft tint on `=> { } ( )` would help scan structure — `ac18536`
- [x] Code tinting: a per-clip "force language" override (detail dropdown) for clips detectCodeLang guesses wrong or can't classify — `ca50138`
- [ ] Density: remember a per-window density (some users want compact in the side panel, comfortable in the popup) — needs a context probe
- [ ] Density: a `density` keyboard shortcut binding (the cycle command exists in Cmd+K; a bare keypress would be faster)

### Open follow-ups from this tick (2026-06-25 18:59 PT)
- [ ] Tag chips: drag-to-reorder so the chip order (and thus the comma string) can be rearranged without retyping — keyboard nav now exists, DnD is the next gap
- [ ] Tag chips: when keyboard-focused, type-to-add — pressing a letter while a chip is focused jumps to the raw input with that char (so add + remove both work without a mouse reach)
- [x] Force-language: a quick-filter `is:langoverride` operator (mirror of is:wrapoverride) to find clips whose tinting language was hand-pinned — `11d804a`
- [ ] Force-language: remember the LAST forced language per-host as a soft default suggestion (e.g. every clip from a SQL console host defaults the dropdown to SQL)
- [x] Code tinting: a per-clip "force language" should also drive the fenced-code export lang (copy-as-Markdown currently re-runs detectCodeLang, ignoring the override) — wire langOverride into the export path so the user's correction rides along — `dd7429a`
- [ ] tok-punct: a settings toggle to disable punctuation tinting for users who find it busy (keep strings/comments/keywords/numbers) — density-style radio or a checkbox
- [ ] Link hover-peek: surface the og:title vs the page `<title>` distinctly when both exist (capture stores one; a richer peek could show "title · og:title" when they differ)
- [x] Detail: a "copy as `<lang>` fenced block" send-to row that uses the forced language — done as part of `dd7429a` (fencedCodeForClip now honors langOverride)
- [x] List day-headers: a tiny per-group count badge ("Today · 6") on the divider so the user sees the day's volume at a glance — `0d61ca0`
- [x] Search: `is:wrapoverride:on` / `is:wrapoverride:off` direction-specific variants (current operator is presence-only; some users want "show me everything I forced to NOWRAP") — `e712cc4`

### Open follow-ups from this tick (2026-06-25 23:13 PT)
- [x] Tag chips: keyboard reorder (Ctrl+←/→ to move a focused chip) for keyboard-only users — `854d8e2`
- [x] Lightbox: prev/next arrows to step through all image clips without closing (mirror detail `[`/`]` nav, image-filtered) — `aa5165e`
- [ ] Lightbox: pinch / scroll-wheel zoom + pan beyond fit-to-viewport, for inspecting a corner of a huge screenshot (currently capped at fit-to-viewport)
- [ ] Force-language: remember the LAST forced language per-host as a soft default suggestion (every clip from a SQL console host defaults the dropdown to SQL)
- [ ] Bulk Copy-as-Markdown: also honor langOverride in the per-clip fence (bulk-markdown re-runs detectCodeLang — wire exportFenceLang in for full parity with single-clip)
- [x] Day-header count badge: make the count a click target that selects every clip in that day's run (one-tap "select today") — `9c06700`
- [x] is:langoverride direction variants — shipped the wrap twin instead: `is:wrapoverride:on` / `:off` (`e712cc4`); langoverride direction variant still open
- [x] Bulk Copy-as-Markdown: a settings toggle for the clip separator (`---` rule vs bare blank line) — some doc targets dislike horizontal rules — `c967d7d`
- [x] Quick-chips scroll-shadow / is:wrapoverride direction: `is:wrapoverride:on`/`:off` direction-specific variants shipped (`e712cc4`)




### Open follow-ups from this tick (2026-06-26 04:52 PT)
- [ ] Lightbox: scroll-wheel / pinch zoom + pan beyond fit-to-viewport (inspect a corner of a huge screenshot); current nav is fit-only — PARTIAL: `861c954` added +/-/0 stepped zoom (with overflow pan once enlarged); true wheel/pinch continuous zoom still open
- [ ] Lightbox: the "image N of M" position could become a clickable dot-strip (jump straight to image K) for runs of many screenshots
- [x] Day-run select: a modifier (Shift+click the divider) could ADD the run to the existing selection instead of toggle-replacing, for cross-day multi-select — `f0e4674`
- [ ] Day-run select: surface the run-select affordance in the keyboard cheatsheet (`?`) so keyboard users discover Enter-on-divider (now also: Shift+click = add)
- [ ] Tag-chip keyboard reorder: a brief highlight pulse on the moved chip so the eye tracks where it landed (currently focus-only)
- [x] Bulk Copy-as-Markdown: also honor langOverride in the per-clip fence (bulk re-runs detectCodeLang — wire exportFenceLang for single-clip parity) — `1cbbde0`
- [x] Search: `is:langoverride:off` / `is:langoverride:<lang>` direction variants (mirror the wrap:on/off split that just shipped — forced-off vs forced-to-a-specific-language) — `5cf3385`

### New (added this tick — 2026-06-26 04:52 PT refill, FRESH frontend)
Deliberately orthogonal to the wrap/lang-override + note clusters of
recent ticks. Image-viewer, list-selection, settings, and detail UX gaps.
- [x] Lightbox: keyboard `+` / `-` zoom steps with a reset-to-fit on `0` (pairs with the new prev/next nav for a full viewer) — `861c954`
- [ ] Detail image: a "download / save image" affordance from the lightbox (Blob -> a[download], local data URL, no network)
- [ ] List: a "jump to day" mini-strip — clicking a day label in a compact header rail scrolls that day's run into view (companion to day-run select)
- [ ] Bulk-bar: "Copy selected as plain text + Markdown" disambiguation — a single split-button with a caret to pick the format, decluttering two adjacent copy buttons
- [ ] Settings: a live PREVIEW swatch next to the bulk-md separator select (render two stub clips with the chosen seam) so the choice is concrete
- [x] Detail: per-clip "open in lightbox" should also work for the list-row image thumb (click the thumb in the row -> straight to lightbox, skipping detail) — `af97a90`
- [ ] Quick-chips: a "Today" chip that applies the same day-run filter the divider selects (filter, not select) for users who want to NARROW not select
- [ ] Detail tag chips: drag-to-reorder should auto-scroll the chip row when dragging past its right edge (long tag lists overflow + clip)
- [ ] Search: `is:imageonly` shorthand chip that pairs with the lightbox nav (filter to images, then the lightbox steps just those)
- [ ] List day-headers: a settings toggle to disable the dividers entirely for users who prefer the pure flat stream (recurring — worth doing)
- [x] Lightbox: respect prefers-reduced-motion for the fade-in + nav transitions (a11y) — `861c954` (folded into the zoom slice)
- [ ] Detail: a "copy image to clipboard" button (navigator.clipboard.write with the image Blob) distinct from copy-as-Markdown
- [ ] Bulk Copy: surface the joined char total in the post-copy toast ("Copied 3 clips · 1,240 chars") so the receipt matches the pre-commit hover
- [ ] Settings: group the copy/export prefs (bulk-md separator, future image-copy format) under a "Copy & export" subheading so the panel stays scannable
- [ ] Focus breadcrumb: when a day-run select is active, the footer could read "row N of M · day-run selected" to telegraph the bulk gesture's scope



### Shipped (autoship)
- [x] Lightbox: +/-/0 zoom stepper (clamped [fit,5x], 0.5 steps, round-% readout) with reduced-motion a11y — `861c954`
- [x] List: click an image-row thumb to open the lightbox directly (selection always wins) — `af97a90`
- [x] Search: `is:langoverride:off` / `is:langoverride:<lang>` direction variants + forced-off Cmd+K command — `5cf3385`
- [x] Bulk Copy-as-Markdown: honor per-clip force-language override (byte-identical fence to single-clip) — `1cbbde0`
- [x] List: Shift+click a day divider ADDS the run (cross-day multi-select, "Added N" toast) — `f0e4674`
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
- [x] Search: `is:unlocked` operator — strict-complement inverse of `is:locked` so no clip ever passes both / fails both, with parser branch + applyQuery + describeQuery + Cmd+K command + empty-state hint — `0fd089d`
- [x] Per-host site rule: `autoLock` — flip per-clip `locked: true` bit at ingest (fresh + dedup sticky), with form checkbox + row badge + IO round-trip + RPC passthrough — `12fa643`
- [x] Detail-view: lock-state breadcrumb — `lockedAt?: number` on ClipItem stamped on transition false→true, cleared on unlock, surfaced as "Locked since <date>" meta row with 6-tier formatter (just-now / Nm / Nh / yesterday / weekday / ISO) + absolute tooltip — `47d43bf`
- [x] Bulk-bar: "Lock + pin" combo — additive-only one-click "keep at top AND mark irreplaceable", new pure bulk-lockpin module + idempotent setPinned in db, button hidden when all-already-both, Cmd+K mirror with live projection label — `4f383ae`
- [x] Trash row: "Restore + lock" combo — companion to restore-pin for the just-rescued-clip lock workflow, uses setLocked (idempotent + stamps lockedAt) with full undo-via-trashClip path + CSS sibling to .trash-restore-pin — `5db5bec`
- [x] Cmd+K palette: "Show recently locked" — 7d window helper over `lockedAt` (not `lastSeenAt`), strict `c.locked === true` + `Number.isFinite(lockedAt)` gate, label shapes (singular/plural/zero) with freshest-age hint, gates on `is:locked` not lockedAt directly since the search bar can't express it — `5c4ed2e`
- [x] Detail-view: per-clip free-form `note` field — schema-additive `note?: string` on ClipItem, pure clip-note module (sanitize/has/summarize/delta) with 2k cap + C0-control stripping + empty-strip-on-save, always-visible textarea row between Locked and Expires, auto-save on blur + Cmd/Ctrl+Enter, char-counter with over-cap red flag, Clear button with optimistic UI — `2134bfc`
- [x] Search: `is:noted` operator — joins the is: family (pinned/redacted/template/expiring/archived/link/locked/unlocked), strict predicate via hasClipNote() so the search filter + detail-view Clear-button visibility can't disagree, parser/applyQuery/describeQuery/Cmd+K command + empty-state hint — `72835ca`
- [x] Bulk-bar: "Export selected with tag X" — optional tag filter input between bulk-tag and bulk-export buttons, pure filterClipsByTag helper (case-insensitive + trimmed match, defensive against non-array clips + bad tag arrays), formatBulkExportTagToast grammar (zero-match honest no-write, partial-selected, all-selected, singular noun), 84px → 130px focus-expand input — `87a8e7d`
- [x] Trash row: hover-preview live re-capture — pure trash-match module finds latest live clip by content hash (newest-lastSeenAt wins, stamped beats unstamped), formats two-shape tooltip ("Live re-capture exists — Xm/h/d ago. Safe to purge." with optional preview snippet vs "No live re-capture — purging this is permanent."), surfaced via row `title` attr — `5726170`
- [x] Search: `is:nonoted` operator — exact strict-complement of `is:noted` (the two partition the clip space; AND is empty), shares hasClipNote() gate with detail-view + filter so three surfaces never disagree, parser/applyQuery/describeQuery + Cmd+K "Hide noted clips" with synonyms (no/un-annotated/missing/commentary/review/candidates/without) + empty-state legend — `0cd3b12`
- [x] Detail-view: `noteUpdatedAt` breadcrumb — schema-additive stamp written by setClipNote on every value-changing write (no-op fast path doesn't bump), cleared on note-delete so re-noted starts fresh, pure note-updated-since module (5-tier formatter: just now / Nm / Nh / N days / ISO date, calendar-day boundary math, clock-skew clamp), "Noted X ago" pill between count + Clear in note-row foot, hidden for legacy clips noted before the stamp shipped — `721a67a`
- [x] Cmd+K palette: "Show recently noted" — 7d chronology over `noteUpdatedAt` companion to recently-locked, pure recently-noted module (newest-first sort, defensive non-array/missing/NaN/Infinity, clock-skew tolerant, custom-window override), label grammar 0/1/many with freshest-age hint, available:false greys row when 0, run handler appends `is:noted` since search bar can't express `noteUpdatedAt >= now - 7d` directly — `634a3b1`
- [x] Trash row hover-preview: clip's own note tails the tooltip — closes the loop between last-tick's trash-match + last-tick's note features, formatTrashRecaptureTooltip extended with optional `trashed` arg (back-compat: omit = original 2-shape tooltip), 80-char default cap with word-boundary truncation, newlines collapse to single spaces, defensive bad-input drops tail silently, note tail follows preview tail in join order — `a52fe7f`
- [x] Bulk-bar: "Add note to selection" — overwrite-and-warn semantics (notes are prose so merge would create franken-text), pure bulk-note module (planBulkNote projects created/replaced/cleared/unchanged + finalValue, isBulkNoteActionable gates, formatBulkNoteToast 6-shape grammar, formatBulkNoteButtonTitle 4-shape hover), same sanitiseClipNote pipeline as detail editor so bulk + single paths produce identical stored values, pre-prompt warning + post-action toast both surface replace-count, empty input clears existing notes (mirrors detail save-empty contract), prompt-null cancel cleanly distinguished from prompt-empty clear, Cmd+K mirror in Bulk group, idempotent re-run yields all-unchanged — `ea1b1e4`
- [x] Search: `is:hostlocked` — cross-store join (site_rules × clips) surfacing clips whose host has an autoLock=true rule under first-match-wins ingest semantics, distinct from `is:locked` (per-clip bit), pure host-locked module (buildHostLockedPredicate with closure-scoped cache, countHostLockedClips, autoLockedHostsForClips), popup wires site-rules RPC into render() so the predicate is fresh every paint, applyQuery gains hostLockedPredicate opt that falls open when unsupplied (test-friendly), Cmd+K Filter command with live count + distinct-host hint, empty-state hint includes the operator — `def8a6c`
- [x] Search: `is:notelonger:N` / `is:noteshorter:N` — note-length filters with strict comparison (>N / <N), implicit `is:noted` requirement on both sides (no-note clips never match), strict-integer parser (rejects decimals/signs/empty tail to leftover), AND-semantics composition with itself for band-pass, contradictory bounds empty by design, describeQuery surfaces "note>N" / "note<N", Cmd+K commands with default thresholds (120 / 30) + greyed when no current-view clip satisfies — `02fe975`
- [x] Note composer: pre-fill from active tab title — "Captured from <title>" stem gives the user a starting frame instead of a blank textarea, pure note-prefill module (normaliseTabTitle with one-pass site-suffix strip + 30-char cap + terminal-punctuation guard, fallbackHostLabel rejects non-http(s), buildNotePrefill 3-shape output, shouldApplyNotePrefill no-clobber guard for re-opened drafts), api.tabs.query wrapped in try/catch for chrome:// scope, no auto-select-on-focus (documented anti-pattern) — `28a02fc`
- [x] Cmd+K: "Note every clip from active host" — third leg of the host-triage trio (pin/lock/note), pure host-note module mirroring host-lock shape (idsToNoteForHost, matchedClipsForHostNote, planHostNote projecting created/replaced/cleared/unchanged/finalValue, formatNoteFromHostLabel 3-shape matrix, formatHostNoteToast 7-shape grammar with "from <host>" tail), overwrite contract mirrors bulk-bar, pre-prompt label warns "(N will be replaced)" when relevant, empty input clears (mirrors detail save-empty + bulk-bar contract), planning gates the IDB loop so idempotent re-runs no-op cleanly, same setClipNote RPC as detail + bulk so noteUpdatedAt stamping is identical across all three entry points — `53b42cf`
- [x] Detail send-to: "Copy note as Markdown" — wraps the per-clip note as a `> ` blockquote so paste-into-docs workflows can include the caveat alongside the content, pure note-markdown module (noteAsMarkdownBlockquote handles CRLF normalisation + outer-blank-strip + internal-blank-as-`>`-placeholder + per-line `> ` prefix + nested-quote pass-through + no length cap, noteAsMarkdownAvailable predicate matches hasClipNote), SendableClip type extended with optional `note?: string`, popup passes c.note in both buildSendActions call sites so menu-render + click-dispatch gates stay consistent, row hides when un-noted (no dimmed dead row) — `056cbd8`
- [x] Search: `is:hostpinned` / `is:hostredacted` / `is:hostscrubbed` — host-rule operator family parity with `is:hostlocked`, new pure host-rule-flags module generic over HostRuleFlag ("autoPin" | "autoRedact" | "autoScrubOrigin") with per-host verdict cache + first-match-wins semantics + strict `=== true` gate matching host-locked's autoLock check, distinct lens from per-clip bits (answers "is this from a site I've configured by RULE?"), three new Cmd+K Filter commands each greys when count=0 with live host-count hint, four new applyQuery predicate opts (hostPinnedPredicate, hostRedactedPredicate, hostScrubbedPredicate alongside existing hostLockedPredicate) with same fall-open contract — `aba7302`
- [x] Detail send-to: "Copy clip + note as Markdown" — composite fenced-code body + Markdown blockquote note joined by paragraph-break, common workflow for sharing a snippet WITH commentary in a PR/doc/chat, new pure clip-note-markdown module composes existing fencedCodeForClip + noteAsMarkdownBlockquote (byte-identical to running both standalone rows back-to-back; composition law verified by sanity test 12), hides when EITHER body unusable (image/empty) OR note missing — no dimmed half-broken combo row — `c4cdc32`
- [x] Search: `is:notenewer:Nd` / `is:noteolder:Nd` — chronology gates over `noteUpdatedAt` with same `Nd`/`Nh`/`Nw` duration grammar as `before:`/`after:` (delegates to existing parseDuration helper), distinct from `after:` (gates on lastSeenAt re-copy recency not annotation-decision recency), band-pass via AND-semantics composition (`is:notenewer:30d is:noteolder:7d` → notes touched between 7 and 30 days ago), 2 new Cmd+K commands with default 7d/30d thresholds + greys when no clip satisfies — `15d6b9a`
- [x] Bulk-bar: "Tag from notes" — extract `#hashtag` tokens from selected clips' notes and merge into structured tag list (promotes inline note-style tagging to `tag:` searchable structure), new pure tag-from-notes module with strict hashtag regex (start-of-string or whitespace/punctuation leader, alphanumeric/underscore start char, 32-char per-tag cap, 16-tag per-note cap, case-folded to lowercase, hyphens allowed mid-tag), case-insensitive dedup against existing tags, 8-shape toast grammar with failure-mode disambiguation (no-notes / no-hashtags / already-tagged / 1-tag-1-clip / 1-tag-N-clips / N-tags-1-clip / N-tags-across-M-clips), new bulk-bar button + Cmd+K mirror, button hides entirely when isTagFromNotesActionable=false — `e4f50da`
- [x] In-page palette: surface clip notes inline as 2nd-line italic tail under preview — passive caveat surfacing at the moment of paste-decision so the user sees "staging only" / "needs login" BEFORE pasting, not after, new pure palette-note-tail module (trim + whitespace-collapse to single spaces + 80-char word-boundary truncation with hard-slice fallback when last-space too early in cap window), shadow-DOM `.note-tail` CSS rule (italic dim gold #c4a86b with 0.85 opacity, "note: " prefix in non-italic at lower opacity), PaletteClip interface gains optional `note?: string` field (back-compat preserved), both background.ts cc-open-palette send sites updated to pass through `note: c.note` in the lite payload — `bb510ec`
- [x] In-page palette: warning tint for rows whose note contains caution keywords (prod/staging/do not/deprecated/secret/draft/wip etc) — soft warm-red row background + ⚠ glyph prefix on the note-tail so the user sees the row is FLAGGED before reading the tail. Pure note-warning module with 24-entry curated keyword list (env names + caution verbs + lifecycle markers + secrecy markers), single combined regex compiled once with `\b` boundaries (preproduction/donut/restaging all rejected), multi-word phrases accept variable whitespace, apostrophe in "don't paste" hard-matched. hasNoteWarning/firstWarningKeyword/formatNoteWarningTooltip API. False positives are cosmetic only (no data dropped, no action blocked) — `b0000a9`
- [x] Cmd+K "Find hashtags in notes" — discovery command scanning currentClips for #hashtag distribution across notes, sorted descending by clipCount with alphabetical tiebreak for determinism. Pure hashtag-discovery module composes existing extractHashtagsFromNote so the discovery + bulk Tag-from-notes share a single source of truth on what counts as a hashtag. Per entry: alreadyTagged flag identifies hashtags already in EVERY clip's structured tag list (case-insensitive), so user sees what's NEW vs already-promoted. 4-shape toast grammar (empty / single-tag / 2-3-inline / 4+ headline-with-top3-hint), live hint with topN=1 preview at palette build time. Always available (empty scan is useful answer "no hashtags hiding"), greyed only when no clips visible — `da66486`
- [x] Detail-view per-clip "Promote N #tags" chip — note-row foot surfaces an accent-tinted chip when current note text contains #hashtag tokens NOT already in the structured tag list. Click promotes inline using same db.updateTags path the bulk-bar uses (byte-identical merged-tag lists across single + bulk via shared note-hashtag-promote module composing extractHashtagsFromNote + mergedTagsForClip). Live refresh on textarea input + detailTags input/change so chip appears the moment user finishes typing `#staging` and hides the moment they manually structure a matching tag. dataset.merged stash so click acts on plan the user SAW, with defensive re-plan as tie-break. 4-shape grammar (empty / 1 / 2-3 list / 4+ count), tooltip surfaces full pending list + alreadyTagged tail — `45e8681`
- [x] Bulk-bar "Tag from notes + clear notes" combo — eraser-icon button next to standalone Tag-from-notes. Promotes #hashtags AND wipes the source note text on every clip where promotion happened (targeted: clip with no hashtags keeps note, all-already-tagged keeps note). Pre-prompt destructive confirm surfaces "Add #X to N clips AND clear N notes?" so misclick doesn't surprise-wipe. Pure tag-from-notes-clear module composes existing primitives (extractHashtagsFromNote + mergedTagsForClip + sanitizeClipNote contract). 5-shape toast grammar with destructive variant ("Added #x · cleared 1 note" / "Added N tags across M clips · cleared M notes"). Cmd+K mirror distinct from standalone palette row so keyboard discovery surfaces destructive variant separately — `491bf7f`
- [x] Detail send-to "Copy as cURL with note comment" — for any clip with BOTH a curlable URL AND a non-empty note, emit `curl 'url' # note`. Composition: byte-identical to standalone curl row on URL half (delegates to curlCommandForClip). Critical safety: multi-line notes collapsed to single line (newline in shell `#` comment would TERMINATE the comment and execute note text). sanitiseForShellComment helper strips C0 controls + caps at 200 chars with word-boundary truncation. New send-to row id=curl-note slots between curl and fenced-code, count bumped 16→17. End-of-line `# note` form survives single-line paste in chat/PR/terminal — newline-prefixed comment forms would be stripped by paste-mangling tools — `901c2f5`
- [x] Detail tag chips: roving-tabindex keyboard nav (←/→/Home/End between chips) + Backspace/Delete removal that lands focus on a neighbour — pure lib/tag-chip-nav, click + keyboard share one removeDetailTag helper, focus-visible ring — `4f427bd`
- [x] Search: `is:wrapoverride` operator — surface clips pinned to their own detail-body wrap, gate = wrap-pref.hasWrapOverride (same predicate the toggle badges), parser + applyQuery + describeQuery + Cmd+K live-count command + empty-state hint — `fcc4316`
- [x] List hover-peek: richer tooltip for LINK clips folding source title + full URL even when the body fits the row (disambiguate two same-host links in one hover), dedups against visible row text — `641e474`
- [x] Code tinting: `tok-punct` token class — soft-tint structural glyphs `{ } ( ) [ ] ; ,` + arrows `=> ->`; only in plain-text gaps (never inside strings/comments), config langs opt out, XSS-safe — `ac18536`
- [x] Detail: per-clip force-language override for code tinting — dropdown to override auto-detection or force tinting off, pure lib/lang-override (3-state effectiveLang) + additive ClipItem.langOverride + db.setLangOverride, live "auto → Rust" hint — `ca50138`
- [x] List: per-day clip-count badge on the day-group dividers ("Today · 6") — new lib/day-group.computeDayHeaderInfos returns {label,count} per run-start; computeDayHeaders is now its label-only projection; muted lighter-weight count span — `0d61ca0`
- [x] Detail: click-to-zoom lightbox for image clips — full-resolution preview over a dim backdrop (local data URL, no network); new pure lib/lightbox (canZoom gate + lightboxCaption mirroring the detail image-info line); Esc/backdrop/× close, closeDetail tears it down, never blurred under anti-shoulder-surf — `28ed7e7`
- [x] Detail: drag-to-reorder for the tag chips — HTML5 native DnD, same drop-edge model as saved-search/recent strips; new pure lib/tag-chips.reorderTags (move from->to with before/after, cleaning+dedupe, no-op guards); commits through the same updateTags+render path so the three tag-edit surfaces can't drift — `d2a49c5`
- [x] Search: `is:langoverride` operator — surface clips with a hand-pinned force-language (or forced-off), gate = lang-override.hasLangOverride (same values selectValueFor treats as non-Auto), presence-only/direction-agnostic, parser+applyQuery+describeQuery + Cmd+K live-count command + empty-state hint — `11d804a`
- [x] Export: force-language override drives the fenced-code export tag — new lang-override.exportFenceLang folds the override into copy-as-Markdown + send-to "Copy as fenced code" (forced lang wins, "none" -> bare fence/prose, auto -> detected); markdownAsFence decides fence-vs-prose; SendableClip.langOverride threaded through both buildSendActions sites — `dd7429a`
- [x] Lightbox: prev/next traversal through image clips without closing — new pure lib/lightbox-nav (imageNavIds derives the zoomable-image subsequence in list order via the canZoom gate; stepLightbox resolves prev/next with wrap; lightboxPosition feeds an "image N of M" caption tail). Chevrons on each side + [ / ] + ←/→ step the image-only nav set; popup tracks the open clip id, swaps img+caption in place, hides chevrons for a lone image. Local data URLs only. 21/21 sanity — `aa5165e`
- [x] List: click a day-group divider to select that whole day's run — new pure lib/day-run (dayRunClipIds slices the run window the header was counted over, clamping a stale count to the live list length; dayRunToggleAction decides select-vs-deselect from whether every run id is already selected). Divider is now a button carrying run-start+count data attrs, keyboard-reachable (focus ring), toggle semantics, anchors a following Shift+Click. 15/15 sanity — `9c06700`
- [x] Detail: keyboard reorder for tag chips (Ctrl/Cmd+arrow) — new pure reorderChipTargetIndex + isChipReorderKey in lib/tag-chip-nav resolve the destination; popup commits through a shared reorderDetailTag helper reusing the EXACT reorderTags+updateTags+render path the drag drop uses (mouse + keyboard reorder can't drift), keeps focus on the moved chip, clamps at ends. Checked before plain-arrow focus-nav (modifier distinguishes move-chip vs move-focus). 16/16 sanity — `854d8e2`
- [x] Settings: bulk Copy-as-Markdown clip separator (rule vs blank line) — planBulkMarkdown takes a separator arg (defaults "rule" so callers unchanged) via new pure bulkMarkdownSeparator; new additive Settings.bulkMarkdownSeparator + Settings-panel <select> wired through open/save with tamper-snapping; bulk-md click reads live preference before clipboard write. Block CONTENT identical across styles, only the seam changes. Sidesteps targets that treat `---` as a thematic break / front-matter fence / new-slide marker. 12/12 sanity — `c967d7d`
- [x] Search: `is:wrapoverride:on` / `:off` direction-specific variants — new pure wrap-pref.wrapOverrideMatches (strict directional gate sharing the typeof-boolean check with hasWrapOverride); search.ts wrapOverrideDir field (parser sets presence+direction; applyQuery directional gate REPLACES presence when a direction is given); describeQuery reads wrap-on/nowrap; two new Cmd+K Filter commands with live split counts + empty-state hint. on+off partition the forced set exactly. 16/16 sanity (existing presence test 10/10 green) — `e712cc4`

## Tick log

(One line per tick. Newest at top.)

<!-- TICKS BELOW -->

- **2026-06-26 09:54 PT** — 5/5 shipped (frontend UX, fresh surfaces).
  Five DISTINCT surfaces (image-viewer / list-selection / search grammar
  / bulk-export / list-selection), each closing an open follow-up from
  the last tick. (1) `861c954` lightbox +/-/0 zoom stepper — new pure
  lib/lightbox-zoom (clamped [fit, 5x] additive 0.5 steps so the readout
  lands on round percents; clampZoom/stepZoom-with-boundary-saturation/
  canZoomIn/Out/formatZoomPercent/zoomTransform); bottom-centre control
  cluster (out / %-readout-as-reset / in), + = / - _ / 0 keys, scale-from-
  centre with overflow pan once enlarged, each image opens/steps fitted;
  FOLDS IN the open prefers-reduced-motion a11y item (drops the backdrop
  fade + zoom tween); new `minus` icon; 42/42. (2) `af97a90` click a
  list-row image thumb → lightbox directly (skip detail) — new pure
  lib/thumb-zoom.shouldZoomThumb gates on hit-test + kind + selection
  intent (selection ALWAYS wins so the thumb isn't a hole in multi-select);
  zoom-in cursor + accent-ring hover cue, no new tab stops; 11/11. (3)
  `5cf3385` is:langoverride:off / is:langoverride:<lang> direction
  variants — new lang-override.langOverrideMatches + isLangOverrideDir
  (normalises off/none to the forced-off sentinel, validates a lang id;
  a bad dir matches NOTHING + the parser rejects it to free-text); apply
  gate replaces presence when dir set; describeQuery "lang-off"/"lang:rust";
  new "tinting forced off" Cmd+K command w/ live count; 25/25 (is-lang
  12/12 + lang-override 25/25 regress clean). (4) `1cbbde0` bulk
  Copy-as-Markdown honors langOverride — BulkMarkdownClip.langOverride +
  bulkMarkdownAsFence (mirrors the popup's markdownAsFence) + exportFenceLang
  so a pinned-"rust" clip's batch fence is byte-identical to its single
  paste; flows through with no call-site change (popup passes full clips);
  9/9 (separator 12/12 regress clean). (5) `f0e4674` Shift+click a day
  divider ADDS the run (cross-day multi-select) — new day-run.
  dayRunModifierAction (Shift = always select, never deselect) +
  dayRunAddedCount (net-new for an honest "Added N" toast); plain-click
  byte-identical; 26/26 (10 new). Gate: tsc --noEmit clean; chrome +
  firefox builds green (popup 461.4KB, background 48.0KB, content 31.2KB);
  full sanity suite 116/116. Pushed 6163862..f0e4674.


- **2026-06-26 04:52 PT** — 5/5 shipped (frontend UX, fresh surfaces).
  Spread across five DISTINCT surfaces (image-viewer / list-selection /
  tag a11y / settings+export / search grammar), each closing an open
  follow-up from the last few ticks. (1) `aa5165e` lightbox prev/next —
  new pure lib/lightbox-nav steps the zoomable-image subsequence in list
  order with wrap (chevrons + [ / ] + ←/→), "image N of M" caption tail,
  chevrons hide for a lone image; 21/21. (2) `9c06700` click a day-group
  divider to select that whole day's run — new pure lib/day-run slices
  the header's run window (clamps a stale count) + toggle select/deselect;
  divider is now a keyboard-reachable button anchoring a following
  Shift+Click; 15/15. (3) `854d8e2` keyboard reorder for tag chips
  (Ctrl/Cmd+arrow) — new pure reorderChipTargetIndex commits through the
  SAME reorderTags+updateTags path the drag uses so mouse+kbd can't
  drift, focus follows the moved chip; 16/16. (4) `c967d7d` bulk
  Copy-as-Markdown clip separator setting (rule vs blank line) —
  planBulkMarkdown gains a separator arg via pure bulkMarkdownSeparator,
  additive Settings field + panel <select>; sidesteps targets that read
  `---` as a thematic break / front-matter; 12/12. (5) `e712cc4`
  is:wrapoverride:on / :off direction variants — new pure
  wrap-pref.wrapOverrideMatches; parser sets presence+direction,
  applyQuery directional gate replaces presence, two Cmd+K commands with
  split counts; on+off partition the forced set; 16/16 (presence 10/10
  still green). Gate: tsc --noEmit clean; chrome + firefox builds green
  (popup 454.8KB, background 48.0KB, content 31.2KB); full sanity suite
  112/112. Pushed a7f8443..e712cc4.


- **2026-06-25 23:13 PT** — 5/5 shipped (frontend UX, fresh surfaces).
  Deliberately spread across five DISTINCT surfaces (list / image /
  tag-interaction / search / export) to avoid clustering on the recent
  code-tinting work. (1) `0d61ca0` per-day clip-count badge on the
  day-group dividers — new lib/day-group.computeDayHeaderInfos returns
  {label,count} per run-start; computeDayHeaders is now its label-only
  projection so the two can't drift; muted lighter-weight count span
  (11/11 sanity). (2) `28ed7e7` click-to-zoom lightbox for image clips —
  full-res preview over a dim backdrop, local data URL (no network);
  new pure lib/lightbox (canZoom gate + lightboxCaption mirroring the
  detail image-info line to the digit); top z-index, Esc/backdrop/×
  close, closeDetail tears it down, src dropped from memory on close,
  never blurred under anti-shoulder-surf (17/17 sanity). (3) `d2a49c5`
  tag-chip drag-to-reorder — HTML5 DnD, same drop-edge model as the
  saved-search/recent strips; new pure lib/tag-chips.reorderTags (move
  from->to with before/after edge, cleaning+dedupe, no-op guards);
  commits through the same updateTags+render path as the chip × and raw
  input (14/14 sanity). (4) `11d804a` is:langoverride operator — find
  clips with a hand-pinned (or forced-off) tinting language, gate =
  lang-override.hasLangOverride, presence-only; parser+applyQuery+
  describeQuery + Cmd+K live-count + empty-state (12/12 sanity). (5)
  `dd7429a` force-language drives the fenced-code export — new
  lang-override.exportFenceLang folds the override into copy-as-Markdown
  + send-to "Copy as fenced code" so a Rust clip pinned to "rust"
  exports ```rust instead of the detector's wrong guess; markdownAsFence
  decides fence-vs-prose; SendableClip.langOverride threaded through both
  buildSendActions sites (16/16 sanity). Gate: tsc --noEmit clean;
  chrome + firefox builds green. 70 new sanity checks + lang-override
  25/25 + is-wrapoverride 10/10 + detail-nav 31/31 regression clean.
  Pushed c28f6e2..dd7429a.

- **2026-06-25 18:59 PT** — 5/5 shipped. Theme: five orthogonal
  frontend slices across five distinct surfaces (detail-tags / search /
  list / detail-code visual / detail-code interaction), four of them
  direct follow-ups blessed in last tick's open list. (1) `4f427bd`
  detail tag chips become a roving-tabindex toolbar — ←/→/Home/End move
  focus between chips, Backspace/Delete removes the focused chip AND
  lands focus on a sensible neighbour (the slid-in tag, the new last, or
  the raw input when emptied) so keyboard-only users keep deleting
  without the mouse. New pure lib/tag-chip-nav (nextChipFocusIndex
  clamps at ends; focusIndexAfterRemove resolves the landing); click +
  keyboard both route through one removeDetailTag helper so they can't
  drift. focus-visible ring, 23/23. (2) `fcc4316` `is:wrapoverride`
  search operator — surfaces clips pinned to their own detail-body wrap
  (the "what did I override?" review pass that the per-clip wrap feature
  had no entry point for). Gate is wrap-pref.hasWrapOverride, the SAME
  predicate the detail toggle badges with, so filter + paint agree.
  Parser + applyQuery + describeQuery + Cmd+K command (live count, greys
  at 0) + empty-state hint. 8/8. (3) `641e474` richer list hover-peek
  for LINK clips — folds source title + full URL into the tooltip even
  when the body fits the row, so two same-host links disambiguate in one
  hover. New lib/linkPeekTooltip dedups against what's already visible +
  collapses title/url/body duplicates. 11/11. (4) `ac18536` code-body
  tok-punct token class — soft-tints structural glyphs `{ } ( ) [ ] ; ,`
  + arrows `=> ->` so nesting/call structure is scannable. Only runs in
  plain-text gaps (strings/comments claimed first → never mis-tinted),
  arrows lead the alternation so `=>` is one span, config langs opt out,
  XSS-safe. 18/18. (5) `ca50138` per-clip force-language override —
  detail dropdown to override the auto-detected tinting language or
  force it off when detectCodeLang guesses wrong / can't classify. New
  pure lib/lang-override (three-state effectiveLang, normalizers,
  options) + additive ClipItem.langOverride + db.setLangOverride
  (mirrors wrapOverride). Live "auto → Rust" hint. 25/25. Gate: tsc
  --noEmit clean; chrome + firefox builds green (popup 437.5kb). Pushed
  367e972..a76c8bb. 83 sanity checks across 5 new bundler-free suites.
  No new lib touched the network or weakened local-only / MV3.


- **2026-06-25 08:41 PT** — 5/5 shipped. Theme: frontend UX papercuts,
  all five orthogonal. (1) `25d7fa7` list hover-peek tooltip for previews
  truncated at 140 chars (new lib/list-peek, flatten+cap+ellipsis,
  null-when-fits). (2) `8e65ea8` detail-stats Alt-click copies a Markdown
  stat line (`**1,240** chars · **198** words`; content-stats gains
  formatContentStatsMarkdown with strip-** == plain invariant). (3)
  `c9812b7` bulk Copy-selected hover previews the joined char total
  (planBulkCopy gains chars = code-point length of exactly what hits the
  clipboard). (4) `78f3995` footer focus breadcrumb appends "· N selected"
  during keyboard nav (focus-position gains selectedCount tail). (5)
  `4724a03` detail prev/next wraps last↔first with a "looped" toast (new
  lib/detail-nav.nextDetailIndex, matches similar-nav cycle). Gate: tsc
  clean, chrome+firefox built (popup 412.3kb). Sanity 196/196 across 5
  suites (list-peek 21, content-stats 68, bulk-clipboard 50,
  focus-position 26, detail-nav 31).

- **2026-06-25 03:51 PT** — 5/5 shipped. Theme: extended last tick's
  fresh non-hashtag frontend cluster with five orthogonal slices —
  three of them direct follow-ups to features that landed last tick,
  two new UX gaps. (1) Detail content-stats breadcrumb is now
  click-to-copy — clicking "1,240 chars · 198 words" writes that exact
  summary to the clipboard + toasts a receipt (`7c06937`, new
  contentStatsClipboard + formatContentStatsCopyToast in
  lib/content-stats, WYSIWYG via the canonical formatter). (2) Bulk
  "Copy selected as Markdown" — structured sibling of plain bulk-copy;
  each clip renders with the single-clip MD grammar (fenced code via
  detectCodeLang, image/link syntax, cited blockquotes) joined by a
  horizontal rule; new lib/bulk-markdown + monochrome `markdown` glyph +
  Cmd+K command for keyboard parity (`5a5ef7a`). (3) Shift+↑/↓ keyboard
  range-extend — the keyboard twin of Shift+Click range-select, reuses
  the same lib/range-select helpers, additive extend-only contract,
  documented in footer hint + cheatsheet (`01ee6b4`). (4) Footer
  "row N of M" keyboard-focus breadcrumb — new pure lib/focus-position,
  shown only while arrow-navigating (listKeyboardActive flag), hidden on
  search focus, accent-tinted aria-live pill (`c35cd17`). (5) Quick-chips
  scroll-shadow edge-fade — new pure lib/scroll-shadow (computeScrollEdges
  with 1px epsilon), mask-image fades toggled by data attributes,
  re-measured on rAF + scroll + resize (`246019c`). Gate: tsc --noEmit
  clean; chrome + firefox builds green (409.4kb popup). Pushed
  300c638..246019c. No new lib touched the network or weakened
  local-only / MV3.


- **2026-06-24 21:38 PT** — 5/5 shipped. Theme: deliberately broke out
  of the multi-tick hashtag/note-cleanup rut with five fresh,
  orthogonal frontend slices filling obvious UX gaps. (1) Detail
  content-stats breadcrumb — chars/words/lines under the body
  (`1c06003`, lib/content-stats, 53/53 sanity). (2) Shift+Click range
  selection in the list — direction-agnostic span from anchor, gated on
  active selection so Shift=MD shortcut survives (`4682392`,
  lib/range-select, 37/37). (3) Search inline clear (×) button +
  Esc-to-clear (`49862e5`, DOM-coupled, build-gated). (4) Bulk "Copy
  selected" — join N clip bodies to clipboard, skip images, raw
  templates (`1e36355`, lib/bulk-clipboard, 43/43). (5) Detail word-wrap
  toggle — wrap/nowrap body for tabular/log/wide-code, persisted in meta
  (`d267c36`, lib/db + 20/20). tsc clean; chrome+firefox builds green
  (popup.js 391.7→401.3kb, +9.6kb; bg+content unchanged). 153/153 sanity
  across 4 new suites. Pushed 8b0152f..d267c36.


- **2026-06-23 21:38 PT** — 5/5 shipped. Theme: a complete
  hashtag-cleanup affordance lattice for both individual clips
  and bulk selections, plus search operators and a keyboard-pick
  filter path. Each feature composes existing primitives
  (extractHashtagsFromNote / mergedTagsForClip /
  stripHashtagsFromNote / sanitizeClipNote) so the 5 new entry
  points produce BYTE-IDENTICAL stored state to what the user
  would get by clicking the constituent actions back-to-back —
  composition law holds, no semantic drift across promote / strip
  / combo / search / palette-filter. (1) `is:hashtags` /
  `is:nohashtags` search operators — narrows is:noted to clips
  whose note carries promotable inline tags (or DOESN'T, for
  prose-only filtering). Shares extractHashtagsFromNote with
  Tag-from-notes and discovery, so the filter, the promote, and
  the report all agree on what counts. Parser + applyQuery +
  describeQuery + 2 Cmd+K mirrors + empty-state hint string.
  `is:hashtags` implies `is:noted`; `is:nohashtags` does NOT
  imply `is:nonoted` (prose-only annotated clips pass both),
  combining them = empty by AND-semantics. (2) Detail-view
  "Strip N #tags" chip — sibling of the existing promote chip in
  the note-row foot. Removes inline `#tag` tokens from the note
  while preserving prose. Different gate from promote (no
  structured-tag list interaction) — strip surfaces whenever the
  note has ANY hashtags, even already-promoted ones. New pure
  module note-hashtag-strip with stripHashtagsFromNote (regex
  mirroring extractHashtags's leader+char-class+32-cap),
  4-pass whitespace tidy (collapse, paragraph guard, per-line
  trim, sanitize round-trip), per-occurrence count helper, 3
  formatters. Warm-neutral chip styling alongside the accent
  promote chip. (3) Bulk-bar "Strip hashtags from notes" — bulk
  counterpart with scissors icon. Different gate from
  Tag-from-notes (cares about PRESENCE, not promotion delta) so
  the cleanup-after-promotion workflow surfaces the strip button
  even when every hashtag is already structured. No confirm
  (prose preservation contract), toast surfaces "(N notes
  emptied)" tail honestly. Cmd+K mirror under "Bulk" group. (4)
  Detail-view "Promote N #tags + strip" combo chip — single-clip
  one-click that runs promote-then-strip. Same gate as standalone
  promote (needs at least one NEW hashtag to promote) so the
  chip hides when strip-alone is the right move. Result is
  byte-identical to two-click promote→strip via mergedTagsForClip
  + stripHashtagsFromNote composition. Visual: accent-soft body +
  warm border ring telegraphs "two operations in one"; sits
  between promote and strip in the note-row foot matching the
  workflow order. All 5 paint anchors refresh the trio of chips
  in lockstep (renderNoteRow + 4 click/input handlers). (5) Cmd+K
  dynamic per-hashtag filter rows (top 8) — closes the discovery
  command's open follow-up ("full panel UI"). Each top-N hashtag
  in the visible clip set's notes gets its own palette row:
  "Filter to clips with #staging in notes (8 clips)" — Enter
  injects `is:hashtags #staging` into the search box. Composes
  this tick's new is:hashtags operator + the existing hashtag
  grammar's precision. New hashtagFilterActionFor helper in
  hashtag-discovery; alreadyTagged flag shapes the label tail +
  hint copy + keywords. All 5 builds clean (popup.js: 374.0kb →
  391.7kb +17.7kb for 5 modules, content.js + background.js
  unchanged). tsc clean. 173 new sanity checks (19 + 49 + 38 +
  45 + 22) and zero regressions on adjacent suites (hashtag-
  discovery, tag-from-notes, note-hashtag-promote, tag-from-
  notes-clear, clip-note, note-warning all still green).
  Commits: 22737d9, 6afdd19, 598f678, 2b4eedc, 8d30c7c.

- **2026-06-23 17:57 PT** — 5/5 shipped. Theme: closing the
  note-hashtag loop in five orthogonal directions (paste-time
  warning + discovery + per-clip promote + destructive combo +
  shell-comment). Every feature this tick composes existing pure
  primitives (extractHashtagsFromNote / mergedTagsForClip /
  curlCommandForClip / hasClipNote / sanitizeClipNote) so the
  five new entry points produce byte-identical output to what
  the user would get by running the constituent actions back-
  to-back — composition law holds across all 5. (1) In-page
  palette warning tint — when a clip's note contains caution
  keywords (prod / staging / do not / deprecated / secret /
  draft / wip / 18 more), the palette row paints with a soft
  warm-red background + the note-tail prefix swaps from "note:"
  to a ⚠ glyph so the user sees the row is FLAGGED before
  reading the tail. Sits one rung above last tick's note-tail
  surfacing — the tail shows WHAT the caveat says, the tint
  shows THAT it carries weight. Pure note-warning module with a
  24-entry curated keyword list (env names + caution verbs +
  lifecycle markers + secrecy markers) + single combined regex
  compiled once with `\b` boundaries (preproduction / donut /
  restaging all rejected — word-boundary discipline). Multi-
  word phrases ("do not", "internal only") accept variable
  whitespace via `\s+` so tabs and double-spaces match;
  apostrophe in "don't paste" hard-matched. Hashtag forms
  (#prod, #staging) also trigger via the leading-`#` boundary.
  Excluded by design: "dev" / "test" / "live" too noisy in
  unrelated note prose. False positives are cosmetic only — no
  data dropped, no action blocked. 73/73 sanity covers
  defensive (null/undefined/empty/non-string), positive case
  per keyword, word-boundary discipline, punctuation
  boundaries, multi-word edge cases (extra whitespace, tab,
  word-order), stateful-regex repeat-safety (no lastIndex
  drift), realistic notes with + without warnings, canonical
  lowercase form, NOTE_WARNING_KEYWORDS constant shape
  (b0000a9). (2) Cmd+K "Find hashtags in notes" — discovery /
  triage command in Filter group. Scans currentClips for the
  #hashtag distribution and surfaces a sorted toast ("Found
  #staging in 8 clips, #wip in 5, #review-q3 in 2") so the user
  SEES what's hiding in their notes BEFORE committing to a bulk
  promote. Closes the loop the OPPOSITE direction from Tag-
  from-notes (which writes) — this reads so the user can decide
  whether to wipe noise (#wip), promote signal (#staging), or
  just keep awareness without acting. Pure hashtag-discovery
  module composes extractHashtagsFromNote so the discovery + the
  bulk Tag-from-notes share a single source of truth on what
  counts as a hashtag (32-char cap / 16-per-note cap / word-
  boundary start / lowercase fold). Per entry: alreadyTagged
  flag identifies hashtags already in EVERY clip's structured
  tag list (case-insensitive match) so the user distinguishes
  "would do work" from "already promoted everywhere". 4-shape
  toast grammar (empty / single-tag / 2-3-inline / 4+-headline-
  with-top3-hint). Hint pre-computes a topN=1 report at palette
  build time for the live preview; click handler re-scans with
  topN=12 for the headline list. Always available (empty scan is
  the useful answer "no hashtags in any visible note"); greyed
  only when no clips visible at all. 36/36 sanity covers
  defensive (null/non-array/empty), basic extraction, aggregation
  (same hashtag across N clips, twice-in-one-note counts once),
  alreadyTagged tracking (true when all clips have it, false
  when any don't, case-insensitive match, per-hashtag
  granularity), sort (count-desc + alpha-tiebreak), topN
  (limits entries / preserves distinctTags / defensive against
  0/negative/NaN), both formatters at every shape, realistic
  12-clip workspace end-to-end (da66486). (3) Detail-view
  per-clip "Promote N #tags" chip — note-row foot surfaces an
  accent-tinted chip when the current note text contains
  #hashtag tokens NOT already in the structured tag list. Click
  promotes inline using the same db.updateTags path the bulk-
  bar uses — single-clip variant of bulk Tag-from-notes that
  bypasses the multi-select requirement. Why this matters:
  detail-view is where the user EDITS the note. The moment they
  type "#staging" into a note is the moment they're most likely
  to want a structured tag with that name; the chip catches the
  intent IN PLACE before they close detail-view. The chip is
  INCREMENTAL — visible only when there's work to do; after
  promotion (every hashtag now structured) the chip vanishes.
  Zero noise when nothing's pending. Pure note-hashtag-promote
  module composes extractHashtagsFromNote + mergedTagsForClip
  from tag-from-notes so single-clip + bulk paths produce
  byte-identical merged tag lists for the same input. Live
  refresh on detailNote input event so chip appears the moment
  user finishes typing `#staging`; also refreshes on
  detailTags input + change so a manually-typed structured tag
  matching a hashtag immediately hides the chip. dataset.merged
  stash so click acts on the plan the user SAW, with defensive
  re-plan as tie-break. 4-shape grammar (empty / 1 / 2-3 list /
  4+ count form). Tooltip surfaces full pending list + optional
  "Already tagged: #x" tail so user knows what's IGNORED vs
  ADDED. 47/47 sanity covers defensive (null/undefined/missing-
  id/missing-note/non-string), extraction (single / multi /
  already-tagged / mixed), case-insensitive matching (Hashtag
  vs structured tag), duplicate-in-note collapses to one,
  hyphenated hashtags, non-array tags + non-string entries
  filtered, mergedTags preserves existing tag order with new
  appended in note order, all 3 formatters at every shape,
  realistic chip cycle (paint → click → hide → user adds new
  hashtag → chip reappears) (45e8681). (4) Bulk-bar "Tag from
  notes + clear notes" combo — eraser-icon button next to the
  standalone Tag-from-notes. Combines additive + destructive:
  promotes #hashtags AND wipes source note text on every clip
  where promotion happened. The standalone Tag-from-notes
  STILL EXISTS for the keep-the-prose workflow (note has more
  than just hashtags — "be careful #staging, check $person
  first" — clearing would lose the prose). The combo is
  TARGETED: only clears notes on clips where promotion
  happened. A clip with no hashtags keeps its note. A clip with
  all-already-tagged hashtags also keeps its note (nothing got
  promoted = nothing to clean up). Pre-prompt destructive
  confirm surfaces "Add #X to N clips AND clear N notes?" so
  misclick on the combo button (vs standalone one row over)
  doesn't surprise-wipe notes. Pure tag-from-notes-clear
  module composes existing primitives so the combo + standalone
  + single-clip paths all produce identical structured tag
  output for the same input. 5-shape toast grammar
  (nothing-to-tag / no-hashtags / all-already-tagged / single-
  tag-single-clip tightest form / multi-tag-multi-clip). Cmd+K
  mirror distinct from standalone palette row so keyboard
  discovery surfaces the destructive variant separately. 39/39
  sanity covers defensive (null/missing-id/no-note), per-clip
  action (promote-and-clear / all-already / mixed / case-
  insensitive), plan aggregation (single / no-promote /
  already-tagged / mixed / distinctNewTags from multi-clip
  same-tag), actionable predicate at every shape, toast +
  button-title grammar at every shape, realistic 4-clip end-
  to-end + idempotent re-run no-op verification (491bf7f).
  (5) Detail send-to "Copy as cURL with note comment" — for
  any clip with BOTH a curlable URL AND a non-empty note, emit
  `curl 'url' # note` single-line shell command. Common
  workflow: handing off a request to someone (Slack, PR
  comment, runbook paste) where recipient needs both the
  command AND the caveat. End-of-line `# note` form survives
  single-line paste everywhere (terminals + chat apps that
  strip newlines on paste won't drop the note); shells treat
  ` # ...` as a real comment so the line runs verbatim.
  Composition: byte-identical to standalone `Copy as cURL` row
  on the URL half (delegates to curlCommandForClip — no re-
  implementation of shell-quoting). Critical safety: multi-
  line notes COLLAPSED to single line. A newline in the
  shell `#` comment would TERMINATE the comment and turn
  note text into an executable shell command. The
  sanitiseForShellComment helper handles this defensively +
  caps at 200 chars with word-boundary truncation + strips
  C0 controls (belt + braces over sanitizeClipNote which
  does this at store-time). New send-to row id=curl-note
  slots between curl and fenced-code; count bumped 16→17.
  Hides when EITHER URL unshareable OR note missing — no
  dimmed half-broken combo row; both single-purpose rows
  (curl, note-md) still cover those cases. 46/46 sanity
  covers sanitiseForShellComment (defensive at every shape,
  cap normalisation, word-boundary truncation, hard-slice
  fallback for giant words, default cap fallbacks),
  curlWithNoteCommentForClip (defensive + positive for
  link/text/single-quote-URL/multi-line-note/long-note),
  buildSendActions integration (row exists/hides/order=
  curl+1/image-clip-with-url), shell-comment safety
  (backtick, dollar-sign, hyphen-flag) (901c2f5). Quality
  gates: tsc --noEmit clean, chrome+firefox builds green
  (popup 374.0kb +16.9kb for 5 features + 4 new pure
  modules + chip CSS + bulk button + Cmd+K commands;
  background 48.0kb unchanged; content 31.2kb +2.8kb for
  note-warning module + warning-tint CSS + tooltip wiring).
  All 85 sanity suites pass (5 new this tick: note-warning,
  hashtag-discovery, note-hashtag-promote, tag-from-notes-
  clear, curl-note-comment = 241 new checks); 0 regressions
  across existing 80 suites (send-to + json-line count
  assertions bumped 16→17 to reflect new row).

<!-- LATEST TICK ABOVE -->


- **2026-06-23 13:46 PT** — 5/5 shipped. Theme: note-family
  composition + host-rule operator family completion. (1)
  `is:hostpinned` / `is:hostredacted` / `is:hostscrubbed` —
  completes the host-rule operator family alongside last tick's
  `is:hostlocked`. Three new search operators surfacing clips
  whose host carries a configured site rule with the
  corresponding flag. Same cross-store join shape as hostlocked
  (site_rules × clips, first-match-wins, per-host verdict cache),
  distinct lens from per-clip bits (rule presence vs current
  clip state). New pure host-rule-flags module generic over
  HostRuleFlag so the three operators share one implementation
  with strict `=== true` gate matching host-locked's autoLock
  check. Three new Cmd+K Filter commands each grey when count=0
  with live host-count hint ("clips from 3 autoPin'd hosts").
  Four new applyQuery predicate opts (hostPinnedPredicate,
  hostRedactedPredicate, hostScrubbedPredicate alongside
  existing hostLockedPredicate) with same fall-open contract so
  tests without rules access don't accidentally empty result
  sets. Empty-state hint extended with all 3 new operators.
  29/29 sanity covers defensive cases, matching (www-strip +
  wildcard), strict gate, first-match-wins in both directions,
  per-flag independence, distinct-host listing, realistic 4-host
  × 4-flag matrix. All 24/24 existing is-hostlocked sanity
  passes (aba7302). (2) Detail send-to "Copy clip + note as
  Markdown" — composite fenced-code body + Markdown blockquote
  note joined by paragraph-break for the third workflow
  (sharing snippet WITH commentary in a PR / doc / chat — both
  the code AND the caveat in a single paste). New pure
  clip-note-markdown module composes existing fencedCodeForClip
  + noteAsMarkdownBlockquote (byte-identical to running both
  standalone rows back-to-back — composition law verified by
  sanity test 12 via component re-import). Two-newline paragraph
  separator survives all common Markdown engines (GitHub GFM,
  Notion, Slack mrkdwn-ish fallback). Hides when EITHER body
  unusable (image/empty) OR note missing — no dimmed
  half-broken combo row. Send-to count bumped 15→16; both
  sanity-send-to and sanity-json-line assertions updated (the
  latter was 2 behind because it predated note-md). 19/19 sanity
  covers availability gate matrix, output shape (text + link +
  code clips), multi-line note preservation, CRLF normalisation,
  composition law (c4cdc32). (3) `is:notenewer:Nd` /
  `is:noteolder:Nd` — chronology gates over `noteUpdatedAt`
  with same `Nd`/`Nh`/`Nw` duration grammar as `before:`/
  `after:` (delegates to existing parseDuration helper for
  consistency). Distinct from `after:` (gates on `lastSeenAt`
  re-copy recency NOT `noteUpdatedAt` annotation-decision
  recency — same divergence rationale as recently-noted vs
  `is:noted after:7d` in Cmd+K). Lets the user write any
  timeframe directly: `is:notenewer:1d` for today's annotations,
  `is:noteolder:90d` for quarterly review. Band-pass via
  AND-semantics composition (`is:notenewer:30d is:noteolder:7d`
  → notes touched between 7 and 30 days ago); contradictory
  bounds (newer=5d, older=10d) yield empty set by AND. Both
  imply `is:noted` + finite noteUpdatedAt (legacy unstamped
  notes correctly fall out by definition). Typo rejection
  preserved: bad duration falls through to leftover so user
  sees their typo as plain text. 2 new Cmd+K commands with
  default 7d/30d thresholds + greys when no clip satisfies.
  33/33 sanity covers all 5 duration units, strict gates,
  boundary inclusivity, AND-semantics band-pass +
  contradiction-empty, composition with is:locked, describeQuery
  surface, end-to-end parse-then-apply round-trip (15d6b9a).
  (4) Bulk-bar "Tag from notes" — scan each selected clip's
  note for `#hashtag` tokens and merge them into the clip's
  structured tag list. Promotes ad-hoc inline tagging (the way
  most people naturally write notes — "be careful — #staging
  #deprecated") into structured tags that power `tag:` search,
  top-host pills, and the bulk-tag column. New pure
  tag-from-notes module with strict hashtag regex (SOL or
  whitespace/punctuation leader so `foo#bar` URL-fragment style
  rejected, alphanumeric/underscore start char so `#-foo`
  rejected, 32-char per-tag cap, 16-tag per-note cap,
  case-folded to lowercase, hyphens allowed mid-tag).
  Case-insensitive dedup against existing tags. Plan-then-toast
  projection with 8-shape grammar (failure-mode disambiguation:
  no-notes / no-hashtags / already-tagged / 1-tag-1-clip /
  1-tag-N-clips with plural noun / N-tags-1-clip /
  N-tags-across-M-clips). New bulk-bar `hash`-icon button +
  Cmd+K Bulk mirror; button hides entirely when
  isTagFromNotesActionable=false (no dead chord). 53/53 sanity
  covers 18 extract cases (defensive, grammar, dedup, case-fold,
  caps, hyphens, underscores, digits, multiline, after-
  punctuation, after-text rejected), 8 merge cases, 6 plan
  cases, 4 actionable cases, 8 toast shapes, 7 button-title
  shapes, 1 realistic 4-clip end-to-end (e4f50da). (5) In-page
  palette surfaces clip notes inline — when a clip carries a
  note, the palette renders a small italicised tail under the
  preview line so the user sees the caveat ("staging only",
  "needs login") BEFORE pasting. Passive surfacing at the
  moment of paste-decision matters because most users won't
  open detail-view to verify a caveat before reaching for
  Cmd+Shift+V. New pure palette-note-tail module with
  trim+whitespace-collapse+80-char word-boundary truncation
  (hard-slice fallback when last-space < 60% of cap window).
  Shadow-DOM `.note-tail` CSS rule (italic dim gold #c4a86b
  with 0.85 opacity sitting between meta and preview, "note: "
  prefix in non-italic at lower opacity differentiates label
  from text). PaletteClip interface gains optional `note?:
  string` field (back-compat preserved — older messages render
  unchanged). Both background.ts cc-open-palette send sites
  (context-menu + keyboard-shortcut) updated to pass through
  `note: c.note` in the lite payload. 24/24 sanity covers
  defensive cases, trim, whitespace collapse, truncation
  (cap-exact / hard-slice / word-boundary / 60% fallback),
  custom cap (invalid falls back to default, decimal floored),
  predicate-formatter consistency, realistic short + paragraph
  cases (bb510ec). Quality gates: tsc --noEmit clean,
  chrome+firefox builds green (popup 357.1kb +19kb for 5
  features + 5 new sanity-friendly pure modules + 1 new icon
  + tag-from-notes button + .note-tail CSS in content;
  background 48.0kb +0.6 for cc-open-palette note pass-through;
  content 28.4kb +1.5 for note-tail rendering + import).
  All 80 sanity suites pass (5 new this tick: host-rule-flags,
  clip-note-markdown, note-chronology, tag-from-notes,
  palette-note-tail = 158 new checks); 0 regressions across
  existing 75 suites.

- **2026-06-23 10:05 PT** — 5/5 shipped. Theme: post-note-suite
  expansion in 5 orthogonal directions. (1) `is:hostlocked` search
  operator — cross-store join (site_rules × clips) under first-
  match-wins semantics, distinct lens from `is:locked` (per-clip
  bit) — answers "is this from a site I've protected by RULE?"
  vs "did I lock THIS clip?". Pure host-locked module with
  closure-scoped per-host verdict cache, refreshed per render
  (no stale rule decisions). Pairs orthogonally with is:locked
  (alignment view) and is:unlocked (drift view). Empty-state
  hint + Cmd+K Filter command with live count + distinct-host
  hint. 24/24 sanity. (def8a6c). (2) `is:notelonger:N` /
  `is:noteshorter:N` — note-length filters with strict comparison
  (>N / <N — boundary belongs to neither). Both implicitly
  require is:noted (no-note clips never match — the operators are
  about note LENGTH, not absence; use is:nonoted for absence).
  Strict-integer parser rejects decimals/signs/empty-tail to
  leftover (typos surface as plain text). AND-semantics
  composition yields a band-pass filter
  (is:notelonger:10 is:noteshorter:50 → notes in [11..49]).
  describeQuery summary gains "note>N"/"note<N" pills. Cmd+K
  defaults: 120 (essays) / 30 (sticky-note style triage
  candidates). 22/22 sanity. (02fe975). (3) Note composer
  pre-fill from active tab title — replaces blank-textarea with
  "Captured from <title>" stem, giving the user a frame to
  edit/append/blow-away instead of facing the "what was I going
  to say?" void. Pure note-prefill module with one-pass site-
  suffix strip ("Article | GitHub" → "Article"; preserves
  legitimate subtitles via 30-char cap + terminal-punctuation
  guard), 80-char cap with word-boundary ellipsis, host fallback
  for chrome:// / file:// rejection. shouldApplyNotePrefill
  no-clobber guard keeps re-opened mid-edit composer drafts
  intact. api.tabs.query wrapped in try/catch (chrome:// scope
  has no tab access). No auto-select-on-focus (documented
  anti-pattern that wipes drafts on first keystroke). 35/35
  sanity. (28a02fc). (4) Cmd+K "Note every clip from active
  host" — third leg of the host-triage trio (pin/lock/note),
  same active-tab anchoring + 4-shape label matrix as the
  pin/lock variants. New pure host-note module mirrors
  host-lock shape exactly: idsToNoteForHost (order-preserving
  host filter, no note-state pre-filter since overwrite =
  every match participates), matchedClipsForHostNote (cheap
  O(N) count for the label), planHostNote (full projection of
  created/replaced/cleared/unchanged/finalValue using SAME
  sanitizeClipNote pipeline as detail + bulk-bar — single
  source of truth across all three entry points),
  formatNoteFromHostLabel (3-shape matrix), formatHostNoteToast
  (7-shape grammar with "from <host>" tail). Apply path
  re-reads live store at click time + counts currently-noted
  matches so prompt label warns "(N will be replaced)" up
  front; planning gates the IDB loop so idempotent re-runs
  no-op cleanly; same setClipNote RPC + noteUpdatedAt stamping
  as the other two paths. 28/28 sanity. (53b42cf). (5) Detail
  send-to "Copy note as Markdown" — wraps clip's free-form note
  as a `> ` blockquote so paste-into-docs workflows can
  include the caveat. New pure note-markdown module:
  noteAsMarkdownBlockquote normalises CRLF/bare-CR to LF,
  strips outer blanks, prefixes each line with `> ` (empty
  inner lines become `>` placeholders so paragraph breaks
  survive Markdown round-trip), passes nested quotes through
  (`> > existing` is legitimate CommonMark nesting), no length
  cap (caller controls — source note is already capped to 2k).
  Row HIDES (not greys) when un-noted so menu stays tight.
  SendableClip type extended with optional note field;
  popup passes c.note in BOTH buildSendActions call sites so
  menu-render + click-dispatch gates stay consistent. Bumped
  sanity-send-to count 14→15. 28/28 new sanity. (056cbd8).
  Quality gates: tsc --noEmit clean, chrome+firefox builds
  green (popup 338.0kb vs 320.9kb baseline, +17kb for 5
  features + sanity-friendly module split). 137 new sanity
  tests this tick; 0 regressions across 68 existing files.

- **2026-06-23 05:24 PT** — 5/5 shipped. (1) `is:nonoted` search
  operator — strict-complement parity twin of `is:noted` (the two
  partition the clip space; AND is empty by construction, matching
  `is:template is:notemplate` and `is:locked is:unlocked` contracts).
  Uses the SAME hasClipNote() predicate as the is:noted filter,
  the detail-view Clear-button visibility, and the future
  recently-noted helper — single source of truth means three
  surfaces can never disagree on what counts as "noted". Use case:
  the "what should I annotate?" review pass, especially paired with
  `is:locked` for the high-leverage "irreplaceable but uncommented"
  set. Parser typo-rejection contract preserved (`is:nonoted2` /
  `is:nonot` fall through to free text). Cmd+K Filter command +
  empty-state legend gain the new op. 18/18 sanity covering parser,
  applyQuery, describeQuery, complement-partition law, intersection
  composition (0cd3b12). (2) Detail-view `noteUpdatedAt`
  breadcrumb — schema-additive stamp on ClipItem written by
  db.setClipNote on every value-changing write. No-op fast path
  doesn't bump (re-saving the same text shouldn't refresh "noted
  recency"). Cleared back to undefined on note-delete so a future
  re-noted starts the clock fresh — same lifecycle contract as
  lockedAt around lock/unlock. New pure lib/note-updated-since.ts:
  formatNoteUpdatedSince(at, now) → {label, tooltip}, 5-tier age
  formatter (just now / Nm / Nh / N days / ISO date) with
  calendar-day boundary math so a note written 23:55 yesterday
  reads as "1 day ago" at 01:00 today (not "12h ago"); clock-skew
  defensive (future stamps clamp to just now). Bad-input safe —
  undefined/null/NaN/string → minimal "Noted" label with empty
  tooltip (caller hides row in that case). Detail-view: new
  <span id="detail-note-stamp"> pill in note-row foot, flex:1
  between count and Clear with opacity 0.75 (secondary to the
  count which is the primary live indicator during typing).
  paintNoteStamp hides for legacy clips noted before this shipped
  — no misleading "Noted" with no age. saveDetailNote() repaints
  with Date.now() on save / undefined on clear so breadcrumb
  appears immediately without re-opening detail. title attr carries
  full YYYY-MM-DD HH:MM tooltip. 25/25 sanity (tier boundaries,
  bad inputs, clock skew, calendar-day math, ISO padding) (721a67a).
  (3) Cmd+K "Show recently noted" — chronology companion to the
  recently-locked command for the per-clip note family. Pure
  lib/recently-noted.ts mirrors recently-locked exactly: 7d window
  over noteUpdatedAt, newest-noted-first sort, label grammar
  (singular/plural/zero) with freshest-age hint, available:false
  greys row when 0. Strict gate via hasClipNote() so the chronology
  + the is:noted filter + the detail-view paint all share one
  predicate. Why a dedicated helper instead of `is:noted after:7d`?
  Same rationale as recently-locked: `after:` filters on
  lastSeenAt (re-copy recency), NOT on noteUpdatedAt (annotation-
  decision recency). A clip noted last week then re-copied today
  would surface in `is:noted after:1d` but isn't a *recent
  annotation*. Run handler appends `is:noted` to the search box
  since the parsed query can't express `noteUpdatedAt >= now - 7d`
  directly — count + hint above tells the precise chronology scope.
  Module-level cache (recentlyNotedCount + freshestAt) refreshed
  once per render() from `wide` snapshot, no extra IDB read on
  palette open. 24/24 sanity (recency at window edge, strict
  gates, clock-skew tolerance, sort order, label grammar at all
  count shapes, custom-window override, mirror-symmetry with
  recently-locked) (634a3b1). (4) Trash row hover-preview surfaces
  the trashed clip's OWN note — closes the loop between
  last-tick's two big shipments (trash-row hover-match-detection +
  per-clip note feature). When a trashed clip carries a note, the
  tooltip's tail surfaces it as "Note: <summary>" — the single
  highest-signal context the user has at trash-housekeeping time.
  If they wrote "deprecated as of June" on a clip, that text
  reaches them BEFORE they purge, not after a restore-and-open
  detail dance. Notes already ride trash + restore round-trips
  for free (db.trashClip spreads the full ClipItem), so this is
  pure surface work — no new write path. formatTrashRecaptureTooltip
  extended with optional `trashed` arg (back-compat: omitting it
  gives the original 2-shape tooltip). 80-char default cap with
  word-boundary truncation, newlines collapse to single spaces.
  Note tail composes with either head shape (live-re-capture
  exists OR no-match-permanent), so a noted clip always shows its
  caveat regardless of recovery story. Note tail follows preview
  tail in the join order so "live preview" + "your note" reads as
  a natural pair. 32/32 sanity (22 existing + 10 new note-tail
  cases: present/absent, both head shapes, defensive bad inputs,
  custom notePeek, word-boundary truncation, composition with
  preview tail) (a52fe7f). (5) Bulk-bar "Add note to selection"
  — overwrite-and-warn semantics. Notes are PROSE so the natural
  bulk action overwrites rather than merges; the planner counts
  how many EXISTING notes the action will replace, and both the
  pre-prompt warning + the post-action toast surface that count
  so consequences are visible BEFORE commit. Empty input clears
  existing notes on the selection (mirrors detail-view's "save
  empty → clear" contract). New pure lib/bulk-note.ts: planBulkNote
  projects {total, created, replaced, cleared, unchanged,
  finalValue} using the SAME sanitizeClipNote() the detail-view
  editor uses — single source of truth means the bulk and editor
  paths produce identical stored values (2k cap, control-strip,
  empty→undefined). isBulkNoteActionable gates the click handler
  (short-circuits no-op selections). formatBulkNoteToast 6-shape
  grammar: total=0 / all unchanged / pure create / pure replace /
  mixed create+replace (surfaces both counts) / clearing.
  formatBulkNoteButtonTitle 4-shape hover (empty / all-unannotated
  / all-already-noted / mixed-with-existing-count). Popup: new
  bulk-note button in bulk-bar between bulk-tag and bulk-export-tag,
  noteText icon. Click handler pulls fresh records (selection
  survives filter changes + may have stale ids), pre-prompt label
  adapts to alreadyNoted count, applies via setClipNote so the
  noteUpdatedAt stamp + IDB shape stay consistent with single-clip
  path. Prompt-cancel (null) cleanly distinguished from
  prompt-empty ("") — cancel aborts, empty clears. updateBulkBar
  refreshes title every paint. Cmd+K mirror in Bulk group with
  synonyms. Idempotent re-run yields all-unchanged → no IDB writes.
  34/34 sanity (planner shape, defensive bad-input, no-op
  idempotence, all 6 toast shapes, all 4 button title shapes,
  control-char strip + 2k cap + empty contract) (ea1b1e4). Gates
  passed: tsc --noEmit clean + chrome+firefox build green (320.9kb
  popup, 47.4kb background, 26.9kb content per platform).
  Theme: full per-clip note-family completion — 5 features
  forming a coherent suite (operator inverse + breadcrumb stamp +
  chronology palette command + trash visibility + bulk apply),
  every piece sharing the hasClipNote()/sanitizeClipNote()
  primitives shipped last tick.

- **2026-06-23 01:46 PT** — 5/5 shipped. (1) Cmd+K palette
  "Show recently locked" — 7d chronology of lock decisions via
  the `lockedAt` breadcrumb (NOT `lastSeenAt`), so a clip locked
  last week then re-copied today doesn't pollute the "recent
  lock decisions" view the way `is:locked after:1d` would.
  Strict gate: `c.locked === true` AND `typeof c.lockedAt ===
  "number" && Number.isFinite(...)` — clips locked before the
  lockedAt breadcrumb shipped are still locked but have no stamp,
  so they correctly fall out of "recently" (we can't tell WHEN).
  Newest-first sort gives the freshest at the top. New pure
  `lib/recently-locked.ts` with recentlyLockedClips/
  countRecentlyLocked/formatRecentlyLockedLabel + module-level
  popup cache slots (count + freshestLockedAt) refreshed once
  per render() from `wide` — no extra IDB read on palette open.
  Run handler appends `is:locked` to the search box since the
  parsed query can't express `lockedAt >= now - 7d` directly;
  the count + freshest-age hint above tells the user the
  precise chronology scope. 29/29 sanity (5c4ed2e). (2) Detail
  free-form note — new schema-additive `note?: string` on
  ClipItem, the user's commentary on the clip ("only for
  staging" / "needs login" / "deprecated as of June") orthogonal
  to tags (structured + searchable), template (machine-
  substitutable), source/nearbyText (capture-time context). New
  pure `lib/clip-note.ts`: sanitizeClipNote (trim + 2k cap +
  C0-control strip + empty-to-undefined so deleted notes free
  their storage), hasClipNote (predicate used by detail-view
  Clear visibility + future `is:noted`), summarizeClipNote
  (one-liner with newline-collapse + word-boundary truncation),
  clipNoteDelta (char delta for future live counter). New
  `db.setClipNote` with no-op fast path when post-sanitize value
  matches existing. Detail-view: always-visible textarea row
  between Locked and Expires, dataset.original short-circuits
  no-op saves, auto-save on blur + Cmd/Ctrl+Enter, live char-
  counter "N / 2000" with over-cap red flag (the sanitizer
  slices over-cap content, so red flags imminent loss), Clear
  button with optimistic UI. Toast on save/clear, error toast
  on mid-edit clip-vanish race. 38/38 sanity (2134bfc). (3)
  `is:noted` search operator — companion to (2), joins the is:
  family alongside pinned/redacted/template/expiring/archived/
  link/locked/unlocked. Strict gate via hasClipNote(c) so the
  search filter and the detail-view Clear-button visibility
  predicate can never disagree — same predicate, both call sites.
  A clip whose note got deleted (setClipNote(undefined) → field
  removed) correctly falls out of the noted set on next read
  because the sanitizer's empty contract guarantees the IDB
  field stays absent (not stored as ""). New `notedOnly: boolean`
  on ParsedQuery, parser branch on exact `is:noted` (typos like
  `is:noted2` / `is:not` fall through to freeText per the
  parser's typo-rejection contract), applyQuery predicate gate,
  describeQuery emits "noted", empty-state hint adds is:noted to
  the operator legend, new Cmd+K "Show noted clips" in Filter
  group with synonyms (note/annotation/caveat/commentary/memo/
  annotated/review). AND-semantics with other is: operators —
  `is:noted is:locked` means "locked AND noted", standard
  intersection. 31/31 sanity (72835ca). (4) Bulk-bar tag-filter
  for Export — optional 84px input between bulk-tag and bulk-
  export buttons (expands to 130px on focus), empty input falls
  through to existing all-selected unfiltered export. Real input
  scopes the export to selected clips carrying that tag without
  shrinking the selection itself — workflow: triage a wide
  selection into share-with-friend / archive partitions across
  separate exports. New `filterClipsByTag` pure helper in
  bulk-export module: case-insensitive + trimmed match on both
  sides (matches db.updateTags' trim contract), defensive against
  non-array clips + bad entries (missing id, non-array tags,
  non-string tag in array — the array can have mixed valid +
  invalid entries and the valid ones still match). New
  `formatBulkExportTagToast` four-shape grammar: empty tag falls
  back to non-tag toast, zero-match honest error toast (no file
  written), all-selected match "(tag: X)" tail, partial-selected
  "N of M" tail. Backward compatible — empty input gives exact
  existing behavior. 29/29 sanity (87a8e7d). (5) Trash row
  hover-preview — when a trashed clip's content hash matches a
  live clip's hash, purging the trash entry is risk-free because
  the content survives in the live store. New pure
  `lib/trash-match.ts`: findLiveRecaptureForTrash returns the
  most-recently-seen live match (tie-break by lastSeenAt desc),
  stamped clips beat unstamped (NaN/missing lastSeenAt loses to
  a real number via strict > -Infinity), defensive against
  missing/non-string hash + non-array live + broken entries.
  formatTrashRecaptureTooltip emits two shapes: "Live re-capture
  exists — Xm/h/d ago. Safe to purge." with optional preview
  snippet when present, vs "No live re-capture — purging this is
  permanent." Local formatShortAge (just-now/Nm/Nh/Nd/N weeks)
  kept private to module so it stays leaf-pure. renderTrash
  pre-loads the live clip list (single 5000-cap pull, shared
  with daily render) so each row resolves its match without a
  per-row IDB read. Row-level `title` attr surfaces the tooltip
  on body hover; child buttons keep actionable titles. 25/25
  sanity (5726170). tsc + chrome/firefox builds green (popup
  308.1KB +11.6 vs last tick — new clip-note + bulk-export
  helpers + trash-match + recently-locked modules + detail-note
  CSS + bulk-export-tag input; background 47.4KB unchanged;
  content 26.9KB unchanged). All 64 sanity suites pass — 152
  new this tick (29 recently-locked + 38 clip-note + 31 is-noted
  + 29 bulk-export-tag + 25 trash-match). Pushed as 5 separate
  revertible commits.

- **2026-06-22 22:14 PT** — 5/5 shipped. (1) `is:unlocked` operator:
  strict-complement inverse of last tick's `is:locked` so the two
  form an exact partition over the locked-bit semantic — no clip
  ever passes both, no clip ever fails both. Strict gate `c.locked
  === true` for locked + `c.locked !== true` for unlocked means
  truthy non-boolean (locked:1 from older import) falls in the
  unlocked bucket because `is:locked` also rejects it — end-to-end
  semantic stays uniform. Natural use case: "what should I lock?"
  review pass via `is:unlocked tag:irreplaceable`. New `unlockedOnly:
  boolean` on ParsedQuery, parser branch only on exact `is:unlocked`
  (typos fall through to freeText), describeQuery emits "unlocked",
  empty-state hint updated, new Cmd+K "Show unlocked clips" in
  Filter group. AND-semantics contradiction `is:locked is:unlocked`
  returns empty set (same intent contract as is:template
  is:notemplate). 24/24 sanity covers parser/applyQuery/describe +
  parser combos + case-insensitivity + typo rejection + AND-empty +
  exact-complement check across truthy/falsy/undefined truth table
  + realistic narrowing + archive-default interaction (0fd089d).
  (2) Per-host site rule autoLock: new `autoLock?: boolean` on
  SiteRule layered same as autoPin + autoRedact — flips the per-clip
  `locked: true` bit BEFORE the ingest write hits IDB. Use case:
  sites where every capture is irreplaceable by default (partner
  portal with one-time tokens, draft URL with secrets, private
  snippet hub). Orthogonal to autoPin (typical "lock + pin for
  safety" needs both) and autoRedact (lock = delete-intent, redact
  = content). Wired through types.ts + db.upsertSiteRule defensive
  cast + background.ts ingest (fresh-clip spread `{ locked: true }`
  + dedup-path sticky with strict `!== true` so already-locked
  stays and truthy non-bool cleans up + autoLock RPC passthrough)
  + site-rules-io.ts (SerializedRule field, emit-only-when-true,
  strict `=== true` validate, `!!` liveRuleFrom coercion) + popup
  (form checkbox + ruleLockInput binding + "pick at least one
  effect" gate + row badge with hover title). Same stickiness as
  autoPin — user's per-clip unlock action is the only way the bit
  comes off. 26/26 autoLock sanity + 78/78 existing site-rules-io
  sanity still green (12fa643). (3) Detail-view lockedAt
  breadcrumb: new optional `lockedAt?: number` on ClipItem
  records when the lock bit transitioned `!== true` → `true`
  (manual toggleLock, idempotent setLocked(true), or ingest under
  autoLock). Cleared back to undefined when lock comes off so a
  future re-lock starts fresh — answers "when did I decide this
  is irreplaceable?" not "when have I EVER locked this". New
  "Locked" meta row below template-tokens, hidden unless `locked
  === true` AND `typeof lockedAt === "number"` (back-compat:
  clips locked before stamp existed simply hide row until
  re-lock). db.toggleLock + setLocked stamp on false→true, delete
  on true→false; setLocked's no-op fast path skips BOTH write AND
  lockedAt mutation. background.ts autoLock spreads `{ locked:
  true, lockedAt: now }` on fresh path + dedup-path stamps on the
  transition only (preserves original lock timestamp for repeat
  dedup hits). NEW pure `lib/locked-since.ts` with 6-tier
  formatLockedSince(at, now) returning {label, tooltip} pair:
  <1m "just now", <1h "Nm ago", <24h "Nh ago",
  yesterday-with-clock, 2-6 days weekday-with-clock, 7+ days ISO
  date. Tooltip always carries the absolute "YYYY-MM-DD HH:MM" so
  hover reveals exact moment. Defensive: negative ages clamp to
  "just now" (clock-skew safety), missing/null/NaN fall back to
  minimal "Locked". 30/30 sanity covers all 6 tiers + defensive
  shapes (undefined / null / NaN / Infinity / string / future)
  + boundary precision (59s vs 60s, 23h vs 24h, last-night 23:59
  in hour tier not yesterday tier, day-6 vs day-7 ISO crossover)
  + tooltip always-absolute contract + clock zero-padding
  (47d43bf). (4) Bulk-bar Lock + pin combo: new bookmark-icon
  button between bulk-lock and bulk-tag that flips BOTH bits in
  one chord. ADDITIVE ONLY: never strips pin or lock — dedicated
  bulk-pin / bulk-lock handle the toggle direction; this combo
  only adds state. Already-both clip is clean no-op. NEW pure
  `lib/bulk-lockpin.ts` with planBulkLockPin (4-field truth-table
  projection: pinWrites, lockWrites, alreadyBoth, total),
  isBulkLockPinActionable (hide button when nothing needs either
  bit — no dead chord), formatBulkLockPinToast (4-shape grammar
  with degenerate-input clamp), formatBulkLockPinButtonTitle
  (live hover-tooltip). New `db.setPinned(id, want)` idempotent
  setter mirroring setLocked — REQUIRED so the combo doesn't
  accidentally un-pin already-pinned clips when targeting
  lock-only subset (togglePin would flip wrong). Click handler
  does sequential setPinned-then-setLocked with no-op fast paths
  so already-correct clips cost zero IDB writes. Cmd+K mirror
  with live projection label + available gate matching button
  visibility. 35/35 sanity covers defensive shapes + truth-table
  (all 4 pinned×locked combos) + strict lock gate + 5/8-clip
  mixed selections + visibility gate + toast formatting + button
  title + degenerate input clamps (skipped > total → "all already
  both" instead of negative changed) (4f383ae). (5) Trash row
  Restore + lock combo: new padlock-icon button between
  restore-pin and the plain Restore pill for the "I almost lost
  this — make it safer next time" workflow. Mirrors restore-pin's
  contract: hidden when wasLocked = `t.locked === true`, 26x26
  square icon button with .trash-restore-lock CSS sibling to
  .trash-restore-pin, "Restored + locked" toast with Undo via
  trashClip (atomic-intent reversal — re-trashing takes the
  freshly-set lock + lockedAt with it). Handler uses setLocked
  (not toggleLock) for the right edge-case behavior: stale render
  + already-locked = no-op + truthful toast, not accidental
  UN-lock. Short-circuits setLocked when restoreClip fails so
  half-restored state never silently picks up lock. Visibility
  matrix: neither bit → both combos show (most common), pin-only
  → only restore-lock, lock-only → only restore-pin, both → just
  plain Restore. 18/18 sanity covers matrix + strict-gate
  interpretation + handler op chain + error-path short-circuit +
  undo semantics + realistic round-trip (5db5bec). tsc + chrome/
  firefox builds green (popup 296.5KB +9.5 vs last tick — new
  bulk-lockpin + locked-since modules + setPinned + lock
  breadcrumb + restore-lock CSS + autoLock wiring + is:unlocked
  + new Cmd+K commands; background 47.4KB +0.2 for autoLock
  ingest branch; content 26.9KB unchanged). All 59 sanity suites
  pass — 133 new this tick (24 is-unlocked + 26 autoLock + 30
  locked-since + 35 bulk-lockpin + 18 trash-restore-lock).
  Pushed as 5 separate revertible commits.

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

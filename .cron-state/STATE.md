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
  ingest + dedup, command shortcut, field-suggestion routing.
- `src/content.ts` — copy capture + in-page palette + field-suggestion chip,
  all shadow-DOM isolated.
- `src/popup/popup.ts` — list/detail/settings/bulk UI. Talks to `lib/db` directly
  and to background via `cc-rpc` for cross-store ops (export/import/redact).
- `src/lib/db.ts` — IndexedDB (`context-clipboard`, version 3). Stores: `clips`,
  `meta`, `field_map`. Use `clipsTx`/`metaTx`/`fieldsTx` helpers.
- `src/lib/util.ts` — hashing, autoTag, redaction regexes (PII + secrets).
- `src/lib/types.ts` — `ClipItem`, `Settings`, `FieldMapEntry`.
- `src/lib/crypto.ts` — AES-GCM-256 envelopes for encrypted export.

## Roadmap (queue — top is next)

Status: ` ` open / `~` in-progress / `x` shipped

### Search & navigation
- [ ] Saved searches / smart folders (user names a query, gets a one-click chip)
- [ ] Recent-host quick filter strip (top 5 hosts as toggle pills)  <!-- partially covered by quick chips, still keep -->
- [ ] Fuzzy command palette in popup (`Cmd+K`: actions like "Pin all images", "Clear redacted only")
- [ ] Jump to host: typing `g github` in search jumps to first github clip
- [ ] Result count per active filter ("12 in code, 4 in github.com")

### Capture & enrichment
- [ ] Collections / folders (manual buckets, per-clip multi-membership)
- [ ] Snippet templates with `{{date}}` / `{{host}}` placeholders
- [ ] Per-site capture rules (auto-tag from host, auto-pin, auto-redact)
- [ ] Image: link back to original `srcUrl` clearly, with re-fetch button
- [ ] Bigger paragraph context: collapse/expand long nearby text
- [ ] Manual quick-tag dropdown when adding notes

### Pasting & flow
- [ ] Paste-stack mode: queue N clips, paste them in order across multiple inputs
- [ ] In-page palette: pin pinned clips at top, dim images you can't paste into text
- [ ] In-page palette: copy as markdown shortcut (`Shift+Enter`)
- [ ] Right-click menu on text input: "Paste from Context Clipboard"

### Privacy & security
- [ ] Per-site auto-redact override (force on for `*.bank.com`)
- [ ] Reveal-once mode for redacted clips (show original, snap back after 10s)
- [ ] Vault-lock: encrypt IndexedDB at rest with passphrase (session unlock)
- [ ] "Forget host": delete every clip whose source matches a hostname

### Data lifecycle
- [ ] Per-clip TTL: this clip auto-deletes in 24h / 7d
- [ ] Smart dedup across `lastSeenAt` window groups (right now only same-hash)
- [ ] Export filter: pick what to export (pinned / by tag / by date range)
- [ ] Import merge strategy: dedup by hash on import

### UI polish (real, not cosmetic)
- [ ] Storage breakdown chart (text vs images vs OCR text)
- [ ] Detail view: previous/next clip arrows (`[` `]`)
- [ ] Toast undo for delete (5s window with "Undo")

### Shipped (autoship)
- [x] Smart search operators (kind/host/tag/is/before/after) — `c407d53`
- [x] Soft-delete trash with 7-day restore — `1a306bc`
- [x] Quick-filter pill row (pinned / redacted / OCR / images / 24h / top hosts) — `9183ea8`
- [x] Export as Markdown + CSV — `47f75d9`
- [x] Image dimensions + byte size in list/detail/export — `76fb6e7`

## Tick log

(One line per tick. Newest at top.)

<!-- TICKS BELOW -->

- **2026-06-19 21:30 PT** — first tick. Bootstrapped STATE + feature/autoship.
  Shipped 5/5: smart search operators (c407d53), soft-delete trash (1a306bc),
  quick-filter pills (9183ea8), Markdown+CSV export (47f75d9), image dims
  (76fb6e7). tsc + chrome/firefox builds green; 15/15 search sanity tests
  pass.

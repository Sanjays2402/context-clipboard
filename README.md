# Context Clipboard 📋

Smart clipboard manager for **Chrome, Brave, Edge, and Firefox**. Every copy remembers where it came from — URL, page title, surrounding paragraph — and yes, it captures **images** too.

![status](https://img.shields.io/badge/status-v0.2.0-amber) ![license](https://img.shields.io/badge/license-MIT-green) ![local-only](https://img.shields.io/badge/data-local%20only-1a8a3e)

## Features

- **Captures text + images + links** — normal Ctrl/⌘+C plus right-click "Capture to Context Clipboard"
- **Page context** — URL, title, favicon, and the surrounding paragraph saved with every clip
- **Searchable history** — fuzzy search across content, source, tags
- **Smart dedup** — re-copying the same thing within 60s bumps the timestamp instead of adding a duplicate
- **Auto-tags** — hostname, `code`, `email`, `url`, `jwt`, `phone`, `long`, etc. detected locally
- **Pin important clips** — pinned items survive auto-prune and "Clear unpinned"
- **Paste as Markdown** — `Shift+Click` or `Shift+Enter` to copy with a citation block
- **Detail view** — click any clip for full content, source link, hit count, editable tags
- **Keyboard-first** — `↑/↓` navigate, `Enter` copy, `Shift+Enter` markdown, `P` pin, `Del` delete, `/` focus search
- **Global shortcut** — `Cmd/Ctrl+Shift+V` opens the palette anywhere
- **Export / Import JSON** — back up your library, restore on a new browser
- **Settings** — adjust max items, dedup window, toggles, theme (auto/dark/light)
- **Local-only** — IndexedDB, no cloud, no account, no telemetry
- **Cross-browser** — Chrome / Brave / Edge / Firefox 121+ (MV3)

## Install (dev)

```bash
npm install
npm run build         # builds dist/chrome and dist/firefox
```

### Chrome / Brave / Edge

1. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** → select `dist/chrome/`

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `dist/firefox/manifest.json`

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Cmd/Ctrl+Shift+V` | Open popup |
| `↑` / `↓` | Navigate clips |
| `Enter` | Copy active clip |
| `Shift+Enter` | Copy as Markdown |
| `P` | Pin / unpin |
| `Delete` | Delete clip |
| `/` | Focus search |
| `Esc` | Close detail / settings |

## How it works

- **Content script** intercepts `copy` events on every page and forwards the selection plus the closest paragraph to the background.
- **Background service worker** owns the IndexedDB store, dedup logic, and context menu handlers. Images are fetched and stored as data URLs.
- **Popup** is a single-page UI with list / detail / settings views, all wired through the same DB module.

## Project layout

```
src/
├── background.ts         # MV3 service worker
├── content.ts            # captures Ctrl/Cmd+C with page context
├── lib/
│   ├── db.ts             # IndexedDB store, dedup, export/import
│   ├── types.ts          # ClipItem, Settings, etc.
│   └── util.ts           # hash, autoTag, hostFrom, timeAgo
└── popup/
    ├── popup.html
    ├── popup.css         # dark + light themes
    └── popup.ts          # list + detail + settings UI
manifests/
├── chrome.json           # MV3 (Chrome/Brave/Edge)
└── firefox.json          # MV3 (Firefox 121+)
scripts/
├── build.mjs             # esbuild → dist/<target>/
└── make-icons.py         # generates PNG icons (Pillow)
icons/                    # 16/32/48/128/256 PNGs
```

## Roadmap

- [ ] LLM auto-tagging via WebGPU / Transformers.js
- [ ] OCR text from captured images (Tesseract.js)
- [ ] Cloud sync via GitHub Gist
- [ ] In-page palette (skip the popup hop)
- [ ] Per-site capture rules (allow / block list)
- [ ] Encrypted export with passphrase

## License

MIT

# Context Clipboard 📋

Smart clipboard manager for **Chrome, Brave, and Firefox**. Every copy remembers where it came from — URL, page title, surrounding text, even images.

## Features

- **Captures text + images + links** (right-click menu or normal Ctrl/⌘+C)
- **Source context** — URL, page title, favicon, and surrounding paragraph
- **Searchable history** with kind filters (text / image / link)
- **Pinned snippets** that survive the auto-prune
- **Paste-as-Markdown** — Shift+Click any item to copy with a citation
- **Local-only** — everything in IndexedDB, no cloud, no account
- **Cross-browser** — Chrome / Brave / Edge / Firefox (MV3)

## Install (dev)

```bash
npm install
npm run build
```

### Chrome / Brave / Edge

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** → select `dist/chrome/`

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `dist/firefox/manifest.json`

## Usage

- **Copy normally** — Ctrl/⌘+C captures with page context
- **Right-click an image** → "Capture image to Context Clipboard"
- **Right-click a link** → "Capture link to Context Clipboard"
- **Click the toolbar icon** to search history
- **Click a clip** to copy it back
- **Shift+Click** to copy as Markdown (with citation)
- **📌** to pin (survives clearing)

## Project layout

```
src/
├── background.ts       # service worker (MV3) — context menus, storage
├── content.ts          # captures copy events with page context
├── lib/
│   ├── db.ts           # IndexedDB wrapper
│   └── types.ts
└── popup/
    ├── popup.html
    ├── popup.css
    └── popup.ts        # search UI
manifests/
├── chrome.json         # Chrome / Brave / Edge MV3
└── firefox.json        # Firefox MV3
scripts/
└── build.mjs           # esbuild → dist/<target>/
```

## Roadmap

- [ ] LLM auto-tagging (local via WebGPU + Transformers.js, or OpenAI key)
- [ ] Cloud sync via GitHub Gist
- [ ] Keyboard shortcut to open palette
- [ ] OCR on captured images
- [ ] Export to JSON / Markdown notebook

## License

MIT

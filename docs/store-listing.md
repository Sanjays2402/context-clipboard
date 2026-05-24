# Chrome Web Store Listing — Context Clipboard

## Short description (132 chars max)

Smart clipboard with image capture, in-page palette (Cmd+Shift+V), source URL + context for every copy. Fully local, no telemetry.

## Detailed description

Context Clipboard is a clipboard manager that remembers where you copied
from. Every clip carries its source URL, page title, and a snippet of the
surrounding text, so you can find that one quote, code block, or
screenshot you grabbed last week without re-Googling.

KEY FEATURES

• Captures text, links, and images.
• Page context: source URL, title, favicon, and nearby text saved with
  every clip.
• In-page command palette: Cmd/Ctrl+Shift+V on any site to search and
  paste without leaving the page.
• Smart field suggestions: when you focus a form field you've pasted into
  before, Context Clipboard offers the right clip with one tap.
• Auto-tags: code, email, link, jwt, phone, number, and more.
• Smart deduplication with copy-count badges.
• Pin clips, paste-as-Markdown (Shift+click), code clips export as fenced
  code blocks with citation.
• Drag-and-drop image capture into the popup.
• Side panel mode for always-on clipboard.
• Bulk select + delete + tag.
• Per-host allow / block lists.
• Export and import JSON for backup.
• Auto / dark / light theme with a Linear-inspired interface.

PRIVACY

100% local. Your clips never leave your browser. No server, no analytics,
no third-party calls, no AI requests. Read the full policy:
https://github.com/Sanjays2402/context-clipboard/blob/main/PRIVACY.md

KEYBOARD

• Cmd/Ctrl+Shift+V — open in-page palette
• ↑ ↓ — navigate clips
• Enter — copy
• Shift+Enter — copy as Markdown
• P — pin
• Del — delete
• / — focus search
• Esc — close detail view

## Per-permission justifications (Chrome Web Store form)

### storage

Stores the user's local settings and a small in-page palette toggle.
Clipboard content is held in the browser's IndexedDB (not the `storage`
API). All data is local.

### clipboardWrite

Required so the popup and the in-page palette can paste a previously
saved clip back to the system clipboard with one click.

### contextMenus

Adds a right-click "Capture selection / image / link" menu so the user
can save a clip without copying first.

### tabs

Reads the active tab's title, URL, and favicon at the moment of capture
to attach source context to the saved clip. No tab history is recorded
and no other tabs are queried.

### sidePanel

Optional always-on clipboard panel that lives in Chrome's side panel.
Disabled by default; users opt in from Settings.

### Host permission `<all_urls>`

The content script must run on every site the user actively copies from
so it can read the page title, URL, favicon, and a short context snippet
at the moment the user issues a copy. No data is collected from pages
the user has not copied on. Per-host block / allow lists let users
exclude any site.

### Single purpose

The single purpose of Context Clipboard is to be a context-aware
clipboard manager. Every permission above is in service of capturing,
storing, and re-using clipboard content with its source context.

### Remote code

The extension ships zero remote code. No `eval`, no remote `import`, no
remote scripts. All JavaScript and WebAssembly is bundled at build time
and verifiable from the source tree.

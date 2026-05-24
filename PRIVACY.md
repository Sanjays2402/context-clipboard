# Privacy Policy — Context Clipboard

**Last updated:** 2026-05-23

Context Clipboard is a local-only browser extension. Your clipboard data
never leaves your device.

## What we collect

Nothing. There is no server, no analytics, no telemetry, no remote logging,
no error reporting, and no third-party SDK.

## What stays on your device

Everything the extension captures stays inside the browser's local
IndexedDB storage on the machine you installed the extension on. That
includes:

- The clipboard content you copied (text, link, or image).
- The source URL, page title, page favicon, and a short surrounding text
  snippet from the page you copied from.
- Tags you add manually and tags auto-generated from the content (for
  example `code`, `email`, `url`).
- Local settings such as theme and per-host allow/block lists.

You can wipe everything from the popup at any time
("Settings → Clear all clips") or by removing the extension.

## What we do NOT do

- We do not upload or sync your clips. Export to JSON is a manual, local
  download under your control.
- We do not read pages you have not actively copied from. The content
  script only activates when you copy, when you open the in-page palette
  with Cmd/Ctrl+Shift+V, or when you use the right-click "Capture" menu.
- We do not run any AI or OCR call against a remote service. Optional OCR
  (when implemented in a future version) will run fully offline via
  WebAssembly.
- We do not show ads.

## Permissions, and why each one exists

| Permission | Why |
|---|---|
| `contextMenus` | Adds the right-click "Capture selection / image / link" menu. |
| `storage` | Used only for a tiny key holding the in-page palette toggle. All clip content lives in IndexedDB. |
| `clipboardWrite` | Lets the popup paste a saved clip back to your system clipboard with one click. |
| `tabs` | Reads the active tab's title/URL/favicon to attach context to a captured clip. No browsing history is recorded. |
| `sidePanel` | Optional always-on side panel UI (Chrome only). Off by default. |
| `<all_urls>` host permission | Required so the content script can capture copy events and run the in-page palette on any site you actively use. Pages you never copy on are not read. Use the per-host block list to exclude sites you don't want capturing. |

## Per-site control

Open the popup → Settings to add hosts to the allow or block list. The
block list overrides everything. If the allow list is non-empty, only
those hosts will capture.

## Data export and deletion

- **Export:** popup → Settings → "Export JSON". Saved locally.
- **Import:** popup → Settings → "Import JSON".
- **Delete one clip:** Del key or trash icon.
- **Delete all unpinned:** popup → Settings.
- **Delete everything:** popup → Settings → "Clear all".
- **Uninstall:** removes IndexedDB and all settings.

## Contact

Issues and questions: https://github.com/Sanjays2402/context-clipboard/issues

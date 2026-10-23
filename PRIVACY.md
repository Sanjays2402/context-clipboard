# Privacy Policy — Context Clipboard

**Last updated:** 2026-10-23

Context Clipboard is a browser extension that keeps a history of what you
copy. This policy explains what it stores, where, and when anything leaves
your device. See also the [Terms of Use](TERMS.md).

## The short version

- The developer collects nothing. There is no server, account, analytics,
  telemetry, error reporting, advertising or third-party SDK.
- Everything the extension saves is stored locally in your browser on the
  device where you installed it.
- Data leaves your device only when **you** choose an action that does so,
  such as searching the web for a clip or exporting a backup. Those are
  listed below.

## What is stored on your device

All of this lives in the extension's IndexedDB storage in your browser
profile:

- **Clips:** the text, link or image you copied or captured.
- **Source details for each clip:** the page URL, page title, the page's
  favicon address, and a short snippet of text near your selection.
- **Things you add:** tags, notes, pins, locks, expiry times and saved
  searches.
- **Automatic tags** such as `code`, `email` or `url`, worked out locally
  from the clip's content.
- **Field suggestions** (if enabled): when you paste a saved clip into a
  form field, the site's host name, a key describing that field (built
  from attributes like its `id`, `name` or `autocomplete`), which clip you
  pasted and a short preview, so the same clip can be offered next time.
- **Recent searches** you typed in the popup.
- **A privacy audit log** of actions like redacting, scrubbing, forgetting
  a site or trashing clips (the last 10–100 entries, your choice).
- **Trash:** deleted clips are kept for 7 days so you can restore them,
  then removed automatically.
- **Settings**, including your allow and block lists and site rules.

Nothing is stored in a cloud account, and the extension has no sync.

## How the extension reads pages

To capture context, the extension's content script runs on the pages you
visit. On each page it:

- reacts when you **copy**, to save the clip with its source details;
- reacts when you **paste** a saved clip into a field, to remember that
  field for suggestions (if enabled);
- notices when you **focus or leave a form field**, to check whether it
  has a suggestion to offer. This reads the field's attributes, not what
  you type, and stores nothing unless you paste;
- shows the search box when you press `Ctrl/⌘+Shift+V`.

It does not record your browsing history, keystrokes or page content you
don't copy. The block list and site rules can stop it from capturing on
any site.

## When data leaves your device

Only when you take one of these actions:

| Action | What is sent, and to whom |
|---|---|
| "Search Google" / "Search this site" on a clip | Opens a new tab to Google with the clip text in the search query ("Search this site" adds a `site:` filter for the clip's source). |
| "Email" on a clip | Opens your mail app with the clip in a new message. Nothing is sent until you send it. |
| "Open source page" / opening a link clip | Your browser visits that page as normal. |
| Capturing an image by right-click, or "Re-fetch image" | The image is downloaded from the site that hosts it. |
| Export | A file is saved where you choose. What happens to it after that is up to you. An encrypted export can only be read with your passphrase. |
| "Copy" and its variants | Puts the clip on your system clipboard, where other apps can read it. |

Previews in the extension use letters drawn from the site name, not
downloaded icons, so browsing your history doesn't contact those sites.

## Permissions and why they're needed

| Permission | Why |
|---|---|
| Access to all sites (content script) | To capture the page title, URL and nearby text when you copy, show the in-page search box, and offer field suggestions. |
| `clipboardWrite` | To put a saved clip back on your clipboard. |
| `clipboardRead` | Only when you click quick-capture or the link composer in the popup, to read what's on your clipboard. Never in the background. |
| `tabs` | To read the current tab's title and URL when you capture something. |
| `contextMenus` | For the right-click "Capture" menu. |
| `sidePanel` (Chrome) | For the optional side-panel view. |

## Your controls

- **Stop capturing on a site:** add it to the block list, or use an allow
  list so only listed sites are captured.
- **Redact:** mask emails, phone numbers, card numbers, ID numbers and API
  keys in a clip, or turn on auto-redact so originals are never stored.
- **Forget a site:** delete every clip captured from one host.
- **Delete:** delete a clip (it goes to the 7-day trash), empty the trash
  to remove it immediately, or use Settings → "Delete everything".
- **Uninstall:** removing the extension deletes all of its stored data
  from that browser profile.

## Children

The extension isn't directed at children and doesn't knowingly collect
anything from anyone; it has no way to send data to the developer.

## Changes

If this policy changes, the new version is published in this file with a
new "Last updated" date. The history of every change is visible in the
project's Git history.

## Contact

Questions or concerns: open an issue at
https://github.com/Sanjays2402/context-clipboard/issues

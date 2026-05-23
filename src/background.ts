/// <reference types="chrome" />
import {
  putClip,
  pruneOldUnpinned,
  findRecentByHash,
  getSettings,
  exportAll,
  importAll,
  clearUnpinned,
  clearAll,
} from "./lib/db";
import type { ClipItem, ClipSource } from "./lib/types";
import { uid, quickHash, hostFrom, autoTag } from "./lib/util";

// Cross-browser shim: Firefox exposes `browser`, Chrome exposes `chrome`.
const api: typeof chrome =
  // @ts-expect-error firefox global
  (typeof browser !== "undefined" ? browser : chrome) as typeof chrome;

api.runtime.onInstalled.addListener(() => {
  // Context menus
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({
      id: "cc-capture-image",
      title: "Capture image to Context Clipboard",
      contexts: ["image"],
    });
    api.contextMenus.create({
      id: "cc-capture-link",
      title: "Capture link to Context Clipboard",
      contexts: ["link"],
    });
    api.contextMenus.create({
      id: "cc-capture-selection",
      title: "Capture selection to Context Clipboard",
      contexts: ["selection"],
    });
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  const base: ClipSource = {
    url: tab?.url,
    title: tab?.title,
    favicon: tab?.favIconUrl,
  };

  try {
    if (info.menuItemId === "cc-capture-image" && info.srcUrl) {
      const dataUrl = await fetchAsDataUrl(info.srcUrl);
      await ingest({
        kind: "image",
        content: dataUrl,
        mime: guessMime(dataUrl),
        preview: `Image from ${base.title || hostFrom(base.url) || "page"}`,
        source: { ...base, nearbyText: info.srcUrl },
      });
    } else if (info.menuItemId === "cc-capture-link" && info.linkUrl) {
      await ingest({
        kind: "link",
        content: info.linkUrl,
        preview: info.selectionText || info.linkUrl,
        source: { ...base, nearbyText: info.selectionText },
      });
    } else if (info.menuItemId === "cc-capture-selection" && info.selectionText) {
      await ingest({
        kind: "text",
        content: info.selectionText,
        preview: info.selectionText.slice(0, 200),
        source: base,
      });
    }
  } catch (e) {
    console.error("[context-clipboard] context menu capture failed", e);
  }
});

// Keyboard command: open popup (defined in manifest commands).
if (api.commands) {
  api.commands.onCommand.addListener((cmd) => {
    if (cmd === "open-popup") {
      // Best-effort: opens the toolbar popup. Some browsers only allow this
      // when the action button is visible; fallback to opening a new tab.
      (api.action.openPopup as ((opts?: unknown) => Promise<void>) | undefined)?.()?.catch(
        () => {
          api.tabs.create({ url: api.runtime.getURL("popup/popup.html") });
        },
      ) ?? api.tabs.create({ url: api.runtime.getURL("popup/popup.html") });
    }
  });
}

// Messages from content script + popup
api.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  (async () => {
    if (isCopyMsg(msg)) {
      const settings = await getSettings();
      if (!settings.captureCopyEvents) return sendResponse({ ok: false, skipped: true });
      const id = await ingest({
        kind: msg.kind,
        content: msg.content,
        mime: msg.mime,
        preview:
          msg.kind === "image"
            ? `Image copied from ${sender.tab?.title || "page"}`
            : msg.content.slice(0, 200),
        source: {
          url: sender.tab?.url,
          title: sender.tab?.title,
          nearbyText: msg.nearbyText,
          favicon: sender.tab?.favIconUrl,
        },
      });
      sendResponse({ ok: true, id });
      return;
    }

    if (isRpc(msg)) {
      try {
        if (msg.action === "export") {
          const data = await exportAll();
          return sendResponse({ ok: true, data });
        }
        if (msg.action === "import") {
          const res = await importAll(msg.payload || {});
          return sendResponse({ ok: true, ...res });
        }
        if (msg.action === "clearUnpinned") {
          const n = await clearUnpinned();
          return sendResponse({ ok: true, removed: n });
        }
        if (msg.action === "clearAll") {
          await clearAll();
          return sendResponse({ ok: true });
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return sendResponse({ ok: false, error: err });
      }
    }

    sendResponse({ ok: false });
  })();
  return true; // async response
});

interface IngestInput {
  kind: ClipItem["kind"];
  content: string;
  mime?: string;
  preview?: string;
  source: ClipSource;
}

async function ingest(inp: IngestInput): Promise<string> {
  const settings = await getSettings();
  // Hash: text is content; image uses first 4KB of the data URL (cheap, deterministic).
  const hashInput =
    inp.kind === "image" ? inp.content.slice(0, 4096) : inp.content;
  const hash = quickHash(`${inp.kind}:${hashInput}`);

  const existing = await findRecentByHash(hash, settings.dedupWindowMs);
  const now = Date.now();
  const host = hostFrom(inp.source.url);

  if (existing) {
    existing.lastSeenAt = now;
    existing.hitCount = (existing.hitCount || 1) + 1;
    // Merge tags from new source host if different
    if (settings.enableAutoTags) {
      const merged = new Set([
        ...existing.tags,
        ...autoTag(inp.content, inp.kind, host),
      ]);
      existing.tags = Array.from(merged);
    }
    await putClip(existing);
    return existing.id;
  }

  const tags = settings.enableAutoTags
    ? autoTag(inp.content, inp.kind, host)
    : [];

  const item: ClipItem = {
    id: uid(),
    kind: inp.kind,
    content: inp.content,
    mime: inp.mime,
    preview: inp.preview,
    source: inp.source,
    pinned: false,
    createdAt: now,
    lastSeenAt: now,
    hitCount: 1,
    tags,
    bytes: inp.content.length,
    hash,
  };
  await putClip(item);
  await pruneOldUnpinned(settings.maxUnpinned);
  return item.id;
}

async function fetchAsDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function guessMime(dataUrl: string): string {
  const m = /^data:([^;]+);/.exec(dataUrl);
  return m ? m[1] : "image/png";
}

interface CopyMsg {
  type: "cc-copy";
  kind: "text" | "image";
  content: string;
  mime?: string;
  nearbyText?: string;
}

interface RpcMsg {
  type: "cc-rpc";
  action: "export" | "import" | "clearUnpinned" | "clearAll";
  payload?: unknown;
}

function isCopyMsg(m: unknown): m is CopyMsg {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as { type?: string }).type === "cc-copy"
  );
}

function isRpc(m: unknown): m is RpcMsg {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as { type?: string }).type === "cc-rpc"
  );
}

/// <reference types="chrome" />
import { addClip, pruneOldUnpinned } from "./lib/db";
import type { ClipItem } from "./lib/types";

// Cross-browser shim: Firefox exposes `browser`, Chrome exposes `chrome`.
const api: typeof chrome =
  // @ts-expect-error firefox global
  (typeof browser !== "undefined" ? browser : chrome) as typeof chrome;

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

api.runtime.onInstalled.addListener(() => {
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

api.contextMenus.onClicked.addListener(async (info, tab) => {
  const base = {
    url: tab?.url,
    title: tab?.title,
    favicon: tab?.favIconUrl,
  };

  if (info.menuItemId === "cc-capture-image" && info.srcUrl) {
    try {
      const dataUrl = await fetchAsDataUrl(info.srcUrl);
      const item: ClipItem = {
        id: uid(),
        kind: "image",
        content: dataUrl,
        mime: guessMime(dataUrl),
        preview: `Image from ${base.title || base.url || "page"}`,
        source: { ...base, nearbyText: info.srcUrl },
        pinned: false,
        createdAt: Date.now(),
        tags: ["image"],
        bytes: dataUrl.length,
      };
      await addClip(item);
      await pruneOldUnpinned();
    } catch (e) {
      console.error("[context-clipboard] image capture failed", e);
    }
  } else if (info.menuItemId === "cc-capture-link" && info.linkUrl) {
    const item: ClipItem = {
      id: uid(),
      kind: "link",
      content: info.linkUrl,
      preview: info.selectionText || info.linkUrl,
      source: { ...base, nearbyText: info.selectionText },
      pinned: false,
      createdAt: Date.now(),
      tags: ["link"],
      bytes: info.linkUrl.length,
    };
    await addClip(item);
    await pruneOldUnpinned();
  } else if (info.menuItemId === "cc-capture-selection" && info.selectionText) {
    const item: ClipItem = {
      id: uid(),
      kind: "text",
      content: info.selectionText,
      preview: info.selectionText.slice(0, 200),
      source: base,
      pinned: false,
      createdAt: Date.now(),
      tags: ["selection"],
      bytes: info.selectionText.length,
    };
    await addClip(item);
    await pruneOldUnpinned();
  }
});

// Messages from content script: regular copy events on pages.
api.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  (async () => {
    if (!isCopyMsg(msg)) return sendResponse({ ok: false });
    const item: ClipItem = {
      id: uid(),
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
      pinned: false,
      createdAt: Date.now(),
      tags: msg.kind === "image" ? ["image", "copy"] : ["copy"],
      bytes: msg.content.length,
    };
    await addClip(item);
    await pruneOldUnpinned();
    sendResponse({ ok: true, id: item.id });
  })();
  return true; // async response
});

async function fetchAsDataUrl(url: string): Promise<string> {
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

function isCopyMsg(m: unknown): m is CopyMsg {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as { type?: string }).type === "cc-copy"
  );
}

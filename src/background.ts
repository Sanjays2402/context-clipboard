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
  listClips,
  getClip,
  putFieldMap,
  getFieldMap,
} from "./lib/db";
import type { ClipItem, ClipSource, FieldMapEntry } from "./lib/types";
import { uid, quickHash, hostFrom, autoTag, redactSensitivePreview } from "./lib/util";

const api: typeof chrome =
  // @ts-expect-error firefox global
  (typeof browser !== "undefined" ? browser : chrome) as typeof chrome;

api.runtime.onInstalled.addListener(() => {
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
  void applySidePanelMode();
});

api.runtime.onStartup?.addListener(() => {
  void applySidePanelMode();
});

/**
 * Side panel mode: when `enableSidePanel` is on (Chrome only), make the
 * toolbar icon open the side panel instead of a popup. When off, restore
 * the popup. Firefox has no `sidePanel` API and this is a no-op there.
 */
async function applySidePanelMode(): Promise<void> {
  const sidePanel = (api as unknown as { sidePanel?: { setPanelBehavior: (o: { openPanelOnActionClick: boolean }) => Promise<void> } }).sidePanel;
  if (!sidePanel || !api.action) return;
  try {
    const settings = await getSettings();
    if (settings.enableSidePanel) {
      await sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      await api.action.setPopup({ popup: "" });
    } else {
      await sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      await api.action.setPopup({ popup: "popup/popup.html" });
    }
  } catch (e) {
    console.warn("[context-clipboard] side-panel mode toggle failed", e);
  }
}

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
        preview: redactSensitivePreview(info.selectionText),
        source: base,
      });
    }
  } catch (e) {
    console.error("[context-clipboard] context menu capture failed", e);
  }
});

if (api.commands) {
  api.commands.onCommand.addListener(async (cmd) => {
    if (cmd !== "open-popup") return;
    const settings = await getSettings();
    if (settings.enableInPagePalette) {
      try {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        if (tab?.id && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("about:")) {
          const clips = await listClips({ limit: 50 });
          const lite = clips.map((c) => ({
            id: c.id,
            kind: c.kind,
            content: c.content,
            preview: c.preview,
            source: { url: c.source.url, title: c.source.title },
          }));
          await api.tabs.sendMessage(tab.id, { type: "cc-open-palette", clips: lite });
          return;
        }
      } catch (_e) {
        // fall through to toolbar popup
      }
    }
    // Fallback: open toolbar popup (or a tab if popup API unavailable)
    type OpenPopupFn = (opts?: unknown) => Promise<void>;
    const open = (api.action.openPopup as OpenPopupFn | undefined);
    if (open) {
      try { await open(); return; } catch (_e) { /* fall back */ }
    }
    api.tabs.create({ url: api.runtime.getURL("popup/popup.html") });
  });
}

api.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  (async () => {
    if (isCopyMsg(msg)) {
      const settings = await getSettings();
      if (!settings.captureCopyEvents) return sendResponse({ ok: false, skipped: true });
      if (msg.kind === "image" && !settings.captureImagesOnCopy) {
        return sendResponse({ ok: false, skipped: true });
      }
      const host = hostFrom(sender.tab?.url);
      if (settings.blockList.includes(host)) return sendResponse({ ok: false, blocked: true });
      if (settings.allowList.length > 0 && !settings.allowList.includes(host)) {
        return sendResponse({ ok: false, blocked: true });
      }
      const id = await ingest({
        kind: msg.kind,
        content: msg.content,
        mime: msg.mime,
        preview:
          msg.kind === "image"
            ? `Image copied from ${sender.tab?.title || "page"}`
            : redactSensitivePreview(msg.content),
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
          const res = await importAll(
            (msg.payload as { clips?: ClipItem[]; settings?: Partial<import("./lib/types").Settings> } | undefined) || {},
          );
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
        if (msg.action === "applySidePanelMode") {
          await applySidePanelMode();
          return sendResponse({ ok: true });
        }
        if (msg.action === "findClipByContent") {
          const p = msg.payload as { content?: string } | undefined;
          if (!p?.content) return sendResponse({ ok: false });
          const hash = quickHash(`text:${p.content}`);
          const item = await findRecentByHash(hash, 10 * 60 * 1000);
          return sendResponse({ ok: true, clipId: item?.id });
        }
        if (msg.action === "recordFieldPaste") {
          const p = msg.payload as
            | { host?: string; fieldKey?: string; clipId?: string; preview?: string }
            | undefined;
          if (!p?.host || !p?.fieldKey || !p?.clipId)
            return sendResponse({ ok: false });
          const id = `${p.host}::${p.fieldKey}`;
          const existing = await getFieldMap(p.host, p.fieldKey);
          const entry: FieldMapEntry = {
            id,
            host: p.host,
            fieldKey: p.fieldKey,
            clipId: p.clipId,
            preview: redactSensitivePreview(p.preview || ""),
            count: (existing?.count || 0) + 1,
            updatedAt: Date.now(),
          };
          await putFieldMap(entry);
          return sendResponse({ ok: true });
        }
        if (msg.action === "getFieldSuggestion") {
          const p = msg.payload as { host?: string; fieldKey?: string } | undefined;
          if (!p?.host || !p?.fieldKey) return sendResponse({ ok: false });
          const settings2 = await getSettings();
          if (!settings2.enableFieldSuggestions)
            return sendResponse({ ok: true, suggestion: null });
          const entry = await getFieldMap(p.host, p.fieldKey);
          if (!entry) return sendResponse({ ok: true, suggestion: null });
          const clip = await getClip(entry.clipId);
          if (!clip) return sendResponse({ ok: true, suggestion: null });
          return sendResponse({
            ok: true,
            suggestion: {
              clipId: clip.id,
              kind: clip.kind,
              content: clip.content,
              preview: clip.preview || clip.content.slice(0, 100),
              count: entry.count,
            },
          });
        }
        if (msg.action === "setOcrText") {
          const p = msg.payload as { id?: string; text?: string } | undefined;
          if (!p?.id) return sendResponse({ ok: false, error: "id required" });
          const c = await getClip(p.id);
          if (!c) return sendResponse({ ok: false, error: "not found" });
          c.ocrText = p.text || "";
          if (c.ocrText.trim()) {
            c.preview = `${c.preview?.split(" · ")[0] || "Image"} · ${c.ocrText.slice(0, 80)}`;
            if (!c.tags.includes("ocr")) c.tags.push("ocr");
          }
          await putClip(c);
          return sendResponse({ ok: true });
        }
        if (msg.action === "addImageBlob") {
          // Popup drag-drop: store an image data URL provided by the user.
          const p = msg.payload as { dataUrl: string; name?: string } | undefined;
          if (!p?.dataUrl) return sendResponse({ ok: false, error: "dataUrl required" });
          const id = await ingest({
            kind: "image",
            content: p.dataUrl,
            mime: guessMime(p.dataUrl),
            preview: `Image: ${p.name || "dropped"}`,
            source: { title: p.name },
          });
          return sendResponse({ ok: true, id });
        }
        if (msg.action === "addNote") {
          const p = msg.payload as { text: string } | undefined;
          if (!p?.text) return sendResponse({ ok: false, error: "text required" });
          const id = await ingest({
            kind: "text",
            content: p.text,
            preview: redactSensitivePreview(p.text),
            source: { title: "Manual note" },
          });
          return sendResponse({ ok: true, id });
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return sendResponse({ ok: false, error: err });
      }
    }

    sendResponse({ ok: false });
  })();
  return true;
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
  const hashInput =
    inp.kind === "image" ? inp.content.slice(0, 4096) : inp.content;
  const hash = quickHash(`${inp.kind}:${hashInput}`);

  const existing = await findRecentByHash(hash, settings.dedupWindowMs);
  const now = Date.now();
  const host = hostFrom(inp.source.url);

  if (existing) {
    existing.lastSeenAt = now;
    existing.hitCount = (existing.hitCount || 1) + 1;
    if (settings.enableAutoTags) {
      existing.tags = Array.from(
        new Set([...existing.tags, ...autoTag(inp.content, inp.kind, host)]),
      );
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

// OCR happens in the popup (CSP-safe). Background only stores the result.

// Message types ------------------------------------------------------------

interface CopyMsg {
  type: "cc-copy";
  kind: "text" | "image";
  content: string;
  mime?: string;
  nearbyText?: string;
}

interface RpcMsg {
  type: "cc-rpc";
  action:
    | "export"
    | "import"
    | "clearUnpinned"
    | "clearAll"
    | "setOcrText"
    | "addImageBlob"
    | "addNote"
    | "recordFieldPaste"
    | "getFieldSuggestion"
    | "findClipByContent"
    | "applySidePanelMode";
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

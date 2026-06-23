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
  redactClip,
  unredactClip,
  purgeOldTrash,
  forgetHost,
  setClipExpiry,
  expireDueClips,
  findSiteRuleFor,
  listSiteRules,
  upsertSiteRule,
  removeSiteRule,
  replaceSiteRules,
  getPaletteLastQuery,
  setPaletteLastQuery,
} from "./lib/db";
import type { ClipItem, ClipSource, FieldMapEntry, SiteRule } from "./lib/types";
import { uid, quickHash, hostFrom, autoTag, redactSensitivePreview, redactPii, applyCustomPatterns } from "./lib/util";
import { hasTemplateTokens } from "./lib/templates";

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
    // Paste-from-Clipboard on any editable field. We don't filter by
    // input type — Chrome's `editable` context already covers textareas,
    // text inputs, and contentEditable. Clicking surfaces the in-page
    // palette so the user can fuzzy-search and pick a clip to paste.
    api.contextMenus.create({
      id: "cc-paste-from",
      title: "Paste from Context Clipboard",
      contexts: ["editable"],
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
  const host = hostFrom(tab?.url);
  const rule = await findSiteRuleFor(host);
  // skipCapture honored for context-menu captures too — otherwise a rule
  // designed to "leave this site alone" would still leak via right-click.
  if (rule?.skipCapture && info.menuItemId !== "cc-paste-from") return;

  try {
    if (info.menuItemId === "cc-paste-from") {
      // Forward the palette into the page so the user can pick a clip
      // to paste. We use the SAME message type as the keyboard
      // shortcut path so the content script's existing palette code
      // handles it — no second renderer to maintain. Skipped on
      // chrome:// / about: tabs where content scripts can't run.
      if (!tab?.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("about:")) {
        return;
      }
      const clips = await listClips({ limit: 50 });
      const lite = clips.map((c) => ({
        id: c.id,
        kind: c.kind,
        content: c.content,
        preview: c.preview,
        pinned: !!c.pinned,
        source: { url: c.source.url, title: c.source.title },
        // Surface the per-clip note so the in-page palette can show
        // the user's caveat ("staging only", "needs login") below
        // the preview line. Same field as detail-view + send-to
        // note-md row; in-page palette gates on its own
        // paletteNoteTailAvailable predicate so a missing/empty
        // note renders nothing (no dead element).
        note: c.note,
      }));
      const lastQuery = await getPaletteLastQuery();
      // Pass the active tab's host so the in-page palette can boost
      // clips captured on this same host — the most-likely match for
      // a "paste from clipboard here" workflow.
      const tabHost = hostFrom(tab.url);
      await api.tabs.sendMessage(tab.id, { type: "cc-open-palette", clips: lite, lastQuery, tabHost });
      return;
    }
    if (info.menuItemId === "cc-capture-image" && info.srcUrl) {
      const dataUrl = await fetchAsDataUrl(info.srcUrl);
      await ingest({
        kind: "image",
        content: dataUrl,
        mime: guessMime(dataUrl),
        preview: `Image from ${base.title || hostFrom(base.url) || "page"}`,
        source: { ...base, nearbyText: info.srcUrl },
      }, rule);
    } else if (info.menuItemId === "cc-capture-link" && info.linkUrl) {
      await ingest({
        kind: "link",
        content: info.linkUrl,
        preview: info.selectionText || info.linkUrl,
        source: { ...base, nearbyText: info.selectionText },
      }, rule);
    } else if (info.menuItemId === "cc-capture-selection" && info.selectionText) {
      await ingest({
        kind: "text",
        content: info.selectionText,
        preview: redactSensitivePreview(info.selectionText),
        source: base,
      }, rule);
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
            pinned: !!c.pinned,
            source: { url: c.source.url, title: c.source.title },
            // Same note pass-through as the context-menu palette path
            // (the in-page palette gates on the field; missing/empty
            // notes render nothing).
            note: c.note,
          }));
          const lastQuery = await getPaletteLastQuery();
          const tabHost = hostFrom(tab.url);
          await api.tabs.sendMessage(tab.id, { type: "cc-open-palette", clips: lite, lastQuery, tabHost });
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

// Omnibox: `cc <text>` captures a quick note from the address bar. Press
// Tab after typing "cc " (or just "cc" on Firefox), type the note, hit
// Enter. The note ingests as a manual-text clip tagged `omnibox` so the
// user can `tag:omnibox` to find them later. No tab navigation happens
// (we don't redirect the URL bar) — capture + visual confirmation only.
//
// Suggestions surface the last few omnibox notes back to the user as
// autocomplete rows so they can re-copy a recent capture without
// opening the popup.
const omnibox = (api as unknown as {
  omnibox?: {
    setDefaultSuggestion: (s: { description: string }) => void;
    onInputChanged: { addListener: (fn: (text: string, suggest: (rows: { content: string; description: string }[]) => void) => void) => void };
    onInputEntered: { addListener: (fn: (text: string, disposition?: string) => void) => void };
  };
}).omnibox;
if (omnibox) {
  omnibox.setDefaultSuggestion({
    description:
      "Capture a quick note (or type a search and hit Enter to filter the popup)",
  });
  omnibox.onInputChanged.addListener(async (text, suggest) => {
    const needle = text.trim().toLowerCase();
    if (!needle) {
      suggest([]);
      return;
    }
    // Surface the most recent `omnibox` notes whose text matches the
    // current input. Capped at 6 rows; chrome ignores anything past it.
    try {
      const all = await listClips({ limit: 1000 });
      const matches = all
        .filter((c) => c.kind === "text" && c.tags.includes("omnibox"))
        .filter((c) => {
          const hay = (c.content || c.preview || "").toLowerCase();
          return hay.includes(needle);
        })
        .slice(0, 6)
        .map((c) => ({
          content: `recall:${c.id}`,
          description: `Recall: ${escapeOmnibox((c.preview || c.content).slice(0, 100))}`,
        }));
      suggest(matches);
    } catch (e) {
      console.warn("[context-clipboard] omnibox suggest failed", e);
      suggest([]);
    }
  });
  omnibox.onInputEntered.addListener(async (text, _disposition) => {
    const raw = (text || "").trim();
    if (!raw) return;
    try {
      // "recall:<id>" — selected an existing omnibox note. Pull its
      // content into the system clipboard via the offscreen-free
      // background path (writeText is not callable from a service
      // worker; we instead bump the row's hitCount so the user can open
      // the popup and copy from there). Most users will rarely pick
      // this branch — the keyword's primary win is fast capture.
      if (raw.startsWith("recall:")) {
        const id = raw.slice("recall:".length);
        const c = await getClip(id);
        if (c) {
          c.hitCount = (c.hitCount || 1) + 1;
          c.lastSeenAt = Date.now();
          await putClip(c);
        }
        return;
      }
      const id = await ingest({
        kind: "text",
        content: raw,
        preview: redactSensitivePreview(raw),
        source: { title: "Omnibox note" },
      });
      // Auto-tag with `omnibox` so the recall suggestions work AND so
      // the user can filter for them later with `tag:omnibox`.
      const stored = await getClip(id);
      if (stored && !stored.tags.includes("omnibox")) {
        stored.tags = [...stored.tags, "omnibox"];
        await putClip(stored);
      }
    } catch (e) {
      console.error("[context-clipboard] omnibox capture failed", e);
    }
  });
}

/**
 * Sanitize a string for the omnibox `description` field. Chrome treats
 * the value as an XML-ish format where `<`, `>`, `&`, `"`, `'` carry
 * meaning, so we escape them. Newlines collapse to spaces because the
 * suggestion row is a single line.
 */
function escapeOmnibox(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
      // Site rules: skipCapture wins over everything. The remaining rule
      // fields layer on inside ingest() via the `rule` parameter.
      const rule = await findSiteRuleFor(host);
      if (rule?.skipCapture) {
        return sendResponse({ ok: false, skipped: true, byRule: true });
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
      }, rule);
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
        if (msg.action === "forgetHost") {
          const p = msg.payload as { host?: string } | undefined;
          if (!p?.host) return sendResponse({ ok: false, error: "host required" });
          const res = await forgetHost(p.host);
          return sendResponse({ ok: true, ...res });
        }
        if (msg.action === "setClipExpiry") {
          const p = msg.payload as { id?: string; expiresAt?: number | null } | undefined;
          if (!p?.id) return sendResponse({ ok: false, error: "id required" });
          const ok = await setClipExpiry(p.id, p.expiresAt ?? null);
          return sendResponse({ ok });
        }
        if (msg.action === "expireDueClips") {
          const n = await expireDueClips();
          return sendResponse({ ok: true, expired: n });
        }
        if (msg.action === "redactClip") {
          const p = msg.payload as { id?: string } | undefined;
          if (!p?.id) return sendResponse({ ok: false });
          const ok = await redactClip(p.id);
          return sendResponse({ ok });
        }
        if (msg.action === "unredactClip") {
          const p = msg.payload as { id?: string } | undefined;
          if (!p?.id) return sendResponse({ ok: false });
          const restored = await unredactClip(p.id);
          return sendResponse({ ok: true, restored });
        }
        if (msg.action === "applySidePanelMode") {
          await applySidePanelMode();
          return sendResponse({ ok: true });
        }
        if (msg.action === "openSidePanel") {
          // Open Chrome's side panel for the SENDER tab. Two invariants:
          //  - Chrome 116+ accepts `chrome.sidePanel.open({tabId})` from
          //    a runtime message handler as long as the message originates
          //    from a user gesture (palette click, popup button). We're
          //    fired from in-page palette → cc-rpc, so we're inside the
          //    user-gesture window.
          //  - Firefox has no sidePanel API at all. Bail with an honest
          //    error so callers can toast / fall back, not throw.
          // The tabId comes from `sender.tab?.id` — the content script
          // calling this RPC lives in a tab, so we have a real id 99% of
          // the time. Defensive against the orphan-tab edge case where
          // sender.tab is undefined (background-page → background-page
          // messages don't carry a tab).
          //
          // Probe mode: callers pass `{ probe: true }` to feature-detect
          // without firing the open call (which would steal the user's
          // gesture). We surface the same ok/error contract so the
          // detection logic is unchanged; the only difference is we
          // never call `sidePanelApi.open`.
          const sidePanelApi = (api as unknown as {
            sidePanel?: { open?: (o: { tabId?: number; windowId?: number }) => Promise<void> };
          }).sidePanel;
          if (!sidePanelApi?.open) {
            return sendResponse({ ok: false, error: "sidePanel API unavailable" });
          }
          const probe = !!(msg.payload as { probe?: boolean } | undefined)?.probe;
          const tabId = sender.tab?.id;
          const windowId = sender.tab?.windowId;
          if (typeof tabId !== "number" && typeof windowId !== "number") {
            return sendResponse({ ok: false, error: "no tab/window context" });
          }
          if (probe) {
            // API is present + we have a tab anchor — that's enough to
            // tell the caller the button should reveal. Don't actually
            // open the panel; that would steal the user's gesture.
            return sendResponse({ ok: true, probed: true });
          }
          try {
            await sidePanelApi.open(
              typeof tabId === "number" ? { tabId } : { windowId: windowId! },
            );
            return sendResponse({ ok: true });
          } catch (e) {
            console.warn("[context-clipboard] sidePanel.open failed", e);
            return sendResponse({
              ok: false,
              error: (e as Error)?.message || "sidePanel.open failed",
            });
          }
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
        if (msg.action === "refetchImage") {
          // Pull a fresh data URL for an image clip from its original
          // source URL. Re-runs the dimension probe so changed images
          // (re-uploads, redirects, server-side resizes) update their
          // width/height too. Returns the updated clip so the popup
          // can re-render without an extra round-trip. Local-only by
          // construction — the only network call goes to the source
          // host the user already visited.
          const p = msg.payload as { id?: string } | undefined;
          if (!p?.id) return sendResponse({ ok: false, error: "id required" });
          const c = await getClip(p.id);
          if (!c) return sendResponse({ ok: false, error: "not found" });
          if (c.kind !== "image") {
            return sendResponse({ ok: false, error: "not an image clip" });
          }
          // We need a source URL — `nearbyText` is where context-menu
          // captures stash the original `srcUrl`; copy-event captures
          // also drop the src there.
          const src = c.source.nearbyText || c.source.url;
          if (!src || !/^https?:\/\//i.test(src)) {
            return sendResponse({ ok: false, error: "no fetchable source URL" });
          }
          try {
            const fresh = await fetchAsDataUrl(src);
            const dims = await imageDims(fresh);
            c.content = fresh;
            c.mime = guessMime(fresh);
            c.bytes = fresh.length;
            if (dims) {
              c.width = dims.width;
              c.height = dims.height;
              // Refresh inline dims in the preview when it has the
              // stock format.
              if (c.preview && /\b\d+×\d+\b/.test(c.preview)) {
                c.preview = c.preview.replace(/\b\d+×\d+\b/, `${dims.width}×${dims.height}`);
              } else if (c.preview && !/\b\d+×\d+\b/.test(c.preview)) {
                c.preview = `${c.preview} · ${dims.width}×${dims.height}`;
              }
            }
            c.lastSeenAt = Date.now();
            await putClip(c);
            return sendResponse({ ok: true, clip: c });
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            return sendResponse({ ok: false, error: err });
          }
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
        if (msg.action === "addLink") {
          // Popup quick-capture: ingest a user-supplied URL as a
          // kind=link clip. The popup pre-validates via
          // parseQuickCaptureUrl (http(s) only, no js:/data:/file:);
          // we re-validate here defense-in-depth because the RPC
          // contract is a public surface and a future caller might
          // skip the popup-side guard.
          const p = msg.payload as {
            url: string;
            preview?: string;
            title?: string;
            tags?: string[];
          } | undefined;
          if (!p?.url) return sendResponse({ ok: false, error: "url required" });
          // Defense-in-depth: only allow http(s). Mirrors the popup
          // validator but as a final firewall.
          if (!/^https?:\/\//i.test(p.url)) {
            return sendResponse({ ok: false, error: "url must be http(s)" });
          }
          const id = await ingest({
            kind: "link",
            content: p.url,
            preview: (p.preview || p.url).slice(0, 200),
            source: { url: p.url, title: p.title?.slice(0, 200) },
          });
          // Apply caller-supplied tags AFTER ingest so dedup + auto-tag
          // run on the bare ingest first, then user intent layers on.
          if (id && p.tags?.length) {
            try {
              const stored = await getClip(id);
              if (stored) {
                const merged = new Set(stored.tags || []);
                for (const t of p.tags) {
                  const cleaned = t.trim().toLowerCase();
                  if (cleaned) merged.add(cleaned);
                }
                stored.tags = Array.from(merged);
                await putClip(stored);
              }
            } catch (e) {
              console.warn("[context-clipboard] addLink tag apply failed", e);
            }
          }
          return sendResponse({ ok: true, id });
        }
        if (msg.action === "addNote") {
          const p = msg.payload as {
            text: string;
            tags?: string[];
            pinned?: boolean;
          } | undefined;
          if (!p?.text) return sendResponse({ ok: false, error: "text required" });
          const id = await ingest({
            kind: "text",
            content: p.text,
            preview: redactSensitivePreview(p.text),
            source: { title: "Manual note" },
          });
          // Apply optional caller-supplied tags + pin AFTER ingest so
          // we don't bypass dedup or auto-tag — we let the same
          // pipeline run, then layer user intent on top. Failures
          // here are non-fatal: the note still landed.
          if (id && (p.tags?.length || p.pinned)) {
            try {
              const stored = await getClip(id);
              if (stored) {
                if (p.tags?.length) {
                  const merged = new Set(stored.tags || []);
                  for (const t of p.tags) {
                    const cleaned = t.trim().toLowerCase();
                    if (cleaned) merged.add(cleaned);
                  }
                  stored.tags = Array.from(merged);
                }
                if (p.pinned) stored.pinned = true;
                await putClip(stored);
              }
            } catch (e) {
              console.warn("[context-clipboard] note tag/pin apply failed", e);
            }
          }
          return sendResponse({ ok: true, id });
        }
        if (msg.action === "listSiteRules") {
          const rules = await listSiteRules();
          return sendResponse({ ok: true, rules });
        }
        if (msg.action === "upsertSiteRule") {
          const p = msg.payload as Partial<SiteRule> | undefined;
          if (!p?.hostPattern) {
            return sendResponse({ ok: false, error: "hostPattern required" });
          }
          const saved = await upsertSiteRule({
            id: p.id,
            hostPattern: p.hostPattern,
            autoTags: p.autoTags,
            autoPin: p.autoPin,
            autoLock: p.autoLock,
            autoRedact: p.autoRedact,
            skipCapture: p.skipCapture,
            autoScrubOrigin: p.autoScrubOrigin,
            customPatterns: p.customPatterns,
          });
          return sendResponse({ ok: true, rule: saved });
        }
        if (msg.action === "removeSiteRule") {
          const p = msg.payload as { id?: string } | undefined;
          if (!p?.id) return sendResponse({ ok: false, error: "id required" });
          const ok = await removeSiteRule(p.id);
          return sendResponse({ ok });
        }
        if (msg.action === "replaceSiteRules") {
          // Bulk-write the rules array straight to IDB. Used by the
          // Settings → site-rules Import flow after the popup has
          // already validated + merged the incoming bundle. Single
          // write keeps a 30-rule paste from paying 30 IDB roundtrips.
          const p = msg.payload as { rules?: SiteRule[] } | undefined;
          if (!Array.isArray(p?.rules)) {
            return sendResponse({ ok: false, error: "rules array required" });
          }
          await replaceSiteRules(p.rules);
          const rules = await listSiteRules();
          return sendResponse({ ok: true, rules });
        }
        if (msg.action === "setPaletteQuery") {
          // Persist the in-page palette's most recent query so the next
          // Cmd+Shift+V chord pre-fills the input. Empty string clears
          // the slot (intentional — user cleared their search before
          // closing). No need to await the response; content fires
          // and forgets.
          const p = msg.payload as { query?: string } | undefined;
          await setPaletteLastQuery(p?.query || "");
          return sendResponse({ ok: true });
        }
        if (msg.action === "purgeTrashOlderThan") {
          // Hard-delete every trash entry older than `maxAgeMs`. Different
          // from `emptyTrash` (which clears everything) because the user
          // explicitly wants a partial purge — typically 24h so the
          // last-day's deletes stay restorable. No confirm here; the
          // popup-side wrapper handles UX.
          const p = msg.payload as { maxAgeMs?: number } | undefined;
          const ms = Math.max(0, Number(p?.maxAgeMs) || 0);
          const purged = await purgeOldTrash(ms);
          return sendResponse({ ok: true, purged });
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

async function ingest(inp: IngestInput, rule?: SiteRule): Promise<string> {
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
    // Merge site-rule tags on the dedup path too so a rule added after the
    // first capture starts tagging subsequent hits.
    if (rule?.autoTags?.length) {
      existing.tags = Array.from(
        new Set([
          ...existing.tags,
          ...rule.autoTags.map((t) => t.toLowerCase()),
        ]),
      );
    }
    // autoPin is sticky — once a rule pins, we don't unpin on later hits.
    if (rule?.autoPin && !existing.pinned) existing.pinned = true;
    // autoLock is also sticky — once a rule locks, later hits never
    // silently unlock. The user's per-clip unlock action is the only
    // way the bit comes off after that, matching how autoPin behaves.
    // Stamp lockedAt on transition so the detail breadcrumb has a
    // truthful "Locked since" — only on the false→true transition,
    // so a dedup hit on an already-locked clip preserves the
    // original lock timestamp instead of bumping it.
    if (rule?.autoLock && existing.locked !== true) {
      existing.locked = true;
      existing.lockedAt = now;
    }
    await putClip(existing);
    return existing.id;
  }

  const tags = settings.enableAutoTags
    ? autoTag(inp.content, inp.kind, host)
    : [];
  // Layer site-rule tags on top of auto-tags (and on top of zero tags
  // when auto-tagging is off). Lowercase + dedupe to match autoTag's shape.
  if (rule?.autoTags?.length) {
    for (const t of rule.autoTags) {
      const lower = t.toLowerCase();
      if (!tags.includes(lower)) tags.push(lower);
    }
  }

  // Auto-redact at capture: rewrite content + preview before storing.
  // One-way — we do NOT stash the original so it never lands on disk.
  // A site rule's autoRedact forces this on regardless of the global toggle.
  const wantRedact =
    (settings.autoRedactPii || !!rule?.autoRedact) && inp.kind === "text";
  let storedContent = inp.content;
  let storedPreview = inp.preview;
  let redacted = false;
  if (wantRedact) {
    const rewritten = redactPii(inp.content);
    if (rewritten !== inp.content) {
      storedContent = rewritten;
      storedPreview = redactSensitivePreview(rewritten);
      redacted = true;
      if (!tags.includes("redacted")) tags.push("redacted");
    }
  }
  // Per-site custom redaction patterns layer on AFTER built-in PII so
  // a user can target host-specific stuff (account numbers, ticket
  // ids, internal IDs) the global PII patterns wouldn't catch. Text
  // clips only — applying regex to a data URL would corrupt images.
  if (inp.kind === "text" && rule?.customPatterns?.length) {
    const { content: rewritten2, matched } = applyCustomPatterns(
      storedContent,
      rule.customPatterns,
    );
    if (matched > 0 && rewritten2 !== storedContent) {
      storedContent = rewritten2;
      storedPreview = redactSensitivePreview(rewritten2);
      redacted = true;
      if (!tags.includes("redacted")) tags.push("redacted");
    }
  }

  const item: ClipItem = {
    id: uid(),
    kind: inp.kind,
    content: storedContent,
    mime: inp.mime,
    preview: storedPreview,
    source: inp.source,
    pinned: !!rule?.autoPin,
    createdAt: now,
    lastSeenAt: now,
    hitCount: 1,
    tags,
    bytes: storedContent.length,
    hash,
    ...(redacted ? { redacted: true } : {}),
    ...(rule?.autoLock ? { locked: true, lockedAt: now } : {}),
  };
  // Per-host auto-scrub: drop URL / title / nearby-context / favicon
  // BEFORE the clip lands on disk so the page identity never makes
  // it into IndexedDB. Different from skipCapture (which discards
  // the whole clip) — here we keep the content + tags + auto-redact
  // outcome and only wipe the where-it-came-from. Tags get `scrubbed`
  // so the user can `tag:scrubbed` later, matching the per-clip
  // affordance's contract.
  if (rule?.autoScrubOrigin) {
    item.source = {};
    if (!item.tags.includes("scrubbed")) item.tags.push("scrubbed");
    // Preview was built from the (now-discarded) page title for image
    // clips — rewrite it so the user doesn't see "Image copied from
    // <page>" with the page reference gone. Text/link previews come
    // from the body itself, so they're already safe.
    if (inp.kind === "image" && item.preview && /copied from/i.test(item.preview)) {
      const dims = /\b\d+×\d+\b/.exec(item.preview)?.[0];
      item.preview = dims ? `Image · ${dims}` : "Image";
    }
  }
  // Template detection (text only): when the captured body contains
  // {{tokens}}, flag the clip so the popup expands at copy time. Image
  // and link clips don't carry templates.
  if (inp.kind === "text" && hasTemplateTokens(storedContent)) {
    item.template = true;
    if (!item.tags.includes("template")) item.tags.push("template");
  }
  if (inp.kind === "image") {
    const dims = await imageDims(inp.content);
    if (dims) {
      item.width = dims.width;
      item.height = dims.height;
      // Inline dimensions in the preview if it's a stock "Image copied from…"
      // string. Easy visual cue in the list without taking another row.
      if (item.preview && !/\b\d+×\d+\b/.test(item.preview)) {
        item.preview = `${item.preview} · ${dims.width}×${dims.height}`;
      }
    }
  }
  await putClip(item);
  await pruneOldUnpinned(settings.maxUnpinned);
  // Opportunistic GC: trash any clips whose TTL has elapsed, then prune
  // any trash older than the retention window. Both are bounded and run
  // at most once per capture; cheap.
  void expireDueClips().catch(() => {});
  void purgeOldTrash(7 * 86_400_000).catch(() => {});
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

/**
 * Decode an image data URL well enough to read its pixel dimensions.
 * Runs in the service worker context (no DOM), so we use
 * `createImageBitmap` on a Blob. Returns undefined on failure — the
 * clip is still useful without dimensions.
 */
async function imageDims(
  dataUrl: string,
): Promise<{ width: number; height: number } | undefined> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    if (typeof createImageBitmap !== "function") return undefined;
    const bmp = await createImageBitmap(blob);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return undefined;
  }
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
    | "forgetHost"
    | "setClipExpiry"
    | "expireDueClips"
    | "setOcrText"
    | "addImageBlob"
    | "addNote"
    | "addLink"
    | "recordFieldPaste"
    | "getFieldSuggestion"
    | "findClipByContent"
    | "applySidePanelMode"
    | "openSidePanel"
    | "redactClip"
    | "unredactClip"
    | "refetchImage"
    | "listSiteRules"
    | "upsertSiteRule"
    | "removeSiteRule"
    | "replaceSiteRules"
    | "setPaletteQuery"
    | "purgeTrashOlderThan";
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

/// <reference types="chrome" />
import {
  listClips,
  deleteClip,
  togglePin,
  getClip,
  updateTags,
  getSettings,
  saveSettings,
} from "../lib/db";
import type { ClipItem, ClipKind, Settings } from "../lib/types";
import { timeAgo, hostFrom, escapeHtml } from "../lib/util";
import { icons, clipKindIcon } from "../lib/icons";

const api: typeof chrome =
  // @ts-expect-error firefox global
  (typeof browser !== "undefined" ? browser : chrome) as typeof chrome;

// Element refs ----------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const listEl = $("list");
const searchEl = $<HTMLInputElement>("search");
const countEl = $("count");
const clearBtn = $<HTMLButtonElement>("clear");
const pinnedToggle = $<HTMLButtonElement>("pinned-toggle");
const settingsBtn = $<HTMLButtonElement>("settings-btn");
const noteBtn = $<HTMLButtonElement>("note-btn");
const tagChipsEl = $("tag-chips");
const dropZone = $("drop-zone");
const filterBtns = document.querySelectorAll<HTMLButtonElement>(
  ".filters button[data-kind]",
);

const detailEl = $("detail");
const detailBack = $<HTMLButtonElement>("detail-back");
const detailPin = $<HTMLButtonElement>("detail-pin");
const detailDelete = $<HTMLButtonElement>("detail-delete");
const detailOcr = $<HTMLButtonElement>("detail-ocr");
const detailBody = $("detail-body");
const detailUrl = $<HTMLAnchorElement>("detail-url");
const detailTime = $("detail-time");
const detailHits = $("detail-hits");
const detailTags = $<HTMLInputElement>("detail-tags");
const detailNearby = $("detail-nearby");
const detailNearbyRow = $("detail-nearby-row");
const detailOcrRow = $("detail-ocr-row");
const detailOcrText = $("detail-ocr-text");
const detailCopy = $<HTMLButtonElement>("detail-copy");
const detailCopyMd = $<HTMLButtonElement>("detail-copy-md");

const settingsPanel = $("settings-panel");
const settingsBack = $<HTMLButtonElement>("settings-back");
const sMax = $<HTMLInputElement>("s-max");
const sDedup = $<HTMLInputElement>("s-dedup");
const sCapture = $<HTMLInputElement>("s-capture");
const sCaptureImg = $<HTMLInputElement>("s-capture-img");
const sAutoTag = $<HTMLInputElement>("s-autotag");
const sOcr = $<HTMLInputElement>("s-ocr");
const sPalette = $<HTMLInputElement>("s-palette");
const sFields = $<HTMLInputElement>("s-fields");
const sBlock = $<HTMLTextAreaElement>("s-block");
const sAllow = $<HTMLTextAreaElement>("s-allow");
const sTheme = $<HTMLSelectElement>("s-theme");
const storageInfo = $("storage-info");
const exportBtn = $<HTMLButtonElement>("export-btn");
const importBtn = $<HTMLButtonElement>("import-btn");
const importFile = $<HTMLInputElement>("import-file");
const clearAllBtn = $<HTMLButtonElement>("clear-all-btn");

const toastEl = $("toast");

// State ----------------------------------------------------------------
let currentKind: ClipKind | "all" = "all";
let pinnedOnly = false;
let activeTag: string | null = null;
let currentClips: ClipItem[] = [];
let activeIndex = 0;
let detailId: string | null = null;
let ocrLoading: Promise<unknown> | null = null;

function toast(msg: string, kind: "ok" | "error" = "ok") {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${kind === "error" ? "error" : ""}`;
  setTimeout(() => (toastEl.className = "toast"), 1300);
}

// Rendering -------------------------------------------------------------
function renderClip(c: ClipItem, idx: number, active: boolean): string {
  const thumb =
    c.kind === "image"
      ? `<div class="thumb"><img src="${c.content}" alt="" /></div>`
      : `<div class="thumb thumb-icon">${clipKindIcon(c.kind)}</div>`;
  const src = [hostFrom(c.source.url), c.source.title]
    .filter(Boolean)
    .join(" · ");
  const previewText =
    c.kind === "image" ? c.preview || "Image" : c.preview || c.content;
  const hits = c.hitCount > 1 ? ` · ×${c.hitCount}` : "";
  const tags = c.tags
    .slice(0, 4)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");
  return `
    <div class="clip ${c.pinned ? "pinned" : ""} ${active ? "active" : ""}" data-id="${c.id}" data-idx="${idx}">
      ${thumb}
      <div class="body">
        <div class="preview">${escapeHtml(previewText.slice(0, 140))}</div>
        <div class="meta">
          <span class="src" title="${escapeHtml(c.source.url || "")}">${escapeHtml(src || "—")}</span>
          <span>· ${timeAgo(c.lastSeenAt)}${hits}</span>
        </div>
        ${tags ? `<div class="tags">${tags}</div>` : ""}
      </div>
      <div class="actions">
        <button class="pin" data-act="pin" title="Pin (P)" data-pin-btn>${c.pinned ? icons.pinFilled() : icons.pin()}</button>
        <button class="copy" data-act="copy" title="Copy (Enter)" data-copy-btn>${icons.copy()}</button>
        <button class="del" data-act="del" title="Delete (Del)" data-del-btn>${icons.trash()}</button>
      </div>
    </div>
  `;
}

function renderTagChips(allClips: ClipItem[]) {
  const counts = new Map<string, number>();
  for (const c of allClips) {
    for (const t of c.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (top.length === 0) {
    tagChipsEl.hidden = true;
    return;
  }
  tagChipsEl.hidden = false;
  tagChipsEl.innerHTML = top
    .map(
      ([t, n]) =>
        `<span class="tag-chip ${t === activeTag ? "active" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)} <em>·${n}</em></span>`,
    )
    .join("");
}

async function render(): Promise<void> {
  const all = await listClips({ limit: 1000 });
  renderTagChips(all);
  currentClips = await listClips({
    q: searchEl.value,
    kind: currentKind,
    pinnedOnly,
    tag: activeTag || undefined,
    limit: 200,
  });
  if (activeIndex >= currentClips.length)
    activeIndex = Math.max(0, currentClips.length - 1);
  if (currentClips.length === 0) {
    listEl.innerHTML = `<div class="empty">No clips yet.<br/>Copy anything, right-click → "Capture", or drop an image here.</div>`;
  } else {
    listEl.innerHTML = currentClips
      .map((c, i) => renderClip(c, i, i === activeIndex))
      .join("");
  }
  countEl.textContent = `${currentClips.length} clip${currentClips.length === 1 ? "" : "s"}`;
}

// Clipboard helpers -----------------------------------------------------
async function copyToClipboard(c: ClipItem) {
  try {
    if (c.kind === "image") {
      const res = await fetch(c.content);
      const blob = await res.blob();
      const Item = (window as unknown as { ClipboardItem: new (parts: Record<string, Blob>) => unknown }).ClipboardItem;
      const clip = navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> };
      await clip.write([new Item({ [blob.type]: blob })]);
    } else {
      await navigator.clipboard.writeText(c.content);
    }
    toast("Copied");
  } catch (e) {
    console.error(e);
    toast("Copy failed", "error");
  }
}

function looksLikeCode(s: string): boolean {
  return /\b(function|const|let|var|class|import|export|=>|<\/?\w|def |print\()/.test(
    s,
  ) || /\n/.test(s);
}

async function copyAsMarkdown(c: ClipItem) {
  let md: string;
  if (c.kind === "image") {
    md = `![${c.source.title || "image"}](${c.source.url || ""})`;
  } else if (c.kind === "link") {
    md = `[${c.preview || c.content}](${c.content})`;
  } else if (c.tags.includes("code") || looksLikeCode(c.content)) {
    md = "```\n" + c.content + "\n```";
  } else {
    const cite = c.source.url
      ? `\n\n— [${c.source.title || c.source.url}](${c.source.url})`
      : "";
    md = `> ${c.content.replace(/\n/g, "\n> ")}${cite}`;
  }
  await navigator.clipboard.writeText(md);
  toast("Copied as Markdown");
}

// Detail view -----------------------------------------------------------
async function openDetail(id: string) {
  const c = await getClip(id);
  if (!c) return;
  detailId = c.id;
  if (c.kind === "image") {
    detailBody.innerHTML = `<img src="${c.content}" alt="" />`;
    detailOcr.hidden = false;
  } else {
    detailBody.innerHTML = `<pre>${escapeHtml(c.content)}</pre>`;
    detailOcr.hidden = true;
  }
  detailUrl.href = c.source.url || "#";
  detailUrl.textContent = c.source.url || "—";
  detailTime.textContent = new Date(c.createdAt).toLocaleString();
  detailHits.textContent = String(c.hitCount);
  detailTags.value = c.tags.join(", ");
  if (c.source.nearbyText) {
    detailNearbyRow.hidden = false;
    detailNearby.textContent = c.source.nearbyText;
  } else {
    detailNearbyRow.hidden = true;
  }
  if (c.ocrText) {
    detailOcrRow.hidden = false;
    detailOcrText.textContent = c.ocrText;
  } else {
    detailOcrRow.hidden = true;
  }
  detailPin.innerHTML = c.pinned ? icons.pinFilled() : icons.pin();
  detailEl.hidden = false;
}

function closeDetail() {
  detailEl.hidden = true;
  detailId = null;
}

// OCR (runs in popup; CSP allows external script for popup pages) -------
async function loadTesseract() {
  throw new Error("OCR is temporarily disabled in v0.3.1 (returning in v0.4.0)");
}

async function runOcr(_c: ClipItem): Promise<string> {
  throw new Error("OCR temporarily disabled");
}

// Settings --------------------------------------------------------------
async function openSettings() {
  const s = await getSettings();
  sMax.value = String(s.maxUnpinned);
  sDedup.value = String(Math.round(s.dedupWindowMs / 1000));
  sCapture.checked = s.captureCopyEvents;
  sCaptureImg.checked = s.captureImagesOnCopy;
  sAutoTag.checked = s.enableAutoTags;
  sOcr.checked = s.enableOcr;
  sPalette.checked = s.enableInPagePalette;
  sFields.checked = s.enableFieldSuggestions;
  sBlock.value = (s.blockList || []).join("\n");
  sAllow.value = (s.allowList || []).join("\n");
  sTheme.value = s.theme;
  await renderStorage();
  settingsPanel.hidden = false;
}

function closeSettings() {
  settingsPanel.hidden = true;
}

async function saveSettingsFromForm() {
  const next: Partial<Settings> = {
    maxUnpinned: Math.max(50, Number(sMax.value) || 500),
    dedupWindowMs: Math.max(0, (Number(sDedup.value) || 60) * 1000),
    captureCopyEvents: sCapture.checked,
    captureImagesOnCopy: sCaptureImg.checked,
    enableAutoTags: sAutoTag.checked,
    enableOcr: sOcr.checked,
    enableInPagePalette: sPalette.checked,
    enableFieldSuggestions: sFields.checked,
    blockList: sBlock.value.split("\n").map((s) => s.trim()).filter(Boolean),
    allowList: sAllow.value.split("\n").map((s) => s.trim()).filter(Boolean),
    theme: (sTheme.value as Settings["theme"]) || "auto",
  };
  const saved = await saveSettings(next);
  document.body.dataset.theme = saved.theme;
}

async function renderStorage() {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) {
      storageInfo.textContent = "Storage info unavailable.";
      return;
    }
    const used = est.usage || 0;
    const quota = est.quota || 1;
    const pct = Math.min(100, Math.round((used / quota) * 100));
    storageInfo.innerHTML = `
      <strong>Storage:</strong> ${formatBytes(used)} of ${formatBytes(quota)} (${pct}%)
      <div class="storage-bar"><div style="width:${pct}%"></div></div>
    `;
  } catch {
    storageInfo.textContent = "";
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Drag & drop -----------------------------------------------------------
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.hidden = false;
});
window.addEventListener("dragleave", (e) => {
  if (e.target === document.documentElement) dropZone.hidden = true;
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.hidden = true;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    await new Promise<void>((resolve) => {
      api.runtime.sendMessage(
        {
          type: "cc-rpc",
          action: "addImageBlob",
          payload: { dataUrl, name: file.name },
        },
        () => resolve(),
      );
    });
  }
  toast("Image added");
  await render();
});

// Tag chips -------------------------------------------------------------
tagChipsEl.addEventListener("click", (e) => {
  const chip = (e.target as HTMLElement).closest(".tag-chip") as HTMLElement | null;
  if (!chip) return;
  const t = chip.dataset.tag || null;
  activeTag = activeTag === t ? null : t;
  activeIndex = 0;
  render();
});

// List events -----------------------------------------------------------
listEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const clipEl = target.closest(".clip") as HTMLElement | null;
  if (!clipEl) return;
  const id = clipEl.dataset.id!;
  const act = (target.dataset.act as string) || "";
  const c = currentClips.find((x) => x.id === id);
  if (!c) return;

  if (act === "del") {
    await deleteClip(id);
    await render();
    return;
  }
  if (act === "pin") {
    await togglePin(id);
    await render();
    return;
  }
  if (act === "copy") {
    if (e.shiftKey) await copyAsMarkdown(c);
    else await copyToClipboard(c);
    return;
  }
  if (e.shiftKey) {
    await copyAsMarkdown(c);
  } else if ((e as MouseEvent).altKey || (e as MouseEvent).metaKey) {
    await copyToClipboard(c);
  } else {
    await openDetail(id);
  }
});

searchEl.addEventListener("input", () => {
  activeIndex = 0;
  render();
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentKind = (btn.dataset.kind as ClipKind | "all") || "all";
    activeIndex = 0;
    render();
  });
});

pinnedToggle.addEventListener("click", () => {
  pinnedOnly = !pinnedOnly;
  pinnedToggle.classList.toggle("active", pinnedOnly);
  activeIndex = 0;
  render();
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Clear all unpinned clips?")) return;
  await new Promise<void>((resolve) => {
    api.runtime.sendMessage(
      { type: "cc-rpc", action: "clearUnpinned" },
      () => resolve(),
    );
  });
  await render();
  toast("Cleared unpinned");
});

noteBtn.addEventListener("click", async () => {
  const text = prompt("Add a quick note:");
  if (!text) return;
  await new Promise<void>((resolve) => {
    api.runtime.sendMessage(
      { type: "cc-rpc", action: "addNote", payload: { text } },
      () => resolve(),
    );
  });
  toast("Note saved");
  await render();
});

// Keyboard --------------------------------------------------------------
document.addEventListener("keydown", async (e) => {
  if (!detailEl.hidden) {
    if (e.key === "Escape") closeDetail();
    return;
  }
  if (!settingsPanel.hidden) {
    if (e.key === "Escape") {
      await saveSettingsFromForm();
      closeSettings();
      await render();
    }
    return;
  }
  const tag = (e.target as HTMLElement).tagName;
  const inSearch =
    tag === "INPUT" && (e.target as HTMLInputElement).type === "search";

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = Math.min(currentClips.length - 1, activeIndex + 1);
    await render();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = Math.max(0, activeIndex - 1);
    await render();
  } else if (e.key === "Enter") {
    const c = currentClips[activeIndex];
    if (!c) return;
    if (e.shiftKey) await copyAsMarkdown(c);
    else await copyToClipboard(c);
  } else if ((e.key === "Delete" || e.key === "Backspace") && !inSearch) {
    const c = currentClips[activeIndex];
    if (c) {
      await deleteClip(c.id);
      await render();
    }
  } else if (e.key.toLowerCase() === "p" && !inSearch) {
    const c = currentClips[activeIndex];
    if (c) {
      await togglePin(c.id);
      await render();
    }
  } else if (e.key === "/" && !inSearch) {
    e.preventDefault();
    searchEl.focus();
  }
});

// Detail wiring ---------------------------------------------------------
detailBack.addEventListener("click", () => closeDetail());

detailDelete.addEventListener("click", async () => {
  if (!detailId) return;
  if (!confirm("Delete this clip?")) return;
  await deleteClip(detailId);
  closeDetail();
  await render();
});

detailPin.addEventListener("click", async () => {
  if (!detailId) return;
  const pinned = await togglePin(detailId);
  detailPin.innerHTML = pinned ? icons.pinFilled() : icons.pin();
  await render();
});

detailCopy.addEventListener("click", async () => {
  if (!detailId) return;
  const c = await getClip(detailId);
  if (c) await copyToClipboard(c);
});

detailCopyMd.addEventListener("click", async () => {
  if (!detailId) return;
  const c = await getClip(detailId);
  if (c) await copyAsMarkdown(c);
});

detailTags.addEventListener("change", async () => {
  if (!detailId) return;
  const tags = detailTags.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  await updateTags(detailId, tags);
  await render();
  toast("Tags saved");
});

detailOcr.addEventListener("click", async () => {
  toast("OCR coming in v0.5.0", "error");
});

// Settings wiring -------------------------------------------------------
settingsBtn.addEventListener("click", () => openSettings());
settingsBack.addEventListener("click", async () => {
  await saveSettingsFromForm();
  closeSettings();
  await render();
});

sTheme.addEventListener("change", () => {
  document.body.dataset.theme = sTheme.value;
});

exportBtn.addEventListener("click", () => {
  api.runtime.sendMessage(
    { type: "cc-rpc", action: "export" },
    (resp: { ok: boolean; data?: unknown }) => {
      if (!resp?.ok) return toast("Export failed", "error");
      const blob = new Blob([JSON.stringify(resp.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `context-clipboard-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Exported");
    },
  );
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    api.runtime.sendMessage(
      { type: "cc-rpc", action: "import", payload: data },
      (resp: { ok: boolean; imported?: number; error?: string }) => {
        if (resp?.ok) {
          toast(`Imported ${resp.imported || 0}`);
          render();
        } else {
          toast(resp?.error || "Import failed", "error");
        }
      },
    );
  } catch (e) {
    toast("Bad JSON", "error");
    console.error(e);
  } finally {
    importFile.value = "";
  }
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Delete EVERYTHING, including pinned? This cannot be undone."))
    return;
  api.runtime.sendMessage({ type: "cc-rpc", action: "clearAll" }, () => {
    toast("All clips deleted");
    render();
  });
});

// Init ------------------------------------------------------------------
(async () => {
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
    const name = el.dataset.icon as keyof typeof icons;
    const fn = icons[name];
    if (typeof fn === "function") el.innerHTML = fn();
  });
  const s = await getSettings();
  document.body.dataset.theme = s.theme;
  await render();
  searchEl.focus();
})();

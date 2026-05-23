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

const api: typeof chrome =
  // @ts-expect-error firefox global
  (typeof browser !== "undefined" ? browser : chrome) as typeof chrome;

const listEl = document.getElementById("list") as HTMLElement;
const searchEl = document.getElementById("search") as HTMLInputElement;
const countEl = document.getElementById("count") as HTMLElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const pinnedToggle = document.getElementById("pinned-toggle") as HTMLButtonElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const filterBtns = document.querySelectorAll<HTMLButtonElement>(
  ".filters button[data-kind]",
);

const detailEl = document.getElementById("detail") as HTMLElement;
const detailBack = document.getElementById("detail-back") as HTMLButtonElement;
const detailPin = document.getElementById("detail-pin") as HTMLButtonElement;
const detailDelete = document.getElementById("detail-delete") as HTMLButtonElement;
const detailBody = document.getElementById("detail-body") as HTMLElement;
const detailUrl = document.getElementById("detail-url") as HTMLAnchorElement;
const detailTime = document.getElementById("detail-time") as HTMLElement;
const detailHits = document.getElementById("detail-hits") as HTMLElement;
const detailTags = document.getElementById("detail-tags") as HTMLInputElement;
const detailNearby = document.getElementById("detail-nearby") as HTMLElement;
const detailNearbyRow = document.getElementById("detail-nearby-row") as HTMLElement;
const detailCopy = document.getElementById("detail-copy") as HTMLButtonElement;
const detailCopyMd = document.getElementById("detail-copy-md") as HTMLButtonElement;

const settingsPanel = document.getElementById("settings-panel") as HTMLElement;
const settingsBack = document.getElementById("settings-back") as HTMLButtonElement;
const sMax = document.getElementById("s-max") as HTMLInputElement;
const sDedup = document.getElementById("s-dedup") as HTMLInputElement;
const sCapture = document.getElementById("s-capture") as HTMLInputElement;
const sAutoTag = document.getElementById("s-autotag") as HTMLInputElement;
const sTheme = document.getElementById("s-theme") as HTMLSelectElement;
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
const importBtn = document.getElementById("import-btn") as HTMLButtonElement;
const importFile = document.getElementById("import-file") as HTMLInputElement;
const clearAllBtn = document.getElementById("clear-all-btn") as HTMLButtonElement;

const toastEl = document.getElementById("toast") as HTMLElement;

let currentKind: ClipKind | "all" = "all";
let pinnedOnly = false;
let currentClips: ClipItem[] = [];
let activeIndex = 0;
let detailId: string | null = null;

function toast(msg: string, kind: "ok" | "error" = "ok") {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${kind === "error" ? "error" : ""}`;
  setTimeout(() => (toastEl.className = "toast"), 1300);
}

function renderClip(c: ClipItem, idx: number, active: boolean): string {
  const thumb =
    c.kind === "image"
      ? `<div class="thumb"><img src="${c.content}" alt="" /></div>`
      : `<div class="thumb">${c.kind === "link" ? "🔗" : "📝"}</div>`;
  const src = [hostFrom(c.source.url), c.source.title]
    .filter(Boolean)
    .join(" · ");
  const previewText =
    c.kind === "image" ? c.preview || "Image" : c.preview || c.content;
  const hits = c.hitCount > 1 ? ` · ×${c.hitCount}` : "";
  const tags = c.tags
    .slice(0, 3)
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
        <button class="pin" data-act="pin" title="Pin (P)">📌</button>
        <button class="copy" data-act="copy" title="Copy (Enter)">⎘</button>
        <button class="del" data-act="del" title="Delete (Del)">✕</button>
      </div>
    </div>
  `;
}

async function render(): Promise<void> {
  currentClips = await listClips({
    q: searchEl.value,
    kind: currentKind,
    pinnedOnly,
    limit: 200,
  });
  if (activeIndex >= currentClips.length) activeIndex = Math.max(0, currentClips.length - 1);
  if (currentClips.length === 0) {
    listEl.innerHTML = `<div class="empty">No clips yet.<br/>Copy anything, or right-click → "Capture to Context Clipboard".</div>`;
  } else {
    listEl.innerHTML = currentClips.map((c, i) => renderClip(c, i, i === activeIndex)).join("");
  }
  countEl.textContent = `${currentClips.length} clip${currentClips.length === 1 ? "" : "s"}`;
}

async function copyToClipboard(c: ClipItem) {
  try {
    if (c.kind === "image") {
      const res = await fetch(c.content);
      const blob = await res.blob();
      const Item = (window as unknown as { ClipboardItem: new (parts: Record<string, Blob>) => unknown }).ClipboardItem;
      const clip = (navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> });
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

async function copyAsMarkdown(c: ClipItem) {
  let md: string;
  if (c.kind === "image") {
    md = `![${c.source.title || "image"}](${c.source.url || ""})`;
  } else if (c.kind === "link") {
    md = `[${c.preview || c.content}](${c.content})`;
  } else {
    const cite = c.source.url
      ? `\n\n— [${c.source.title || c.source.url}](${c.source.url})`
      : "";
    md = `> ${c.content.replace(/\n/g, "\n> ")}${cite}`;
  }
  await navigator.clipboard.writeText(md);
  toast("Copied as Markdown");
}

async function openDetail(id: string) {
  const c = await getClip(id);
  if (!c) return;
  detailId = c.id;
  if (c.kind === "image") {
    detailBody.innerHTML = `<img src="${c.content}" alt="" />`;
  } else {
    detailBody.innerHTML = `<pre>${escapeHtml(c.content)}</pre>`;
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
  detailPin.textContent = c.pinned ? "📌 Pinned" : "📌";
  detailEl.hidden = false;
}

function closeDetail() {
  detailEl.hidden = true;
  detailId = null;
}

async function openSettings() {
  const s = await getSettings();
  sMax.value = String(s.maxUnpinned);
  sDedup.value = String(Math.round(s.dedupWindowMs / 1000));
  sCapture.checked = s.captureCopyEvents;
  sAutoTag.checked = s.enableAutoTags;
  sTheme.value = s.theme;
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
    enableAutoTags: sAutoTag.checked,
    theme: (sTheme.value as Settings["theme"]) || "auto",
  };
  const saved = await saveSettings(next);
  document.body.dataset.theme = saved.theme;
}

// Event wiring -------------------------------------------------------------

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
  // Click on body → open detail
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

// Keyboard navigation -----------------------------------------------------

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
  const inSearch = tag === "INPUT" && (e.target as HTMLInputElement).type === "search";

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

// Detail view wiring ------------------------------------------------------

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
  detailPin.textContent = pinned ? "📌 Pinned" : "📌";
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
  const tags = detailTags.value.split(",").map((t) => t.trim()).filter(Boolean);
  await updateTags(detailId, tags);
  await render();
  toast("Tags saved");
});

// Settings wiring --------------------------------------------------------

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
  api.runtime.sendMessage({ type: "cc-rpc", action: "export" }, (resp: { ok: boolean; data?: unknown }) => {
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
  });
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
  if (!confirm("Delete EVERYTHING, including pinned? This cannot be undone.")) return;
  api.runtime.sendMessage({ type: "cc-rpc", action: "clearAll" }, () => {
    toast("All clips deleted");
    render();
  });
});

// Init --------------------------------------------------------------------

(async () => {
  const s = await getSettings();
  document.body.dataset.theme = s.theme;
  await render();
  searchEl.focus();
})();

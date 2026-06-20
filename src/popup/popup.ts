/// <reference types="chrome" />
import {
  listClips,
  togglePin,
  getClip,
  updateTags,
  getSettings,
  saveSettings,
  trashClip,
  listTrash,
  restoreClip,
  emptyTrash,
  trashCount,
  type TrashedClip,
} from "../lib/db";
import type { ClipItem, ClipKind, Settings } from "../lib/types";
import { timeAgo, hostFrom, escapeHtml } from "../lib/util";
import { icons, clipKindIcon } from "../lib/icons";
import {
  encryptJson,
  decryptJson,
  isEncryptedEnvelope,
  type EncryptedEnvelope,
} from "../lib/crypto";
import { parseQuery, applyQuery, describeQuery } from "../lib/search";
import { toMarkdown, toCsv, mimeFor, extFor, type ExportFormat } from "../lib/export";

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
const quickChipsEl = $("quick-chips");
const dropZone = $("drop-zone");
const filterBtns = document.querySelectorAll<HTMLButtonElement>(
  ".filters button[data-kind]",
);

const detailEl = $("detail");
const detailBack = $<HTMLButtonElement>("detail-back");
const detailPrev = $<HTMLButtonElement>("detail-prev");
const detailNext = $<HTMLButtonElement>("detail-next");
const detailNavPos = $("detail-nav-pos");
const detailPin = $<HTMLButtonElement>("detail-pin");
const detailDelete = $<HTMLButtonElement>("detail-delete");
const detailOcr = $<HTMLButtonElement>("detail-ocr");
const detailRedact = $<HTMLButtonElement>("detail-redact");
const detailBody = $("detail-body");
const detailUrl = $<HTMLAnchorElement>("detail-url");
const detailTime = $("detail-time");
const detailHits = $("detail-hits");
const detailTags = $<HTMLInputElement>("detail-tags");
const detailNearby = $("detail-nearby");
const detailNearbyRow = $("detail-nearby-row");
const detailImageRow = $("detail-image-row");
const detailImageInfo = $("detail-image-info");
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
const sSidePanel = $<HTMLInputElement>("s-sidepanel");
const sAutoRedact = $<HTMLInputElement>("s-autoredact");
const sBlock = $<HTMLTextAreaElement>("s-block");
const sAllow = $<HTMLTextAreaElement>("s-allow");
const sTheme = $<HTMLSelectElement>("s-theme");
const storageInfo = $("storage-info");
const exportBtn = $<HTMLButtonElement>("export-btn");
const importBtn = $<HTMLButtonElement>("import-btn");
const importFile = $<HTMLInputElement>("import-file");
const clearAllBtn = $<HTMLButtonElement>("clear-all-btn");
const encryptToggle = $<HTMLInputElement>("s-encrypt-export");
const exportPass = $<HTMLInputElement>("export-pass");
const encryptPassRow = $("encrypt-pass-row");
const exportFormat = $<HTMLSelectElement>("export-format");
const trashSummary = $("trash-summary");
const trashList = $("trash-list");
const trashEmpty = $<HTMLButtonElement>("trash-empty");

const bulkBar = $("bulk-bar");
const bulkCount = $("bulk-count");
const bulkPin = $<HTMLButtonElement>("bulk-pin");
const bulkTag = $<HTMLButtonElement>("bulk-tag");
const bulkDel = $<HTMLButtonElement>("bulk-del");
const bulkClear = $<HTMLButtonElement>("bulk-clear");

const toastEl = $("toast");

// State ----------------------------------------------------------------
let currentKind: ClipKind | "all" = "all";
let pinnedOnly = false;
let activeTag: string | null = null;
let currentClips: ClipItem[] = [];
let activeIndex = 0;
let detailId: string | null = null;
let ocrLoading: Promise<unknown> | null = null;
const selectedIds = new Set<string>();

/**
 * Show a transient toast. If `action` is provided, render a clickable
 * button to the right of the message; clicking it dismisses the toast and
 * runs `action.fn`. Use this for undoable operations (delete → restore).
 *
 * The toast auto-dismisses; for action toasts we hold it for ~4.5s so the
 * user has time to actually hit Undo, vs ~1.3s for normal status toasts.
 */
function toast(
  msg: string,
  kind: "ok" | "error" = "ok",
  action?: { label: string; fn: () => void | Promise<void> },
) {
  // Reset any prior content so re-using the same toast element works.
  toastEl.innerHTML = "";
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = msg;
  toastEl.appendChild(text);
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener(
      "click",
      async (e) => {
        e.stopPropagation();
        toastEl.className = "toast";
        try {
          await action.fn();
        } catch (err) {
          console.error(err);
        }
      },
      { once: true },
    );
    toastEl.appendChild(btn);
  }
  toastEl.className = `toast show ${kind === "error" ? "error" : ""}${
    action ? " has-action" : ""
  }`;
  const dwell = action ? 4500 : 1300;
  setTimeout(() => {
    toastEl.className = "toast";
  }, dwell);
}

/**
 * Trash one or more clips and surface a single "Undo" toast that restores
 * the whole batch. The undo window is the toast lifetime (~4.5s).
 */
async function trashWithUndo(ids: string[], label?: string): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) await trashClip(id);
  const message =
    label ??
    (ids.length === 1 ? "Moved to trash" : `Moved ${ids.length} to trash`);
  toast(message, "ok", {
    label: "Undo",
    fn: async () => {
      let restored = 0;
      for (const id of ids) {
        const ok = await restoreClip(id);
        if (ok) restored++;
      }
      await render();
      toast(restored === 1 ? "Restored" : `Restored ${restored}`);
    },
  });
  await render();
}

// Rendering -------------------------------------------------------------
function renderClip(c: ClipItem, idx: number, active: boolean): string {
  const thumb =
    c.kind === "image"
      ? `<div class="thumb"><img src="${c.content}" alt="" />${c.width && c.height ? `<span class="thumb-dims">${c.width}×${c.height}</span>` : ""}</div>`
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
    <div class="clip ${c.pinned ? "pinned" : ""} ${active ? "active" : ""} ${selectedIds.has(c.id) ? "selected" : ""}" data-id="${c.id}" data-idx="${idx}">
      ${selectedIds.size > 0 ? `<div class="select-mark">${selectedIds.has(c.id) ? icons.check() : ""}</div>` : ""}
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

/**
 * Quick-filter pills. Each pill toggles a search operator on/off in the
 * search box. We compute the host pills from the top hosts in the
 * currently-loaded set so they stay relevant to what the user actually has.
 */
function renderQuickChips(allClips: ClipItem[]) {
  const raw = searchEl.value;
  const hasOp = (op: string) => new RegExp(`(?:^|\\s)${op}(?:\\s|$)`).test(raw);
  const hasHost = (h: string) =>
    new RegExp(`(?:^|\\s)host:${h.replace(/\./g, "\\.")}(?:\\s|$)`, "i").test(raw);

  const hostCounts = new Map<string, number>();
  let redacted = 0;
  let ocr = 0;
  let images = 0;
  for (const c of allClips) {
    const h = hostFrom(c.source.url);
    if (h) hostCounts.set(h, (hostCounts.get(h) || 0) + 1);
    if (c.redacted) redacted++;
    if (c.ocrText) ocr++;
    if (c.kind === "image") images++;
  }
  const topHosts = Array.from(hostCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  type Pill = { label: string; op: string; active: boolean; count?: number; ariaLabel?: string };
  const pills: Pill[] = [];
  pills.push({
    label: "Pinned",
    op: "is:pinned",
    active: hasOp("is:pinned"),
  });
  if (redacted > 0)
    pills.push({
      label: "Redacted",
      op: "is:redacted",
      active: hasOp("is:redacted"),
      count: redacted,
    });
  if (ocr > 0)
    pills.push({
      label: "OCR",
      op: "is:ocr",
      active: hasOp("is:ocr"),
      count: ocr,
    });
  if (images > 0)
    pills.push({
      label: "Images",
      op: "kind:image",
      active: hasOp("kind:image"),
      count: images,
    });
  pills.push({
    label: "Last 24h",
    op: "after:24h",
    active: hasOp("after:24h"),
  });
  for (const [h, n] of topHosts) {
    pills.push({
      label: h,
      op: `host:${h}`,
      active: hasHost(h),
      count: n,
      ariaLabel: `Filter to ${h}`,
    });
  }

  if (pills.length === 0) {
    quickChipsEl.hidden = true;
    return;
  }
  quickChipsEl.hidden = false;
  quickChipsEl.innerHTML = pills
    .map(
      (p) =>
        `<button class="quick-chip ${p.active ? "active" : ""}" data-op="${escapeHtml(p.op)}" title="${escapeHtml(p.ariaLabel || `Toggle ${p.op}`)}"><span>${escapeHtml(p.label)}</span>${p.count != null ? `<em>${p.count}</em>` : ""}</button>`,
    )
    .join("");
}

function toggleSearchOp(op: string) {
  const raw = searchEl.value;
  const re = new RegExp(
    `(?:^|\\s)${op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`,
  );
  let next: string;
  if (re.test(raw)) {
    next = raw.replace(re, " ").replace(/\s+/g, " ").trim();
  } else {
    next = raw.trim() ? `${raw.trim()} ${op}` : op;
  }
  searchEl.value = next;
  activeIndex = 0;
  void render();
}

async function render(): Promise<void> {
  const all = await listClips({ limit: 1000 });
  renderTagChips(all);
  renderQuickChips(all);
  const parsed = parseQuery(searchEl.value);
  // Pull a wide window from IDB then apply parsed filters in-memory. The
  // total clip count is bounded by `maxUnpinned` (default 500) + pinned, so
  // this stays cheap. We keep the legacy free-text filter inside listClips
  // disabled (we own it now) and pass only kind/pinned/tag through, then
  // overlay the parsed operators on top.
  const wide = await listClips({ limit: 5000 });
  currentClips = applyQuery(wide, parsed, {
    extraPinnedOnly: pinnedOnly,
    extraTag: activeTag,
    extraKind: currentKind,
  }).slice(0, 200);
  if (activeIndex >= currentClips.length)
    activeIndex = Math.max(0, currentClips.length - 1);
  if (currentClips.length === 0) {
    const hint = searchEl.value.trim()
      ? `<div class="empty">No clips match.<br/><small>Try plain text, or <code>kind:image</code> / <code>host:github.com</code> / <code>tag:code</code> / <code>is:pinned</code> / <code>after:24h</code>.</small></div>`
      : `<div class="empty">No clips yet.<br/>Copy anything, right-click → "Capture", or drop an image here.</div>`;
    listEl.innerHTML = hint;
  } else {
    listEl.innerHTML = currentClips
      .map((c, i) => renderClip(c, i, i === activeIndex))
      .join("");
  }
  const desc = describeQuery(parsed);
  const countText = `${currentClips.length} clip${currentClips.length === 1 ? "" : "s"}`;
  countEl.textContent = desc ? `${countText} · ${desc}` : countText;
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
  if (c.kind === "image") {
    detailImageRow.hidden = false;
    const dims =
      c.width && c.height ? `${c.width}×${c.height} px` : "unknown size";
    const mime = c.mime || "image/png";
    detailImageInfo.textContent = `${dims} · ${formatBytes(c.bytes)} · ${mime}`;
  } else {
    detailImageRow.hidden = true;
  }
  if (c.ocrText) {
    detailOcrRow.hidden = false;
    detailOcrText.textContent = c.ocrText;
  } else {
    detailOcrRow.hidden = true;
  }
  detailPin.innerHTML = c.pinned ? icons.pinFilled() : icons.pin();
  renderRedactButton(c);
  updateDetailNav();
  detailEl.hidden = false;
}

/**
 * Refresh the prev/next buttons + position pill based on `detailId`'s
 * index in the currently-filtered list. When the clip isn't in the list
 * (e.g. opened from search then filter changed), buttons disable and the
 * pill hides — we don't try to guess what "next" should mean off-list.
 */
function updateDetailNav(): void {
  const idx = detailId
    ? currentClips.findIndex((c) => c.id === detailId)
    : -1;
  if (idx < 0 || currentClips.length === 0) {
    detailPrev.disabled = true;
    detailNext.disabled = true;
    detailNavPos.hidden = true;
    return;
  }
  detailNavPos.hidden = false;
  detailNavPos.textContent = `${idx + 1} / ${currentClips.length}`;
  detailPrev.disabled = idx <= 0;
  detailNext.disabled = idx >= currentClips.length - 1;
}

/**
 * Step to the previous/next clip in the currently-filtered list and
 * re-open the detail view on it. Keeps `activeIndex` in sync so the
 * underlying list highlights the same clip when the user closes the
 * detail. No-op at list boundaries (buttons disable; keys silent).
 */
async function stepDetail(direction: -1 | 1): Promise<void> {
  if (!detailId) return;
  const idx = currentClips.findIndex((c) => c.id === detailId);
  if (idx < 0) return;
  const next = idx + direction;
  if (next < 0 || next >= currentClips.length) return;
  const target = currentClips[next];
  activeIndex = next;
  await openDetail(target.id);
}

function renderRedactButton(c: ClipItem) {
  // Images aren't redactable (binary payload).
  if (c.kind === "image") {
    detailRedact.hidden = true;
    return;
  }
  detailRedact.hidden = false;
  if (c.redacted) {
    detailRedact.innerHTML = icons.shieldOff();
    if (c.originalContent != null) {
      detailRedact.title = "Unmask — restore original content";
      detailRedact.disabled = false;
    } else {
      detailRedact.title = "Redaction is permanent (original was never stored)";
      detailRedact.disabled = true;
    }
  } else {
    detailRedact.innerHTML = icons.shield();
    detailRedact.title = "Redact emails / phones / cards / secrets in this clip";
    detailRedact.disabled = false;
  }
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
  sSidePanel.checked = s.enableSidePanel;
  sAutoRedact.checked = s.autoRedactPii;
  sBlock.value = (s.blockList || []).join("\n");
  sAllow.value = (s.allowList || []).join("\n");
  sTheme.value = s.theme;
  await renderStorage();
  await renderTrash();
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
    enableSidePanel: sSidePanel.checked,
    autoRedactPii: sAutoRedact.checked,
    blockList: sBlock.value.split("\n").map((s) => s.trim()).filter(Boolean),
    allowList: sAllow.value.split("\n").map((s) => s.trim()).filter(Boolean),
    theme: (sTheme.value as Settings["theme"]) || "auto",
  };
  const saved = await saveSettings(next);
  document.body.dataset.theme = saved.theme;
  // Tell background to re-apply Chrome side panel behavior (no-op on Firefox).
  try {
    api.runtime.sendMessage({ type: "cc-rpc", action: "applySidePanelMode" });
  } catch (_e) { /* background may not be ready in side-panel mode boot */ }
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

// Trash --------------------------------------------------------------------

const TRASH_RETENTION_MS = 7 * 86_400_000;

function trashRow(t: TrashedClip): string {
  const previewText =
    t.kind === "image" ? t.preview || "Image" : t.preview || t.content;
  const left = Math.max(
    0,
    Math.ceil((t.deletedAt + TRASH_RETENTION_MS - Date.now()) / 86_400_000),
  );
  const src = [hostFrom(t.source.url), t.source.title]
    .filter(Boolean)
    .join(" · ");
  return `
    <div class="trash-row" data-id="${t.id}">
      <div class="trash-body">
        <div class="trash-preview">${escapeHtml(previewText.slice(0, 90))}</div>
        <div class="trash-meta">${escapeHtml(src || "—")} · deleted ${timeAgo(t.deletedAt)} · ${left}d left</div>
      </div>
      <button class="trash-restore" data-act="restore" title="Restore">Restore</button>
    </div>
  `;
}

async function renderTrash(): Promise<void> {
  const items = await listTrash();
  trashSummary.textContent =
    items.length === 0
      ? "empty"
      : `${items.length} clip${items.length === 1 ? "" : "s"}`;
  trashEmpty.disabled = items.length === 0;
  if (items.length === 0) {
    trashList.innerHTML = "";
    return;
  }
  trashList.innerHTML = items.slice(0, 50).map(trashRow).join("");
}

trashList.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const row = target.closest(".trash-row") as HTMLElement | null;
  if (!row) return;
  const id = row.dataset.id!;
  if (target.dataset.act === "restore") {
    const ok = await restoreClip(id);
    if (ok) toast("Restored");
    await renderTrash();
    await render();
  }
});

trashEmpty.addEventListener("click", async () => {
  const count = await trashCount();
  if (count === 0) return;
  if (!confirm(`Permanently delete ${count} clip${count === 1 ? "" : "s"}? This cannot be undone.`))
    return;
  const n = await emptyTrash();
  toast(`Emptied ${n}`);
  await renderTrash();
});

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

// Quick-filter pills -----------------------------------------------------
quickChipsEl.addEventListener("click", (e) => {
  const chip = (e.target as HTMLElement).closest(".quick-chip") as HTMLElement | null;
  if (!chip) return;
  const op = chip.dataset.op;
  if (!op) return;
  toggleSearchOp(op);
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

  const mouseEvt = e as MouseEvent;
  const wantsSelect =
    mouseEvt.metaKey || mouseEvt.ctrlKey || selectedIds.size > 0;

  // In selection mode (or with cmd/ctrl), clicks toggle selection instead
  // of opening the clip. Action buttons (pin/copy/del) still work directly.
  if (wantsSelect && !act) {
    toggleSelected(id);
    await render();
    return;
  }

  if (act === "del") {
    await trashWithUndo([id]);
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
  } else if (mouseEvt.altKey) {
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
    else if (e.key === "[") {
      e.preventDefault();
      await stepDetail(-1);
    } else if (e.key === "]") {
      e.preventDefault();
      await stepDetail(1);
    }
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
      await trashWithUndo([c.id]);
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
  } else if (e.key === "Escape" && selectedIds.size > 0) {
    clearSelection();
  } else if (e.key.toLowerCase() === "x" && !inSearch) {
    // Toggle selection on the active clip.
    const c = currentClips[activeIndex];
    if (c) {
      toggleSelected(c.id);
      await render();
    }
  }
});

// Detail wiring ---------------------------------------------------------
detailBack.addEventListener("click", () => closeDetail());

detailPrev.addEventListener("click", () => void stepDetail(-1));
detailNext.addEventListener("click", () => void stepDetail(1));

detailDelete.addEventListener("click", async () => {
  if (!detailId) return;
  const idForUndo = detailId;
  closeDetail();
  await trashWithUndo([idForUndo]);
});

detailPin.addEventListener("click", async () => {
  if (!detailId) return;
  const pinned = await togglePin(detailId);
  detailPin.innerHTML = pinned ? icons.pinFilled() : icons.pin();
  await render();
});

detailRedact.addEventListener("click", async () => {
  if (!detailId) return;
  const c = await getClip(detailId);
  if (!c) return;
  if (c.kind === "image") return;
  const action = c.redacted ? "unredactClip" : "redactClip";
  if (action === "redactClip") {
    const confirmMsg =
      "Redact this clip? Emails, phones, cards, and secrets will be masked. You can unmask later — the original is kept locally.";
    if (!confirm(confirmMsg)) return;
  }
  api.runtime.sendMessage(
    { type: "cc-rpc", action, payload: { id: detailId } },
    async (resp: { ok: boolean; restored?: boolean }) => {
      if (!resp?.ok) return toast("Couldn't update clip", "error");
      if (action === "unredactClip" && resp.restored === false) {
        return toast("Original not stored — redaction is permanent", "error");
      }
      const updated = await getClip(detailId!);
      if (updated) {
        if (updated.kind === "image") {
          detailBody.innerHTML = `<img src="${updated.content}" alt="" />`;
        } else {
          detailBody.innerHTML = `<pre>${escapeHtml(updated.content)}</pre>`;
        }
        detailTags.value = updated.tags.join(", ");
        renderRedactButton(updated);
      }
      toast(action === "redactClip" ? "Redacted" : "Restored");
      await render();
    },
  );
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

encryptToggle.addEventListener("change", () => {
  encryptPassRow.hidden = !encryptToggle.checked;
  if (encryptToggle.checked) {
    setTimeout(() => exportPass.focus(), 0);
  } else {
    exportPass.value = "";
  }
});

exportBtn.addEventListener("click", () => {
  const format = (exportFormat.value as ExportFormat) || "json";
  const wantEncrypt = encryptToggle.checked && format === "json";
  const pass = exportPass.value;
  if (wantEncrypt && pass.length < 4) {
    toast("Passphrase must be at least 4 chars", "error");
    exportPass.focus();
    return;
  }
  if (encryptToggle.checked && format !== "json") {
    toast("Encryption is JSON-only; exporting plaintext", "error");
  }
  api.runtime.sendMessage(
    { type: "cc-rpc", action: "export" },
    async (resp: { ok: boolean; data?: { clips?: ClipItem[] } & Record<string, unknown> }) => {
      if (!resp?.ok || !resp.data) return toast("Export failed", "error");
      try {
        let blobText: string;
        let suffix = "";
        let mime = mimeFor(format);
        if (format === "markdown") {
          blobText = toMarkdown(resp.data.clips || []);
        } else if (format === "csv") {
          blobText = toCsv(resp.data.clips || []);
        } else if (wantEncrypt) {
          const env = await encryptJson(resp.data, pass);
          blobText = JSON.stringify(env, null, 2);
          suffix = "-encrypted";
          mime = "application/json";
        } else {
          blobText = JSON.stringify(resp.data, null, 2);
        }
        const blob = new Blob([blobText], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `context-clipboard-${new Date().toISOString().slice(0, 10)}${suffix}.${extFor(format, wantEncrypt)}`;
        a.click();
        URL.revokeObjectURL(url);
        const label =
          format === "markdown"
            ? "Exported Markdown"
            : format === "csv"
              ? "Exported CSV"
              : wantEncrypt
                ? "Exported (encrypted)"
                : "Exported JSON";
        toast(label);
        if (wantEncrypt) exportPass.value = "";
      } catch (e) {
        console.error(e);
        toast(
          e instanceof Error ? e.message : "Export failed",
          "error",
        );
      }
    },
  );
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    let data: unknown = parsed;
    if (isEncryptedEnvelope(parsed)) {
      const pass = prompt(
        "This export is encrypted. Enter the passphrase to restore:",
      );
      if (pass == null) {
        toast("Import cancelled");
        return;
      }
      try {
        data = await decryptJson(parsed as EncryptedEnvelope, pass);
      } catch (e) {
        toast(
          e instanceof Error ? e.message : "Decryption failed",
          "error",
        );
        return;
      }
    }
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

// Bulk select wiring ---------------------------------------------------
function updateBulkBar(): void {
  if (selectedIds.size === 0) {
    bulkBar.hidden = true;
    return;
  }
  bulkBar.hidden = false;
  bulkCount.textContent = `${selectedIds.size} selected`;
}

function toggleSelected(id: string): void {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkBar();
}

function clearSelection(): void {
  if (selectedIds.size === 0) return;
  selectedIds.clear();
  updateBulkBar();
  void render();
}

bulkClear.addEventListener("click", () => clearSelection());

bulkDel.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  selectedIds.clear();
  updateBulkBar();
  await trashWithUndo(ids);
});

bulkPin.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  // Pin everything that isn't pinned; if all already pinned, unpin all.
  const items = await Promise.all(ids.map((id) => getClip(id)));
  const allPinned = items.every((c) => c?.pinned);
  for (const c of items) {
    if (!c) continue;
    if (allPinned ? c.pinned : !c.pinned) await togglePin(c.id);
  }
  toast(allPinned ? "Unpinned" : "Pinned");
  await render();
});

bulkTag.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  const raw = prompt("Add tag(s) to selection (comma-separated):");
  if (!raw) return;
  const newTags = raw.split(",").map((t) => t.trim()).filter(Boolean);
  if (newTags.length === 0) return;
  for (const id of ids) {
    const c = await getClip(id);
    if (!c) continue;
    const merged = Array.from(new Set([...c.tags, ...newTags]));
    await updateTags(id, merged);
  }
  toast(`Tagged ${ids.length}`);
  await render();
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

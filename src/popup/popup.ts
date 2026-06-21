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
  listSavedSearches,
  addSavedSearch,
  removeSavedSearch,
  listSearchHistory,
  pushSearchHistory,
  clearSearchHistory,
  getListSort,
  setListSort,
  mergeDuplicatesByHash,
  findDuplicateGroups,
  mergeDuplicateGroup,
  scrubClipOrigin,
  retroactiveAutoRedact,
  findSimilarClips,
  toggleArchive,
  appendPrivacyAuditEntry,
  listPrivacyAudit,
  clearPrivacyAudit,
  type TrashedClip,
  type DuplicateGroup,
  type PrivacyAuditEntry,
} from "../lib/db";
import type { ClipItem, ClipKind, Settings, SavedSearch, SiteRule, SortMode } from "../lib/types";
import { timeAgo, hostFrom, escapeHtml, highlightHtml, isValidPattern, findCustomPatternHits, redactPii, detectCodeLang } from "../lib/util";
import { icons, clipKindIcon } from "../lib/icons";
import {
  encryptJson,
  decryptJson,
  isEncryptedEnvelope,
  type EncryptedEnvelope,
} from "../lib/crypto";
import { parseQuery, applyQuery, describeQuery } from "../lib/search";
import { sortClips, sortLabel } from "../lib/sort";
import { toMarkdown, toCsv, mimeFor, extFor, applyExportFilter, describeExportFilter, type ExportFormat, type ExportFilter } from "../lib/export";
import { expandTemplate, listTokens, type TemplateContext } from "../lib/templates";
import { rankActions, boldedLabel, type PaletteAction } from "../lib/palette";
import { contextTagsForTab } from "../lib/context-tags";
import { buildSendActions, type SendAction } from "../lib/send-to";

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
const quickCaptureBtn = $<HTMLButtonElement>("quick-capture-btn");
const tagChipsEl = $("tag-chips");
const quickChipsEl = $("quick-chips");
const savedSearchesEl = $("saved-searches");
const searchHistoryEl = $("search-history");
const saveSearchBtn = $<HTMLButtonElement>("save-search-btn");
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
const detailRefetch = $<HTMLButtonElement>("detail-refetch");
const detailReveal = $<HTMLButtonElement>("detail-reveal");
const detailRedact = $<HTMLButtonElement>("detail-redact");
const detailScrub = $<HTMLButtonElement>("detail-scrub");
const detailArchive = $<HTMLButtonElement>("detail-archive");
const detailSend = $<HTMLButtonElement>("detail-send");
const detailSendMenu = $("detail-send-menu");
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
const detailTemplateRow = $("detail-template-row");
const detailTemplateInfo = $("detail-template-info");
const detailExpiry = $<HTMLSelectElement>("detail-expiry");
const detailExpiryHint = $("detail-expiry-hint");
const detailSimilarRow = $("detail-similar-row");
const detailSimilar = $("detail-similar");
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
const retroRedactBtn = $<HTMLButtonElement>("retro-redact-btn");
const sBlurPreviews = $<HTMLInputElement>("s-blur");
const sCompactRows = $<HTMLInputElement>("s-compact");
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
const expPinned = $<HTMLInputElement>("exp-pinned");
const expSkipImages = $<HTMLInputElement>("exp-skip-images");
const expRedactedOnly = $<HTMLInputElement>("exp-redacted-only");
const expTag = $<HTMLInputElement>("exp-tag");
const expAfter = $<HTMLInputElement>("exp-after");
const expBefore = $<HTMLInputElement>("exp-before");
const exportFilterHint = $("export-filter-hint");
const trashSummary = $("trash-summary");
const trashList = $("trash-list");
const trashEmpty = $<HTMLButtonElement>("trash-empty");
const trashPurge24h = $<HTMLButtonElement>("trash-purge-24h");
const auditSummary = $("audit-summary");
const auditList = $("audit-list");
const auditFiltersEl = $("audit-filters");
const auditClearBtn = $<HTMLButtonElement>("audit-clear");
const forgetHostInput = $<HTMLInputElement>("forget-host-input");
const forgetHostBtn = $<HTMLButtonElement>("forget-host-btn");
const siteRulesList = $("site-rules-list");
const siteRulesSummary = $("site-rules-summary");
const ruleHostInput = $<HTMLInputElement>("rule-host");
const ruleTagsInput = $<HTMLInputElement>("rule-tags");
const rulePatternsInput = $<HTMLTextAreaElement>("rule-patterns");
const rulePinInput = $<HTMLInputElement>("rule-pin");
const ruleRedactInput = $<HTMLInputElement>("rule-redact");
const ruleScrubInput = $<HTMLInputElement>("rule-scrub");
const ruleSkipInput = $<HTMLInputElement>("rule-skip");
const ruleAddBtn = $<HTMLButtonElement>("rule-add");
const ruleCancelBtn = $<HTMLButtonElement>("rule-cancel");
const ruleFormTitle = $("rule-form-title");
const ruleTestInput = $<HTMLTextAreaElement>("rule-test-input");
const ruleTestResult = $("rule-test-result");

const bulkBar = $("bulk-bar");
const bulkCount = $("bulk-count");
const bulkSelectAll = $<HTMLButtonElement>("bulk-select-all");
const bulkPin = $<HTMLButtonElement>("bulk-pin");
const bulkTag = $<HTMLButtonElement>("bulk-tag");
const bulkDel = $<HTMLButtonElement>("bulk-del");
const bulkClear = $<HTMLButtonElement>("bulk-clear");
const selectAllFilteredBtn = $<HTMLButtonElement>("select-all-filtered");
const sortModeEl = $<HTMLSelectElement>("sort-mode");

const toastEl = $("toast");
const rowMenuEl = $("row-menu");
const cheatsheetEl = $("cheatsheet");
const cheatsheetClose = $<HTMLButtonElement>("cheatsheet-close");
const paletteEl = $("palette");
const paletteInput = $<HTMLInputElement>("palette-input");
const paletteListEl = $("palette-list");
const dupesPanel = $("dupes-panel");
const dupesBody = $("dupes-body");
const dupesSummary = $("dupes-summary");
const dupesClose = $<HTMLButtonElement>("dupes-close");
const dupesMergeAll = $<HTMLButtonElement>("dupes-merge-all");
const noteComposer = $("note-composer");
const noteText = $<HTMLTextAreaElement>("note-text");
const noteTagsInput = $<HTMLInputElement>("note-tags-input");
const noteTagSuggestions = $("note-tag-suggestions");
const notePinInput = $<HTMLInputElement>("note-pin");
const noteSaveBtn = $<HTMLButtonElement>("note-save");
const noteCancelBtn = $<HTMLButtonElement>("note-cancel");

// State ----------------------------------------------------------------
let currentKind: ClipKind | "all" = "all";
let pinnedOnly = false;
let activeTag: string | null = null;
let currentClips: ClipItem[] = [];
let activeIndex = 0;
let detailId: string | null = null;
let ocrLoading: Promise<unknown> | null = null;
const selectedIds = new Set<string>();
let savedSearches: SavedSearch[] = [];
let searchHistory: string[] = [];
// When non-null, addSiteRuleFromForm() updates the rule with this id
// instead of creating a fresh one. Set by clicking a rule row in the
// settings panel; cleared by save, cancel, or any explicit form reset.
let editingRuleId: string | null = null;
// Active list sort mode (persisted in IDB meta). Defaults to "recent"
// which preserves the historical behavior — `lastSeenAt desc` with
// pinned floated to the top.
let listSort: SortMode = "recent";
// Debounce timer for recording the search box into history. We wait ~900ms
// after the last keystroke before persisting so we don't write a row
// per character.
let historyDebounce: number | null = null;
// The most recent free-text needle from the search box. We pass it into
// renderClip + openDetail so matches get highlighted. Cleared when the
// box empties so the highlight goes away without a re-render.
let currentNeedle = "";

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
function renderClip(c: ClipItem, idx: number, active: boolean, needle?: string): string {
  const thumb =
    c.kind === "image"
      ? `<div class="thumb"><img src="${c.content}" alt="" />${c.width && c.height ? `<span class="thumb-dims">${c.width}×${c.height}</span>` : ""}</div>`
      : `<div class="thumb thumb-icon">${clipKindIcon(c.kind)}${c.template ? `<span class="thumb-badge" title="Template — tokens fill in at copy time">T</span>` : ""}</div>`;
  const src = [hostFrom(c.source.url), c.source.title]
    .filter(Boolean)
    .join(" · ");
  const previewText =
    c.kind === "image" ? c.preview || "Image" : c.preview || c.content;
  const hits = c.hitCount > 1 ? ` · ×${c.hitCount}` : "";
  const expiry =
    !c.pinned && typeof c.expiresAt === "number"
      ? ` · <span class="meta-ttl${c.expiresAt <= Date.now() ? " due" : ""}" title="Expires ${new Date(c.expiresAt).toLocaleString()}">${icons.clock()}${formatRemaining(c.expiresAt)}</span>`
      : "";
  const tags = c.tags
    .slice(0, 4)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");
  const archivedBadge = c.archived
    ? `<span class="archived-badge" title="Archived — hidden from default list">archived</span>`
    : "";
  // Highlight the free-text needle inside the preview slice. For images we
  // never highlight (the "preview" is just a placeholder label like "Image").
  const previewSlice = previewText.slice(0, 140);
  const previewHtml =
    c.kind === "image"
      ? escapeHtml(previewSlice)
      : highlightHtml(previewSlice, needle);
  return `
    <div class="clip ${c.pinned ? "pinned" : ""} ${active ? "active" : ""} ${selectedIds.has(c.id) ? "selected" : ""}${c.archived ? " archived" : ""}" data-id="${c.id}" data-idx="${idx}">
      ${selectedIds.size > 0 ? `<div class="select-mark">${selectedIds.has(c.id) ? icons.check() : ""}</div>` : ""}
      ${thumb}
      <div class="body">
        <div class="preview">${previewHtml}${archivedBadge}</div>
        <div class="meta">
          <span class="src" title="${escapeHtml(c.source.url || "")}">${escapeHtml(src || "—")}</span>
          <span>· ${timeAgo(c.lastSeenAt)}${hits}${expiry}</span>
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

/** Short "5d" / "2h" / "in 3m" / "due" — for the inline meta TTL pill. */
function formatRemaining(deadline: number): string {
  const ms = deadline - Date.now();
  if (ms <= 0) return "due";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
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
  let templates = 0;
  let expiring = 0;
  let archived = 0;
  for (const c of allClips) {
    const h = hostFrom(c.source.url);
    if (h) hostCounts.set(h, (hostCounts.get(h) || 0) + 1);
    if (c.redacted) redacted++;
    if (c.ocrText) ocr++;
    if (c.kind === "image") images++;
    if (c.template) templates++;
    if (typeof c.expiresAt === "number") expiring++;
    if (c.archived) archived++;
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
  if (templates > 0)
    pills.push({
      label: "Templates",
      op: "is:template",
      active: hasOp("is:template"),
      count: templates,
    });
  if (expiring > 0)
    pills.push({
      label: "Expiring",
      op: "is:expiring",
      active: hasOp("is:expiring"),
      count: expiring,
    });
  if (archived > 0)
    pills.push({
      label: "Archived",
      op: "is:archived",
      active: hasOp("is:archived"),
      count: archived,
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

/**
 * Render the saved-searches chip strip. Each chip applies its query when
 * clicked; the right-side × button removes it (no confirm — saved searches
 * are cheap, recreating one is one prompt away).
 *
 * The strip stays hidden when there are zero saved searches so we don't
 * eat vertical space for an empty row.
 */
function renderSavedSearches(): void {
  if (savedSearches.length === 0) {
    savedSearchesEl.hidden = true;
    savedSearchesEl.innerHTML = "";
    return;
  }
  const current = searchEl.value.trim();
  savedSearchesEl.hidden = false;
  savedSearchesEl.innerHTML = savedSearches
    .map(
      (s) =>
        `<span class="saved-search-chip ${s.query === current ? "active" : ""}" data-id="${escapeHtml(s.id)}" title="${escapeHtml(s.query)}">` +
        `<button class="saved-search-apply" data-act="apply" type="button">${escapeHtml(s.name)}</button>` +
        `<button class="saved-search-del" data-act="del" type="button" title="Remove">×</button>` +
        `</span>`,
    )
    .join("");
}

/**
 * Toggle the save-search button: visible only when the search box has a
 * non-trivial query that isn't already saved verbatim. Empty boxes don't
 * need a save affordance; already-saved queries don't either.
 */
function updateSaveSearchButton(): void {
  const q = searchEl.value.trim();
  if (!q) {
    saveSearchBtn.hidden = true;
    return;
  }
  const alreadySaved = savedSearches.some((s) => s.query === q);
  saveSearchBtn.hidden = alreadySaved;
  saveSearchBtn.title = alreadySaved
    ? "Already saved"
    : "Save this search as a chip";
}

async function refreshSavedSearches(): Promise<void> {
  savedSearches = await listSavedSearches();
}

async function refreshSearchHistory(): Promise<void> {
  searchHistory = await listSearchHistory();
}

/**
 * Render the "Recent" ghost-chip strip just under the saved-searches row.
 * We dedupe against saved searches (so a query that's both recent AND
 * saved only shows as the saved chip) and against the current search
 * box value (the user already sees what they're typing). Hidden when
 * nothing useful remains so we don't waste vertical space.
 *
 * Ghost styling — muted, low-contrast border — telegraphs that these
 * are auto-tracked vs the bolder bookmarked chips above.
 */
function renderSearchHistory(): void {
  const current = searchEl.value.trim();
  const savedQueries = new Set(savedSearches.map((s) => s.query));
  const visible = searchHistory.filter(
    (q) => q && q !== current && !savedQueries.has(q),
  );
  if (visible.length === 0) {
    searchHistoryEl.hidden = true;
    searchHistoryEl.innerHTML = "";
    return;
  }
  searchHistoryEl.hidden = false;
  searchHistoryEl.innerHTML =
    `<span class="recent-label">Recent</span>` +
    visible
      .map(
        (q) =>
          `<button class="recent-chip" type="button" data-q="${escapeHtml(q)}" title="${escapeHtml(q)}">${escapeHtml(q.length > 28 ? q.slice(0, 28) + "…" : q)}</button>`,
      )
      .join("") +
    `<button class="recent-clear" type="button" title="Clear recent searches">×</button>`;
}

/**
 * Schedule a write to search history. We debounce ~900ms so typing
 * "github" doesn't store "g", "gi", "git", ... — only the settled value.
 * Caller responsible for canceling pending writes (e.g. on chip apply).
 */
function scheduleHistoryPush(query: string): void {
  if (historyDebounce != null) clearTimeout(historyDebounce);
  const value = query.trim();
  if (!value) return;
  historyDebounce = setTimeout(async () => {
    historyDebounce = null;
    await pushSearchHistory(value);
    await refreshSearchHistory();
    renderSearchHistory();
  }, 900) as unknown as number;
}

async function handleSaveSearch(): Promise<void> {
  const q = searchEl.value.trim();
  if (!q) return;
  // Default name = first meaningful token. We pull it from the parsed
  // query so "kind:image after:24h" → "image", not the raw operator.
  const parsed = parseQuery(q);
  const fallback =
    parsed.freeText.split(/\s+/)[0] ||
    parsed.host ||
    parsed.tags[0] ||
    parsed.kind ||
    "Saved search";
  const name = prompt("Name this search:", fallback.slice(0, 32));
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast("Name required", "error");
    return;
  }
  const entry = await addSavedSearch(trimmed, q);
  if (!entry) {
    toast("Couldn't save", "error");
    return;
  }
  await refreshSavedSearches();
  toast(`Saved "${entry.name}"`);
  await render();
}

async function render(): Promise<void> {
  const all = await listClips({ limit: 1000 });
  renderTagChips(all);
  renderQuickChips(all);
  renderSavedSearches();
  renderSearchHistory();
  updateSaveSearchButton();
  const parsed = parseQuery(searchEl.value);
  // Pull a wide window from IDB then apply parsed filters in-memory. The
  // total clip count is bounded by `maxUnpinned` (default 500) + pinned, so
  // this stays cheap. We keep the legacy free-text filter inside listClips
  // disabled (we own it now) and pass only kind/pinned/tag through, then
  // overlay the parsed operators on top.
  const wide = await listClips({ limit: 5000 });
  const filtered = applyQuery(wide, parsed, {
    extraPinnedOnly: pinnedOnly,
    extraTag: activeTag,
    extraKind: currentKind,
  });
  // Sort happens AFTER the filter so the sort comparator only sees the
  // visible window — much smaller, and stable across renders. The
  // "recent" mode keeps the historical lastSeenAt order; other modes
  // pivot but always float pinned to the top.
  currentClips = sortClips(filtered, listSort).slice(0, 200);
  currentNeedle = parsed.freeText;
  if (activeIndex >= currentClips.length)
    activeIndex = Math.max(0, currentClips.length - 1);
  if (currentClips.length === 0) {
    const hint = searchEl.value.trim()
      ? `<div class="empty">No clips match.<br/><small>Try plain text, or <code>kind:image</code> / <code>host:github.com</code> / <code>tag:code</code> / <code>is:pinned</code> / <code>is:template</code> / <code>is:expiring</code> / <code>is:archived</code> / <code>after:24h</code>.</small></div>`
      : `<div class="empty">No clips yet.<br/>Copy anything, right-click → "Capture", or drop an image here.</div>`;
    listEl.innerHTML = hint;
  } else {
    listEl.innerHTML = currentClips
      .map((c, i) => renderClip(c, i, i === activeIndex, currentNeedle))
      .join("");
  }
  renderCountBreakdown(parsed);
}

/**
 * Compose the footer count line. When a filter is active (search text,
 * kind, pinned-only, active tag), we surface a quick breakdown of the
 * current result set: kind counts, top host, pinned count. That makes
 * the difference between a 7-clip filter result and a 7-clip empty-state
 * obvious without scanning the list.
 *
 * No breakdown when the list is unfiltered — the bare "N clips" stays
 * the cleanest state for the default view.
 */
function renderCountBreakdown(parsed: ReturnType<typeof parseQuery>): void {
  const desc = describeQuery(parsed);
  const total = currentClips.length;
  const countText = `${total} clip${total === 1 ? "" : "s"}`;

  const hasFilter =
    !!desc ||
    pinnedOnly ||
    !!activeTag ||
    currentKind !== "all" ||
    !!searchEl.value.trim();

  if (!hasFilter || total === 0) {
    countEl.textContent = desc ? `${countText} · ${desc}` : countText;
    return;
  }

  // Build a few quick breakdown bits in this priority order:
  //   kind counts → pinned count → top host.
  // We cap at three so the footer line stays scannable.
  const bits: string[] = [];
  const byKind: Record<string, number> = { text: 0, image: 0, link: 0 };
  let pinned = 0;
  const hostCounts = new Map<string, number>();
  for (const c of currentClips) {
    byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    if (c.pinned) pinned++;
    const h = hostFrom(c.source.url);
    if (h) hostCounts.set(h, (hostCounts.get(h) || 0) + 1);
  }
  // Kind counts — only include the ones with nonzero hits AND not already
  // pinned by the filter (e.g. `kind:image` filter → don't echo "12 image").
  if (!parsed.kind && currentKind === "all") {
    if (byKind.text > 0 && byKind.text !== total)
      bits.push(`${byKind.text} text`);
    if (byKind.image > 0 && byKind.image !== total)
      bits.push(`${byKind.image} image${byKind.image === 1 ? "" : "s"}`);
    if (byKind.link > 0 && byKind.link !== total)
      bits.push(`${byKind.link} link${byKind.link === 1 ? "" : "s"}`);
  }
  if (pinned > 0 && pinned !== total && !parsed.pinnedOnly && !pinnedOnly) {
    bits.push(`${pinned} pinned`);
  }
  // Top host — only when it isn't redundant with a host: operator.
  if (!parsed.host && hostCounts.size > 0) {
    const [topHost, n] = [...hostCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n > 1 && n !== total) bits.push(`${n} @${topHost}`);
  }

  const breakdown = bits.slice(0, 3).join(" · ");
  const head = desc ? `${countText} · ${desc}` : countText;
  countEl.textContent = breakdown ? `${head} · ${breakdown}` : head;

  // Surface "Select all (N)" beside the count when a filter is active,
  // there's something to act on, and the user hasn't already started a
  // selection (in which case the bulk bar's own select-all is enough).
  const showSelectAll =
    hasFilter && total > 0 && selectedIds.size === 0;
  selectAllFilteredBtn.hidden = !showSelectAll;
  if (showSelectAll) {
    selectAllFilteredBtn.textContent = `Select all ${total}`;
    selectAllFilteredBtn.title = `Add all ${total} filtered clip${total === 1 ? "" : "s"} to selection (⌘/Ctrl+A)`;
  }
}

// Clipboard helpers -----------------------------------------------------

/**
 * Pull URL/title/host from the currently active tab so templates can
 * expand `{{url}}` / `{{title}}` / `{{host}}` against the page the user
 * is actually looking at when they hit Copy. Falls back to the clip's
 * own source when the popup is opened over chrome:// / extension pages
 * where tabs.query returns nothing useful.
 */
async function gatherTemplateContext(c: ClipItem): Promise<TemplateContext> {
  let url: string | undefined;
  let title: string | undefined;
  try {
    const [tab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
    });
    if (tab?.url && !/^(chrome|about|edge|moz-extension|chrome-extension):/i.test(tab.url)) {
      url = tab.url;
      title = tab.title;
    }
  } catch {
    // tabs API may be unavailable (some browsers / contexts) — ignore
  }
  if (!url) url = c.source.url;
  if (!title) title = c.source.title;
  return { url, title, host: hostFrom(url) || undefined };
}

async function copyToClipboard(c: ClipItem) {
  try {
    if (c.kind === "image") {
      const res = await fetch(c.content);
      const blob = await res.blob();
      const Item = (window as unknown as { ClipboardItem: new (parts: Record<string, Blob>) => unknown }).ClipboardItem;
      const clip = navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> };
      await clip.write([new Item({ [blob.type]: blob })]);
    } else if (c.template || (c.kind === "text" && /\{\{[a-zA-Z]/.test(c.content))) {
      // Expand template against the live active-tab context. We re-check
      // for tokens inline so older clips imported before the `template`
      // flag existed still expand correctly.
      const ctx = await gatherTemplateContext(c);
      const expanded = expandTemplate(c.content, ctx);
      await navigator.clipboard.writeText(expanded);
      const tokens = listTokens(c.content);
      toast(
        tokens.length ? `Copied (filled ${tokens.length} token${tokens.length === 1 ? "" : "s"})` : "Copied",
      );
      return;
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
    const lang = detectCodeLang(c.content) ?? "";
    md = "```" + lang + "\n" + c.content + "\n```";
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
  // Always end any prior reveal before swapping clips. Otherwise the timer
  // would clobber the new clip's body when it fires.
  if (detailId && detailId !== id) endRevealOnce();
  detailId = c.id;
  if (c.kind === "image") {
    detailBody.innerHTML = `<img src="${c.content}" alt="" />`;
    detailOcr.hidden = false;
    // Re-fetch is only meaningful when we have an http(s) source to
    // pull from. `nearbyText` is where context-menu image captures
    // stash the original srcUrl; copy-event captures drop the src
    // there too. Falls back to the page URL when neither carries an
    // http URL.
    const srcGuess = c.source.nearbyText || c.source.url || "";
    detailRefetch.hidden = !/^https?:\/\//i.test(srcGuess);
  } else {
    detailBody.innerHTML = `<pre>${highlightHtml(c.content, currentNeedle)}</pre>`;
    detailOcr.hidden = true;
    detailRefetch.hidden = true;
  }
  detailUrl.href = c.source.url || "#";
  detailUrl.textContent = c.source.url || "—";
  detailTime.textContent = new Date(c.createdAt).toLocaleString();
  detailHits.textContent = String(c.hitCount);
  detailTags.value = c.tags.join(", ");
  if (c.source.nearbyText) {
    detailNearbyRow.hidden = false;
    // Long nearby context (paragraphs around a copy) used to push the
    // rest of the meta row off-screen. We now render the first ~360
    // chars collapsed by default with a "Show more" toggle; the full
    // text lives in `data-full` so the toggle is a pure DOM swap, no
    // re-fetch. Threshold tuned so single-sentence quotes never get
    // collapsed (they fit comfortably in one line).
    const COLLAPSE_AT = 360;
    const full = c.source.nearbyText;
    if (full.length <= COLLAPSE_AT) {
      detailNearby.textContent = full;
      detailNearby.classList.remove("collapsible", "expanded");
      detailNearby.removeAttribute("data-full");
    } else {
      const peek = full.slice(0, COLLAPSE_AT).replace(/\s+\S*$/, "").trimEnd();
      detailNearby.dataset.full = full;
      detailNearby.classList.add("collapsible");
      detailNearby.classList.remove("expanded");
      detailNearby.innerHTML =
        `<span class="nearby-text">${escapeHtml(peek)}…</span> ` +
        `<button class="nearby-toggle" type="button" data-act="expand">Show more (+${full.length - peek.length})</button>`;
    }
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
  // Template tokens — show a preview of how the clip will expand when
  // copied. Re-runs the expander against current tab context so the
  // user sees the *real* substitutions, not just the token names.
  if (c.kind === "text" && (c.template || /\{\{[a-zA-Z]/.test(c.content))) {
    const tokens = listTokens(c.content);
    if (tokens.length > 0) {
      const ctx = await gatherTemplateContext(c);
      const expanded = expandTemplate(c.content, ctx);
      const sample = expanded.length > 160 ? `${expanded.slice(0, 160).trim()}…` : expanded;
      detailTemplateRow.hidden = false;
      detailTemplateInfo.innerHTML =
        `<div class="template-tokens">${tokens
          .map((t) => `<code>{{${escapeHtml(t)}}}</code>`)
          .join("")}</div>` +
        `<div class="template-preview" title="Preview of what gets copied (live tab context)">${escapeHtml(sample)}</div>`;
    } else {
      detailTemplateRow.hidden = true;
    }
  } else {
    detailTemplateRow.hidden = true;
  }
  renderExpiryRow(c);
  detailPin.innerHTML = c.pinned ? icons.pinFilled() : icons.pin();
  renderRedactButton(c);
  renderArchiveButton(c);
  updateDetailNav();
  detailEl.hidden = false;
  // Similar clips lookup is async + cheap. We render the row separately
  // so the rest of the detail panel paints immediately and the sidekick
  // list slots in once IDB returns.
  void renderSimilarClips(c);
}

/**
 * Populate the "Similar" sidekick list for the open clip. We compute
 * the reason text per row (host match wins over tag overlap because
 * it's the higher-signal axis) so the user knows WHY this clip is
 * being suggested. Hidden when nothing similar surfaces — no empty-
 * state row, just a clean detail panel.
 *
 * Refreshes are debounced implicitly by openDetail: each call cancels
 * the previous one's effects by re-rendering against the new pivot.
 * Safe to invoke from openDetail() unconditionally.
 */
async function renderSimilarClips(pivot: ClipItem): Promise<void> {
  const pivotId = pivot.id;
  try {
    const matches = await findSimilarClips(pivotId, { limit: 5 });
    // Guard: if the user navigated away mid-flight, drop this paint.
    if (detailId !== pivotId) return;
    if (matches.length === 0) {
      detailSimilarRow.hidden = true;
      detailSimilar.innerHTML = "";
      return;
    }
    const pivotHost = hostFrom(pivot.source.url);
    const pivotTagSet = new Set(
      (pivot.tags || []).map((t) => t.toLowerCase()),
    );
    detailSimilarRow.hidden = false;
    detailSimilar.innerHTML = matches
      .map((c) => {
        const previewText =
          c.kind === "image" ? c.preview || "Image" : c.preview || c.content;
        const previewSlice = previewText.slice(0, 80).replace(/\s+/g, " ");
        const hostMatch = !!pivotHost && hostFrom(c.source.url) === pivotHost;
        let sharedTags = 0;
        for (const t of c.tags || []) {
          if (pivotTagSet.has(t.toLowerCase())) sharedTags++;
        }
        const reason = hostMatch
          ? `@${pivotHost}`
          : sharedTags > 0
            ? `#${sharedTags} shared`
            : "related";
        return (
          `<button type="button" class="similar-row${c.pinned ? " pinned" : ""}" data-id="${escapeHtml(c.id)}" title="${escapeHtml(previewText.slice(0, 200))}">` +
          `<span class="similar-kind">${clipKindIcon(c.kind)}</span>` +
          `<span class="similar-preview">${escapeHtml(previewSlice)}</span>` +
          `<span class="similar-reason">${escapeHtml(reason)}</span>` +
          `</button>`
        );
      })
      .join("");
  } catch (e) {
    console.debug("[context-clipboard] similar-clips render failed", e);
    detailSimilarRow.hidden = true;
  }
}

/**
 * Format the "Expires" row based on the clip's current `expiresAt`.
 * The dropdown values are durations from *now*, so we don't try to
 * "select" the original value — Never is the sticky baseline. The hint
 * shows the current state ("Expires in 5d 2h" / "Expired — will GC at
 * next capture" / "Pinned · TTL ignored").
 */
function renderExpiryRow(c: ClipItem): void {
  detailExpiry.value = "";
  if (c.pinned && c.expiresAt) {
    detailExpiryHint.textContent = "Pinned · TTL ignored until unpinned";
    detailExpiryHint.className = "expiry-hint warn";
    return;
  }
  if (typeof c.expiresAt !== "number") {
    detailExpiryHint.textContent = "No TTL — keeps until the unpinned cap evicts it";
    detailExpiryHint.className = "expiry-hint";
    return;
  }
  const remaining = c.expiresAt - Date.now();
  if (remaining <= 0) {
    detailExpiryHint.textContent = "Expired — will GC at next capture";
    detailExpiryHint.className = "expiry-hint warn";
  } else {
    detailExpiryHint.textContent = `Expires in ${formatDuration(remaining)} (at ${new Date(c.expiresAt).toLocaleString()})`;
    detailExpiryHint.className = "expiry-hint";
  }
}

/** Human-friendly "5d 3h" / "47m" — caps at the two biggest units. */
function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
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
    detailReveal.hidden = true;
    return;
  }
  detailRedact.hidden = false;
  if (c.redacted) {
    detailRedact.innerHTML = icons.shieldOff();
    if (c.originalContent != null) {
      detailRedact.title = "Unmask permanently — restore original content";
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
  // Reveal-once is only meaningful when the clip is redacted AND we still
  // have the original. Auto-redacted-on-capture clips never get the
  // affordance because there's nothing to reveal.
  if (c.redacted && c.originalContent != null) {
    detailReveal.hidden = false;
    detailReveal.title = "Show original for 10s, then snap back";
  } else {
    detailReveal.hidden = true;
  }
}

/**
 * Update the detail-view archive button glyph + title from the open
 * clip's state. Archived clips show the inbox glyph (unarchive ≈ pull
 * back into the daily list); fresh clips show the archive box.
 */
function renderArchiveButton(c: ClipItem) {
  if (c.archived) {
    detailArchive.innerHTML = icons.inbox();
    detailArchive.title = "Unarchive — show in the default list again";
    detailArchive.classList.add("active");
  } else {
    detailArchive.innerHTML = icons.archive();
    detailArchive.title = "Archive — hide from default list, keep in IDB";
    detailArchive.classList.remove("active");
  }
}

function closeDetail() {
  endRevealOnce();
  // Defensive: if the send-to dropdown is open and the user navigates
  // away via Back / Esc, drop the menu so it doesn't linger as a
  // ghost overlay over the main list.
  if (!detailSendMenu.hidden) closeSendMenu();
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
  sBlurPreviews.checked = !!s.blurPreviews;
  sCompactRows.checked = !!s.compactRows;
  sBlock.value = (s.blockList || []).join("\n");
  sAllow.value = (s.allowList || []).join("\n");
  sTheme.value = s.theme;
  await renderStorage();
  await renderTrash();
  await renderSiteRules();
  await renderAudit();
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
    blurPreviews: sBlurPreviews.checked,
    compactRows: sCompactRows.checked,
    blockList: sBlock.value.split("\n").map((s) => s.trim()).filter(Boolean),
    allowList: sAllow.value.split("\n").map((s) => s.trim()).filter(Boolean),
    theme: (sTheme.value as Settings["theme"]) || "auto",
  };
  const saved = await saveSettings(next);
  document.body.dataset.theme = saved.theme;
  applyBlurMode(saved.blurPreviews);
  applyCompactRows(saved.compactRows);
  // Tell background to re-apply Chrome side panel behavior (no-op on Firefox).
  try {
    api.runtime.sendMessage({ type: "cc-rpc", action: "applySidePanelMode" });
  } catch (_e) { /* background may not be ready in side-panel mode boot */ }
}

/**
 * Toggle the body-level blur class. Pulled into a single helper so the
 * setting save path, the initial-load path, and the palette quick-toggle
 * all flip the same bit. Pure DOM — no IDB write.
 */
function applyBlurMode(on: boolean): void {
  document.body.classList.toggle("blur-on", !!on);
}

/**
 * Compact-row mode: shrink each clip row to ~36px so the popup fits 30+
 * clips per screen. Pure DOM — no IDB write here, just the body class.
 * `compactRows` setting drives this; quick-toggle from the palette flips
 * the same bit.
 */
function applyCompactRows(on: boolean): void {
  document.body.classList.toggle("compact-rows", !!on);
}

async function renderStorage() {
  try {
    const est = await navigator.storage?.estimate?.();
    const used = est?.usage || 0;
    const quota = est?.quota || 0;
    // Walk the clip set ourselves to attribute bytes to text / image / link
    // / OCR / trash. `bytes` is set at capture time and tracks both the
    // body and a tiny envelope estimate — close enough for a UX bar that
    // tells the user where their storage actually went. We don't try to
    // round-trip against navigator.storage.estimate (that's quota+meta+
    // tombstones, not just clips).
    const [clips, trash] = await Promise.all([
      listClips({ limit: 1_000_000 }),
      listTrash(),
    ]);
    let textBytes = 0;
    let imageBytes = 0;
    let linkBytes = 0;
    let ocrBytes = 0;
    for (const c of clips) {
      if (c.kind === "image") imageBytes += c.bytes || 0;
      else if (c.kind === "link") linkBytes += c.bytes || 0;
      else textBytes += c.bytes || 0;
      if (c.ocrText) ocrBytes += c.ocrText.length;
    }
    let trashBytes = 0;
    for (const t of trash) trashBytes += t.bytes || 0;
    const clipsTotal = textBytes + imageBytes + linkBytes + ocrBytes;
    // The denominator for the segment bar is the clip+trash subtotal (so
    // bars always sum to 100%); the bottom line still shows quota usage
    // for context.
    const segTotal = clipsTotal + trashBytes;

    type Seg = { label: string; bytes: number; tone: string };
    const segs: Seg[] = [
      { label: "Text", bytes: textBytes, tone: "text" },
      { label: "Images", bytes: imageBytes, tone: "image" },
      { label: "Links", bytes: linkBytes, tone: "link" },
      { label: "OCR", bytes: ocrBytes, tone: "ocr" },
      { label: "Trash", bytes: trashBytes, tone: "trash" },
    ].filter((s) => s.bytes > 0);

    const segBar = segTotal > 0
      ? segs
          .map(
            (s) =>
              `<span class="storage-seg seg-${s.tone}" style="flex:${s.bytes};" title="${escapeHtml(s.label)}: ${formatBytes(s.bytes)} (${Math.round((s.bytes / segTotal) * 100)}%)"></span>`,
          )
          .join("")
      : `<span class="storage-seg seg-empty" style="flex:1;"></span>`;

    const legend = segs.length
      ? segs
          .map(
            (s) =>
              `<span class="storage-legend"><span class="legend-dot dot-${s.tone}"></span>${escapeHtml(s.label)} <em>${formatBytes(s.bytes)}</em></span>`,
          )
          .join("")
      : `<span class="storage-legend muted">No clips yet</span>`;

    const quotaLine = quota
      ? `<strong>Storage:</strong> ${formatBytes(used)} of ${formatBytes(quota)} (${Math.round((used / quota) * 100)}%)`
      : `<strong>Storage:</strong> ${formatBytes(used)}`;

    storageInfo.innerHTML = `
      ${quotaLine}
      <div class="storage-segbar" role="img" aria-label="Storage breakdown by clip kind">${segBar}</div>
      <div class="storage-legends">${legend}</div>
      <div class="storage-foot">Clips ${formatBytes(clipsTotal)} · Trash ${formatBytes(trashBytes)} · ${clips.length} live · ${trash.length} trashed</div>
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

// Privacy audit -----------------------------------------------------------
//
// Renders the meta-store audit ring into the Settings panel. Read-only;
// the "Clear" button is the only mutation and lives next to the title.
// Hidden when empty so the section doesn't shout at users who haven't
// taken any privacy actions yet.

/** Short human label for each audit kind. Matches the action verbs the
 *  user sees in toasts / confirms so the log reads as a diary. */
function auditKindLabel(k: PrivacyAuditEntry["kind"]): string {
  switch (k) {
    case "redact": return "Redacted";
    case "unredact": return "Unredacted";
    case "scrub-origin": return "Scrubbed origin";
    case "retro-redact": return "Retroactive redact";
    case "forget-host": return "Forgot host";
    case "set-ttl": return "Set TTL";
    case "clear-ttl": return "Cleared TTL";
    case "archive": return "Archived";
    case "unarchive": return "Unarchived";
    case "trash": return "Trashed";
    case "restore": return "Restored";
  }
}

// Audit-log filter chips. The raw log can fill up fast on an active
// device — flipping on a category narrows the visible rows to "what
// did I redact this week?" without trashing entries. Persisted only
// in module state (intentional — chip state is a glance, not a
// preference). `all` is the default whenever the audit section
// re-opens.
type AuditFilter =
  | "all"
  | "redact"        // redact + unredact + retro-redact
  | "scrub"         // scrub-origin
  | "lifecycle"     // trash + restore + archive + unarchive
  | "host"          // forget-host
  | "ttl";          // set-ttl + clear-ttl

let auditFilter: AuditFilter = "all";

function auditKindBucket(k: PrivacyAuditEntry["kind"]): Exclude<AuditFilter, "all"> {
  switch (k) {
    case "redact":
    case "unredact":
    case "retro-redact":
      return "redact";
    case "scrub-origin":
      return "scrub";
    case "trash":
    case "restore":
    case "archive":
    case "unarchive":
      return "lifecycle";
    case "forget-host":
      return "host";
    case "set-ttl":
    case "clear-ttl":
      return "ttl";
  }
}

interface AuditChipDef {
  id: AuditFilter;
  label: string;
}

const AUDIT_CHIP_DEFS: AuditChipDef[] = [
  { id: "all", label: "All" },
  { id: "redact", label: "Redact" },
  { id: "scrub", label: "Scrub" },
  { id: "lifecycle", label: "Lifecycle" },
  { id: "host", label: "Host" },
  { id: "ttl", label: "TTL" },
];

async function renderAudit(): Promise<void> {
  const entries = await listPrivacyAudit();
  if (entries.length === 0) {
    auditSummary.textContent = "no actions yet";
    auditFiltersEl.hidden = true;
    auditFiltersEl.innerHTML = "";
    auditList.innerHTML = `<div class="audit-empty">When you redact, scrub, forget a host, or archive a clip, the action shows up here.</div>`;
    return;
  }
  // Bucket counts so chips can show the right N inline — and so we can
  // hide chips that would match zero rows (no point offering a "TTL"
  // pill if the user has never set one).
  const counts: Record<Exclude<AuditFilter, "all">, number> = {
    redact: 0,
    scrub: 0,
    lifecycle: 0,
    host: 0,
    ttl: 0,
  };
  for (const e of entries) counts[auditKindBucket(e.kind)]++;
  // If the currently-active filter has zero rows (because the user
  // cleared the only matching entry, or the ring rotated past it),
  // snap back to `all` so the panel never looks empty for no reason.
  if (auditFilter !== "all" && counts[auditFilter] === 0) auditFilter = "all";

  const visibleChips = AUDIT_CHIP_DEFS.filter(
    (c) => c.id === "all" || counts[c.id as Exclude<AuditFilter, "all">] > 0,
  );
  auditFiltersEl.hidden = false;
  auditFiltersEl.innerHTML = visibleChips
    .map((c) => {
      const n = c.id === "all" ? entries.length : counts[c.id as Exclude<AuditFilter, "all">];
      const active = c.id === auditFilter ? " active" : "";
      return (
        `<button type="button" class="audit-chip${active}" data-filter="${escapeHtml(c.id)}" title="${escapeHtml(c.label)} (${n})">` +
        `<span>${escapeHtml(c.label)}</span><em>${n}</em></button>`
      );
    })
    .join("");

  const filtered =
    auditFilter === "all"
      ? entries
      : entries.filter((e) => auditKindBucket(e.kind) === auditFilter);
  auditSummary.textContent =
    auditFilter === "all"
      ? `${entries.length} action${entries.length === 1 ? "" : "s"}`
      : `${filtered.length} of ${entries.length}`;
  if (filtered.length === 0) {
    auditList.innerHTML = `<div class="audit-empty">No ${escapeHtml(auditFilter)} actions in the last 30.</div>`;
    return;
  }
  auditList.innerHTML = filtered
    .map((e) => {
      const subjectBits: string[] = [];
      if (e.host) subjectBits.push(`@${e.host}`);
      if (e.detail) subjectBits.push(e.detail);
      const subject = subjectBits.join(" · ");
      return (
        `<div class="audit-row audit-${e.kind}">` +
        `<span class="audit-kind">${escapeHtml(auditKindLabel(e.kind))}</span>` +
        `<span class="audit-subject" title="${escapeHtml(subject)}">${escapeHtml(subject || "—")}</span>` +
        `<span class="audit-time" title="${escapeHtml(new Date(e.at).toLocaleString())}">${escapeHtml(timeAgo(e.at))}</span>` +
        `</div>`
      );
    })
    .join("");
}

auditFiltersEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".audit-chip") as HTMLButtonElement | null;
  if (!btn) return;
  const id = (btn.dataset.filter || "all") as AuditFilter;
  if (!AUDIT_CHIP_DEFS.some((c) => c.id === id)) return;
  // Toggle: clicking the active filter snaps back to "all" so the
  // chip behaves like a single-select with an obvious reset path.
  auditFilter = auditFilter === id && id !== "all" ? "all" : id;
  void renderAudit();
});

auditClearBtn.addEventListener("click", async () => {
  if (!confirm("Clear the privacy audit log? This only wipes the log — your clips and settings stay untouched.")) return;
  await clearPrivacyAudit();
  await renderAudit();
  toast("Audit log cleared");
});

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
  // Only enable the 24h-purge button when there's at least one trash
  // entry old enough to qualify — otherwise the button is a no-op trap.
  const cutoff = Date.now() - 86_400_000;
  const oldEnough = items.filter((t) => t.deletedAt < cutoff).length;
  trashPurge24h.disabled = oldEnough === 0;
  trashPurge24h.textContent =
    oldEnough > 0 ? `Purge >24h (${oldEnough})` : "Purge >24h";
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

/**
 * Hard-delete only the trash entries older than 24 hours, leaving
 * yesterday's deletes restorable. Useful when you want to free up
 * storage without losing the safety net for things you just deleted
 * (the standard "Empty" wipes the whole trash). Pre-counts so the
 * confirm message names a real number; refuses politely when there's
 * nothing to purge.
 */
async function purgeTrashOlderThan24h(): Promise<void> {
  const items = await listTrash();
  const cutoff = Date.now() - 86_400_000;
  const oldEnough = items.filter((t) => t.deletedAt < cutoff);
  if (oldEnough.length === 0) {
    toast("Nothing older than 24h in trash");
    return;
  }
  const msg =
    `Permanently delete ${oldEnough.length} trashed clip${oldEnough.length === 1 ? "" : "s"} older than 24h? ` +
    `Newer trash stays restorable.`;
  if (!confirm(msg)) return;
  const resp = await new Promise<{ ok: boolean; purged?: number }>(
    (resolve) => {
      api.runtime.sendMessage(
        {
          type: "cc-rpc",
          action: "purgeTrashOlderThan",
          payload: { maxAgeMs: 86_400_000 },
        },
        (r) => resolve(r),
      );
    },
  );
  if (!resp?.ok) {
    toast("Purge failed", "error");
    return;
  }
  toast(
    `Purged ${resp.purged ?? oldEnough.length} trashed clip${(resp.purged ?? oldEnough.length) === 1 ? "" : "s"}`,
  );
  await renderTrash();
}

trashPurge24h.addEventListener("click", () => void purgeTrashOlderThan24h());

async function runForgetHost(): Promise<void> {
  const raw = forgetHostInput.value.trim().toLowerCase().replace(/^www\./, "");
  if (!raw) {
    toast("Type a hostname first", "error");
    forgetHostInput.focus();
    return;
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) {
    toast("Doesn't look like a hostname", "error");
    return;
  }
  // Look up how many clips actually match before we touch anything, so the
  // confirm message is concrete instead of a guess.
  const wide = await listClips({ limit: 1_000_000 });
  const matches = wide.filter((c) => hostFrom(c.source.url) === raw);
  if (matches.length === 0) {
    toast(`No clips from ${raw}`, "error");
    return;
  }
  const pinned = matches.filter((c) => c.pinned).length;
  const willTrash = matches.length - pinned;
  const summary =
    pinned > 0
      ? `Forget ${willTrash} clip${willTrash === 1 ? "" : "s"} from ${raw}? (${pinned} pinned will be skipped.)`
      : `Forget ${willTrash} clip${willTrash === 1 ? "" : "s"} from ${raw}?`;
  if (!confirm(summary)) return;
  const resp = await new Promise<{ ok: boolean; trashed?: number; pinnedSkipped?: number }>(
    (resolve) => {
      api.runtime.sendMessage(
        { type: "cc-rpc", action: "forgetHost", payload: { host: raw } },
        (r) => resolve(r),
      );
    },
  );
  if (!resp?.ok) {
    toast("Forget failed", "error");
    return;
  }
  forgetHostInput.value = "";
  const trashed = resp.trashed ?? 0;
  const skipped = resp.pinnedSkipped ?? 0;
  if (trashed > 0) {
    void appendPrivacyAuditEntry({
      kind: "forget-host",
      clipId: "",
      host: raw,
      detail: `${trashed} clip${trashed === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} pinned kept` : ""}`,
    });
  }
  const msg =
    skipped > 0
      ? `Forgot ${trashed} from ${raw} (${skipped} pinned kept)`
      : `Forgot ${trashed} from ${raw}`;
  toast(msg);
  await renderTrash();
  await render();
}

forgetHostBtn.addEventListener("click", () => void runForgetHost());
forgetHostInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    void runForgetHost();
  }
});

// Per-site rules -------------------------------------------------------
//
// Rules live in IDB meta; UI is fully driven by the background RPC list so
// the popup doesn't import the db helper twice. We re-render after every
// add/remove because the list stays small enough that diffing is overkill.

interface SiteRuleResponse { ok: boolean; rules?: SiteRule[]; rule?: SiteRule; error?: string }

async function rpcSiteRules<T = SiteRuleResponse>(
  action: "listSiteRules" | "upsertSiteRule" | "removeSiteRule",
  payload?: unknown,
): Promise<T> {
  return new Promise((resolve) => {
    api.runtime.sendMessage(
      { type: "cc-rpc", action, payload },
      (resp: T) => resolve(resp),
    );
  });
}

function ruleBadges(r: SiteRule): string {
  const bits: string[] = [];
  if (r.skipCapture) bits.push(`<span class="rule-badge danger-tone">skip</span>`);
  if (r.autoPin) bits.push(`<span class="rule-badge">pin</span>`);
  if (r.autoRedact) bits.push(`<span class="rule-badge">redact</span>`);
  if (r.autoScrubOrigin) bits.push(`<span class="rule-badge">scrub</span>`);
  const npatterns = r.customPatterns?.length || 0;
  if (npatterns > 0) {
    bits.push(
      `<span class="rule-badge" title="${npatterns} custom redaction pattern${npatterns === 1 ? "" : "s"}: ${escapeHtml(r.customPatterns!.join(" · "))}">regex ×${npatterns}</span>`,
    );
  }
  for (const t of r.autoTags ?? []) {
    bits.push(`<span class="rule-badge tag-tone">#${escapeHtml(t)}</span>`);
  }
  return bits.length ? bits.join("") : `<span class="rule-badge muted">(no effect)</span>`;
}

async function renderSiteRules(): Promise<void> {
  const resp = await rpcSiteRules("listSiteRules");
  const rules = resp.rules ?? [];
  siteRulesSummary.textContent =
    rules.length === 0 ? "none" : `${rules.length} rule${rules.length === 1 ? "" : "s"}`;
  if (rules.length === 0) {
    siteRulesList.innerHTML = "";
    return;
  }
  siteRulesList.innerHTML = rules
    .map(
      (r) =>
        `<div class="site-rule-row${editingRuleId === r.id ? " editing" : ""}" data-id="${escapeHtml(r.id)}" title="Click to edit">
          <div class="site-rule-host" title="${escapeHtml(r.hostPattern)}">${escapeHtml(r.hostPattern)}</div>
          <div class="site-rule-badges">${ruleBadges(r)}</div>
          <button class="site-rule-del" data-act="del" title="Remove rule">×</button>
        </div>`,
    )
    .join("");
}

/**
 * Snap the site-rule form into edit mode for `rule` — pre-fill every
 * input from its current state, mark the matching row, swap the
 * submit button label to "Update" + reveal the Cancel pill. Calling
 * with the same id twice (or hitting Cancel) clears edit mode and
 * blanks the form back out so the user can add a fresh rule.
 */
function loadRuleIntoForm(rule: SiteRule): void {
  editingRuleId = rule.id;
  ruleHostInput.value = rule.hostPattern;
  ruleTagsInput.value = (rule.autoTags || []).join(", ");
  rulePatternsInput.value = (rule.customPatterns || []).join("\n");
  rulePinInput.checked = !!rule.autoPin;
  ruleRedactInput.checked = !!rule.autoRedact;
  ruleScrubInput.checked = !!rule.autoScrubOrigin;
  ruleSkipInput.checked = !!rule.skipCapture;
  ruleAddBtn.textContent = "Update rule";
  ruleCancelBtn.hidden = false;
  ruleFormTitle.textContent = `Editing ${rule.hostPattern}`;
  ruleAddBtn.closest(".site-rule-form")?.classList.add("editing");
  // Slide the form into view + put focus on the host field so the
  // user can tweak it immediately. Bounded scroll — the parent panel
  // is already visible; we're just nudging within it.
  ruleHostInput.focus();
  ruleHostInput.select();
  renderRuleTest();
}

function resetRuleForm(): void {
  editingRuleId = null;
  ruleHostInput.value = "";
  ruleTagsInput.value = "";
  rulePatternsInput.value = "";
  rulePinInput.checked = false;
  ruleRedactInput.checked = false;
  ruleScrubInput.checked = false;
  ruleSkipInput.checked = false;
  ruleAddBtn.textContent = "Add rule";
  ruleCancelBtn.hidden = true;
  ruleFormTitle.textContent = "Add a rule";
  ruleAddBtn.closest(".site-rule-form")?.classList.remove("editing");
  renderRuleTest();
}

async function addSiteRuleFromForm(): Promise<void> {
  const host = ruleHostInput.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) {
    toast("Host required", "error");
    ruleHostInput.focus();
    return;
  }
  const validHost = /^(\*\.)?[a-z0-9.-]+\.[a-z]{2,}$/i.test(host);
  if (!validHost) {
    toast("Use host or *.example.com", "error");
    return;
  }
  const tags = ruleTagsInput.value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const skip = ruleSkipInput.checked;
  const pin = rulePinInput.checked;
  const redact = ruleRedactInput.checked;
  const scrub = ruleScrubInput.checked;
  // Custom redaction patterns: one per line. We validate per-line so we
  // can tell the user *which* line is wrong instead of silently dropping it.
  const rawPatterns = rulePatternsInput.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const patterns: string[] = [];
  const bad: number[] = [];
  rawPatterns.forEach((p, i) => {
    if (isValidPattern(p)) patterns.push(p);
    else bad.push(i + 1);
  });
  if (bad.length > 0) {
    toast(
      `Invalid regex on line${bad.length === 1 ? "" : "s"} ${bad.join(", ")}`,
      "error",
    );
    rulePatternsInput.focus();
    return;
  }
  // A rule with zero behavior is just visual noise.
  if (!skip && !pin && !redact && !scrub && tags.length === 0 && patterns.length === 0) {
    toast("Pick at least one effect", "error");
    return;
  }
  const resp = await rpcSiteRules("upsertSiteRule", {
    id: editingRuleId ?? undefined,
    hostPattern: host,
    autoTags: tags,
    autoPin: pin,
    autoRedact: redact,
    skipCapture: skip,
    autoScrubOrigin: scrub,
    customPatterns: patterns.length ? patterns : undefined,
  });
  if (!resp.ok) {
    toast(resp.error || "Couldn't save rule", "error");
    return;
  }
  const wasEdit = editingRuleId != null;
  resetRuleForm();
  const detail = patterns.length
    ? ` (${patterns.length} pattern${patterns.length === 1 ? "" : "s"})`
    : "";
  toast(`${wasEdit ? "Rule updated" : "Rule saved"} for ${host}${detail}`);
  await renderSiteRules();
}

ruleAddBtn.addEventListener("click", () => void addSiteRuleFromForm());
ruleHostInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    void addSiteRuleFromForm();
  }
});
ruleCancelBtn.addEventListener("click", async () => {
  resetRuleForm();
  await renderSiteRules();
});

/**
 * Render the live-test panel for the custom redaction patterns
 * textarea: take whatever's in the test input, run the current
 * patterns over it, and paint each match wrapped in a red span so
 * the user can SEE which characters will be redacted before saving
 * the rule. Empty input shows hint text; zero matches shows zero;
 * invalid patterns get counted in the footer line.
 *
 * Re-runs on every keystroke in either textarea. Synchronous and
 * cheap (caps + safety limits inside findCustomPatternHits).
 */
function renderRuleTest(): void {
  const sample = ruleTestInput.value;
  const patterns = rulePatternsInput.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sample.trim()) {
    ruleTestResult.innerHTML =
      `<span class="empty-state">Paste sample text above to see what would be redacted.</span>`;
    return;
  }
  if (patterns.length === 0) {
    ruleTestResult.innerHTML =
      `<span class="empty-state">Add a regex above (one per line) to start testing.</span>`;
    return;
  }
  const { hits, invalid, matchedPatterns } = findCustomPatternHits(sample, patterns);
  if (hits.length === 0) {
    const note =
      invalid > 0
        ? ` <span class="empty-state">(${invalid} invalid pattern${invalid === 1 ? "" : "s"} skipped)</span>`
        : "";
    ruleTestResult.innerHTML = `<span class="empty-state">No matches.</span>${note}`;
    return;
  }
  // Build the highlighted output by walking the sample and emitting
  // escaped text + spans alternately. Hits are sorted + non-overlapping
  // by `findCustomPatternHits` so this single pass is sound.
  const pieces: string[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor) pieces.push(escapeHtml(sample.slice(cursor, h.start)));
    pieces.push(
      `<span class="red" title="matched: ${escapeHtml(h.pattern)}">${escapeHtml(sample.slice(h.start, h.end))}</span>`,
    );
    cursor = h.end;
  }
  if (cursor < sample.length) pieces.push(escapeHtml(sample.slice(cursor)));
  const summary = `<span class="empty-state">${hits.length} match${hits.length === 1 ? "" : "es"} across ${matchedPatterns} pattern${matchedPatterns === 1 ? "" : "s"}${invalid > 0 ? ` · ${invalid} invalid skipped` : ""}</span>\n`;
  ruleTestResult.innerHTML = summary + pieces.join("");
}

rulePatternsInput.addEventListener("input", () => renderRuleTest());
ruleTestInput.addEventListener("input", () => renderRuleTest());

siteRulesList.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const row = target.closest(".site-rule-row") as HTMLElement | null;
  if (!row) return;
  const id = row.dataset.id!;
  if (target.dataset.act === "del") {
    e.stopPropagation();
    await rpcSiteRules("removeSiteRule", { id });
    // If the deleted rule was the one being edited, the form is now
    // orphaned — flip back to add mode so the user doesn't accidentally
    // recreate a no-longer-relevant rule.
    if (editingRuleId === id) resetRuleForm();
    await renderSiteRules();
    return;
  }
  // Row click (anywhere outside the × button): load this rule back
  // into the form for editing. Clicking the same row toggles edit
  // off so it acts like a quick \"never mind\".
  const resp = await rpcSiteRules("listSiteRules");
  const rule = (resp.rules ?? []).find((r) => r.id === id);
  if (!rule) return;
  if (editingRuleId === id) {
    resetRuleForm();
  } else {
    loadRuleIntoForm(rule);
  }
  await renderSiteRules();
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

// Saved searches --------------------------------------------------------
savedSearchesEl.addEventListener("click", async (e) => {
  const chip = (e.target as HTMLElement).closest(
    ".saved-search-chip",
  ) as HTMLElement | null;
  if (!chip) return;
  const id = chip.dataset.id;
  if (!id) return;
  const entry = savedSearches.find((s) => s.id === id);
  if (!entry) return;
  const target = e.target as HTMLElement;
  if (target.dataset.act === "del") {
    e.stopPropagation();
    await removeSavedSearch(id);
    await refreshSavedSearches();
    toast(`Removed "${entry.name}"`);
    await render();
    return;
  }
  // Apply: drop into search box, focus so the user can refine, render.
  searchEl.value = entry.query;
  activeIndex = 0;
  searchEl.focus();
  await render();
});

saveSearchBtn.addEventListener("click", () => void handleSaveSearch());

// Search history (recent ghost chips) ----------------------------------
searchHistoryEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("recent-clear")) {
    await clearSearchHistory();
    await refreshSearchHistory();
    renderSearchHistory();
    return;
  }
  const chip = target.closest(".recent-chip") as HTMLElement | null;
  if (!chip) return;
  const q = chip.dataset.q || "";
  if (!q) return;
  // Cancel any pending debounce so applying a recent chip doesn't queue
  // a redundant write for the same string the user is now seeing.
  if (historyDebounce != null) {
    clearTimeout(historyDebounce);
    historyDebounce = null;
  }
  searchEl.value = q;
  activeIndex = 0;
  // Move to front in the history (acts as "I used this again").
  await pushSearchHistory(q);
  await refreshSearchHistory();
  searchEl.focus();
  await render();
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

// Row context menu --------------------------------------------------
//
// Right-clicking a clip in the list opens a compact menu of the
// actions most users want without hunting through the bulk bar or
// detail view: copy, copy-as-markdown, open, pin/unpin, toggle
// selection, add tag, filter-to-host, forget-host, trash.
//
// The menu lives in popup.html as a single hidden node; we position
// + populate it for the right-clicked clip on each open. Closing
// happens on outside click, Esc, scroll, or any underlying action
// running. Keyboard accessible — items are real <button>s with
// data-act attributes so the same code path handles click + Enter.

let rowMenuClipId: string | null = null;

function closeRowMenu(): void {
  if (rowMenuEl.hidden) return;
  rowMenuEl.hidden = true;
  rowMenuClipId = null;
}

/**
 * Populate the menu for a specific clip + position it near the
 * right-click point, clamped to the viewport so it doesn't spill
 * off-screen. Item labels swap based on the clip's current state
 * (pinned -> "Unpin"; in selection -> "Remove from selection";
 * no host -> filter/forget buttons hide entirely).
 */
function openRowMenu(c: ClipItem, x: number, y: number): void {
  rowMenuClipId = c.id;
  // Swap state-aware labels.
  const pinLabel = rowMenuEl.querySelector("[data-pin-label]");
  if (pinLabel) pinLabel.textContent = c.pinned ? "Unpin clip" : "Pin clip";
  const selectLabel = rowMenuEl.querySelector("[data-select-label]");
  if (selectLabel) {
    selectLabel.textContent = selectedIds.has(c.id)
      ? "Remove from selection"
      : "Add to selection";
  }
  const host = hostFrom(c.source.url);
  const filterHostBtn = rowMenuEl.querySelector(
    '[data-act="filter-host"]',
  ) as HTMLButtonElement | null;
  const forgetHostBtn = rowMenuEl.querySelector(
    '[data-act="forget-host"]',
  ) as HTMLButtonElement | null;
  if (host) {
    const fhLabel = filterHostBtn?.querySelector("[data-filter-host-label]");
    const fgLabel = forgetHostBtn?.querySelector("[data-forget-host-label]");
    if (fhLabel) fhLabel.textContent = `Filter to ${host}`;
    if (fgLabel) fgLabel.textContent = `Forget all from ${host}…`;
    if (filterHostBtn) filterHostBtn.hidden = false;
    if (forgetHostBtn) forgetHostBtn.hidden = false;
  } else {
    // Scrubbed / origin-less clip — no host actions to offer.
    if (filterHostBtn) filterHostBtn.hidden = true;
    if (forgetHostBtn) forgetHostBtn.hidden = true;
  }
  // Open + measure first so we can clamp into the viewport. Position
  // the menu so its top-left aligns with the mouse, then nudge it left/
  // up if it would overflow.
  rowMenuEl.hidden = false;
  rowMenuEl.style.left = "0px";
  rowMenuEl.style.top = "0px";
  const rect = rowMenuEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(4, Math.min(x, vw - rect.width - 4));
  const top = Math.max(4, Math.min(y, vh - rect.height - 4));
  rowMenuEl.style.left = `${left}px`;
  rowMenuEl.style.top = `${top}px`;
}

/**
 * Apply a menu action to the clip the menu was opened for. Runs the
 * same handlers list/detail code already uses so the behavior stays
 * in sync (e.g. trash goes through trashWithUndo). Closes the menu
 * before async work to avoid a frozen-menu feeling.
 */
async function runRowMenuAction(act: string): Promise<void> {
  if (!rowMenuClipId) return;
  const id = rowMenuClipId;
  closeRowMenu();
  const c = await getClip(id);
  if (!c) return;
  switch (act) {
    case "copy":
      await copyToClipboard(c);
      return;
    case "copy-md":
      await copyAsMarkdown(c);
      return;
    case "open":
      await openDetail(id);
      return;
    case "pin":
      await togglePin(id);
      await render();
      return;
    case "select":
      toggleSelected(id);
      await render();
      return;
    case "tag": {
      const raw = prompt("Add tag(s) (comma-separated):");
      if (!raw) return;
      const newTags = raw.split(",").map((t) => t.trim()).filter(Boolean);
      if (newTags.length === 0) return;
      const merged = Array.from(new Set([...c.tags, ...newTags]));
      await updateTags(id, merged);
      toast(`Tagged ${newTags.length === 1 ? newTags[0] : `${newTags.length} tags`}`);
      await render();
      return;
    }
    case "filter-host": {
      const host = hostFrom(c.source.url);
      if (!host) return;
      // Append `host:` operator. If it's already there, no-op + nudge focus.
      toggleSearchOp(`host:${host}`);
      searchEl.focus();
      return;
    }
    case "forget-host": {
      const host = hostFrom(c.source.url);
      if (!host) return;
      forgetHostInput.value = host;
      // runForgetHost runs the same confirm + RPC the settings panel uses.
      await openSettings();
      // Defer one tick so settings panel is visible before the prompt.
      setTimeout(() => void runForgetHost(), 50);
      return;
    }
    case "trash":
      await trashWithUndo([id]);
      return;
  }
}

listEl.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  const clipEl = target.closest(".clip") as HTMLElement | null;
  if (!clipEl) return;
  const id = clipEl.dataset.id;
  if (!id) return;
  const c = currentClips.find((x) => x.id === id);
  if (!c) return;
  e.preventDefault();
  openRowMenu(c, e.clientX, e.clientY);
});

rowMenuEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".row-menu-item") as HTMLElement | null;
  if (!btn) return;
  const act = btn.dataset.act;
  if (!act) return;
  void runRowMenuAction(act);
});

// Outside click / Esc / scroll / window blur all close the menu.
document.addEventListener(
  "mousedown",
  (e) => {
    if (rowMenuEl.hidden) return;
    if (!(e.target instanceof Node)) return;
    if (rowMenuEl.contains(e.target)) return;
    closeRowMenu();
  },
  true,
);
document.addEventListener(
  "keydown",
  (e) => {
    if (rowMenuEl.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRowMenu();
    }
  },
  true,
);
listEl.addEventListener("scroll", () => closeRowMenu(), true);
window.addEventListener("blur", () => closeRowMenu());

searchEl.addEventListener("input", () => {
  activeIndex = 0;
  scheduleHistoryPush(searchEl.value);
  render();
});

/**
 * Parse a `g <prefix>` jump pattern from the search box. Returns the
 * prefix when the value matches `g <something>` (case-insensitive,
 * leading-only), else null. Pure helper — exported for the keydown
 * handler below and reachable from tests via the same import path.
 */
function parseJumpPattern(raw: string): string | null {
  const m = /^\s*g\s+([\w.*-]+)\s*$/i.exec(raw);
  if (!m) return null;
  return m[1].toLowerCase().replace(/^www\./, "");
}

/**
 * Resolve a jump prefix to the first matching clip from the currently-
 * loaded set. Match order: exact host = best, then host starts-with,
 * then host contains. Pinned beats unpinned within each tier so the
 * \"go to that thing I always go to\" instinct wins.
 *
 * Pure given (clips, prefix); split out for unit-testability.
 */
function resolveJumpTarget(clips: ClipItem[], prefix: string): ClipItem | null {
  if (!prefix) return null;
  const p = prefix.toLowerCase();
  type Scored = { clip: ClipItem; rank: number };
  const scored: Scored[] = [];
  for (const c of clips) {
    const h = hostFrom(c.source.url);
    if (!h) continue;
    let rank = -1;
    if (h === p) rank = 0;
    else if (h.startsWith(p)) rank = 1;
    else if (h.includes(p)) rank = 2;
    if (rank < 0) continue;
    // Pinned floats up within each tier (subtract 0.5 so a pinned
    // starts-with still beats an unpinned exact-match? no — we keep
    // exact-match king regardless of pin state, so the pinned tie-
    // break is INSIDE its tier only).
    if (c.pinned) rank -= 0.1;
    scored.push({ clip: c, rank });
  }
  if (scored.length === 0) return null;
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      // Within a tier, prefer more-recently-seen clips.
      b.clip.lastSeenAt - a.clip.lastSeenAt,
  );
  return scored[0].clip;
}

// Enter on the search box: if the value matches `g <prefix>`, open the
// first clip whose host matches the prefix in the detail view. Mirrors
// the global Enter behavior (which copies the active clip) but is
// scoped to the search input via this listener so we don't have to
// shoehorn host-jump logic into the global keydown handler.
searchEl.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const prefix = parseJumpPattern(searchEl.value);
  if (!prefix) return;
  e.preventDefault();
  e.stopPropagation();
  // Source: the currently-loaded list when it's not empty, else a
  // fresh full pull so the user can jump even before they've scrolled
  // / filtered. Bounded at 1000 to avoid an unreasonable read.
  const source =
    currentClips.length > 0 ? currentClips : await listClips({ limit: 1000 });
  const target = resolveJumpTarget(source, prefix);
  if (!target) {
    toast(`No clips from "${prefix}"`, "error");
    return;
  }
  // Drop the jump command from the search box so the list isn't
  // stuck filtering to "g github" garbage when the user backs out.
  searchEl.value = "";
  activeIndex = 0;
  await render();
  await openDetail(target.id);
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

noteBtn.addEventListener("click", () => void openNoteComposer());

/**
 * Inline note composer overlay. Replaces the bare `prompt()` with a
 * real dialog so the user can:
 *   - Type a multi-line note (Cmd/Ctrl+Enter saves, Enter inserts a line)
 *   - Add tags inline (comma-separated text input)
 *   - Click chip suggestions to add tags drawn from existing clips'
 *     top tags (noise tags like "image"/"text"/"redacted" filtered out)
 *   - Pin the note from the same dialog (no second click after save)
 *
 * Opens centered, focuses the textarea, restores focus to the toolbar
 * after close. Esc cancels; the global keydown handler routes through
 * the composer before falling through to other panels.
 */
async function openNoteComposer(): Promise<void> {
  noteText.value = "";
  noteTagsInput.value = "";
  notePinInput.checked = false;
  await renderNoteTagSuggestions();
  noteComposer.hidden = false;
  // After the panel paints — focus the textarea so typing lands there
  // instead of stealing focus from whatever the user just clicked.
  setTimeout(() => noteText.focus(), 0);
}

function closeNoteComposer(): void {
  noteComposer.hidden = true;
}

/**
 * Build the quick-tag chip strip from the user's most-used tags. We
 * pull the same data the main list's tag chips render off of, drop
 * the noise auto-tags (kind shapes, generic descriptors) so we
 * surface intent tags like `code`, `recipe`, `idea`, `todo`, etc.
 * Hidden when no tags exist yet.
 */
async function renderNoteTagSuggestions(): Promise<void> {
  const NOISE = new Set([
    "image",
    "link",
    "text",
    "url",
    "long",
    "redacted",
    "scrubbed",
    "quick-capture",
    "omnibox",
    "code",
  ]);
  try {
    // Active-tab context tags come FIRST so the user sees the most
    // session-relevant tags at the front of the strip. Pre-active when
    // the chip's tag is already in the input field (chip already
    // toggled on by an earlier capture) so the visual state matches.
    let contextTags: string[] = [];
    try {
      const [activeTab] = await api.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url) {
        contextTags = contextTagsForTab(
          { url: activeTab.url, title: activeTab.title },
          5,
        );
      }
    } catch {
      // No tab access — chrome:// / about: / extension page. Fall
      // back to historical-tag-only suggestions; not a failure.
      contextTags = [];
    }

    const all = await listClips({ limit: 2000 });
    const counts = new Map<string, number>();
    for (const c of all) {
      for (const t of c.tags || []) {
        const k = t.toLowerCase();
        if (NOISE.has(k)) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    // Drop history-tags that the context strip already covers so we
    // don't render the same chip twice.
    const ctxSet = new Set(contextTags);
    const histRows = top.filter(([t]) => !ctxSet.has(t));
    if (contextTags.length === 0 && histRows.length === 0) {
      noteTagSuggestions.hidden = true;
      noteTagSuggestions.innerHTML = "";
      return;
    }
    const segments: string[] = [];
    if (contextTags.length > 0) {
      segments.push(
        `<span class="note-tag-suggestions-label">From this tab</span>` +
          contextTags
            .map(
              (t) =>
                `<button type="button" class="note-tag-chip note-tag-chip-ctx" data-tag="${escapeHtml(t)}" title="From the active tab — ${escapeHtml(t)}">${escapeHtml(t)}</button>`,
            )
            .join(""),
      );
    }
    if (histRows.length > 0) {
      segments.push(
        `<span class="note-tag-suggestions-label note-tag-suggestions-label-sep">Recent</span>` +
          histRows
            .map(
              ([t, n]) =>
                `<button type="button" class="note-tag-chip" data-tag="${escapeHtml(t)}" title="${escapeHtml(t)} (${n})">${escapeHtml(t)}</button>`,
            )
            .join(""),
      );
    }
    noteTagSuggestions.hidden = false;
    noteTagSuggestions.innerHTML = segments.join("");
  } catch {
    noteTagSuggestions.hidden = true;
  }
}

noteTagSuggestions.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".note-tag-chip") as HTMLButtonElement | null;
  if (!btn) return;
  const tag = btn.dataset.tag || "";
  if (!tag) return;
  const existing = noteTagsInput.value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (existing.includes(tag)) {
    // Toggle off — clicking a chip a second time removes it from the
    // tag input. Keeps the chip strip behaving like a multi-select.
    const next = existing.filter((t) => t !== tag);
    noteTagsInput.value = next.join(", ");
    btn.classList.remove("active");
  } else {
    const next = [...existing, tag];
    noteTagsInput.value = next.join(", ");
    btn.classList.add("active");
  }
  noteText.focus();
});

noteCancelBtn.addEventListener("click", () => closeNoteComposer());
noteComposer.addEventListener("click", (e) => {
  if (e.target === noteComposer) closeNoteComposer();
});

async function saveNoteFromComposer(): Promise<void> {
  const text = noteText.value.trim();
  if (!text) {
    toast("Empty note", "error");
    noteText.focus();
    return;
  }
  const tags = noteTagsInput.value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const pinned = notePinInput.checked;
  noteSaveBtn.disabled = true;
  try {
    await new Promise<void>((resolve) => {
      api.runtime.sendMessage(
        {
          type: "cc-rpc",
          action: "addNote",
          payload: { text, tags, pinned },
        },
        () => resolve(),
      );
    });
    const bits: string[] = ["Note saved"];
    if (tags.length) bits.push(`${tags.length} tag${tags.length === 1 ? "" : "s"}`);
    if (pinned) bits.push("pinned");
    toast(bits.join(" · "));
    closeNoteComposer();
    await render();
  } finally {
    noteSaveBtn.disabled = false;
  }
}

noteSaveBtn.addEventListener("click", () => void saveNoteFromComposer());

noteText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void saveNoteFromComposer();
  }
});
noteTagsInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    void saveNoteFromComposer();
  }
});

/**
 * Quick-capture: read the system clipboard and ingest whatever is there
 * as a fresh clip. Tries images first (clipboard.read returns ClipboardItems
 * with MIME types), falls back to plain text. The captured clip is marked
 * with a `quick-capture` tag + `Manual capture` source title so users can
 * `tag:quick-capture` later. Local-only — the read happens in the popup,
 * not over the wire.
 *
 * Failure modes (no permission, empty clipboard, exotic MIME) surface as
 * a one-line toast — no silent no-ops.
 */
async function quickCaptureFromClipboard(): Promise<void> {
  const before = quickCaptureBtn.title;
  quickCaptureBtn.disabled = true;
  quickCaptureBtn.title = "Reading clipboard…";
  try {
    // Try the rich Clipboard API first so we catch images. Falls back
    // to readText() when read() isn't available (older Firefox).
    const clip = navigator.clipboard as unknown as {
      read?: () => Promise<Array<{ types: string[]; getType: (t: string) => Promise<Blob> }>>;
      readText?: () => Promise<string>;
    };
    if (clip.read) {
      try {
        const items = await clip.read();
        for (const it of items) {
          const imageType = it.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await it.getType(imageType);
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.onerror = () => reject(r.error);
              r.readAsDataURL(blob);
            });
            await new Promise<void>((resolve) => {
              api.runtime.sendMessage(
                {
                  type: "cc-rpc",
                  action: "addImageBlob",
                  payload: { dataUrl, name: "Quick capture" },
                },
                () => resolve(),
              );
            });
            await tagLastQuickCapture("quick-capture");
            toast("Image captured from clipboard");
            await render();
            return;
          }
          const textType = it.types.find((t) => t === "text/plain");
          if (textType) {
            const blob = await it.getType(textType);
            const text = (await blob.text()).trim();
            if (!text) continue;
            await ingestQuickText(text);
            return;
          }
        }
        // No supported types found in the rich payload — fall through
        // to readText so an HTML-only clipboard still gets captured
        // (browsers usually expose a text/plain fallback alongside).
      } catch (e) {
        // Permission denied / no focus / DataCloneError on some Firefox
        // builds — fall through to readText.
        console.debug("[context-clipboard] clipboard.read failed", e);
      }
    }
    if (clip.readText) {
      const text = (await clip.readText()).trim();
      if (!text) {
        toast("Clipboard is empty", "error");
        return;
      }
      await ingestQuickText(text);
      return;
    }
    toast("Clipboard read not supported", "error");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast(`Capture failed: ${msg}`, "error");
  } finally {
    quickCaptureBtn.disabled = false;
    quickCaptureBtn.title = before;
  }
}

/** Internal: ingest a plain-text quick capture and tag the result. */
async function ingestQuickText(text: string): Promise<void> {
  await new Promise<void>((resolve) => {
    api.runtime.sendMessage(
      { type: "cc-rpc", action: "addNote", payload: { text } },
      () => resolve(),
    );
  });
  await tagLastQuickCapture("quick-capture");
  toast(text.length > 60 ? `Captured ${text.length} chars` : `Captured: ${text.slice(0, 40)}${text.length > 40 ? "…" : ""}`);
  await render();
}

/**
 * Append a tag to the most-recently-seen clip. Used right after a quick
 * capture (which we have no direct id for, since addNote/addImageBlob
 * resolve asynchronously and we don't await the response payload). The
 * lastSeenAt index pins the freshly-ingested clip to position 0 so this
 * is reliable inside the ~ms window between capture and tag.
 */
async function tagLastQuickCapture(tag: string): Promise<void> {
  try {
    const all = await listClips({ limit: 1 });
    const c = all[0];
    if (!c) return;
    const merged = Array.from(new Set([...c.tags, tag]));
    await updateTags(c.id, merged);
  } catch (e) {
    console.debug("[context-clipboard] quick-capture tag failed", e);
  }
}

quickCaptureBtn.addEventListener("click", () => void quickCaptureFromClipboard());

// Keyboard cheatsheet --------------------------------------------------
//
// `?` toggles a modal listing every shortcut + search operator. Esc and
// backdrop click close. Open works from anywhere (including inside the
// search input) because `?` requires Shift+/ which is non-destructive in
// a text field — we preventDefault so it doesn't insert.

function openCheatsheet(): void {
  cheatsheetEl.hidden = false;
}

function closeCheatsheet(): void {
  cheatsheetEl.hidden = true;
}

function toggleCheatsheet(): void {
  if (cheatsheetEl.hidden) openCheatsheet();
  else closeCheatsheet();
}

cheatsheetClose.addEventListener("click", () => closeCheatsheet());
cheatsheetEl.addEventListener("click", (e) => {
  // Backdrop click (the dim layer is the dialog root itself; the card stops
  // propagation via its own listener).
  if (e.target === cheatsheetEl) closeCheatsheet();
});
cheatsheetEl
  .querySelector(".cheatsheet-card")
  ?.addEventListener("click", (e) => e.stopPropagation());

// Command palette (Cmd+K) ----------------------------------------------
//
// Fuzzy-search every action in the popup. We build the action list on
// each open (cheap; ~40 actions) so contextual `available` flags
// reflect current state (e.g. "Empty trash" hidden when trash is
// empty, "Clear selection" only when something is selected). The
// matcher lives in `lib/palette.ts` and is pure so it's testable.

let paletteIndex = 0;
let paletteResults: ReturnType<typeof rankActions> = [];

function buildPaletteActions(): PaletteAction[] {
  const hasSelection = selectedIds.size > 0;
  const hasFilter =
    !!searchEl.value.trim() ||
    pinnedOnly ||
    !!activeTag ||
    currentKind !== "all";
  const visible = currentClips.length;
  const actions: PaletteAction[] = [
    // Navigation / focus ---------------------------------------------
    {
      id: "focus-search",
      label: "Focus search",
      hint: "Jump cursor to the search box",
      group: "Navigate",
      shortcut: "/",
      run: () => {
        closePalette();
        searchEl.focus();
      },
    },
    {
      id: "open-cheatsheet",
      label: "Show keyboard shortcuts",
      hint: "Open the cheatsheet overlay",
      group: "Navigate",
      shortcut: "?",
      run: () => {
        closePalette();
        openCheatsheet();
      },
    },
    {
      id: "open-settings",
      label: "Open settings",
      hint: "Theme, capture, exports, rules",
      group: "Navigate",
      run: () => {
        closePalette();
        void openSettings();
      },
    },
    {
      id: "open-audit",
      label: "Show privacy audit log",
      hint: "Last 30 redact / scrub / forget / archive actions",
      group: "Privacy",
      keywords: "audit log history privacy actions trail diary",
      run: async () => {
        closePalette();
        await openSettings();
        // Scroll the audit section into view after the panel paints.
        setTimeout(() => {
          const el = document.getElementById("audit-section");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      },
    },
    {
      id: "add-note",
      label: "Add note",
      hint: "Save a quick text clip",
      group: "Capture",
      run: () => {
        closePalette();
        noteBtn.click();
      },
    },
    {
      id: "quick-capture",
      label: "Capture from system clipboard",
      hint: "Pull the current clipboard contents into a fresh clip",
      group: "Capture",
      keywords: "paste import pull pasteboard",
      run: () => {
        closePalette();
        void quickCaptureFromClipboard();
      },
    },
    {
      id: "toggle-blur",
      label: document.body.classList.contains("blur-on")
        ? "Stop blurring previews"
        : "Blur previews (anti-shoulder-surf)",
      hint: "Hide clip contents until you hover",
      group: "Privacy",
      keywords: "shoulder surf privacy mask",
      run: async () => {
        closePalette();
        const next = !document.body.classList.contains("blur-on");
        await saveSettings({ blurPreviews: next });
        applyBlurMode(next);
        toast(next ? "Blur on" : "Blur off");
      },
    },
    {
      id: "toggle-compact-rows",
      label: document.body.classList.contains("compact-rows")
        ? "Expand row spacing"
        : "Compact rows (fit 30+ per screen)",
      hint: "Shrink each clip row so more fit on one screen",
      group: "Filter",
      keywords: "dense compact tight rows height",
      run: async () => {
        closePalette();
        const next = !document.body.classList.contains("compact-rows");
        await saveSettings({ compactRows: next });
        applyCompactRows(next);
        toast(next ? "Compact rows on" : "Compact rows off");
      },
    },
    {
      id: "scrub-open-clip",
      label: "Scrub origin from open clip",
      hint: "Drop URL/title/context, keep content",
      group: "Privacy",
      keywords: "forget source unlink anonymize",
      available: detailId != null,
      run: () => {
        closePalette();
        void scrubDetailOrigin();
      },
    },
    {
      id: "send-open-clip",
      label: "Send open clip to…",
      hint: "Open URL · search · email · copy as Markdown",
      group: "Bulk",
      keywords: "send share export open url search mailto markdown copy",
      available: detailId != null,
      run: () => {
        closePalette();
        void openSendMenu();
      },
    },
    {
      id: "archive-open-clip",
      label: "Archive / unarchive open clip",
      hint: "Hide cold pins from the default list",
      group: "Bulk",
      keywords: "archive cold hide tuck away inbox",
      available: detailId != null,
      run: () => {
        closePalette();
        void toggleDetailArchive();
      },
    },
    {
      id: "show-archived",
      label: "Show archived clips",
      hint: "is:archived — only the archive surfaces",
      group: "Filter",
      keywords: "archive is:archived cold pins",
      run: () => {
        closePalette();
        appendSearchOp("is:archived");
      },
    },
    {
      id: "retroactive-redact",
      label: "Redact PII in every existing clip",
      hint: "Mask emails / phones / cards / secrets in old captures",
      group: "Privacy",
      keywords: "sweep retroactive bulk redaction cleanup history pii",
      run: () => {
        closePalette();
        void runRetroactiveAutoRedact();
      },
    },
    // Kind filters ---------------------------------------------------
    {
      id: "filter-all",
      label: "Show all clips",
      hint: "Clear kind filter",
      group: "Filter",
      keywords: "kind:all reset",
      available: currentKind !== "all",
      run: () => {
        closePalette();
        applyKindFilter("all");
      },
    },
    {
      id: "filter-text",
      label: "Show text only",
      group: "Filter",
      keywords: "kind:text",
      run: () => {
        closePalette();
        applyKindFilter("text");
      },
    },
    {
      id: "filter-image",
      label: "Show images only",
      group: "Filter",
      keywords: "kind:image picture",
      run: () => {
        closePalette();
        applyKindFilter("image");
      },
    },
    {
      id: "filter-link",
      label: "Show links only",
      group: "Filter",
      keywords: "kind:link url",
      run: () => {
        closePalette();
        applyKindFilter("link");
      },
    },
    {
      id: "toggle-pinned",
      label: pinnedOnly ? "Stop filtering to pinned" : "Show pinned only",
      group: "Filter",
      keywords: "is:pinned bookmark",
      run: () => {
        closePalette();
        pinnedToggle.click();
      },
    },
    {
      id: "filter-redacted",
      label: "Show redacted clips",
      group: "Filter",
      keywords: "is:redacted privacy",
      run: () => {
        closePalette();
        appendSearchOp("is:redacted");
      },
    },
    {
      id: "filter-templates",
      label: "Show templates",
      group: "Filter",
      keywords: "is:template tokens snippets",
      run: () => {
        closePalette();
        appendSearchOp("is:template");
      },
    },
    {
      id: "filter-expiring",
      label: "Show expiring clips",
      group: "Filter",
      keywords: "is:expiring ttl",
      run: () => {
        closePalette();
        appendSearchOp("is:expiring");
      },
    },
    {
      id: "filter-24h",
      label: "Show last 24 hours",
      group: "Filter",
      keywords: "after:24h recent today",
      run: () => {
        closePalette();
        appendSearchOp("after:24h");
      },
    },
    {
      id: "filter-7d",
      label: "Show last 7 days",
      group: "Filter",
      keywords: "after:7d week",
      run: () => {
        closePalette();
        appendSearchOp("after:7d");
      },
    },
    {
      id: "clear-filters",
      label: "Clear all filters",
      hint: "Reset search, kind, pinned, tag",
      group: "Filter",
      available: hasFilter,
      run: () => {
        closePalette();
        clearAllFilters();
      },
    },
    // Bulk -----------------------------------------------------------
    {
      id: "select-all-visible",
      label: `Select all visible (${visible})`,
      group: "Bulk",
      shortcut: "⌘A",
      available: visible > 0,
      run: async () => {
        closePalette();
        const n = selectAllVisible();
        if (n > 0) toast(`Selected ${selectedIds.size}`);
        await render();
      },
    },
    {
      id: "clear-selection",
      label: "Clear selection",
      group: "Bulk",
      shortcut: "Esc",
      available: hasSelection,
      run: () => {
        closePalette();
        clearSelection();
      },
    },
    {
      id: "pin-selection",
      label: "Toggle pin on selection",
      group: "Bulk",
      available: hasSelection,
      run: () => {
        closePalette();
        bulkPin.click();
      },
    },
    {
      id: "tag-selection",
      label: "Tag selection…",
      group: "Bulk",
      available: hasSelection,
      run: () => {
        closePalette();
        bulkTag.click();
      },
    },
    {
      id: "delete-selection",
      label: "Delete selection",
      group: "Bulk",
      available: hasSelection,
      run: () => {
        closePalette();
        bulkDel.click();
      },
    },
    {
      id: "pin-all-filtered",
      label: `Pin all ${visible} filtered`,
      hint: "Pins every clip in the current view",
      group: "Bulk",
      available: visible > 0,
      run: async () => {
        closePalette();
        await pinAllFiltered(true);
      },
    },
    {
      id: "unpin-all-filtered",
      label: `Unpin all ${visible} filtered`,
      group: "Bulk",
      available: visible > 0,
      run: async () => {
        closePalette();
        await pinAllFiltered(false);
      },
    },
    {
      id: "tag-all-filtered",
      label: `Tag all ${visible} filtered…`,
      hint: "Apply tag(s) to every clip in the current view",
      group: "Bulk",
      keywords: "label categorize batch tagging",
      available: visible > 0,
      run: async () => {
        closePalette();
        await tagAllFiltered();
      },
    },
    {
      id: "archive-all-filtered",
      label: `Archive all ${visible} filtered`,
      hint: "Tuck the whole filtered view into the archive (cold storage)",
      group: "Bulk",
      keywords: "archive cold hide tuck batch bulk",
      available: visible > 0 && currentClips.some((c) => !c.archived),
      run: async () => {
        closePalette();
        await archiveAllFiltered(true);
      },
    },
    {
      id: "unarchive-all-filtered",
      label: `Unarchive all ${visible} filtered`,
      hint: "Resurface every archived clip in the current view",
      group: "Bulk",
      keywords: "unarchive inbox resurface batch bulk",
      available: visible > 0 && currentClips.some((c) => !!c.archived),
      run: async () => {
        closePalette();
        await archiveAllFiltered(false);
      },
    },
    {
      id: "clear-unpinned",
      label: "Clear all unpinned clips",
      hint: "Keeps pins, drops the rest",
      group: "Bulk",
      run: () => {
        closePalette();
        clearBtn.click();
      },
    },
    {
      id: "purge-trash-24h",
      label: "Purge trash older than 24h",
      hint: "Frees storage while keeping fresh deletes restorable",
      group: "Bulk",
      keywords: "trash purge cleanup retention 24h day",
      run: async () => {
        closePalette();
        await purgeTrashOlderThan24h();
      },
    },
    {
      id: "merge-duplicates",
      label: "Merge duplicate clips by content",
      hint: "Combine same-content clips across windows · pinned bit OR'd",
      group: "Bulk",
      keywords: "dedup duplicates hash collapse merge",
      run: async () => {
        closePalette();
        await runMergeDuplicates();
      },
    },
    {
      id: "review-duplicates",
      label: "Review duplicates…",
      hint: "Browse dupe groups + merge them one at a time",
      group: "Bulk",
      keywords: "dedup duplicates review inspect groups picker selective",
      run: async () => {
        closePalette();
        await openDupesPanel();
      },
    },
    // Export ---------------------------------------------------------
    {
      id: "export-now",
      label: "Export with current filter",
      hint: "Uses the settings panel's format",
      group: "Export",
      run: () => {
        closePalette();
        exportBtn.click();
      },
    },
    {
      id: "import-json",
      label: "Import JSON…",
      group: "Export",
      run: () => {
        closePalette();
        importBtn.click();
      },
    },
    // Sort -----------------------------------------------------------
    {
      id: "sort-recent",
      label: "Sort: Most recent",
      group: "Sort",
      keywords: "lastSeen newest fresh",
      available: listSort !== "recent",
      run: async () => {
        closePalette();
        await applyListSort("recent");
      },
    },
    {
      id: "sort-oldest",
      label: "Sort: Oldest first",
      group: "Sort",
      keywords: "archaeology old",
      available: listSort !== "oldest",
      run: async () => {
        closePalette();
        await applyListSort("oldest");
      },
    },
    {
      id: "sort-hits",
      label: "Sort: Most copied",
      group: "Sort",
      keywords: "hitCount frequent popular",
      available: listSort !== "hits",
      run: async () => {
        closePalette();
        await applyListSort("hits");
      },
    },
    {
      id: "sort-size",
      label: "Sort: Largest first",
      group: "Sort",
      keywords: "bytes big storage",
      available: listSort !== "size",
      run: async () => {
        closePalette();
        await applyListSort("size");
      },
    },
    {
      id: "sort-alpha",
      label: "Sort: A to Z",
      group: "Sort",
      keywords: "alphabetical name",
      available: listSort !== "alpha",
      run: async () => {
        closePalette();
        await applyListSort("alpha");
      },
    },
  ];
  return actions;
}

function openPalette(): void {
  paletteEl.hidden = false;
  paletteInput.value = "";
  paletteIndex = 0;
  renderPalette();
  setTimeout(() => paletteInput.focus(), 0);
}

function closePalette(): void {
  paletteEl.hidden = true;
}

function togglePalette(): void {
  if (paletteEl.hidden) openPalette();
  else closePalette();
}

/**
 * Apply a kind filter from the palette (or any other code path). Mirrors
 * the click-handler on the filter buttons so all filter changes go
 * through the same render path.
 */
function applyKindFilter(kind: ClipKind | "all"): void {
  currentKind = kind;
  filterBtns.forEach((b) => {
    b.classList.toggle("active", (b.dataset.kind || "all") === kind);
  });
  activeIndex = 0;
  void render();
}

/**
 * Append or toggle a search operator into the search box. Different from
 * the chip's toggleSearchOp in that this version is always *additive* —
 * the palette's "Show last 24h" should add the operator, not strip it
 * off if it's already there.
 */
function appendSearchOp(op: string): void {
  const raw = searchEl.value.trim();
  const re = new RegExp(
    `(?:^|\\s)${op.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\s|$)`,
  );
  if (re.test(raw)) {
    // Already present — just refocus + re-render so user sees the effect.
    searchEl.focus();
    return;
  }
  searchEl.value = raw ? `${raw} ${op}` : op;
  activeIndex = 0;
  void render();
}

/** Reset every filter (search box, kind, pinned, active tag) and re-render. */
function clearAllFilters(): void {
  searchEl.value = "";
  currentKind = "all";
  pinnedOnly = false;
  activeTag = null;
  pinnedToggle.classList.remove("active");
  filterBtns.forEach((b) => {
    b.classList.toggle("active", (b.dataset.kind || "all") === "all");
  });
  activeIndex = 0;
  void render();
}

/**
 * Switch list sort to `mode` and persist it. Single source of truth so
 * the dropdown and palette stay in sync; updates the dropdown's
 * `changed` accent + tooltip alongside.
 */
async function applyListSort(mode: SortMode): Promise<void> {
  if (mode === listSort) {
    toast(`Already ${sortLabel(mode).toLowerCase()}`);
    return;
  }
  listSort = mode;
  sortModeEl.value = mode;
  sortModeEl.classList.toggle("changed", mode !== "recent");
  sortModeEl.title = `Sort: ${sortLabel(mode)}`;
  await setListSort(mode);
  await render();
  toast(`Sort: ${sortLabel(mode)}`);
}

/**
 * Bulk pin or unpin every clip in the current filtered view. Mirrors
 * the bulk-bar pin action but skips having to manually multi-select
 * first — the filter IS the selection. Skipped no-ops keep messages
 * honest (e.g. "Already pinned").
 */
async function pinAllFiltered(pin: boolean): Promise<void> {
  if (currentClips.length === 0) return;
  const verb = pin ? "Pin" : "Unpin";
  const targets = currentClips.filter((c) => c.pinned !== pin);
  if (targets.length === 0) {
    toast(`Already ${pin ? "pinned" : "unpinned"}`);
    return;
  }
  if (
    targets.length > 25 &&
    !confirm(`${verb} ${targets.length} clip${targets.length === 1 ? "" : "s"}?`)
  ) {
    return;
  }
  for (const c of targets) await togglePin(c.id);
  toast(`${pin ? "Pinned" : "Unpinned"} ${targets.length}`);
  await render();
}

/**
 * Bulk archive / unarchive every clip in the current filtered view.
 * Mirrors `pinAllFiltered` shape: skips no-ops, confirms above 25 to
 * stop fat-fingered mass actions, fires per-clip privacy-audit
 * entries so the action shows up in the Settings audit log.
 *
 * Archive semantics: archiving leaves `lastSeenAt` alone (so the
 * archive view stays ordered by recency); unarchiving bumps it so
 * the clip resurfaces near the top of the daily list. Both come for
 * free from `toggleArchive()` — we just flip the bit toward the
 * target state for any clip that doesn't already match.
 *
 * Useful workflow: `is:archived host:docs.github.com` → palette →
 * "Unarchive all 12 filtered" to bring a batch back to the daily
 * list without opening each one.
 */
async function archiveAllFiltered(archive: boolean): Promise<void> {
  if (currentClips.length === 0) return;
  const verb = archive ? "Archive" : "Unarchive";
  const targets = currentClips.filter((c) => !!c.archived !== archive);
  if (targets.length === 0) {
    toast(`Already ${archive ? "archived" : "unarchived"}`);
    return;
  }
  if (
    targets.length > 25 &&
    !confirm(
      `${verb} ${targets.length} clip${targets.length === 1 ? "" : "s"}?`,
    )
  ) {
    return;
  }
  let flipped = 0;
  for (const c of targets) {
    const next = await toggleArchive(c.id);
    if (next == null) continue;
    if (next === archive) {
      flipped++;
      void appendPrivacyAuditEntry({
        kind: archive ? "archive" : "unarchive",
        clipId: c.id,
        host: hostFrom(c.source.url),
      });
    }
  }
  if (flipped === 0) {
    toast(`Already ${archive ? "archived" : "unarchived"}`);
    return;
  }
  toast(`${archive ? "Archived" : "Unarchived"} ${flipped}`);
  await render();
}

/**
 * Apply one or more tags to every clip in the current filtered view —
 * the filter IS the selection. Mirrors the bulk-bar tag action, but
 * scoped to the visible window so a user who's already narrowed the
 * list with `host:github.com tag:code` can `palette > Tag all filtered`
 * and stamp `#review` across the whole batch in one keystroke.
 *
 * Tags are merged (union), not replaced — we never strip existing tags.
 * Skipped if a clip already carries every requested tag.
 */
async function tagAllFiltered(): Promise<void> {
  if (currentClips.length === 0) return;
  const raw = prompt(
    `Tag all ${currentClips.length} filtered clip${currentClips.length === 1 ? "" : "s"} (comma-separated):`,
  );
  if (!raw) return;
  const newTags = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (newTags.length === 0) return;
  if (
    currentClips.length > 25 &&
    !confirm(
      `Apply ${newTags.length === 1 ? `tag "${newTags[0]}"` : `${newTags.length} tags`} to ${currentClips.length} clips?`,
    )
  ) {
    return;
  }
  let updated = 0;
  const newTagSet = new Set(newTags);
  for (const c of currentClips) {
    const before = new Set(c.tags);
    let changed = false;
    for (const t of newTagSet) if (!before.has(t)) changed = true;
    if (!changed) continue;
    const merged = Array.from(new Set([...c.tags, ...newTags]));
    await updateTags(c.id, merged);
    updated++;
  }
  if (updated === 0) {
    toast("Already tagged");
    return;
  }
  toast(`Tagged ${updated}`);
  await render();
}

/**
 * Smart dedup across windows: groups every clip by content hash and
 * collapses duplicates that escaped the dedup-window check at capture
 * time (e.g. you copied the same code snippet on Monday and Friday).
 * Survivor keeps the freshest `lastSeenAt` + sums hitCount + unions
 * tags + OR-merges pinned + keeps earliest createdAt. Losers go to
 * the trash via the standard soft-delete path so the user has 7 days
 * to undo.
 *
 * Confirms before running so a user can't fat-finger 50 duplicates
 * into the trash unintentionally. Skips silently when there's
 * nothing to merge.
 */
async function runMergeDuplicates(): Promise<void> {
  // Quick read first to decide whether to confirm + what the
  // potential impact looks like. Bounded at the same 1M as the merge
  // call itself; both are streaming reads over IDB.
  const all = await listClips({ limit: 1_000_000 });
  const groups = new Map<string, number>();
  for (const c of all) {
    if (!c.hash) continue;
    groups.set(c.hash, (groups.get(c.hash) || 0) + 1);
  }
  let dupGroups = 0;
  let dupRows = 0;
  for (const [, n] of groups) {
    if (n > 1) {
      dupGroups++;
      dupRows += n - 1;
    }
  }
  if (dupRows === 0) {
    toast("No duplicates found");
    return;
  }
  if (
    !confirm(
      `Merge ${dupRows} duplicate row${dupRows === 1 ? "" : "s"} across ${dupGroups} group${dupGroups === 1 ? "" : "s"}?\n` +
        `Survivors keep your pins, tags, and hit counts. Losers go to Trash (restorable for 7 days).`,
    )
  ) {
    return;
  }
  const res = await mergeDuplicatesByHash();
  if (res.merged === 0) {
    toast("No duplicates found");
    return;
  }
  toast(`Merged ${res.merged} into ${res.groups} group${res.groups === 1 ? "" : "s"}`);
  await render();
}

// Find duplicates review panel -----------------------------------------
//
// Sibling of runMergeDuplicates that opens a modal listing every dupe
// group so the user can pick which to collapse. Mirrors the cheatsheet
// overlay's interaction model: backdrop click + Esc + close button all
// dismiss; "Merge all" runs the bulk path; individual group buttons
// run mergeDuplicateGroup(hash) so the rest stay untouched.

async function openDupesPanel(): Promise<void> {
  const groups = await findDuplicateGroups();
  paintDupesPanel(groups);
  dupesPanel.hidden = false;
}

function closeDupesPanel(): void {
  dupesPanel.hidden = true;
}

function paintDupesPanel(groups: DuplicateGroup[]): void {
  if (groups.length === 0) {
    dupesSummary.textContent = "no duplicates";
    dupesMergeAll.hidden = true;
    dupesBody.innerHTML =
      `<div class="dupes-empty">No duplicate groups. Your clipboard is clean.</div>`;
    return;
  }
  let totalLosers = 0;
  for (const g of groups) totalLosers += g.members.length - 1;
  dupesSummary.textContent = `${groups.length} group${groups.length === 1 ? "" : "s"} · ${totalLosers} extra row${totalLosers === 1 ? "" : "s"}`;
  dupesMergeAll.hidden = false;
  dupesMergeAll.textContent = `Merge all (${totalLosers})`;
  dupesBody.innerHTML = groups
    .map((g, gi) => renderDupeGroup(g, gi))
    .join("");
}

function renderDupeGroup(g: DuplicateGroup, gi: number): string {
  const survivor = g.members[0];
  const losers = g.members.slice(1);
  const survivorMeta = [hostFrom(survivor.source.url), survivor.source.title]
    .filter(Boolean)
    .join(" · ");
  const previewText = (survivor.preview || survivor.content || "Image").slice(0, 120);
  const pinDot = g.pinnedInGroup
    ? `<span class="dupe-pin-dot" title="At least one member is pinned — survivor will inherit"></span>`
    : "";
  const loserList = losers
    .map((l) => {
      const lMeta = [hostFrom(l.source.url), l.source.title]
        .filter(Boolean)
        .join(" · ");
      return `<li class="dupe-loser"><span class="dupe-loser-when">${escapeHtml(timeAgo(l.lastSeenAt))}</span><span class="dupe-loser-meta" title="${escapeHtml(l.source.url || "")}">${escapeHtml(lMeta || "—")}</span></li>`;
    })
    .join("");
  return `
    <div class="dupe-group" data-hash="${escapeHtml(g.hash)}" data-gi="${gi}">
      <div class="dupe-group-head">
        <div class="dupe-survivor">
          ${pinDot}
          <div class="dupe-survivor-body">
            <div class="dupe-survivor-preview">${escapeHtml(previewText)}</div>
            <div class="dupe-survivor-meta">${escapeHtml(survivorMeta || "—")} · keep</div>
          </div>
        </div>
        <button class="dupe-merge-btn small" type="button" data-act="merge-group" data-hash="${escapeHtml(g.hash)}">Merge ${g.members.length}</button>
      </div>
      <ul class="dupe-loser-list">${loserList}</ul>
    </div>
  `;
}

dupesClose.addEventListener("click", () => closeDupesPanel());
dupesPanel.addEventListener("click", (e) => {
  // Backdrop click closes; card click stays.
  if (e.target === dupesPanel) closeDupesPanel();
});
dupesBody.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest('[data-act="merge-group"]');
  if (!(btn instanceof HTMLButtonElement)) return;
  const hash = btn.dataset.hash || "";
  if (!hash) return;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Merging…";
  try {
    const trashed = await mergeDuplicateGroup(hash);
    if (trashed === 0) {
      toast("Group already merged", "error");
    } else {
      toast(`Merged ${trashed} duplicate${trashed === 1 ? "" : "s"}`);
    }
    // Re-fetch + re-paint so resolved groups disappear. Don't close —
    // the user may want to merge several in a row.
    const groups = await findDuplicateGroups();
    paintDupesPanel(groups);
    void render(); // refresh the main list too (survivors changed)
  } catch (err) {
    console.error(err);
    toast("Merge failed", "error");
    btn.disabled = false;
    btn.textContent = original;
  }
});
dupesMergeAll.addEventListener("click", async () => {
  dupesMergeAll.disabled = true;
  try {
    const res = await mergeDuplicatesByHash();
    if (res.merged === 0) {
      toast("Already clean");
    } else {
      toast(`Merged ${res.merged} into ${res.groups} group${res.groups === 1 ? "" : "s"}`);
    }
    const groups = await findDuplicateGroups();
    paintDupesPanel(groups);
    void render();
  } finally {
    dupesMergeAll.disabled = false;
  }
});

/**
 * Walk every text clip and redact any that still carry PII or
 * secrets — useful right after a user flips on `autoRedactPii` for
 * the first time and realises their accumulated history is full of
 * emails / phone numbers / leaked API keys.
 *
 * Confirms with a concrete count BEFORE acting (no fat-finger 200-
 * clip mass-redaction). Unlike on-capture auto-redact, the original
 * is stashed in `originalContent` so the redact is reversible — the
 * data is already on disk anyway, no privacy cost to keeping a copy.
 *
 * Surfaces an "Already clean" toast when scanning finds nothing to
 * redact so the user gets feedback either way.
 */
async function runRetroactiveAutoRedact(): Promise<void> {
  // First pass: count how many would be touched. Same scan as the
  // db helper does, but we do it inline so we can show the user a
  // concrete confirmation BEFORE writing anything.
  const all = await listClips({ limit: 1_000_000 });
  let candidates = 0;
  for (const c of all) {
    if (c.kind !== "text" || c.redacted) continue;
    if (redactPii(c.content) !== c.content) candidates++;
  }
  if (candidates === 0) {
    toast("No PII found in existing clips");
    return;
  }
  const msg =
    `Redact ${candidates} clip${candidates === 1 ? "" : "s"} that still contain ` +
    `PII (emails, phones, cards, secrets)?\n\nOriginals are kept locally — ` +
    `you can unmask any clip later from its detail view.`;
  if (!confirm(msg)) return;
  const res = await retroactiveAutoRedact();
  if (res.redacted > 0) {
    void appendPrivacyAuditEntry({
      kind: "retro-redact",
      clipId: "",
      detail: `${res.redacted} clip${res.redacted === 1 ? "" : "s"} · scanned ${res.scanned}`,
    });
  }
  toast(
    `Redacted ${res.redacted} · scanned ${res.scanned}` +
      (res.alreadyRedacted > 0 ? ` · ${res.alreadyRedacted} already redacted` : ""),
  );
  await render();
}

function renderPalette(): void {
  const actions = buildPaletteActions();
  paletteResults = rankActions(actions, paletteInput.value);
  if (paletteResults.length === 0) {
    paletteListEl.innerHTML = `<div class="palette-empty">No actions match.</div>`;
    return;
  }
  if (paletteIndex >= paletteResults.length) paletteIndex = 0;
  // Group by `action.group`, preserving the rank order *within* each group.
  const groups = new Map<string, typeof paletteResults>();
  for (const m of paletteResults) {
    const g = m.action.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(m);
  }
  const rows: string[] = [];
  let flatIdx = 0;
  for (const [groupName, members] of groups) {
    rows.push(`<div class="palette-group-head">${escapeHtml(groupName)}</div>`);
    for (const m of members) {
      const active = flatIdx === paletteIndex;
      const labelHtml = boldedLabel(m.action.label, m.hits);
      const hint = m.action.hint
        ? `<span class="palette-hint">${escapeHtml(m.action.hint)}</span>`
        : "";
      const shortcut = m.action.shortcut
        ? `<span class="palette-shortcut"><kbd>${escapeHtml(m.action.shortcut)}</kbd></span>`
        : "";
      rows.push(
        `<div class="palette-row${active ? " active" : ""}" data-i="${flatIdx}" role="option">` +
          `<span class="palette-label">${labelHtml}</span>${hint}${shortcut}` +
          `</div>`,
      );
      flatIdx++;
    }
  }
  paletteListEl.innerHTML = rows.join("");
  // Scroll active row into view on arrow-nav.
  const activeEl = paletteListEl.querySelector(".palette-row.active") as HTMLElement | null;
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
}

async function runActiveAction(): Promise<void> {
  const m = paletteResults[paletteIndex];
  if (!m) return;
  try {
    await m.action.run();
  } catch (e) {
    console.error("[context-clipboard] palette action failed", e);
    toast("Action failed", "error");
  }
}

paletteInput.addEventListener("input", () => {
  paletteIndex = 0;
  renderPalette();
});

paletteInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    paletteIndex = Math.min(paletteResults.length - 1, paletteIndex + 1);
    renderPalette();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    paletteIndex = Math.max(0, paletteIndex - 1);
    renderPalette();
  } else if (e.key === "Enter") {
    e.preventDefault();
    void runActiveAction();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closePalette();
  }
});

paletteListEl.addEventListener("click", (e) => {
  const row = (e.target as HTMLElement).closest(".palette-row") as HTMLElement | null;
  if (!row) return;
  const i = Number(row.dataset.i);
  if (Number.isFinite(i)) {
    paletteIndex = i;
    void runActiveAction();
  }
});

paletteEl.addEventListener("click", (e) => {
  if (e.target === paletteEl) closePalette();
});

paletteEl
  .querySelector(".palette-card")
  ?.addEventListener("click", (e) => e.stopPropagation());

// Keyboard --------------------------------------------------------------
document.addEventListener("keydown", async (e) => {
  // Palette takes priority — it has its own input that captures keys, but
  // we still let Cmd/Ctrl+K toggle it from anywhere (incl. inside the
  // palette itself, so the same chord closes it).
  const isPaletteChord =
    e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
  if (isPaletteChord) {
    e.preventDefault();
    togglePalette();
    return;
  }
  if (!paletteEl.hidden) {
    // Esc + arrows + Enter are handled by the input listener; everything
    // else falls through to native input behavior. Stop here so the rest
    // of the global handler doesn't react to typing inside the palette.
    return;
  }
  // Cheatsheet is always the first thing we check so `?` works globally,
  // and Esc closes it before any other panel reacts to Esc.
  if (!cheatsheetEl.hidden) {
    if (e.key === "Escape" || e.key === "?") {
      e.preventDefault();
      closeCheatsheet();
    }
    return;
  }
  if (!dupesPanel.hidden) {
    // Dupes review modal: Esc closes; everything else falls through to
    // the input/button handlers. Slots in BETWEEN cheatsheet and the
    // detail/settings panels so a Cmd+K → "Review duplicates" flow can
    // be dismissed without nuking another open panel underneath.
    if (e.key === "Escape") {
      e.preventDefault();
      closeDupesPanel();
    }
    return;
  }
  if (!noteComposer.hidden) {
    // Note composer: Esc cancels. Cmd/Ctrl+Enter save is handled by the
    // textarea's own keydown listener so the global handler doesn't
    // need to know about it. Return early so the rest of the global
    // handler doesn't react to typing inside the dialog.
    if (e.key === "Escape") {
      e.preventDefault();
      closeNoteComposer();
    }
    return;
  }
  if (e.key === "?") {
    // Shift+/ is harmless to swallow even inside the search box.
    e.preventDefault();
    toggleCheatsheet();
    return;
  }
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
  } else if (e.key.toLowerCase() === "a" && (e.metaKey || e.ctrlKey) && !inSearch) {
    // Select all currently-visible clips. Skipped inside the search box so
    // it preserves the native text-select-all there. Anywhere else in the
    // popup, this is the bulk-action accelerator.
    if (currentClips.length === 0) return;
    e.preventDefault();
    const before = selectedIds.size;
    const added = selectAllVisible();
    if (added > 0) toast(`Selected ${selectedIds.size}`);
    else if (before > 0) toast("All visible already selected");
    await render();
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
  // If a reveal countdown is running, restoring the redacted view is the
  // safer default — we don't want a stray click to permanently unmask.
  if (revealTimer != null) {
    endRevealOnce();
    return;
  }
  const action = c.redacted ? "unredactClip" : "redactClip";
  if (action === "redactClip") {
    const confirmMsg =
      "Redact this clip? Emails, phones, cards, and secrets will be masked. You can unmask later — the original is kept locally.";
    if (!confirm(confirmMsg)) return;
  }
  if (action === "unredactClip") {
    const confirmMsg =
      "Permanently restore original? For a temporary view, use the eye button (10-second reveal).";
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
          detailBody.innerHTML = `<pre>${highlightHtml(updated.content, currentNeedle)}</pre>`;
        }
        detailTags.value = updated.tags.join(", ");
        renderRedactButton(updated);
      }
      // Privacy audit: record once the underlying op succeeds. Fire-
      // and-forget — failures inside the audit writer are swallowed
      // there, never block the user.
      void appendPrivacyAuditEntry({
        kind: action === "redactClip" ? "redact" : "unredact",
        clipId: detailId!,
        host: hostFrom(c.source.url) || undefined,
      });
      toast(action === "redactClip" ? "Redacted" : "Restored");
      await render();
    },
  );
});

// Reveal-once mode -----------------------------------------------------
//
// Show a redacted clip's original content for ~10s with a visible
// countdown, then snap back. The DB is never touched — the `redacted`
// flag stays on; only the popup DOM changes. We tear down on any of:
// timer expiry, manual close, opening a different clip, or popup close.

const REVEAL_MS = 10_000;
let revealTimer: number | null = null;
let revealInterval: number | null = null;

function endRevealOnce(): void {
  if (revealTimer != null) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  if (revealInterval != null) {
    clearInterval(revealInterval);
    revealInterval = null;
  }
  detailBody.classList.remove("revealed");
  // Re-render the body from the (still-redacted) DB content. Don't await
  // — this is a UI-side cleanup; if the DB call fails, the worst case is
  // a stale view that the user can refresh by closing/reopening.
  if (detailId) {
    void getClip(detailId).then((updated) => {
      if (!updated) return;
      if (updated.kind === "image") {
        detailBody.innerHTML = `<img src="${updated.content}" alt="" />`;
      } else {
        detailBody.innerHTML = `<pre>${highlightHtml(updated.content, currentNeedle)}</pre>`;
      }
      renderRedactButton(updated);
    });
  }
}

async function startRevealOnce(): Promise<void> {
  if (!detailId) return;
  const c = await getClip(detailId);
  if (!c || !c.redacted || c.originalContent == null) {
    toast("Nothing to reveal", "error");
    return;
  }
  // Cancel any prior reveal first so two quick clicks don't stack timers.
  endRevealOnce();
  // Swap the body to the original with a clear "revealed" treatment.
  // A wrapping span carries the countdown so the user always knows when
  // it'll snap back.
  detailBody.classList.add("revealed");
  const countdownId = "reveal-countdown";
  detailBody.innerHTML =
    `<div class="reveal-banner"><span class="reveal-dot"></span> Revealed · snaps back in <span id="${countdownId}">10</span>s</div>` +
    `<pre>${highlightHtml(c.originalContent, currentNeedle)}</pre>`;
  let remaining = Math.ceil(REVEAL_MS / 1000);
  revealInterval = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    const el = document.getElementById(countdownId);
    if (el) el.textContent = String(remaining);
  }, 1000) as unknown as number;
  revealTimer = setTimeout(() => {
    endRevealOnce();
    toast("Snapped back");
  }, REVEAL_MS) as unknown as number;
}

detailReveal.addEventListener("click", () => void startRevealOnce());

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

detailExpiry.addEventListener("change", async () => {
  if (!detailId) return;
  const raw = detailExpiry.value.trim();
  // Selecting any preset = TTL from *now*. Selecting "" = clear TTL.
  // We never use the dropdown as a "show current value" — it's purely an
  // action affordance, so we reset to "" after every change to mirror
  // openDetail()'s baseline.
  const id = detailId;
  const expiresAt = raw ? Date.now() + Number(raw) : null;
  await new Promise<void>((resolve) => {
    api.runtime.sendMessage(
      { type: "cc-rpc", action: "setClipExpiry", payload: { id, expiresAt } },
      () => resolve(),
    );
  });
  const updated = await getClip(id);
  if (updated) renderExpiryRow(updated);
  detailExpiry.value = "";
  void appendPrivacyAuditEntry({
    kind: raw ? "set-ttl" : "clear-ttl",
    clipId: id,
    host: hostFrom(updated?.source.url) || undefined,
    detail: raw ? `in ${formatDuration(Number(raw))}` : undefined,
  });
  toast(raw ? "TTL set" : "TTL cleared");
  await render();
});

detailOcr.addEventListener("click", async () => {
  toast("OCR coming in v0.5.0", "error");
});

/**
 * Re-fetch the source image for the open detail clip. The background
 * does the fetch (service worker has the right fetch context + dimension
 * probe) and returns the updated clip. We swap the detail body's image
 * in place and re-render the list so the thumbnail picks up the new
 * data + dimensions. The button disables briefly to debounce double-clicks
 * while a slow image is fetching.
 *
 * Failure modes (404, network down, CORS) surface as a one-line toast
 * with the underlying error — no silent no-ops.
 */
async function refetchDetailImage(): Promise<void> {
  if (!detailId) return;
  const id = detailId;
  const beforeLabel = detailRefetch.title;
  detailRefetch.disabled = true;
  detailRefetch.title = "Re-fetching…";
  detailRefetch.classList.add("refetching");
  try {
    const resp = await new Promise<{ ok: boolean; clip?: ClipItem; error?: string }>(
      (resolve) => {
        api.runtime.sendMessage(
          { type: "cc-rpc", action: "refetchImage", payload: { id } },
          (r) => resolve(r),
        );
      },
    );
    if (!resp?.ok || !resp.clip) {
      toast(resp?.error || "Re-fetch failed", "error");
      return;
    }
    const c = resp.clip;
    // Swap the body image and update the meta row in place. We don't
    // call openDetail again because that would scroll-reset the panel
    // and steal focus.
    detailBody.innerHTML = `<img src="${c.content}" alt="" />`;
    detailImageRow.hidden = false;
    const dims = c.width && c.height ? `${c.width}×${c.height} px` : "unknown size";
    detailImageInfo.textContent = `${dims} · ${formatBytes(c.bytes)} · ${c.mime || "image/png"}`;
    toast(
      c.width && c.height
        ? `Re-fetched · ${c.width}×${c.height}`
        : "Re-fetched",
    );
    await render();
  } finally {
    detailRefetch.disabled = false;
    detailRefetch.title = beforeLabel;
    detailRefetch.classList.remove("refetching");
  }
}

detailRefetch.addEventListener("click", () => void refetchDetailImage());

/**
 * Scrub the source metadata off the open clip: wipe URL, title,
 * nearby-text, favicon — keep the content, tags, pin, OCR. Tags the
 * clip `scrubbed` so it's findable later. Confirms first because the
 * metadata can't be reconstructed (the original page URL is gone for
 * good unless the user explicitly remembers it).
 *
 * Idempotent: scrubbing an already-scrubbed clip is a no-op toast.
 * After a successful scrub, we re-open the detail to repaint the
 * meta rows in their cleared state — easier than reaching into the
 * DOM ourselves and keeps openDetail() the single source of truth.
 */
async function scrubDetailOrigin(): Promise<void> {
  if (!detailId) return;
  const c = await getClip(detailId);
  if (!c) return;
  const hadAny =
    !!c.source.url ||
    !!c.source.title ||
    !!c.source.nearbyText ||
    !!c.source.favicon;
  if (!hadAny) {
    toast("Nothing to scrub");
    return;
  }
  // Confirm with the concrete loss so users know what's about to go.
  const bits: string[] = [];
  if (c.source.url) bits.push("URL");
  if (c.source.title) bits.push("title");
  if (c.source.nearbyText) bits.push("context");
  if (c.source.favicon) bits.push("favicon");
  const msg =
    `Scrub origin?\n\nThis permanently removes ${bits.join(" + ")} from this clip — ` +
    `the content stays. Can't be undone (the original page is forgotten).`;
  if (!confirm(msg)) return;
  const ok = await scrubClipOrigin(c.id);
  if (!ok) {
    toast("Couldn't scrub clip", "error");
    return;
  }
  void appendPrivacyAuditEntry({
    kind: "scrub-origin",
    clipId: c.id,
    host: hostFrom(c.source.url) || undefined,
    detail: bits.join("+"),
  });
  toast(`Scrubbed origin · ${bits.join(", ")} cleared`);
  // Re-open so the meta rows render in their cleared state.
  await openDetail(c.id);
  await render();
}

detailScrub.addEventListener("click", () => void scrubDetailOrigin());

/**
 * Flip the archive bit on the open clip. Archived clips disappear from
 * the default list (the parser drops them) so we re-render and close
 * the detail panel so the user lands back on the visible list instead
 * of a now-hidden clip. Unarchiving leaves detail open + bumps
 * lastSeenAt so the clip surfaces at the top.
 */
async function toggleDetailArchive(): Promise<void> {
  if (!detailId) return;
  const id = detailId;
  const c = await getClip(id);
  const next = await toggleArchive(id);
  if (next == null) {
    toast("Clip not found", "error");
    return;
  }
  void appendPrivacyAuditEntry({
    kind: next ? "archive" : "unarchive",
    clipId: id,
    host: hostFrom(c?.source.url) || undefined,
  });
  if (next) {
    toast("Archived — find it with is:archived");
    closeDetail();
    await render();
  } else {
    toast("Pulled back into the list");
    await openDetail(id);
    await render();
  }
}

detailArchive.addEventListener("click", () => void toggleDetailArchive());

// Send-to sub-menu --------------------------------------------------
//
// Pure-URL builders + clipboard writes — see lib/send-to.ts. The
// menu lives as a floating dropdown anchored to the detail header
// (right-aligned over the action row) so it doesn't fight with the
// detail body's scroll. Closes on Esc / outside-click / item-click,
// re-opens fresh each time so action availability tracks the
// current clip.

function closeSendMenu(): void {
  detailSendMenu.hidden = true;
  detailSendMenu.innerHTML = "";
  document.removeEventListener("mousedown", onSendMenuOutside, true);
  document.removeEventListener("keydown", onSendMenuKey, true);
}

function onSendMenuOutside(e: MouseEvent): void {
  const t = e.target as Node | null;
  if (!t) return;
  if (detailSendMenu.contains(t) || detailSend.contains(t)) return;
  closeSendMenu();
}

function onSendMenuKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    closeSendMenu();
    detailSend.focus();
  }
}

async function openSendMenu(): Promise<void> {
  if (!detailId) return;
  if (!detailSendMenu.hidden) {
    closeSendMenu();
    return;
  }
  const c = await getClip(detailId);
  if (!c) return;
  const actions = buildSendActions({
    id: c.id,
    kind: c.kind,
    content: c.content,
    preview: c.preview,
    source: c.source,
  });
  const available = actions.filter((a) => a.available);
  if (available.length === 0) {
    toast("Nothing to send for this clip");
    return;
  }
  detailSendMenu.innerHTML = available
    .map((a) => {
      const hint = a.hint ? `<span class="send-row-hint">${escapeHtml(a.hint)}</span>` : "";
      const verb = a.kind === "copy" ? "copy" : "open";
      return (
        `<button type="button" class="send-row" role="menuitem" data-id="${escapeHtml(a.id)}" data-verb="${verb}">` +
        `<span class="send-row-label">${escapeHtml(a.label)}</span>${hint}` +
        `</button>`
      );
    })
    .join("");
  detailSendMenu.hidden = false;
  // Defer outside-click bind to the next tick so the click that
  // OPENED the menu (on the button) doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("mousedown", onSendMenuOutside, true);
    document.addEventListener("keydown", onSendMenuKey, true);
  }, 0);
}

detailSend.addEventListener("click", () => void openSendMenu());

detailSendMenu.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest(".send-row") as HTMLButtonElement | null;
  if (!btn || !detailId) return;
  const id = btn.dataset.id || "";
  const c = await getClip(detailId);
  if (!c) {
    closeSendMenu();
    return;
  }
  const actions = buildSendActions({
    id: c.id,
    kind: c.kind,
    content: c.content,
    preview: c.preview,
    source: c.source,
  });
  const action: SendAction | undefined = actions.find((a) => a.id === id);
  closeSendMenu();
  if (!action || !action.payload || !action.available) {
    toast("Action unavailable", "error");
    return;
  }
  if (action.kind === "nav") {
    try {
      // mailto: needs api.tabs.create as well — Chrome routes it to
      // the user's default mail handler. Fall back to window.open for
      // Firefox / contexts where tabs.create is unavailable.
      if (api.tabs?.create) {
        await api.tabs.create({ url: action.payload });
      } else {
        window.open(action.payload, "_blank");
      }
    } catch {
      window.open(action.payload, "_blank");
    }
    return;
  }
  // kind: "copy" — clipboard write. Mirror existing copy-paths
  // (popup writes natively because the service worker can't reach
  // navigator.clipboard).
  try {
    await navigator.clipboard.writeText(action.payload);
    toast(`Copied ${action.label.toLowerCase()}`);
  } catch (err) {
    console.error(err);
    toast("Clipboard write failed", "error");
  }
});

/**
 * Expand/collapse the nearby-context block in the detail meta row when
 * it carries a "Show more" affordance. We swap the DOM payload in
 * place using the `data-full` cache the openDetail() path stamped on,
 * so toggling doesn't need to re-query the DB. Idempotent — clicking
 * "Show less" re-runs openDetail's collapsed branch.
 */
detailNearby.addEventListener("click", (e) => {
  const target = e.target as HTMLElement | null;
  if (!target || target.dataset.act === undefined) return;
  if (target.dataset.act === "expand") {
    const full = detailNearby.dataset.full || "";
    if (!full) return;
    detailNearby.classList.add("expanded");
    detailNearby.innerHTML =
      `<span class="nearby-text">${escapeHtml(full)}</span> ` +
      `<button class="nearby-toggle" type="button" data-act="collapse">Show less</button>`;
  } else if (target.dataset.act === "collapse") {
    // Re-derive the collapsed payload from the cached full text so we
    // don't need to round-trip the DB.
    const full = detailNearby.dataset.full || "";
    const COLLAPSE_AT = 360;
    const peek = full.slice(0, COLLAPSE_AT).replace(/\s+\S*$/, "").trimEnd();
    detailNearby.classList.remove("expanded");
    detailNearby.innerHTML =
      `<span class="nearby-text">${escapeHtml(peek)}…</span> ` +
      `<button class="nearby-toggle" type="button" data-act="expand">Show more (+${full.length - peek.length})</button>`;
  }
});

// Click any "Similar" row to jump to that clip's detail view. We don't
// add it to the visible-list activeIndex because the similar item may
// not be in the currently-filtered window — openDetail() handles the
// orphan case via updateDetailNav (prev/next disable, position pill
// hides). Esc still closes back to the original filtered list.
detailSimilar.addEventListener("click", async (e) => {
  const row = (e.target as HTMLElement).closest(".similar-row") as HTMLElement | null;
  if (!row) return;
  const id = row.dataset.id;
  if (!id) return;
  await openDetail(id);
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

sBlurPreviews.addEventListener("change", () => {
  // Live preview so the user sees the effect on the (settings panel
  // hides the list but you can already see the badge appear / the panel
  // background dim). Settings write still happens on Save/Esc/back.
  applyBlurMode(sBlurPreviews.checked);
});

sCompactRows.addEventListener("change", () => {
  // Same live-preview pattern as blur — flip the body class so the
  // toggle telegraphs the result. The actual setting persists on
  // Save / Esc / back via saveSettingsFromForm.
  applyCompactRows(sCompactRows.checked);
});

retroRedactBtn.addEventListener("click", () => void runRetroactiveAutoRedact());

encryptToggle.addEventListener("change", () => {
  encryptPassRow.hidden = !encryptToggle.checked;
  if (encryptToggle.checked) {
    setTimeout(() => exportPass.focus(), 0);
  } else {
    exportPass.value = "";
  }
});

/**
 * Read the export filter form into a typed spec. Empty / disabled fields
 * become undefined so `describeExportFilter` says "All clips" until the
 * user actually picks something.
 */
function readExportFilter(): ExportFilter {
  return {
    pinnedOnly: expPinned.checked || undefined,
    redactedOnly: expRedactedOnly.checked || undefined,
    skipImages: expSkipImages.checked || undefined,
    tag: expTag.value.trim() || undefined,
    afterDate: expAfter.value || undefined,
    beforeDate: expBefore.value || undefined,
  };
}

function updateExportFilterHint(): void {
  const f = readExportFilter();
  exportFilterHint.textContent = describeExportFilter(f);
}

for (const el of [expPinned, expRedactedOnly, expSkipImages, expTag, expAfter, expBefore]) {
  el.addEventListener("change", updateExportFilterHint);
  el.addEventListener("input", updateExportFilterHint);
}

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
  const filter = readExportFilter();
  api.runtime.sendMessage(
    { type: "cc-rpc", action: "export" },
    async (resp: { ok: boolean; data?: { clips?: ClipItem[] } & Record<string, unknown> }) => {
      if (!resp?.ok || !resp.data) return toast("Export failed", "error");
      try {
        const allClips = resp.data.clips || [];
        const filteredClips = applyExportFilter(allClips, filter);
        if (filteredClips.length === 0) {
          toast("Filter matched 0 clips — nothing exported", "error");
          return;
        }
        // Replace the clips in the payload so JSON exports respect the
        // filter too. Spread to avoid mutating the response from background.
        const payload = { ...resp.data, clips: filteredClips };
        let blobText: string;
        let suffix = "";
        let mime = mimeFor(format);
        if (format === "markdown") {
          blobText = toMarkdown(filteredClips);
        } else if (format === "csv") {
          blobText = toCsv(filteredClips);
        } else if (wantEncrypt) {
          const env = await encryptJson(payload, pass);
          blobText = JSON.stringify(env, null, 2);
          suffix = "-encrypted";
          mime = "application/json";
        } else {
          blobText = JSON.stringify(payload, null, 2);
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
        const subset =
          filteredClips.length === allClips.length
            ? `${filteredClips.length}`
            : `${filteredClips.length} of ${allClips.length}`;
        toast(`${label} · ${subset} clip${filteredClips.length === 1 ? "" : "s"}`);
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
      (resp: { ok: boolean; imported?: number; skippedId?: number; skippedHash?: number; auditMerged?: number; error?: string }) => {
        if (resp?.ok) {
          const imp = resp.imported || 0;
          const skipId = resp.skippedId || 0;
          const skipHash = resp.skippedHash || 0;
          const auditMerged = resp.auditMerged || 0;
          // Build a concise summary: lead with imported count, then
          // surface dedup outcomes ONLY when they happened so the
          // common case ("clean import") stays a one-word toast.
          const parts = [`Imported ${imp}`];
          if (skipId > 0 || skipHash > 0) {
            const dedupBits: string[] = [];
            if (skipHash > 0) dedupBits.push(`${skipHash} merged`);
            if (skipId > 0) dedupBits.push(`${skipId} already present`);
            parts.push(`(${dedupBits.join(" · ")})`);
          }
          if (auditMerged > 0) {
            parts.push(`+ ${auditMerged} audit entr${auditMerged === 1 ? "y" : "ies"}`);
          }
          toast(parts.join(" "));
          // Audit log changed under us if we imported any entries —
          // re-render the section so the Settings panel reflects the
          // merged ring without a manual refresh.
          if (auditMerged > 0) void renderAudit();
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
  // Adapt the select-all button to act as a deselect-all when every
  // currently-visible clip is already in the selection. Tooltip clarifies.
  const allSelected =
    currentClips.length > 0 &&
    currentClips.every((c) => selectedIds.has(c.id));
  bulkSelectAll.title = allSelected
    ? "Deselect all visible"
    : `Select all visible (${currentClips.length})`;
  bulkSelectAll.classList.toggle("active", allSelected);
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

/**
 * Select every clip in the current filtered list. Returns the count
 * selected. Used by the footer "Select all (N)" affordance, the bulk
 * bar's select-all toggle, and the ⌘/Ctrl+A shortcut.
 *
 * Behavior is idempotent additive — items not in the current filter stay
 * in the selection if they were already there (so applying a filter,
 * select-all-ing, then changing the filter doesn't silently forget
 * earlier work).
 */
function selectAllVisible(): number {
  let added = 0;
  for (const c of currentClips) {
    if (!selectedIds.has(c.id)) {
      selectedIds.add(c.id);
      added++;
    }
  }
  updateBulkBar();
  return added;
}

/** Remove every currently-visible clip from the selection. */
function deselectAllVisible(): number {
  let removed = 0;
  for (const c of currentClips) {
    if (selectedIds.has(c.id)) {
      selectedIds.delete(c.id);
      removed++;
    }
  }
  updateBulkBar();
  return removed;
}

bulkSelectAll.addEventListener("click", async () => {
  const allSelected =
    currentClips.length > 0 &&
    currentClips.every((c) => selectedIds.has(c.id));
  if (allSelected) {
    const n = deselectAllVisible();
    if (n > 0) toast(`Deselected ${n}`);
  } else {
    const n = selectAllVisible();
    if (n > 0) toast(`Selected ${selectedIds.size}`);
  }
  await render();
});

selectAllFilteredBtn.addEventListener("click", async () => {
  if (currentClips.length === 0) return;
  const n = selectAllVisible();
  if (n > 0) toast(`Selected ${selectedIds.size}`);
  await render();
});

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
  applyBlurMode(s.blurPreviews);
  applyCompactRows(s.compactRows);
  // Restore the persisted sort mode BEFORE the first render so the list
  // doesn't flash in the wrong order.
  listSort = await getListSort();
  sortModeEl.value = listSort;
  sortModeEl.classList.toggle("changed", listSort !== "recent");
  sortModeEl.title = `Sort: ${sortLabel(listSort)}`;
  await refreshSavedSearches();
  await refreshSearchHistory();
  await render();
  searchEl.focus();
})();

sortModeEl.addEventListener("change", async () => {
  const next = sortModeEl.value as SortMode;
  listSort = next;
  sortModeEl.classList.toggle("changed", next !== "recent");
  sortModeEl.title = `Sort: ${sortLabel(next)}`;
  await setListSort(next);
  await render();
  // Lightweight feedback so the action feels confirmed, especially when
  // the new ordering doesn't visibly shuffle (e.g. unfiltered list with
  // few clips already in lastSeenAt order).
  toast(`Sort: ${sortLabel(next)}`);
});

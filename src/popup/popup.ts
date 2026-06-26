/// <reference types="chrome" />
import {
  listClips,
  togglePin,
  setPinned,
  getClip,
  updateTags,
  getSettings,
  saveSettings,
  trashClip,
  listTrash,
  restoreClip,
  emptyTrash,
  trashCount,
  restoreAllFromHost,
  purgeTrashByIds,
  listSavedSearches,
  addSavedSearch,
  removeSavedSearch,
  renameSavedSearch,
  reorderSavedSearches,
  listSearchHistory,
  pushSearchHistory,
  clearSearchHistory,
  reorderSearchHistory,
  getListSort,
  setListSort,
  getDetailWrap,
  setDetailWrap,
  setWrapOverride,
  setLangOverride,
  mergeDuplicatesByHash,
  findDuplicateGroups,
  mergeDuplicateGroup,
  scrubClipOrigin,
  retroactiveAutoRedact,
  findSimilarClips,
  toggleArchive,
  toggleLock,
  setLocked,
  setClipNote,
  appendPrivacyAuditEntry,
  listPrivacyAudit,
  clearPrivacyAudit,
  removePrivacyAuditEntry,
  trimPrivacyAuditToCap,
  usagesForRules,
  matchesHostPattern,
  getSendToLast,
  setSendToLast,
  getLastSavedSearchId,
  setLastSavedSearchId,
  type TrashedClip,
  type DuplicateGroup,
  type PrivacyAuditEntry,
} from "../lib/db";
import type { ClipItem, ClipKind, Settings, SavedSearch, SiteRule, SortMode } from "../lib/types";
import { timeAgo, hostFrom, escapeHtml, highlightHtml, isValidPattern, findCustomPatternHits, redactPii, detectCodeLang } from "../lib/util";
import { icons, clipKindIcon } from "../lib/icons";
import {
  stringifyRules,
  parseRulesJson,
  mergeRules,
  type MergeMode,
} from "../lib/site-rules-io";
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
import { buildNotePrefill, shouldApplyNotePrefill } from "../lib/note-prefill";
import { buildSendActions, reorderSendActionsByLast, type SendAction } from "../lib/send-to";
import { buildBulkPreviewMessage } from "../lib/bulk-preview";
import { groupAuditByDay } from "../lib/audit-rollup";
import { groupTrashByHost } from "../lib/trash-host-rollup";
import { extractHostPattern, looksLikeUrl } from "../lib/host-pattern";
import { computeTtlBanner } from "../lib/ttl-banner";
import {
  buildAuditExport,
  stringifyAuditExport,
  auditExportFilename,
} from "../lib/audit-export-json";
import { findLastForgottenHost, formatAge } from "../lib/last-forgotten-host";
import { buildStorageDeltaLabel } from "../lib/bulk-storage-delta";
import { precheckAuditJump, describeAuditJump } from "../lib/detail-audit-jump";
import { nextArchivedClipId, prevArchivedClipId, describeArchiveCycle, describeArchiveCycleReverse } from "../lib/next-archived";
import { buildAuditChipBody } from "../lib/audit-chip-labels";
import {
  countTemplateTokens,
  formatTokenPillLabel,
  formatTokenPillTooltip,
} from "../lib/template-token-count";
import {
  summarizeTrashByKind,
  planTrashPurge,
  formatPurgeConfirm,
  formatPurgeButtonLabel,
} from "../lib/trash-purge-kind";
import {
  buildSimilarNav,
  stepSimilarNav,
  formatSimilarPosLabel,
  formatTraverseButtonLabel,
  isInSimilarNav,
  syncSimilarNav,
  type SimilarNav,
} from "../lib/similar-nav";
import { formatContentStats, contentStatsClipboard, formatContentStatsCopyToast, formatContentStatsMarkdown } from "../lib/content-stats";
import { formatFocusPosition } from "../lib/focus-position";
import { computeScrollEdges } from "../lib/scroll-shadow";
import { computeRange, idsForRange, rangeIdsToAdd } from "../lib/range-select";
import { peekTooltip, linkPeekTooltip } from "../lib/list-peek";
import { computeDayHeaders } from "../lib/day-group";
import { effectiveWrap, hasWrapOverride, wrapButtonTitle } from "../lib/wrap-pref";
import { parseTags, removeTag, serializeTags } from "../lib/tag-chips";
import {
  nextChipFocusIndex,
  focusIndexAfterRemove,
  isChipNavKey,
  isChipRemoveKey,
} from "../lib/tag-chip-nav";
import { highlightCode } from "../lib/code-highlight";
import {
  effectiveLang,
  selectValueFor,
  normalizeLangChoice,
  langControlTitle,
  langLabel,
  LANG_OPTIONS,
  OVERRIDE_AUTO,
  OVERRIDE_NONE,
} from "../lib/lang-override";
import {
  resolveDensity,
  densityBodyClass,
  densityToCompactBool,
  densityLabel,
  type Density,
} from "../lib/density";
import { nextDetailIndex, formatWrapToast } from "../lib/detail-nav";
import {
  planBulkCopy,
  formatBulkCopyToast,
  formatBulkCopyButtonTitle,
} from "../lib/bulk-clipboard";
import {
  planBulkMarkdown,
  formatBulkMarkdownToast,
  formatBulkMarkdownButtonTitle,
} from "../lib/bulk-markdown";
import {
  parseQuickCaptureUrl,
  buildQuickCaptureTags,
} from "../lib/url-quick-capture";
import {
  previewClipsForRules,
  formatPreviewCardTitle,
  formatPreviewRowTooltip,
} from "../lib/rule-preview";
import {
  partitionLocked,
  formatLockConfirm,
  formatLockedClipConfirm,
} from "../lib/clip-lock";
import {
  decideBulkLockIntent,
  countBulkLockWrites,
  formatBulkLockToast,
  formatBulkLockButtonTitle,
} from "../lib/bulk-lock";
import {
  planBulkLockPin,
  isBulkLockPinActionable,
  formatBulkLockPinToast,
  formatBulkLockPinButtonTitle,
} from "../lib/bulk-lockpin";
import { formatLockedSince } from "../lib/locked-since";
import { formatNoteUpdatedSince } from "../lib/note-updated-since";
import {
  bulkExportJson,
  bulkExportFilename,
  formatBulkExportToast,
  filterClipsByTag,
  formatBulkExportTagToast,
} from "../lib/bulk-export";
import {
  idsToPinForHost,
  availableToPin,
  matchedClipsForHost,
  formatPinFromHostLabel,
} from "../lib/host-pin";
import {
  idsToLockForHost,
  availableToLockHost,
  matchedClipsForHostLock,
  formatLockFromHostLabel,
} from "../lib/host-lock";
import {
  buildHostLockedPredicate,
  countHostLockedClips,
  autoLockedHostsForClips,
} from "../lib/host-locked";
import {
  buildHostRulePredicate,
  countHostRuleClips,
  flaggedHostsForClips,
} from "../lib/host-rule-flags";
import {
  idsToNoteForHost,
  matchedClipsForHostNote,
  planHostNote,
  formatNoteFromHostLabel,
  formatHostNoteToast,
} from "../lib/host-note";
import {
  recentlyLockedClips,
  countRecentlyLocked,
  formatRecentlyLockedLabel,
  RECENTLY_LOCKED_DEFAULT_WINDOW_MS,
} from "../lib/recently-locked";
import {
  recentlyNotedClips,
  formatRecentlyNotedLabel,
  RECENTLY_NOTED_DEFAULT_WINDOW_MS,
} from "../lib/recently-noted";
import {
  planBulkNote,
  formatBulkNoteToast,
  formatBulkNoteButtonTitle,
} from "../lib/bulk-note";
import {
  planTagFromNotes,
  mergedTagsForClip,
  isTagFromNotesActionable,
  formatTagFromNotesToast,
  formatTagFromNotesButtonTitle,
} from "../lib/tag-from-notes";
import {
  perClipActionForCombo,
  planTagFromNotesAndClear,
  isTagFromNotesAndClearActionable,
  formatTagFromNotesAndClearToast,
  formatTagFromNotesAndClearButtonTitle,
} from "../lib/tag-from-notes-clear";
import {
  discoverHashtagsInNotes,
  formatHashtagDiscoveryToast,
  formatHashtagDiscoveryHint,
  hashtagFilterActionFor,
} from "../lib/hashtag-discovery";
import {
  planNoteHashtagPromote,
  isNoteHashtagPromoteActionable,
  formatNoteHashtagPromoteLabel,
  formatNoteHashtagPromoteTooltip,
  formatNoteHashtagPromoteToast,
} from "../lib/note-hashtag-promote";
import {
  stripHashtagsFromNote,
  noteHasStrippableHashtags,
  countStrippableHashtagsInNote,
  formatStripHashtagsChipLabel,
  formatStripHashtagsChipTooltip,
  formatStripHashtagsToast,
} from "../lib/note-hashtag-strip";
import {
  planBulkStripHashtags,
  perClipActionForStrip,
  isBulkStripHashtagsActionable,
  formatBulkStripHashtagsToast,
  formatBulkStripHashtagsButtonTitle,
} from "../lib/bulk-strip-hashtags";
import {
  planPromoteAndStrip,
  isPromoteAndStripActionable,
  formatPromoteAndStripChipLabel,
  formatPromoteAndStripChipTooltip,
  formatPromoteAndStripToast,
} from "../lib/note-promote-strip";
import {
  sanitizeClipNote,
  hasClipNote,
  CLIP_NOTE_MAX_LEN,
} from "../lib/clip-note";
import {
  findLiveRecaptureForTrash,
  formatTrashRecaptureTooltip,
} from "../lib/trash-match";

const api: typeof chrome =
  // @ts-expect-error firefox global
  (typeof browser !== "undefined" ? browser : chrome) as typeof chrome;

// Element refs ----------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const listEl = $("list");
const searchEl = $<HTMLInputElement>("search");
const countEl = $("count");
const focusPosEl = $("focus-pos");
const clearBtn = $<HTMLButtonElement>("clear");
const pinnedToggle = $<HTMLButtonElement>("pinned-toggle");
const settingsBtn = $<HTMLButtonElement>("settings-btn");
const noteBtn = $<HTMLButtonElement>("note-btn");
const quickCaptureBtn = $<HTMLButtonElement>("quick-capture-btn");
const linkCaptureBtn = $<HTMLButtonElement>("link-capture-btn");
const tagChipsEl = $("tag-chips");
const quickChipsEl = $("quick-chips");
const savedSearchesEl = $("saved-searches");
const searchHistoryEl = $("search-history");
const saveSearchBtn = $<HTMLButtonElement>("save-search-btn");
const searchClearBtn = $<HTMLButtonElement>("search-clear-btn");
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
const detailWrap = $<HTMLButtonElement>("detail-wrap");
const detailRedact = $<HTMLButtonElement>("detail-redact");
const detailScrub = $<HTMLButtonElement>("detail-scrub");
const detailArchive = $<HTMLButtonElement>("detail-archive");
const detailSend = $<HTMLButtonElement>("detail-send");
const detailSendMenu = $("detail-send-menu");
const detailHistory = $<HTMLButtonElement>("detail-history");
const detailLock = $<HTMLButtonElement>("detail-lock");
const detailBody = $("detail-body");
const detailStats = $("detail-stats");
const detailLangRow = $("detail-lang-row");
const detailLang = $<HTMLSelectElement>("detail-lang");
const detailLangHint = $("detail-lang-hint");
const detailUrl = $<HTMLAnchorElement>("detail-url");
const detailTime = $("detail-time");
const detailHits = $("detail-hits");
const detailTags = $<HTMLInputElement>("detail-tags");
const detailTagChips = $("detail-tag-chips");
const detailNearby = $("detail-nearby");
const detailNearbyRow = $("detail-nearby-row");
const detailImageRow = $("detail-image-row");
const detailImageInfo = $("detail-image-info");
const detailOcrRow = $("detail-ocr-row");
const detailOcrText = $("detail-ocr-text");
const detailTemplateRow = $("detail-template-row");
const detailTemplateInfo = $("detail-template-info");
const detailLockedRow = $("detail-locked-row");
const detailLockedInfo = $("detail-locked-info");
const detailNote = $<HTMLTextAreaElement>("detail-note");
const detailNoteCount = $("detail-note-count");
const detailNoteStamp = $("detail-note-stamp");
const detailNotePromote = $<HTMLButtonElement>("detail-note-promote");
const detailNotePromoteStrip = $<HTMLButtonElement>("detail-note-promote-strip");
const detailNoteStrip = $<HTMLButtonElement>("detail-note-strip");
const detailNoteClear = $<HTMLButtonElement>("detail-note-clear");
const detailExpiry = $<HTMLSelectElement>("detail-expiry");
const detailExpiryHint = $("detail-expiry-hint");
const detailTtlBanner = $("detail-ttl-banner");
const detailTtlLabel = $("detail-ttl-label");
const detailTtlDetail = $("detail-ttl-detail");
const detailTtlPin = $<HTMLButtonElement>("detail-ttl-pin");
const detailTtlClear = $<HTMLButtonElement>("detail-ttl-clear");
const detailSimilarRow = $("detail-similar-row");
const detailSimilar = $("detail-similar");
const detailSimilarTraverse = $<HTMLButtonElement>("detail-similar-traverse");
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
const sDensity = $<HTMLSelectElement>("s-density");
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
const trashHostStrip = $("trash-host-strip");
const trashEmpty = $<HTMLButtonElement>("trash-empty");
const trashPurge24h = $<HTMLButtonElement>("trash-purge-24h");
const trashPurgeText = $<HTMLButtonElement>("trash-purge-text");
const trashPurgeImage = $<HTMLButtonElement>("trash-purge-image");
const auditSummary = $("audit-summary");
const auditList = $("audit-list");
const auditFiltersEl = $("audit-filters");
const auditScopeEl = $("audit-scope");
const auditWindowEl = $<HTMLSelectElement>("audit-window");
const auditClearBtn = $<HTMLButtonElement>("audit-clear");
const auditDownloadBtn = $<HTMLButtonElement>("audit-download");
const auditRetentionEl = $<HTMLSelectElement>("audit-retention");
const auditFootCap = $("audit-foot-cap");
const forgetHostInput = $<HTMLInputElement>("forget-host-input");
const forgetHostBtn = $<HTMLButtonElement>("forget-host-btn");
const siteRulesList = $("site-rules-list");
const siteRulesSummary = $("site-rules-summary");
const rulesExportBtn = $<HTMLButtonElement>("rules-export-btn");
const rulesImportBtn = $<HTMLButtonElement>("rules-import-btn");
const rulesIoPanel = $("rules-io-panel");
const rulesIoTitle = $("rules-io-title");
const rulesIoText = $<HTMLTextAreaElement>("rules-io-text");
const rulesIoApply = $<HTMLButtonElement>("rules-io-apply");
const rulesIoCopy = $<HTMLButtonElement>("rules-io-copy");
const rulesIoClose = $<HTMLButtonElement>("rules-io-close");
const rulesIoStatus = $("rules-io-status");
const ruleHostInput = $<HTMLInputElement>("rule-host");
const ruleHostSuggest = $("rule-host-suggest");
const ruleTagsInput = $<HTMLInputElement>("rule-tags");
const rulePatternsInput = $<HTMLTextAreaElement>("rule-patterns");
const rulePinInput = $<HTMLInputElement>("rule-pin");
const ruleLockInput = $<HTMLInputElement>("rule-lock");
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
const bulkStorageDelta = $("bulk-storage-delta");
const bulkSelectAll = $<HTMLButtonElement>("bulk-select-all");
const bulkPin = $<HTMLButtonElement>("bulk-pin");
const bulkLock = $<HTMLButtonElement>("bulk-lock");
const bulkLockPin = $<HTMLButtonElement>("bulk-lockpin");
const bulkTag = $<HTMLButtonElement>("bulk-tag");
const bulkNote = $<HTMLButtonElement>("bulk-note");
const bulkTagFromNotes = $<HTMLButtonElement>("bulk-tag-from-notes");
const bulkTagFromNotesClear = $<HTMLButtonElement>("bulk-tag-from-notes-clear");
const bulkStripHashtags = $<HTMLButtonElement>("bulk-strip-hashtags");
const bulkCopy = $<HTMLButtonElement>("bulk-copy");
const bulkCopyMd = $<HTMLButtonElement>("bulk-copy-md");
const bulkExport = $<HTMLButtonElement>("bulk-export");
const bulkExportTag = $<HTMLInputElement>("bulk-export-tag");
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
const noteTemplatePillRow = $("note-template-pill-row");
const linkComposer = $("link-composer");
const linkUrlInput = $<HTMLInputElement>("link-url");
const linkStatusEl = $("link-status");
const linkSaveBtn = $<HTMLButtonElement>("link-save");
const linkCancelBtn = $<HTMLButtonElement>("link-cancel");
const noteTemplatePill = $("note-template-pill");

// State ----------------------------------------------------------------
let currentKind: ClipKind | "all" = "all";
let pinnedOnly = false;
let activeTag: string | null = null;
let currentClips: ClipItem[] = [];
let activeIndex = 0;
// Whether the user is actively keyboard-navigating the clip list. Drives
// the footer "row N of M" position breadcrumb — it's signal a keyboard
// user wants but a mouse user would find noisy, so we only show it once
// a list-navigation key has been pressed, and hide it when focus moves
// to the search box or a panel opens.
let listKeyboardActive = false;
let detailId: string | null = null;
let ocrLoading: Promise<unknown> | null = null;
const selectedIds = new Set<string>();
// Range-select anchor: the list index of the user's most recent
// explicit single-toggle. Shift+Click extends a contiguous range
// from here to the clicked row. A plain/Cmd-click sets it; a
// shift-click leaves it put (so the user can re-extend from the
// same anchor, Finder/Gmail-style). Reset to null whenever the
// selection is fully cleared.
let selectionAnchor: number | null = null;
// Similar-traversal nav stack. When non-null, the detail-view's prev/next
// walk this list instead of `currentClips`. Set by "Open all (N)" from
// the Similar row; cleared when the user navigates to a clip outside
// the stack or returns to the list view.
let similarNav: SimilarNav | null = null;
let savedSearches: SavedSearch[] = [];
let searchHistory: string[] = [];
/**
 * Stable id of the most-recently-applied saved search, mirrored from
 * the meta store on popup boot + every apply path. Used by the Cmd+K
 * "Open my last saved search" command without an IDB read per palette
 * open. Empty string when nothing has been applied yet (or when the
 * referenced chip has since been deleted — the apply-handler clears
 * this on remove).
 */
let lastSavedSearchId: string = "";
/**
 * Most-recent forget-host audit entry, refreshed at popup boot and
 * after any forget-host action. The Cmd+K "Show last forgotten host"
 * command reads this synchronously so the palette open doesn't pay
 * a listPrivacyAudit() roundtrip every time. Null when the audit
 * ring has no forget-host entries yet.
 */
let lastForgottenHost: import("../lib/last-forgotten-host").ForgottenHostInfo | null = null;

// Cached archived-clip count for the Cmd+K "Jump to next archived"
// command label. Refreshed on every render() so the live count is
// always current without a per-palette-open IDB read. Zero hides
// the command from the palette via `available: false`.
let archivedCount = 0;
// Cached count of clips carrying a per-clip detail-body wrap override,
// for the Cmd+K "Show clips with a wrap override" command label.
// Refreshed every render() over the already-loaded clip set so the live
// tally is current without a per-palette-open IDB read; zero hides the
// command via `available: false`.
let wrapOverrideCount = 0;
/**
 * Active-tab host cache for the Cmd+K "Pin every clip from this host"
 * command. Three layers:
 *   - `activeTabHost` — the live hostname (www-stripped, lowercased)
 *     of the popup's owning tab. Empty string when the tab is on
 *     chrome:// / about: / has no http(s) URL.
 *   - `activeHostMatched` — total clips in the live store whose
 *     `source.url` host matches. Drives the "all N already pinned" hint.
 *   - `activeHostPinnable` — subset of `matched` that aren't already
 *     pinned. Drives the command's `available` gate + the label count.
 *
 * Refreshed on every render() so the palette always sees fresh numbers.
 * Reading the active tab is cheap (single api.tabs.query) and we lean
 * on `wide` (already loaded for the list render) for the count, so the
 * refresh adds no extra IDB round-trip.
 */
let activeTabHost = "";
let activeHostMatched = 0;
let activeHostPinnable = 0;
// Lock counterpart to the pin cache above. Shares activeTabHost (one
// host lookup per render) so the refresh path stays single-IDB-read.
// `activeHostLockMatched` is intentionally separate from
// `activeHostMatched` only for naming clarity — both compute the same
// host-match count; in practice the rollup is shared (see
// refreshActiveHostPin).
let activeHostLockable = 0;
/**
 * Site-rules cache + the derived `is:hostlocked` count + predicate.
 * Refreshed on every render() via refreshSiteRulesCache (single RPC
 * call) so the search filter, the empty-state hint, and the Cmd+K
 * "Show hostlocked" command all see the same in-scope set without
 * each having to fetch independently.
 *
 * `hostLockedPredicate` is rebuilt on every render via
 * buildHostLockedPredicate, so its internal cache is fresh per
 * render — no stale rule decisions persist across config changes.
 * The predicate is closure-scoped (no global Map) so two renders
 * in quick succession after a rule edit can't see each other's
 * stale verdicts.
 *
 * `hostLockedCount` is the live count of clips matched by the
 * predicate over `wide`. Drives the palette command's `available`
 * gate (greys when 0) and the count label ("N clips · hostlocked").
 */
let currentSiteRules: SiteRule[] = [];
let hostLockedPredicate: ((c: ClipItem) => boolean) = () => false;
let hostLockedCount = 0;
/**
 * Predicates + counts for the host-rule operator family (companion
 * to hostLocked above). Rebuilt on every render via
 * buildHostRulePredicate so verdict caches are fresh per render —
 * no stale rule decisions persist across config changes. Each
 * count drives the Cmd+K command's `available` gate (greys when 0)
 * and feeds the empty-state hint.
 *
 * Same fall-open contract as the locked predicate: when the user
 * hasn't typed the operator, applyQuery skips the gate so the
 * predicate cost is paid only when the user is actually asking.
 */
let hostPinnedPredicate: ((c: ClipItem) => boolean) = () => false;
let hostPinnedCount = 0;
let hostRedactedPredicate: ((c: ClipItem) => boolean) = () => false;
let hostRedactedCount = 0;
let hostScrubbedPredicate: ((c: ClipItem) => boolean) = () => false;
let hostScrubbedCount = 0;
/**
 * Recently-locked cache for the Cmd+K "Show recently locked clips"
 * command. Updated once per render() from `wide` (the same array the
 * pin/lock caches scan) so the command label always carries the live
 * count + freshest lockedAt without an extra IDB read on palette open.
 *
 * `recentlyLockedCount` drives the `available` gate (greys the row when
 * 0). `recentlyLockedFreshestAt` powers the "Most recent: X ago" hint.
 * Both reset to 0 / undefined when no clip has lockedAt within the 7d
 * window — matches the formatRecentlyLockedLabel empty-state contract.
 */
let recentlyLockedCount = 0;
let recentlyLockedFreshestAt: number | undefined = undefined;
/**
 * Mirror cache for the Cmd+K "Show recently noted" command. Same
 * 7-day chronology shape as recently-locked above but keyed on
 * `noteUpdatedAt`. Refreshed once per render() from `wide` — no
 * extra IDB read on palette open. `recentlyNotedCount` drives
 * the `available` gate; `recentlyNotedFreshestAt` powers the
 * "Most recent: X ago" hint. Both reset to 0 / undefined when
 * no clip has noteUpdatedAt within the 7d window.
 */
let recentlyNotedCount = 0;
let recentlyNotedFreshestAt: number | undefined = undefined;
/**
 * When non-null, the saved-search chip with this id renders as a
 * text input instead of a button so the user can rename it inline.
 * Cleared on commit / cancel / blur. Lives only in module state — no
 * IDB, no Settings — because rename mode is purely a UI dance.
 */
let renamingSavedSearchId: string | null = null;
// When non-null, addSiteRuleFromForm() updates the rule with this id
// instead of creating a fresh one. Set by clicking a rule row in the
// settings panel; cleared by save, cancel, or any explicit form reset.
let editingRuleId: string | null = null;
// Active list sort mode (persisted in IDB meta). Defaults to "recent"
// which preserves the historical behavior — `lastSeenAt desc` with
// pinned floated to the top.
let listSort: SortMode = "recent";
// Detail body word-wrap preference. True = wrap long lines (default,
// historical behavior); false = no-wrap + horizontal scroll for
// tabular / log / wide-code clips. Loaded from the meta store on
// init, persisted on every toggle, applied to .detail-body via the
// .nowrap modifier class.
let detailWrapOn = true;
// The open clip's per-clip wrap override (undefined = follow the
// global default above). Refreshed on every openDetail from the clip's
// `wrapOverride` field; mutated by the wrap-button click handler. The
// effective wrap painted on the body is resolved from BOTH this and
// the global default via lib/wrap-pref.effectiveWrap.
let detailWrapClipOverride: boolean | undefined = undefined;
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

/**
 * Wrapped delete: gates on the per-clip `locked` bit. When ANY id in
 * the batch is locked, surfaces a single confirm naming the locked
 * count (and preview for the one-clip case) so the user can choose
 * intelligently. Bailing out of the confirm preserves the WHOLE batch
 * — we don't trash the unlocked clips silently when the user said
 * "wait" to the locked ones; locking is a "double-check this whole
 * action" signal, not a per-clip veto.
 *
 * All-unlocked batches short-circuit to trashWithUndo with no extra
 * friction — the common case stays one-click.
 *
 * Pulls each clip via getClip so a stale id (already trashed by
 * another window/tab) is silently skipped — partitionLocked treats
 * missing clips as unlocked, which means a stale id won't manufacture
 * a phantom confirm prompt.
 */
async function trashWithLockGuard(ids: string[], label?: string): Promise<void> {
  if (ids.length === 0) return;
  // Cheap fetch — most batches are <50 ids. We could parallelise with
  // Promise.all, but the existing trashWithUndo loop is sequential
  // already, so a sequential pre-check matches the cost profile.
  const checks: { id: string; locked?: boolean; preview?: string; content?: string }[] = [];
  for (const id of ids) {
    const c = await getClip(id);
    if (!c) continue;
    checks.push({ id: c.id, locked: c.locked, preview: c.preview, content: c.content });
  }
  if (checks.length === 0) return;
  const partition = partitionLocked(checks);
  if (partition.locked.length > 0) {
    // Single-clip path uses the preview-aware confirm so the user
    // sees WHICH clip they're throwing away.
    if (checks.length === 1 && partition.locked.length === 1) {
      const only = checks[0];
      const previewText = only.preview || only.content || "";
      if (!confirm(formatLockedClipConfirm(previewText))) return;
    } else {
      const msg = formatLockConfirm(partition);
      // msg should never be null here (locked > 0), but defensive.
      if (msg && !confirm(msg)) return;
    }
  }
  await trashWithUndo(ids, label);
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
  // Locked clips get a small inline padlock chip so the user can
  // scan the daily list and see at a glance which entries will
  // confirm-on-delete. Subtle (not a pill) because lock is a
  // confirm-gate, not a category.
  const lockedBadge = c.locked
    ? `<span class="locked-badge" title="Locked — delete will confirm">${icons.lock()}</span>`
    : "";
  // Highlight the free-text needle inside the preview slice. For images we
  // never highlight (the "preview" is just a placeholder label like "Image").
  const previewSlice = previewText.slice(0, 140);
  const previewHtml =
    c.kind === "image"
      ? escapeHtml(previewSlice)
      : highlightHtml(previewSlice, needle);
  // Hover-peek: when the preview is truncated at 140 chars, carry a longer
  // (flattened, capped) slice as a native `title` so the user can read more
  // context on hover / focus without opening the detail view. Images never
  // get a peek — their "preview" is a placeholder label, not real text.
  // Link clips get a RICHER peek (lib/linkPeekTooltip) that folds in the
  // source title + full URL even when the body itself fits — that's the
  // case where two same-host links ("github.com/a/b" vs ".../c/d") need
  // one hover to disambiguate without opening detail.
  let peek: string | null;
  if (c.kind === "image") {
    peek = null;
  } else if (c.kind === "link") {
    peek = linkPeekTooltip(
      previewText,
      { title: c.source.title, url: c.source.url },
      { rowSliceLength: 140 },
    );
  } else {
    peek = peekTooltip(previewText, { rowSliceLength: 140 });
  }
  const previewTitle = peek ? ` title="${escapeHtml(peek)}"` : "";
  return `
    <div class="clip ${c.pinned ? "pinned" : ""} ${active ? "active" : ""} ${selectedIds.has(c.id) ? "selected" : ""}${c.archived ? " archived" : ""}" data-id="${c.id}" data-idx="${idx}">
      ${selectedIds.size > 0 ? `<div class="select-mark">${selectedIds.has(c.id) ? icons.check() : ""}</div>` : ""}
      ${thumb}
      <div class="body">
        <div class="preview"${previewTitle}>${previewHtml}${archivedBadge}${lockedBadge}</div>
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

/**
 * Paint the content-stats breadcrumb under the detail body. Text /
 * link clips show "1,240 chars · 198 words · 12 lines"; image clips
 * (and empty bodies) hide the row entirely. Delegates all counting +
 * grammar to lib/content-stats so the popup just renders the string.
 *
 * Cheap + synchronous — called from openDetail after the body paints,
 * and again from the wrap-toggle (no recompute needed, but keeps the
 * row consistent if the open clip ever changes shape under it).
 */
function renderContentStats(c: ClipItem): void {
  const line = formatContentStats(c);
  if (!line) {
    detailStats.hidden = true;
    detailStats.textContent = "";
    detailStats.removeAttribute("data-copyable");
    detailStats.title = "";
    return;
  }
  detailStats.hidden = false;
  detailStats.textContent = line;
  // Mark the breadcrumb as clickable so the click handler knows there's
  // a real summary to copy (vs. an empty/hidden row). The cursor +
  // title affordance telegraphs that this static-looking line is
  // actually a one-click copy target.
  detailStats.dataset.copyable = "1";
  detailStats.title = "Click to copy this summary \u00b7 Alt-click for Markdown";
}

/**
 * Paint the footer "row N of M" keyboard-focus breadcrumb. Only shows
 * while the user is actively keyboard-navigating the list (set by the
 * arrow/X/P handlers) AND the list is non-empty — for mouse users it
 * stays hidden so the footer doesn't gain a number they don't need.
 * Delegates the 1-based grammar + bounds handling to lib/focus-position.
 */
function renderFocusPosition(): void {
  if (!listKeyboardActive) {
    focusPosEl.hidden = true;
    focusPosEl.textContent = "";
    return;
  }
  const line = formatFocusPosition({
    activeIndex,
    total: currentClips.length,
    selectedCount: selectedIds.size,
  });
  if (!line) {
    focusPosEl.hidden = true;
    focusPosEl.textContent = "";
    return;
  }
  focusPosEl.hidden = false;
  focusPosEl.textContent = line;
}

/**
 * Apply the current word-wrap preference to the detail body. Wrap-on
 * (the default) leaves the body reflowing; wrap-off adds the .nowrap
 * modifier so long lines scroll horizontally and columns stay aligned
 * (tabular text, logs, wide code). Also flips the toggle button's
 * pressed state + tooltip so the affordance reflects the live mode.
 *
 * Pure DOM — no IDB write (that happens in the toggle handler). Safe
 * to call on every openDetail so a freshly-opened clip inherits the
 * persisted preference without a flash.
 */
function applyDetailWrap(): void {
  // Resolve the effective wrap from the per-clip override (if any) layered
  // over the global default. A clip with an explicit override ignores the
  // global; everything else follows it. The button's .active (nowrap) state
  // + .overridden badge + tooltip all reflect the resolved view so the
  // affordance never lies about what's painted.
  const wrapOn = effectiveWrap({ wrapOverride: detailWrapClipOverride }, detailWrapOn);
  const overridden = hasWrapOverride({ wrapOverride: detailWrapClipOverride });
  detailBody.classList.toggle("nowrap", !wrapOn);
  detailWrap.classList.toggle("active", !wrapOn);
  // A dot cue on the button telegraphs "this clip is pinned to its own
  // wrap, not the global" — the same language the send-to last-action dot
  // uses elsewhere in the popup.
  detailWrap.classList.toggle("overridden", overridden);
  detailWrap.title = wrapButtonTitle(wrapOn, overridden);
}

/**
 * Paint the detail-view tag chips from the live input value. Each tag
 * renders as a pill with an × so removal is one click (no hunting for
 * the right comma in the raw string). The raw input stays below as the
 * canonical edit surface + the way to ADD tags; the chips mirror it and
 * are the fast REMOVE path. Hidden when there are no tags so an empty
 * clip shows just the placeholder input.
 *
 * Reads from `detailTags.value` (not the stored clip) so the chips stay
 * in lock-step with whatever the user is mid-typing — committing a tag
 * in the input repaints the chips, and removing a chip rewrites the
 * input. lib/tag-chips owns the parse/dedupe so the two views agree.
 */
function renderDetailTagChips(): void {
  const tags = parseTags(detailTags.value);
  if (tags.length === 0) {
    detailTagChips.hidden = true;
    detailTagChips.innerHTML = "";
    return;
  }
  detailTagChips.hidden = false;
  // Roving-tabindex toolbar (WAI-ARIA pattern): the row itself is one
  // Tab stop; ←/→/Home/End move focus BETWEEN chips (handled by the
  // keydown listener), and Backspace/Delete removes the focused chip
  // and re-lands focus on a neighbour. Only one chip is tabbable at a
  // time (index 0 by default); the rest are reachable via arrows.
  detailTagChips.innerHTML = tags
    .map(
      (t, i) =>
        `<span class="detail-tag-chip" role="listitem" data-tag="${escapeHtml(t)}" data-chip-idx="${i}" tabindex="${i === 0 ? "0" : "-1"}" aria-label="Tag ${escapeHtml(t)} \u2014 press Backspace to remove">` +
        `<span class="detail-tag-label">${escapeHtml(t)}</span>` +
        `<button type="button" class="detail-tag-x" data-act="remove-tag" data-tag="${escapeHtml(t)}" tabindex="-1" title="Remove tag ${escapeHtml(t)}" aria-label="Remove tag ${escapeHtml(t)}">${icons.close()}</button>` +
        `</span>`,
    )
    .join("");
}

/**
 * Move keyboard focus to the chip at `idx` in the detail tag row,
 * making it the roving-tabindex member (the others go to -1). When
 * `idx` is -1 (or out of range — e.g. the row just emptied), focus
 * falls back to the raw tag input, the only thing left to interact
 * with. Shared by the arrow-nav + post-remove paths so "where does
 * focus land" lives in one place.
 */
function focusDetailTagChip(idx: number): void {
  const chips = Array.from(
    detailTagChips.querySelectorAll<HTMLElement>(".detail-tag-chip"),
  );
  chips.forEach((el, i) => {
    el.tabIndex = i === idx ? 0 : -1;
  });
  const target = idx >= 0 ? chips[idx] : null;
  if (target) target.focus();
  else detailTags.focus();
}

/**
 * Remove a single tag from the clip currently open in detail, shared by
 * both the chip × click and the keyboard Backspace/Delete path so the
 * two can never drift. Rewrites the raw input from the pruned list
 * (lib/tag-chips owns the set math), commits via the same updateTags +
 * render path the input's change handler uses, refreshes the note chips
 * (removing a structured tag can re-reveal a promotable hashtag), and
 * toasts a receipt. Does NOT move focus — the caller decides where
 * focus lands (the keyboard path restores it to a neighbour chip).
 */
async function removeDetailTag(tag: string): Promise<void> {
  if (!detailId) return;
  const next = removeTag(parseTags(detailTags.value), tag);
  detailTags.value = serializeTags(next);
  renderDetailTagChips();
  await updateTags(detailId, next);
  await render();
  paintNotePromoteChip(detailNote.value, next);
  paintNoteStripChip(detailNote.value);
  paintNotePromoteStripChip(detailNote.value, next);
  toast(`Removed ${tag}`);
}

/**
 * Build + sync the per-clip force-language control (lib/lang-override).
 *
 * Shows a dropdown under the body for text/link clips so the user can
 * override the auto-detected tinting language (or force it off) when
 * detectCodeLang guesses wrong or can't classify. Hidden for images
 * (no code body) and while the user is actively searching (the
 * search-match highlight wins over syntax tinting, so the control would
 * have no visible effect). The <option> list is rendered once from
 * LANG_OPTIONS; this just selects the right value + refreshes the hint
 * each open. The clip's stored override drives the selected value via
 * selectValueFor.
 */
function renderDetailLangControl(c: ClipItem): void {
  const searching = currentNeedle.trim() !== "";
  if (c.kind === "image" || searching) {
    detailLangRow.hidden = true;
    return;
  }
  detailLangRow.hidden = false;
  // Populate the <option> list once (idempotent — only when empty).
  if (detailLang.options.length === 0) {
    const opts: string[] = [
      `<option value="${OVERRIDE_AUTO}">Auto-detect</option>`,
      `<option value="${OVERRIDE_NONE}">Plain text (no tint)</option>`,
    ];
    for (const o of LANG_OPTIONS) {
      opts.push(`<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`);
    }
    detailLang.innerHTML = opts.join("");
  }
  const detected = detectCodeLang(c.content);
  detailLang.value = selectValueFor(c.langOverride);
  detailLang.title = langControlTitle(c.langOverride, detected);
  // Hint tail tells the user what Auto WOULD pick, so "Auto-detect"
  // isn't a black box: "auto → Rust" or "auto → not code".
  const eff = effectiveLang(c.langOverride, detected);
  if (eff.overridden) {
    detailLangHint.textContent = detected
      ? `forced \u00b7 auto would pick ${langLabel(detected)}`
      : "forced \u00b7 auto finds no code";
  } else {
    detailLangHint.textContent = detected
      ? `auto \u2192 ${langLabel(detected)}`
      : "auto \u2192 not code";
  }
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
    // Hide the Archived chip while `is:archived` is already in the
    // query — the user is already in archive view, so a chip that
    // would only toggle them BACK out doesn't earn its row real estate
    // (the empty-state "Show daily list" button handles that escape
    // when needed, and the search box still shows the operator).
    if (!hasOp("is:archived"))
      pills.push({
        label: "Archived",
        op: "is:archived",
        active: false,
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
  // Layout metrics (scrollWidth/clientWidth) aren't valid until the new
  // chips have been laid out — defer the shadow measure one frame so the
  // edge-fade reflects the freshly-painted row, not the previous one.
  requestAnimationFrame(refreshQuickChipsScrollShadow);
}

/**
 * Toggle the leading/trailing edge-fade affordance on the quick-chips
 * strip based on its live scroll position. The strip hides its
 * scrollbar for a clean look, which also removes the only native cue
 * that chips are clipped off an edge — the fades restore that "there's
 * more this way" signal. Pure edge math lives in lib/scroll-shadow;
 * here we just read the element's metrics and flip two data attributes
 * the CSS keys off. Safe to call any time (hidden / empty strip → no
 * fades).
 */
function refreshQuickChipsScrollShadow(): void {
  if (quickChipsEl.hidden) {
    quickChipsEl.removeAttribute("data-shadow-start");
    quickChipsEl.removeAttribute("data-shadow-end");
    return;
  }
  const edges = computeScrollEdges({
    scrollLeft: quickChipsEl.scrollLeft,
    scrollWidth: quickChipsEl.scrollWidth,
    clientWidth: quickChipsEl.clientWidth,
  });
  quickChipsEl.toggleAttribute("data-shadow-start", edges.start);
  quickChipsEl.toggleAttribute("data-shadow-end", edges.end);
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
 * Double-click on the label flips it into an inline rename input: an
 * `<input type="text">` swaps in with the current name selected, Enter
 * commits via `renameSavedSearch`, Escape / blur cancels. Avoids the
 * `prompt()` modal — keeps the user in the popup, no focus loss, no
 * extension API to dismiss.
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
    .map((s) => {
      const isRenaming = renamingSavedSearchId === s.id;
      const label = isRenaming
        ? `<input class="saved-search-rename" type="text" value="${escapeHtml(s.name)}" maxlength="40" autocomplete="off" spellcheck="false" data-act="rename-input" />`
        : `<button class="saved-search-apply" data-act="apply" type="button" title="Apply · double-click to rename · drag to reorder">${escapeHtml(s.name)}</button>`;
      // Draggable only when NOT renaming — otherwise the input would
      // start a drag the moment the user touches it. The renaming
      // chip stays fixed; once the user commits/cancels the chip
      // becomes draggable again on the next render.
      const dragAttr = isRenaming ? "" : ` draggable="true"`;
      return (
        `<span class="saved-search-chip ${s.query === current ? "active" : ""}${isRenaming ? " renaming" : ""}" data-id="${escapeHtml(s.id)}" title="${escapeHtml(s.query)}"${dragAttr}>` +
        label +
        `<button class="saved-search-del" data-act="del" type="button" title="Remove">×</button>` +
        `</span>`
      );
    })
    .join("");
  if (renamingSavedSearchId) {
    // Focus + select the rename input so the user can type immediately.
    const input = savedSearchesEl.querySelector<HTMLInputElement>(
      `.saved-search-chip[data-id="${cssEscape(renamingSavedSearchId)}"] .saved-search-rename`,
    );
    if (input) {
      input.focus();
      input.select();
    }
  }
}

/**
 * CSS.escape() polyfill for older WebViews — saved-search ids look like
 * `ss_<ts>_<nonce>` (alphanum + underscore), so a minimal escape that
 * just handles the safe character set is enough here. Falls back to the
 * platform implementation when present.
 */
function cssEscape(s: string): string {
  if (typeof (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape === "function") {
    return (globalThis as unknown as { CSS: { escape: (v: string) => string } }).CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
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
 * Refresh the cached `lastForgottenHost` pointer from the privacy
 * audit ring. Cheap (single IDB read of the small ring), called from
 * popup boot + after any forget-host action so the Cmd+K rescue
 * command always knows the most-recent target.
 */
async function refreshLastForgottenHost(): Promise<void> {
  try {
    const entries = await listPrivacyAudit();
    lastForgottenHost = findLastForgottenHost(entries);
  } catch (e) {
    console.warn("[context-clipboard] last-forgotten-host refresh failed", e);
    lastForgottenHost = null;
  }
}

/**
 * Refresh the active-tab host + matched/pinnable counts that drive
 * the Cmd+K "Pin every clip from this host" command.
 *
 * Two halves:
 *   1. Tab read via api.tabs.query. We capture the host even when
 *      the tab is loading or has a non-http(s) URL — those land as
 *      empty `activeTabHost`, which the label helper turns into a
 *      greyed-out "Pin every clip from this site / No site context"
 *      row. Better than the command silently vanishing.
 *   2. Count rollup over `wide` (passed in by render() to avoid a
 *      duplicate IDB read). Skipped when host is empty.
 *
 * Fire-and-forget from render(). A failed tabs.query leaves the cache
 * at its last-known good value; the user-visible effect is "the
 * command still works against whatever was active last time", which
 * is acceptable (the next render catches up).
 */
async function refreshActiveHostPin(wide: ClipItem[]): Promise<void> {
  let host = "";
  try {
    const [tab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
    });
    if (tab?.url) {
      host = hostFrom(tab.url);
    }
  } catch (e) {
    console.warn("[context-clipboard] active-tab host probe failed", e);
    // Leave the previous cache intact — better than wiping to "" on
    // a transient permission glitch.
    return;
  }
  activeTabHost = host || "";
  if (!activeTabHost) {
    activeHostMatched = 0;
    activeHostPinnable = 0;
    activeHostLockable = 0;
    return;
  }
  activeHostMatched = matchedClipsForHost(activeTabHost, wide);
  activeHostPinnable = availableToPin(activeTabHost, wide);
  // Lock-from-host cache. Same host, same matched count contract; we
  // only need the "how many would the action lock?" rollup. Cheap
  // single pass over `wide` (the same array the pin counts use).
  activeHostLockable = availableToLockHost(activeTabHost, wide);
}

/**
 * Cmd+K palette handler: pin every clip whose source.url host matches
 * the popup's owning tab. One-shot triage — useful when you've been
 * researching on a specific site and want all the clips you captured
 * there sorted to the top of the daily list.
 *
 * Non-toggle semantics: we ONLY pin clips that aren't already pinned.
 * Toggling already-pinned clips back to unpinned would silently undo
 * the user's earlier explicit pin actions — a clear footgun. Matches
 * `idsToPinForHost`'s contract.
 *
 * Re-reads the full clip set at click time (not the cached `wide` from
 * the last render) so a clip just captured between render and click
 * lands in the batch. Cheap: same single IDB read render() does.
 */
async function pinAllFromActiveHost(): Promise<void> {
  if (!activeTabHost) {
    toast("No site context — open this on a normal http(s) tab", "error");
    return;
  }
  // Re-read live store so a freshly-captured clip doesn't get missed.
  const all = await listClips({ limit: 5000 });
  const ids = idsToPinForHost(activeTabHost, all);
  if (ids.length === 0) {
    // Could be "no clips from this host" or "all already pinned" — the
    // palette label already disambiguates, but we toast honestly here
    // in case the user invoked the command via the keyboard before the
    // render cache caught up.
    const matched = matchedClipsForHost(activeTabHost, all);
    toast(
      matched === 0
        ? `No clips from ${activeTabHost}`
        : `All ${matched} from ${activeTabHost} already pinned`,
    );
    return;
  }
  // togglePin per id (mirror pinAllFiltered). Sequential because the
  // IDB puts collide if we race them and pin counts in the dozens for
  // the realistic case.
  for (const id of ids) await togglePin(id);
  toast(
    ids.length === 1
      ? `Pinned 1 from ${activeTabHost}`
      : `Pinned ${ids.length} from ${activeTabHost}`,
  );
  // Render refreshes the cache + repaints the list with the new pin
  // dots.
  await render();
}

/**
 * Cmd+K companion to `pinAllFromActiveHost`: lock every clip from the
 * popup's owning tab's host with the "ask before deleting" gate.
 *
 * Non-toggle semantics (mirror pin variant): only locks the unlocked.
 * Already-locked clips skip — the command's intent is "lock everything
 * from this site", and toggling locked → unlocked would silently undo
 * a user's earlier explicit lock.
 *
 * Re-reads the live store at click time so a clip captured between
 * render and click joins the batch. Uses setLocked (not toggleLock)
 * for the same idempotent reason bulk-lock does — explicit final
 * state, not a flip.
 */
async function lockAllFromActiveHost(): Promise<void> {
  if (!activeTabHost) {
    toast("No site context — open this on a normal http(s) tab", "error");
    return;
  }
  const all = await listClips({ limit: 5000 });
  const ids = idsToLockForHost(activeTabHost, all);
  if (ids.length === 0) {
    const matched = matchedClipsForHostLock(activeTabHost, all);
    toast(
      matched === 0
        ? `No clips from ${activeTabHost}`
        : `All ${matched} from ${activeTabHost} already locked`,
    );
    return;
  }
  for (const id of ids) await setLocked(id, true);
  toast(
    ids.length === 1
      ? `Locked 1 from ${activeTabHost}`
      : `Locked ${ids.length} from ${activeTabHost}`,
  );
  await render();
}

/**
 * Cmd+K companion to `pinAllFromActiveHost` / `lockAllFromActiveHost`:
 * apply (or replace) the same free-form note on every clip captured
 * from the popup's owning tab's host. Completes the host-scoped
 * triage family — pin = sort affinity, lock = delete gate, NOTE =
 * commentary.
 *
 * Overwrite semantics (mirror bulk-bar add-note):
 *   - Prompts the user for a single note string.
 *   - Empty input clears existing notes on the matching clips (same
 *     contract as detail-view save-empty + bulk-bar).
 *   - Cancel (prompt returns null) is a clean no-op — distinct from
 *     prompt-empty ("" → clear).
 *   - Same sanitiseClipNote pipeline as the detail editor so bulk +
 *     single + host paths can never produce different stored values.
 *
 * Pre-warning: before the apply, we project planHostNote against the
 * live store so the user sees "Replacing N existing notes" in the
 * prompt label when relevant. That's the same consequence-visibility
 * contract bulk-note enforces — overwrite for prose needs the
 * replace-count up front, not buried in the post-action toast.
 *
 * Re-reads the live store at click time (not the cached `wide` from
 * the last render) so a clip captured between render and click joins
 * the batch. Cheap: same single IDB read render() does.
 */
async function noteAllFromActiveHost(): Promise<void> {
  if (!activeTabHost) {
    toast("No site context — open this on a normal http(s) tab", "error");
    return;
  }
  // Re-read live store so a freshly-captured clip doesn't get missed.
  const all = await listClips({ limit: 5000 });
  const matched = matchedClipsForHostNote(activeTabHost, all);
  if (matched === 0) {
    toast(`No clips from ${activeTabHost}`);
    return;
  }
  // Count how many already carry a note so the prompt label can warn
  // the user about replacements up front. We don't yet know what
  // they'll type, but the "N currently noted" surface is honest about
  // the upper bound on potential replacements.
  let currentlyNoted = 0;
  for (const c of all) {
    if (idsToNoteForHost(activeTabHost, [c]).length === 0) continue;
    if (typeof c.note === "string" && c.note.trim().length > 0) currentlyNoted++;
  }
  const promptLabel =
    currentlyNoted > 0
      ? `Note to apply to ${matched} clip${matched === 1 ? "" : "s"} from ${activeTabHost} (${currentlyNoted} will be replaced) — leave empty to clear:`
      : `Note to apply to ${matched} clip${matched === 1 ? "" : "s"} from ${activeTabHost} — leave empty to clear:`;
  const raw = prompt(promptLabel, "");
  if (raw === null) return; // Cancel → clean no-op.
  // Project the plan so the post-action toast is truthful even when
  // the user's input would no-op (e.g. clears that hit only un-noted
  // clips, or a note identical to the current value on a re-run).
  const plan = planHostNote(activeTabHost, all, raw);
  if (plan.created + plan.replaced + plan.cleared === 0) {
    toast(formatHostNoteToast(activeTabHost, plan));
    return;
  }
  const ids = idsToNoteForHost(activeTabHost, all);
  for (const id of ids) {
    await setClipNote(id, plan.finalValue);
  }
  toast(formatHostNoteToast(activeTabHost, plan));
  await render();
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
          // The chip is one composite span: the apply-button label PLUS
          // a hover-only pin icon button that promotes the query to a
          // saved search. The pin button stops propagation in its own
          // handler so a click on it never falls through to apply.
          // `draggable="true"` enables HTML5 native DnD so the user can
          // promote a frequent recent-query left (same model as the
          // saved-searches strip above). data-q stays the stable
          // identifier — queries are case-sensitive on the persisted
          // side so two visually-similar entries stay distinct.
          `<span class="recent-chip" draggable="true" data-q="${escapeHtml(q)}" title="${escapeHtml(q)} · drag to reorder · right-click or hover-pin to save">` +
          `<button class="recent-apply" type="button" data-act="apply" data-q="${escapeHtml(q)}">${escapeHtml(q.length > 28 ? q.slice(0, 28) + "…" : q)}</button>` +
          `<button class="recent-pin" type="button" data-act="save" data-q="${escapeHtml(q)}" title="Save as a chip — promote this query to a saved search">${icons.pin()}</button>` +
          `</span>`,
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
  syncSearchClearBtn();
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
  // Refresh the archived-count cache so the Cmd+K "Jump to next
  // archived" command shows the live tally + hides itself when the
  // archive is empty. Cheap: filter over the already-loaded `wide`,
  // no extra IDB read.
  archivedCount = 0;
  for (const c of wide) if (c.archived === true) archivedCount++;
  // Refresh the wrap-override count (Cmd+K "Show clips with a wrap
  // override"). Same predicate the search filter + detail toggle use
  // (hasWrapOverride) so the count, the filter, and the badge agree.
  wrapOverrideCount = 0;
  for (const c of wide) if (hasWrapOverride(c)) wrapOverrideCount++;
  // Refresh the active-host pin cache so the Cmd+K "Pin every clip
  // from this host" command knows whether it's available + how many
  // it'd pin. Tab read is fire-and-forget — first render after open
  // may show the command with stale host="", but the next render
  // (filter typed, list scrolled, anything) catches up. We also
  // refresh the matched + pinnable counts from `wide` so the label
  // text is always current.
  void refreshActiveHostPin(wide);
  // Recently-locked rollup for the Cmd+K "Show recently locked"
  // command. Single pass over `wide` (already loaded) — no extra IDB
  // call. The recentlyLockedClips() helper is the same one the unit
  // tests cover, so the popup ranking + label match the helper's
  // documented contract exactly.
  const recent = recentlyLockedClips(wide);
  recentlyLockedCount = recent.length;
  recentlyLockedFreshestAt = recent[0]?.lockedAt;
  // Recently-noted chronology — same single-pass model as
  // recently-locked above, keyed on noteUpdatedAt. Both rollups
  // run from the same `wide` snapshot so the palette has no
  // extra IDB cost on open. Stamp lives on every clip with a
  // post-shipped note; clips noted before the stamp shipped
  // correctly drop out (matches the lockedAt back-compat
  // contract for recently-locked).
  const recentNoted = recentlyNotedClips(wide);
  recentlyNotedCount = recentNoted.length;
  recentlyNotedFreshestAt = recentNoted[0]?.noteUpdatedAt;
  // Site-rules refresh — single RPC, drives the `is:hostlocked`
  // operator AND the Cmd+K "Show hostlocked" command. We do it on
  // every render so a rule the user just edited / added / deleted
  // gets reflected immediately in the filter and the palette. The
  // RPC is cheap (rules are stored as a single meta row); we await
  // it before the applyQuery so the predicate is fresh in case the
  // user types `is:hostlocked` mid-render. The catch swallows
  // transient RPC misses without empty-ing the filter — the
  // predicate falls back to "no match" naturally.
  try {
    const r = await rpcSiteRules("listSiteRules");
    if (r?.ok && Array.isArray(r.rules)) {
      currentSiteRules = r.rules;
    }
  } catch {
    // Keep last-known rules on transient RPC failure — better than
    // wiping the cache and silently emptying every is:hostlocked
    // filter for the duration of the network blip.
  }
  hostLockedPredicate = buildHostLockedPredicate(currentSiteRules);
  hostLockedCount = countHostLockedClips(currentSiteRules, wide);
  // Host-rule family parity (autoPin / autoRedact / autoScrubOrigin).
  // Same shape as hostLocked, different rule flag. Predicate +
  // count refreshed per render so they don't drift across rule edits.
  hostPinnedPredicate = buildHostRulePredicate(currentSiteRules, "autoPin");
  hostPinnedCount = countHostRuleClips(currentSiteRules, wide, "autoPin");
  hostRedactedPredicate = buildHostRulePredicate(currentSiteRules, "autoRedact");
  hostRedactedCount = countHostRuleClips(currentSiteRules, wide, "autoRedact");
  hostScrubbedPredicate = buildHostRulePredicate(currentSiteRules, "autoScrubOrigin");
  hostScrubbedCount = countHostRuleClips(currentSiteRules, wide, "autoScrubOrigin");
  const filtered = applyQuery(wide, parsed, {
    extraPinnedOnly: pinnedOnly,
    extraTag: activeTag,
    extraKind: currentKind,
    // Pass the live predicate so `is:hostlocked` works. When the
    // user hasn't typed the operator (parsed.hostLockedOnly ===
    // false) applyQuery skips it — no extra cost per clip.
    hostLockedPredicate,
    // Same wiring for the new host-rule family. Each predicate's
    // closure-scoped cache means even with all four flags enabled
    // and 5,000 clips, the cost is 5,000 hash lookups not 20,000
    // regex walks.
    hostPinnedPredicate,
    hostRedactedPredicate,
    hostScrubbedPredicate,
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
    const archiveView = parsed.archivedOnly;
    let hint: string;
    if (archiveView) {
      // Archive view empty — distinct copy + a one-click escape back
      // to the daily list. Catches the common "I went looking for an
      // archived clip, came up empty, now I'm stuck in archive mode"
      // case. The chip is a real button (data-act handled below) so
      // keyboard works too.
      hint =
        `<div class="empty archive-empty">No archived clips${searchEl.value.trim() !== "is:archived" ? " match this filter" : " yet"}.` +
        `<br/><small>Archive a clip from its detail view, or run <code>palette → Archive all filtered</code>.</small>` +
        `<br/><button type="button" class="empty-action" data-act="exit-archive">Show daily list</button>` +
        `</div>`;
    } else {
      hint = searchEl.value.trim()
        ? `<div class="empty">No clips match.<br/><small>Try plain text, or <code>kind:image</code> / <code>host:github.com</code> / <code>tag:code</code> / <code>is:pinned</code> / <code>is:link</code> / <code>is:locked</code> / <code>is:unlocked</code> / <code>is:hostlocked</code> / <code>is:hostpinned</code> / <code>is:hostredacted</code> / <code>is:hostscrubbed</code> / <code>is:noted</code> / <code>is:nonoted</code> / <code>is:hashtags</code> / <code>is:nohashtags</code> / <code>is:wrapoverride</code> / <code>is:notelonger:50</code> / <code>is:noteshorter:30</code> / <code>is:notenewer:7d</code> / <code>is:noteolder:30d</code> / <code>is:template</code> / <code>is:notemplate</code> / <code>is:expiring</code> / <code>is:archived</code> / <code>before:7d</code></small></div>`
        : `<div class="empty">No clips yet.<br/>Copy anything, right-click → "Capture", or drop an image here.</div>`;
    }
    listEl.innerHTML = hint;
  } else {
    // Day-group dividers — only for time-ordered sorts (recent/oldest),
    // where adjacent rows actually share calendar days. For hits/size/
    // alpha the order isn't chronological, so grouping by day would
    // scatter one-row "headers" everywhere; we skip them and render a
    // flat list. The pinned tier collapses to a single "Pinned" header
    // (see lib/day-group) so a stale age label never lands at the top.
    const showDayHeaders = listSort === "recent" || listSort === "oldest";
    const dayHeaders = showDayHeaders
      ? computeDayHeaders(currentClips)
      : [];
    listEl.innerHTML = currentClips
      .map((c, i) => {
        const header = dayHeaders[i];
        const headerHtml = header
          ? `<div class="day-header" role="presentation">${escapeHtml(header)}</div>`
          : "";
        return headerHtml + renderClip(c, i, i === activeIndex, currentNeedle);
      })
      .join("");
  }
  renderCountBreakdown(parsed);
  renderFocusPosition();
  // Storage-delta hint depends on currentClips ∩ selectedIds, so we
  // refresh the bulk-bar on every render so the number stays truthful
  // as the filter changes.
  updateBulkBar();
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
  // Similar-nav lifecycle: if we're traversing and the new id is in the
  // stack, resync the index so the position pill stays correct. If the
  // new id is NOT in the stack, the user navigated away (clicked a list
  // row, opened from search, etc.) — drop the nav and return to list-mode.
  if (similarNav) {
    const resynced = syncSimilarNav(similarNav, id);
    similarNav = resynced; // null when id not in stack -> exits mode
  }
  detailId = c.id;
  // Refresh the per-clip wrap override from the freshly-loaded clip so
  // applyDetailWrap() below resolves THIS clip's effective wrap (override
  // wins, else global default). A clip with no override falls through to
  // the global as before.
  detailWrapClipOverride =
    typeof c.wrapOverride === "boolean" ? c.wrapOverride : undefined;
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
    // Detail body: when the user is actively searching, the
    // search-match highlight (<mark>) wins — finding the needle matters
    // more than syntax colour, and composing the two would risk nested
    // markup. With NO active needle (the common "just opened a clip"
    // case), tint detected code (strings / comments / keywords /
    // numbers) so a config / SQL / JSON clip is scannable instead of a
    // flat grey wall. detectCodeLang gates BOTH the lang choice and
    // whether we tint at all — an undetected clip stays plain escaped
    // text. lib/code-highlight escapes internally (same entity map),
    // so the body can never break out of the <pre>.
    const needle = currentNeedle.trim();
    let bodyHtml: string;
    if (needle) {
      bodyHtml = highlightHtml(c.content, currentNeedle);
      detailBody.classList.remove("code-tinted");
    } else {
      // Resolve the language to tint with: a per-clip force-language
      // override (lib/lang-override) wins over auto-detection, and the
      // explicit "none" override forces tinting off for a clip that
      // detectCodeLang false-positives as code. effectiveLang folds
      // both the language choice AND whether to tint at all into one
      // verdict so the .code-tinted class + the highlightCode call can
      // never disagree.
      const detected = detectCodeLang(c.content);
      const eff = effectiveLang(c.langOverride, detected);
      if (eff.tint && eff.lang) {
        bodyHtml = highlightCode(c.content, eff.lang);
        detailBody.classList.add("code-tinted");
      } else {
        bodyHtml = highlightHtml(c.content, "");
        detailBody.classList.remove("code-tinted");
      }
    }
    detailBody.innerHTML = `<pre>${bodyHtml}</pre>`;
    detailOcr.hidden = true;
    detailRefetch.hidden = true;
  }
  renderDetailLangControl(c);
  renderContentStats(c);
  // Word-wrap toggle only applies to the text <pre> body — images
  // have no wrappable lines, so hide the button for image clips and
  // always paint them wrapped (a no-op for an <img>). For text/link
  // clips, show the button and apply the persisted preference.
  if (c.kind === "image") {
    detailWrap.hidden = true;
    detailBody.classList.remove("nowrap");
  } else {
    detailWrap.hidden = false;
    applyDetailWrap();
  }
  detailUrl.href = c.source.url || "#";
  detailUrl.textContent = c.source.url || "—";
  detailTime.textContent = new Date(c.createdAt).toLocaleString();
  detailHits.textContent = String(c.hitCount);
  detailTags.value = c.tags.join(", ");
  renderDetailTagChips();
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
  renderTtlBanner(c);
  detailPin.innerHTML = c.pinned ? icons.pinFilled() : icons.pin();
  renderRedactButton(c);
  renderArchiveButton(c);
  renderLockButton(c);
  renderLockedRow(c);
  renderNoteRow(c);
  // Refresh the "Show audit history" jumper's tooltip with the live
  // match count from the audit ring. Fire-and-forget — the title is
  // a hint, not a gate (the click handler works regardless).
  void refreshDetailHistoryTitle(c.id);
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
    // Traverse button — surfaces only when there are at least 2 matches.
    // Stash the ordered id list on the button so the click handler can
    // build the nav stack without re-running findSimilarClips.
    const traverseLabel = formatTraverseButtonLabel(matches.length);
    if (traverseLabel) {
      detailSimilarTraverse.hidden = false;
      detailSimilarTraverse.textContent = traverseLabel;
      detailSimilarTraverse.dataset.ids = matches.map((m) => m.id).join(",");
      detailSimilarTraverse.dataset.pivotId = pivotId;
    } else {
      detailSimilarTraverse.hidden = true;
      detailSimilarTraverse.textContent = "";
      delete detailSimilarTraverse.dataset.ids;
      delete detailSimilarTraverse.dataset.pivotId;
    }
  } catch (e) {
    console.debug("[context-clipboard] similar-clips render failed", e);
    detailSimilarRow.hidden = true;
    detailSimilarTraverse.hidden = true;
  }
}

/**
 * Render (or hide) the prominent TTL countdown banner above the detail
 * body. Delegates urgency math to `computeTtlBanner` in lib/ttl-banner
 * so the popup just paints the result. Pinned + no-TTL + far-future
 * cases hide the banner; expired / imminent (< 1h) / soon (< 24h) tiers
 * surface it with distinct visual treatments via .tier-* CSS classes.
 *
 * Distinct from `renderExpiryRow` (the small footnote next to the
 * dropdown): the banner is the *attention-grabbing* affordance that
 * catches the user before something they care about silently
 * disappears. The hint stays for "what's the current state" reading.
 */
function renderTtlBanner(c: ClipItem): void {
  const state = computeTtlBanner(
    { pinned: !!c.pinned, expiresAt: c.expiresAt },
    Date.now(),
  );
  if (!state) {
    detailTtlBanner.hidden = true;
    detailTtlBanner.classList.remove("tier-expired", "tier-imminent", "tier-soon");
    return;
  }
  detailTtlBanner.hidden = false;
  // Swap class so CSS can paint expired/imminent/soon distinctly.
  detailTtlBanner.classList.remove("tier-expired", "tier-imminent", "tier-soon");
  detailTtlBanner.classList.add(`tier-${state.tier}`);
  detailTtlLabel.textContent = state.label;
  if (state.detail) {
    detailTtlDetail.hidden = false;
    detailTtlDetail.textContent = state.detail;
  } else {
    detailTtlDetail.hidden = true;
    detailTtlDetail.textContent = "";
  }
  // Hover title shows the absolute timestamp so the user can verify
  // without expanding the dropdown footnote.
  detailTtlBanner.title = `Expires at ${new Date(state.expiresAt).toLocaleString()}`;
  // The "Keep" pin button only makes sense when the clip isn't already
  // pinned (computeTtlBanner returns null when it is, but defensive).
  detailTtlPin.hidden = !!c.pinned;
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
  // Similar-traversal mode overrides list-mode nav. Position pill reads
  // "Similar N / M" and prev/next wrap (no end-of-list disable) since
  // similar sets are typically small enough that the user wants to
  // cycle freely. Exit semantics live in openDetail (id-not-in-stack
  // drops the nav).
  if (similarNav && similarNav.ids.length > 0 && detailId) {
    if (isInSimilarNav(similarNav, detailId)) {
      const label = formatSimilarPosLabel(similarNav);
      detailNavPos.hidden = false;
      detailNavPos.textContent = label || "";
      detailNavPos.title = `Traversing ${similarNav.ids.length} similar clips · prev/next cycles · Esc exits`;
      // Cycle wraps, so prev/next are always available when the stack
      // has at least 2 entries. Single-entry stacks are filtered at
      // buildSimilarNav time (would be silly — there's nothing to step
      // to) but defensive: a 1-stack disables both.
      const cycleable = similarNav.ids.length >= 2;
      detailPrev.disabled = !cycleable;
      detailNext.disabled = !cycleable;
      return;
    }
    // Detail-id outside the stack: traversal already ended via openDetail
    // exit handling; fall through to list-mode rendering below.
  }
  const idx = detailId
    ? currentClips.findIndex((c) => c.id === detailId)
    : -1;
  if (idx < 0 || currentClips.length === 0) {
    detailPrev.disabled = true;
    detailNext.disabled = true;
    detailNavPos.hidden = true;
    detailNavPos.title = "";
    return;
  }
  detailNavPos.hidden = false;
  detailNavPos.textContent = `${idx + 1} / ${currentClips.length}`;
  // Prev/next wrap around (loop last↔first) whenever there are at least
  // two clips, so the buttons only disable on a single-item list — no
  // dead-ends. Title telegraphs the loop affordance at the edges.
  const loopable = currentClips.length >= 2;
  detailPrev.disabled = !loopable;
  detailNext.disabled = !loopable;
  detailNavPos.title = loopable ? "Prev / next wraps around the filtered list" : "";
}

/**
 * Step to the previous/next clip in the currently-filtered list and
 * re-open the detail view on it. Keeps `activeIndex` in sync so the
 * underlying list highlights the same clip when the user closes the
 * detail. Wraps around the list edges (last->first / first->last) with
 * a subtle "looped" toast; only a single-item list has nowhere to go.
 */
async function stepDetail(direction: -1 | 1): Promise<void> {
  if (!detailId) return;
  // Similar-traversal mode: step through the snapshot stack instead of
  // currentClips. Cycle wraps so the user can keep tapping a single
  // direction key. Resync happens inside openDetail via syncSimilarNav.
  if (similarNav && isInSimilarNav(similarNav, detailId)) {
    const step = stepSimilarNav(similarNav, direction === 1 ? "next" : "prev");
    if (!step) return;
    await openDetail(step.id);
    return;
  }
  const idx = currentClips.findIndex((c) => c.id === detailId);
  if (idx < 0) return;
  // Wrap-around: stepping past either edge loops to the other end (and
  // surfaces a subtle "looped" toast), matching the similar-nav cycle.
  // nextDetailIndex returns null only when there's genuinely nowhere to
  // go (single-item list) — so a short filter result still loops.
  const step = nextDetailIndex(idx, direction, currentClips.length, true);
  if (!step) return;
  const target = currentClips[step.index];
  activeIndex = step.index;
  await openDetail(target.id);
  if (step.wrapped) toast(formatWrapToast(direction));
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

/**
 * Paint the per-clip lock toggle. Three states surfaced visually:
 *   - locked → filled padlock + accent active class so it stands out
 *     in the detail header (lock is rare, and the user should see at
 *     a glance which clips carry it).
 *   - unlocked → outline padlock, neutral icon-btn styling, tooltip
 *     explains what the toggle does.
 *
 * Mirrors renderArchiveButton's contract so the openDetail() caller
 * can wire all three (redact + archive + lock) the same way.
 */
function renderLockButton(c: ClipItem) {
  if (c.locked) {
    detailLock.innerHTML = icons.lockFilled();
    detailLock.title = "Locked — click to unlock (delete confirms while locked)";
    detailLock.classList.add("active");
  } else {
    detailLock.innerHTML = icons.lock();
    detailLock.title = "Lock — ask before deleting this clip";
    detailLock.classList.remove("active");
  }
}

/**
 * Render the "Locked" breadcrumb in the detail-view meta row.
 * Visible only when `c.locked === true` AND we have a `lockedAt`
 * stamp (back-compat: clips locked before the stamp existed don't
 * have the field — those simply hide the row until the user
 * re-locks). Clears on unlock.
 *
 * Why a separate row from the padlock toggle?
 *   - The padlock is the ACTION (toggle).
 *   - The breadcrumb is the HISTORY ("when did I commit to this?").
 *   Both belong in detail-view but answer different questions.
 *
 * Uses formatLockedSince() so the date math is testable in isolation
 * without spinning up the popup.
 */
function renderLockedRow(c: ClipItem): void {
  if (c.locked !== true || typeof c.lockedAt !== "number") {
    detailLockedRow.hidden = true;
    detailLockedInfo.textContent = "";
    return;
  }
  const formatted = formatLockedSince(c.lockedAt, Date.now());
  detailLockedRow.hidden = false;
  detailLockedInfo.textContent = formatted.label;
  detailLockedInfo.title = `${formatted.tooltip} · click the padlock above to unlock this clip`;
}

/**
 * Paint the per-clip note row in detail-view. The textarea is ALWAYS
 * present (the row never hides) so the user has an obvious "add a
 * note here" affordance even on noteless clips — different from the
 * conditional rows above (locked/template/ocr) which exist to
 * surface STATE, not to invite input.
 *
 * Pre-fills with the current note (if any) and refreshes the
 * char-counter + Clear button. The actual save happens on blur +
 * Cmd/Ctrl+Enter via the input handlers wired below renderTrash().
 *
 * Defensive: dataset.original tracks the value at-paint time so the
 * blur-handler can short-circuit a no-op save (the user opened the
 * detail, didn't touch the note, closed it — no IDB write). The
 * dataset comparison uses the raw string, NOT the sanitized form,
 * because the sanitize() pass is symmetric (already-sanitized input
 * → same string).
 */
function renderNoteRow(c: ClipItem): void {
  const current = typeof c.note === "string" ? c.note : "";
  detailNote.value = current;
  detailNote.dataset.clipId = c.id;
  detailNote.dataset.original = current;
  updateNoteCount(current);
  detailNoteClear.hidden = !hasClipNote(c);
  paintNoteStamp(c.noteUpdatedAt);
  // Promote-hashtags chip: surfaces when the note contains
  // #hashtag tokens not yet in the structured tag list.
  // paintNotePromoteChip uses the current TEXTAREA value + the
  // clip's current tag list, so the chip is live against
  // unsaved edits too (no need to wait for blur/save).
  paintNotePromoteChip(current, c.tags);
  // Strip-hashtags chip: surfaces when the note contains ANY
  // `#hashtag` tokens (independent of structured-tag list). Lives
  // alongside the promote chip so the user can pick: PROMOTE (add
  // tags, keep note), STRIP (remove inline tokens, keep prose), or
  // both back-to-back.
  paintNoteStripChip(current);
  // Promote+Strip combo chip: single-click variant of the two-step
  // promote-then-strip workflow. Same visibility gate as promote
  // alone (needs at least one NEW hashtag) so the chip surfaces
  // only when both halves would do real work.
  paintNotePromoteStripChip(current, c.tags);
}

/**
 * Paint the "Noted <X ago>" breadcrumb pill in the note-row foot.
 * Hidden when:
 *   - the clip has no note (no point showing a stamp for a non-thing)
 *   - the clip was noted before noteUpdatedAt shipped (legacy: still
 *     a note, but we can't tell when, so we silently omit the stamp
 *     rather than show a misleading "Noted" with no age)
 *
 * formatNoteUpdatedSince is the single source of truth for the
 * label + tooltip math — same module powers the chronology cutoff
 * the Cmd+K "Show recently noted" command uses, so the user sees
 * the same age the palette tally is computed against.
 */
function paintNoteStamp(noteUpdatedAt: number | undefined): void {
  if (typeof noteUpdatedAt !== "number" || !Number.isFinite(noteUpdatedAt)) {
    detailNoteStamp.hidden = true;
    detailNoteStamp.textContent = "";
    detailNoteStamp.title = "";
    return;
  }
  const formatted = formatNoteUpdatedSince(noteUpdatedAt, Date.now());
  detailNoteStamp.hidden = false;
  detailNoteStamp.textContent = formatted.label;
  detailNoteStamp.title = formatted.tooltip;
}

/**
 * Repaint the char-counter + over-cap flag. Called on every input
 * event + on paint. The display is "N / 2000" — over-cap turns red
 * because the underlying sanitizer slices to the cap, so anything
 * over that is content the user is about to LOSE on save.
 */
function updateNoteCount(value: string): void {
  const len = value.length;
  detailNoteCount.textContent = `${len.toLocaleString()} / ${CLIP_NOTE_MAX_LEN.toLocaleString()}`;
  if (len > CLIP_NOTE_MAX_LEN) {
    detailNoteCount.classList.add("over-cap");
  } else {
    detailNoteCount.classList.remove("over-cap");
  }
  detailNoteClear.hidden = value.trim().length === 0;
}

/**
 * Repaint the per-clip "Promote N #tags" chip in the note-row foot.
 *
 * Surfaces when the live note value contains `#hashtag` tokens that
 * aren't already in the clip's structured tag list (case-insensitive
 * match). Click handler reads the chip's dataset for the merged
 * tag list and writes via the same db.updateTags path the bulk-bar
 * uses - single source of truth means the chip + the bulk action
 * produce byte-identical structured tag lists for the same input.
 *
 * Called from:
 *   - renderNoteRow (initial paint when detail opens)
 *   - the textarea input event (live as the user types - reach
 *     for the chip the moment they finish typing `#staging`)
 *   - saveDetailNote post-write (refresh once the new note is
 *     canonicalised)
 *   - the chip's own click handler (post-promotion the chip should
 *     hide because every hashtag is now structured)
 *
 * The current `tags` arg is the LATEST tag list (pulled from the
 * stored ClipItem at paint time + refreshed via detailTags.value
 * on input event). Without that, a user who promotes then adds
 * another `#newone` to the note would see the chip stale-include
 * the just-promoted tags as "still pending".
 *
 * Defensive: detailNote.dataset.clipId mismatch (rare race when
 * the detail navigates between paints) leaves the chip hidden -
 * the click handler also re-checks at fire time.
 */
function paintNotePromoteChip(
  noteValue: string,
  currentTags: string[] | undefined,
): void {
  const clipId = detailNote.dataset.clipId;
  if (!clipId) {
    detailNotePromote.hidden = true;
    return;
  }
  const plan = planNoteHashtagPromote({
    id: clipId,
    note: noteValue,
    tags: Array.isArray(currentTags) ? currentTags : [],
  });
  if (plan.pending.length === 0) {
    detailNotePromote.hidden = true;
    detailNotePromote.textContent = "";
    detailNotePromote.title = "";
    // Clear the dataset so a stale click can't fire after the chip
    // becomes inert mid-render.
    delete detailNotePromote.dataset.merged;
    delete detailNotePromote.dataset.pending;
    return;
  }
  detailNotePromote.hidden = false;
  detailNotePromote.textContent = formatNoteHashtagPromoteLabel(plan);
  detailNotePromote.title = formatNoteHashtagPromoteTooltip(plan);
  // Stash the merged tag list + pending list on the element so the
  // click handler can write without re-running the plan (the
  // textarea may have changed between paint and click — we want to
  // act on the plan the USER saw, not a fresh one). The click
  // handler defensively re-plans anyway as a tie-break, but stashing
  // here lets the toast carry the exact list the chip advertised.
  detailNotePromote.dataset.pending = plan.pending.join(",");
  if (plan.mergedTags) {
    detailNotePromote.dataset.merged = JSON.stringify(plan.mergedTags);
  } else {
    delete detailNotePromote.dataset.merged;
  }
}

/**
 * Repaint the per-clip "Strip N #tags" chip in the note-row foot.
 *
 * Sibling of paintNotePromoteChip — operates on the SAME note text
 * but answers a different question: how many `#hashtag` tokens are
 * present (= would be removed by a click), regardless of whether
 * they're already in the structured tag list.
 *
 * Why two chips (promote + strip) instead of one combined one?
 *   - Different semantics: promote ADDS structured tags, strip
 *     REMOVES inline text. They can both be relevant at once
 *     ("promote then strip" is a valid two-click workflow) but the
 *     user shouldn't have to choose between them via a modal — both
 *     chips visible side-by-side is the clearest affordance.
 *   - Different visibility predicates: promote is hidden when every
 *     hashtag is already structured (nothing new to promote); strip
 *     is hidden ONLY when there are zero `#tag` tokens at all
 *     (even already-promoted ones can be stripped — that's exactly
 *     the post-promotion cleanup workflow). So the gates differ.
 *
 * The strip chip composes the same regex extraction as
 * Tag-from-notes so the user can't see "Strip 3 #tags" then have
 * the action fail to find any — single source of truth via the
 * pure module.
 *
 * Called from the same five paint anchors paintNotePromoteChip
 * uses (renderNoteRow, textarea input, save post-write, clear
 * post-write, chip-click post-action) so the two chips repaint in
 * lockstep — a textarea edit always refreshes BOTH chips.
 *
 * Defensive: when the textarea has no clipId set (rare race during
 * navigation between paints) we hide rather than crash.
 */
function paintNoteStripChip(noteValue: string): void {
  const clipId = detailNote.dataset.clipId;
  if (!clipId) {
    detailNoteStrip.hidden = true;
    return;
  }
  if (!noteHasStrippableHashtags(noteValue)) {
    detailNoteStrip.hidden = true;
    detailNoteStrip.textContent = "";
    detailNoteStrip.title = "";
    delete detailNoteStrip.dataset.count;
    return;
  }
  const count = countStrippableHashtagsInNote(noteValue);
  detailNoteStrip.hidden = false;
  detailNoteStrip.textContent = formatStripHashtagsChipLabel(count);
  detailNoteStrip.title = formatStripHashtagsChipTooltip(count);
  // Stash the count on the dataset so the click handler can show
  // the toast with the exact number the chip ADVERTISED (defensive
  // against a textarea-edit race between paint and click — the
  // handler defensively re-counts anyway).
  detailNoteStrip.dataset.count = String(count);
}

/**
 * Repaint the per-clip "Promote N #tags + strip" combo chip.
 *
 * Single-clip mirror of the bulk-bar Tag-from-notes-and-clear
 * combo, but with STRIP semantics (preserves prose) instead of
 * the destructive whole-note clear. Closes the per-clip workflow:
 *
 *   - Promote alone:        ADDS tags, keeps inline text + prose
 *   - Strip alone:          REMOVES inline text, keeps tag list
 *   - Combo (THIS):         Does BOTH in one click
 *
 * Visibility gate (planPromoteAndStrip.pending.length > 0) is the
 * same as the standalone promote chip's. When every hashtag is
 * already structured, the standalone strip chip surfaces but this
 * combo hides — clicking it would do the same thing as strip alone,
 * just with extra noise on the toast. The user gets the cleanest
 * affordance for what they're trying to do.
 *
 * The two-click "promote then strip" path still works (both chips
 * remain visible side by side); the combo just trims the chord.
 *
 * Same five paint anchors as the other two chips (renderNoteRow,
 * textarea input, save post-write, clear post-write, click
 * post-action) so the trio repaints in lockstep.
 *
 * Defensive: textarea has no clipId set (rare race) → hide rather
 * than crash.
 */
function paintNotePromoteStripChip(
  noteValue: string,
  currentTags: string[] | undefined,
): void {
  const clipId = detailNote.dataset.clipId;
  if (!clipId) {
    detailNotePromoteStrip.hidden = true;
    return;
  }
  const plan = planPromoteAndStrip({
    id: clipId,
    note: noteValue,
    tags: Array.isArray(currentTags) ? currentTags : [],
  });
  if (plan.pending.length === 0 || !plan.mergedTags) {
    detailNotePromoteStrip.hidden = true;
    detailNotePromoteStrip.textContent = "";
    detailNotePromoteStrip.title = "";
    delete detailNotePromoteStrip.dataset.merged;
    delete detailNotePromoteStrip.dataset.newnote;
    delete detailNotePromoteStrip.dataset.empties;
    return;
  }
  detailNotePromoteStrip.hidden = false;
  detailNotePromoteStrip.textContent = formatPromoteAndStripChipLabel(plan);
  detailNotePromoteStrip.title = formatPromoteAndStripChipTooltip(plan);
  // Stash plan state for the click handler. We always defensively
  // re-plan at click time anyway (the textarea may have changed
  // between paint and click) but stashing lets the toast carry
  // the exact label the chip ADVERTISED.
  detailNotePromoteStrip.dataset.merged = JSON.stringify(plan.mergedTags);
  // newNote may be undefined (strip empties the note); the empty
  // flag carries that signal so the click handler can decide
  // between setClipNote(undefined) and setClipNote(string).
  detailNotePromoteStrip.dataset.empties = plan.emptiesNote ? "1" : "0";
  if (plan.newNote !== undefined) {
    detailNotePromoteStrip.dataset.newnote = plan.newNote;
  } else {
    delete detailNotePromoteStrip.dataset.newnote;
  }
}

/**
 * Persist the current note value (sanitized) for the open clip.
 * Returns true when something actually got written. False on
 * no-op (same value as the painted original) or when the clip
 * is no longer the open one (rare race — user navigated away
 * between focus and blur).
 */
async function saveDetailNote(): Promise<boolean> {
  const id = detailNote.dataset.clipId;
  if (!id) return false;
  if (detailId !== id) return false; // user navigated
  const raw = detailNote.value;
  const sanitized = sanitizeClipNote(raw);
  const original = detailNote.dataset.original ?? "";
  const originalSanitized = sanitizeClipNote(original);
  if (sanitized === originalSanitized) return false; // no-op
  const result = await setClipNote(id, sanitized);
  if (result === null) {
    toast("Clip not found", "error");
    return false;
  }
  // Refresh the dataset to the new canonical value so the next blur
  // doesn't re-save the same thing.
  detailNote.dataset.original = sanitized ?? "";
  // Clear button reflects post-save reality.
  detailNoteClear.hidden = !sanitized;
  // Refresh the "Noted <X ago>" stamp — paint immediately so the user
  // sees the breadcrumb appear without having to close and re-open
  // detail. setClipNote stamps noteUpdatedAt = Date.now() on the
  // write side, so passing Date.now() here paints the same value
  // (within a few ms) that the next paint via render→openDetail
  // would. The save's IDB round-trip lands before the next render
  // pulls the clip, so the future paint is consistent too.
  if (sanitized) {
    paintNoteStamp(Date.now());
  } else {
    paintNoteStamp(undefined);
  }
  toast(sanitized ? "Note saved" : "Note cleared");
  return true;
}

function closeDetail() {
  endRevealOnce();
  // Defensive: if the send-to dropdown is open and the user navigates
  // away via Back / Esc, drop the menu so it doesn't linger as a
  // ghost overlay over the main list.
  if (!detailSendMenu.hidden) closeSendMenu();
  detailEl.hidden = true;
  detailId = null;
  // Exiting detail-view always drops similar-nav. The user can re-enter
  // traversal mode from any clip's Similar row; the stack is intentionally
  // session-local (no point persisting across closes).
  similarNav = null;
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
  sDensity.value = resolveDensity(s);
  // Privacy audit retention — defaults to 30 if the stored value
  // is missing or junk (a freshly imported settings shape from an
  // older version won't have this field).
  const retention = (s.privacyAuditRetention === 10 || s.privacyAuditRetention === 30 ||
    s.privacyAuditRetention === 60 || s.privacyAuditRetention === 100)
    ? s.privacyAuditRetention
    : 30;
  auditRetentionEl.value = String(retention);
  auditFootCap.textContent = String(retention);
  // Reset transient audit filters on every panel open. They're a
  // glance, not a preference — re-opening should land you on the
  // global ring, not on whatever you last scoped to.
  auditClipScope = null;
  auditWindow = "all";
  auditWindowEl.value = "all";
  auditFilter = "all";
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
  // Resolve the picked density once (snap a tampered <select> value back
  // to comfortable) so both the density field and the mirrored
  // compactRows boolean derive from the same source of truth.
  const pickedDensity: Density =
    sDensity.value === "comfortable" ||
    sDensity.value === "cozy" ||
    sDensity.value === "compact"
      ? (sDensity.value as Density)
      : "comfortable";
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
    // Row density drives the new tri-state; keep the legacy compactRows
    // boolean MIRRORED (compact <-> true) so the palette quick-toggle +
    // import/export round-trip + any legacy reader stay consistent.
    density: pickedDensity,
    compactRows: densityToCompactBool(pickedDensity),
    // Snap the raw <select> value back to the allowed quartet so a
    // tampered DOM (extension dev-tools, etc.) can't sneak a value
    // like 5000 into IDB.
    privacyAuditRetention: (() => {
      const v = Number(auditRetentionEl.value);
      return v === 10 || v === 30 || v === 60 || v === 100 ? (v as 10 | 30 | 60 | 100) : 30;
    })(),
    blockList: sBlock.value.split("\n").map((s) => s.trim()).filter(Boolean),
    allowList: sAllow.value.split("\n").map((s) => s.trim()).filter(Boolean),
    theme: (sTheme.value as Settings["theme"]) || "auto",
  };
  const saved = await saveSettings(next);
  document.body.dataset.theme = saved.theme;
  applyBlurMode(saved.blurPreviews);
  // Apply the resolved density (honors the new field; falls back to the
  // legacy boolean for an old saved shape).
  applyCompactRows(resolveDensity(saved));
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
 * Apply the row density to the body. Toggles the `compact-rows` /
 * `cozy-rows` classes (comfortable = neither) the list CSS keys off.
 * Pure DOM — no IDB write. Accepts either a Density string OR the
 * legacy boolean (true = compact) so the existing call sites that pass
 * `compactRows` keep working unchanged; a boolean is mapped through the
 * same comfortable/compact pair.
 *
 * `compactRows` setting still drives the legacy path; the density radio
 * + palette command pass an explicit Density.
 */
function applyCompactRows(density: Density | boolean): void {
  const d: Density =
    typeof density === "boolean"
      ? density
        ? "compact"
        : "comfortable"
      : density;
  // Clear both modifier classes, then add the one this density needs
  // (comfortable adds neither). densityBodyClass returns "" for
  // comfortable so we guard the empty add.
  document.body.classList.remove("compact-rows", "cozy-rows");
  const cls = densityBodyClass(d);
  if (cls) document.body.classList.add(cls);
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

/**
 * Per-day collapse state for the rolled-up audit panel — sticky across
 * re-renders so the user's manual fold/unfold survives a clip jump or
 * filter chip click. Keyed by `groupAuditByDay`'s YYYY-MM-DD local
 * keys. Absent key = "use the group's defaultOpen" (Today + Yesterday
 * open by default; older days fold).
 *
 * In-memory only — collapse is a glance, not a preference, and it
 * resets when the popup re-opens (consistent with the audit filter
 * chip behaviour above).
 */
const auditDayCollapsed = new Map<string, boolean>();

/**
 * Clip-scope filter for the audit panel. When set, the audit list
 * only shows entries whose `clipId` matches. Pre-applied BEFORE the
 * bucket chips so the chip counts reflect "of this clip's actions"
 * rather than the global total — which is what the user wants when
 * they're spelunking one clip's history.
 *
 * Activated by Alt+clicking a jumpable audit row (or via the row's
 * right-click → "Filter audit to this clip" entry). A clear-scope
 * pill appears above the chip strip while active; clicking it
 * resets to the global view.
 *
 * Like the bucket filter + day-collapse: in-memory only, resets on
 * popup close. The audit panel is a glance, not a preference.
 */
let auditClipScope: { clipId: string; preview: string } | null = null;

/**
 * Time-window filter for the audit panel. Default "all" shows the
 * entire ring buffer (capped at the retention setting). "7d" / "30d"
 * pre-filter by entry `at` BEFORE the bucket chips so the chip
 * counts reflect the window the user picked.
 *
 * Same lifecycle as `auditClipScope` + `auditFilter`: module state,
 * resets on popup close. The audit panel is a glance, not a
 * preference.
 */
type AuditWindow = "all" | "7d" | "30d";
let auditWindow: AuditWindow = "all";

const AUDIT_WINDOW_MS: Record<Exclude<AuditWindow, "all">, number> = {
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

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
    auditScopeEl.hidden = true;
    auditScopeEl.innerHTML = "";
    auditList.innerHTML = `<div class="audit-empty">When you redact, scrub, forget a host, or archive a clip, the action shows up here.</div>`;
    return;
  }
  // 1) Scope filters apply BEFORE the bucket counts so chips show
  //    "of these visible rows" rather than the global tally. Order:
  //    clip-scope → time-window → bucket. Each is a narrowing pass.
  let windowed = entries;
  if (auditWindow !== "all") {
    const cutoff = Date.now() - AUDIT_WINDOW_MS[auditWindow];
    windowed = windowed.filter((e) => e.at >= cutoff);
  }
  // Auto-scope-away if the scoped clip no longer has any matching
  // entries in the visible window (user might have cleared rows in
  // a way that left zero matches). Keeps the panel from looking
  // mysteriously empty.
  if (auditClipScope) {
    const scoped = windowed.filter((e) => e.clipId === auditClipScope!.clipId);
    if (scoped.length === 0) {
      auditClipScope = null;
    } else {
      windowed = scoped;
    }
  }

  // 2) Render the scope banner (clip + window) above the chips. The
  //    banner only appears when at least one scope is active — when
  //    everything is "all", the panel reads as the global ring.
  const scopeBits: string[] = [];
  if (auditClipScope) {
    scopeBits.push(
      `<button type="button" class="audit-scope-pill" data-act="clear-clip" title="Show audit rows for every clip">` +
        `<span class="audit-scope-label">clip:</span>` +
        `<span class="audit-scope-value" title="${escapeHtml(auditClipScope.preview)}">${escapeHtml(auditClipScope.preview.slice(0, 32))}</span>` +
        `<span class="audit-scope-x" aria-hidden="true">×</span>` +
        `</button>`,
    );
  }
  if (auditWindow !== "all") {
    const windowLabel = auditWindow === "7d" ? "Last 7 days" : "Last 30 days";
    scopeBits.push(
      `<button type="button" class="audit-scope-pill" data-act="clear-window" title="Show every audit row">` +
        `<span class="audit-scope-label">when:</span>` +
        `<span class="audit-scope-value">${escapeHtml(windowLabel)}</span>` +
        `<span class="audit-scope-x" aria-hidden="true">×</span>` +
        `</button>`,
    );
  }
  if (scopeBits.length === 0) {
    auditScopeEl.hidden = true;
    auditScopeEl.innerHTML = "";
  } else {
    auditScopeEl.hidden = false;
    auditScopeEl.innerHTML = scopeBits.join("");
  }

  // 3) Bucket counts so chips can show the right N inline — and so we can
  //    hide chips that would match zero rows (no point offering a "TTL"
  //    pill if the user has never set one).
  const counts: Record<Exclude<AuditFilter, "all">, number> = {
    redact: 0,
    scrub: 0,
    lifecycle: 0,
    host: 0,
    ttl: 0,
  };
  for (const e of windowed) counts[auditKindBucket(e.kind)]++;
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
      const n = c.id === "all" ? windowed.length : counts[c.id as Exclude<AuditFilter, "all">];
      const active = c.id === auditFilter ? " active" : "";
      // New chip body via buildAuditChipBody: parens around the
      // count + percentage-of-visible tooltip so the strip reads as
      // a real frequency distribution. The "All" chip skips the
      // percentage (it would always be 100%) and shows raw count
      // with "actions in this view" copy instead.
      const { bodyHtml, title } = buildAuditChipBody(
        {
          label: c.label,
          count: n,
          total: windowed.length,
          isAll: c.id === "all",
        },
        escapeHtml,
      );
      return (
        `<button type="button" class="audit-chip${active}" data-filter="${escapeHtml(c.id)}" title="${escapeHtml(title)}">` +
        `${bodyHtml}</button>`
      );
    })
    .join("");

  const filtered =
    auditFilter === "all"
      ? windowed
      : windowed.filter((e) => auditKindBucket(e.kind) === auditFilter);
  // Summary stays informative across all three filter layers — show
  // "filtered / global" when ANY scope is active so the user knows the
  // ring isn't shrinking, just narrowed.
  const totalForSummary = entries.length;
  auditSummary.textContent =
    auditFilter === "all" && auditWindow === "all" && !auditClipScope
      ? `${totalForSummary} action${totalForSummary === 1 ? "" : "s"}`
      : `${filtered.length} of ${totalForSummary}`;
  if (filtered.length === 0) {
    // "Last N" reads from the live foot-cap span so it tracks the
    // user's retention pick. Falls back to the entries length when
    // the foot cap span hasn't rendered yet (very early render).
    const capLabel = auditFootCap.textContent || String(entries.length);
    auditList.innerHTML = `<div class="audit-empty">No ${escapeHtml(auditFilter)} actions in the last ${escapeHtml(capLabel)}.</div>`;
    return;
  }
  auditList.innerHTML = renderAuditGroupsHtml(filtered);
}

/**
 * Render the filtered audit entries as day-grouped collapsible
 * sections. Per-day header carries the count + a chevron; clicking
 * toggles the section open/closed (state stored in `auditDayCollapsed`
 * so it survives re-renders).
 *
 * Non-clip rows (forget-host) render as <div>; clip-tied rows render
 * as <button> with a `jumpable` class — the existing click handler
 * on `auditList` already routes those, no per-day wiring needed.
 */
function renderAuditGroupsHtml(entries: PrivacyAuditEntry[]): string {
  if (entries.length === 0) return "";
  const groups = groupAuditByDay(entries);
  return groups
    .map((g) => {
      // Resolve effective open state: sticky override → group default.
      const sticky = auditDayCollapsed.get(g.key);
      const open = sticky != null ? !sticky : g.defaultOpen;
      const rowsHtml = open
        ? g.entries
            .map((e) => {
              const subjectBits: string[] = [];
              if (e.host) subjectBits.push(`@${e.host}`);
              if (e.detail) subjectBits.push(e.detail);
              const subject = subjectBits.join(" · ");
              const jumpable = !!e.clipId;
              const tag = jumpable ? "button" : "div";
              const extra = jumpable
                ? ` type="button" data-act="jump" data-clip-id="${escapeHtml(e.clipId)}" title="Show this clip · Alt-click to scope · right-click to forget"`
                : ` title="Right-click to forget this entry"`;
              return (
                `<${tag} class="audit-row audit-${e.kind}${jumpable ? " jumpable" : ""}" data-entry-id="${escapeHtml(e.id)}"${extra}>` +
                `<span class="audit-kind">${escapeHtml(auditKindLabel(e.kind))}</span>` +
                `<span class="audit-subject" title="${escapeHtml(subject)}">${escapeHtml(subject || "—")}</span>` +
                `<span class="audit-time" title="${escapeHtml(new Date(e.at).toLocaleString())}">${escapeHtml(timeAgo(e.at))}</span>` +
                `</${tag}>`
              );
            })
            .join("")
        : "";
      const chev = open ? "▾" : "▸";
      const aria = open ? "true" : "false";
      const n = g.entries.length;
      return (
        `<div class="audit-day${open ? " open" : ""}" data-day-key="${escapeHtml(g.key)}">` +
        `<button type="button" class="audit-day-head" data-act="toggle-day" aria-expanded="${aria}" title="${open ? "Collapse" : "Expand"} ${escapeHtml(g.label)}">` +
        `<span class="audit-day-chev">${chev}</span>` +
        `<span class="audit-day-label">${escapeHtml(g.label)}</span>` +
        `<em class="audit-day-count">${n}</em>` +
        `</button>` +
        (open ? `<div class="audit-day-rows">${rowsHtml}</div>` : "") +
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

/**
 * Click an audit row → jump to that clip. Lookup ladder:
 *  1) Live clips store — open the detail view (handles archived
 *     clips by surfacing them via openDetail's orphan-tolerant path).
 *  2) Trash store — close settings, scroll the trash panel into view,
 *     and toast where they ended up. We deliberately DON'T auto-restore
 *     (the trash is an intentional retention boundary; the user should
 *     decide whether to restore).
 *  3) Gone entirely — toast a friendly note; the audit row is the
 *     only evidence the clip ever existed.
 *
 * Non-clip rows (forget-host) don't carry a clipId and never enter
 * this handler — they render as plain divs above.
 */
auditList.addEventListener("click", async (e) => {
  // Day-header toggle: collapse / expand a day group. Stops here —
  // the "jump to clip" handler below ignores non-row targets.
  const dayHead = (e.target as HTMLElement).closest("button.audit-day-head") as
    | HTMLButtonElement
    | null;
  if (dayHead) {
    const dayEl = dayHead.closest(".audit-day") as HTMLElement | null;
    const key = dayEl?.dataset.dayKey || "";
    if (!key) return;
    // Read current state from the DOM so we don't have to recompute
    // defaultOpen here (the renderer already resolved it). Toggle the
    // override map: true = collapsed, false = expanded.
    const wasOpen = dayEl?.classList.contains("open") ?? false;
    auditDayCollapsed.set(key, wasOpen);
    void renderAudit();
    return;
  }
  const btn = (e.target as HTMLElement).closest("button.audit-row.jumpable") as
    | HTMLButtonElement
    | null;
  if (!btn) return;
  const clipId = btn.dataset.clipId || "";
  if (!clipId) return;
  // Alt-click pivots to clip-scope mode INSTEAD of jumping. Lets the
  // user spelunk one clip's history without leaving the audit panel.
  // Plain click still jumps (the dominant flow); the modifier opt-in
  // keeps a single click reversible.
  if (e.altKey) {
    e.preventDefault();
    await setAuditClipScope(clipId);
    return;
  }
  const live = await getClip(clipId);
  if (live) {
    closeSettings();
    await openDetail(clipId);
    return;
  }
  // Not in live store — peek into trash.
  const trash = await listTrash();
  const hit = trash.find((t) => t.id === clipId);
  if (hit) {
    // Make sure trash section is visible + offer a single-click
    // restore via the toast so they don't have to scroll-hunt.
    const preview =
      (hit.preview || hit.content || "Clip").slice(0, 40).replace(/\s+/g, " ");
    toast(`In trash: ${preview}`, "ok", {
      label: "Restore",
      fn: async () => {
        const ok = await restoreClip(clipId);
        if (!ok) {
          toast("Couldn't restore", "error");
          return;
        }
        await renderTrash();
        await renderAudit();
        await render();
        toast("Restored — back in the list");
      },
    });
    // Scroll the trash list into view inside the settings panel so
    // the user can see the row even if they ignore the toast.
    const trashSection = document.getElementById("trash-section");
    trashSection?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  toast("Clip is gone — only the audit row remains", "error");
});

/**
 * Resolve a short preview for a clipId so the scope-pill reads as
 * something the user recognises ("Hello world…" rather than a
 * random id). Looks in live first, falls back to trash, then to the
 * clipId itself (better than an empty pill — at least it's stable).
 */
async function previewForClipId(clipId: string): Promise<string> {
  const live = await getClip(clipId);
  if (live) return (live.preview || live.content || clipId).slice(0, 60);
  const trash = await listTrash();
  const t = trash.find((x) => x.id === clipId);
  if (t) return (t.preview || t.content || clipId).slice(0, 60);
  return `clip ${clipId.slice(0, 8)}`;
}

/**
 * Pivot the audit panel into clip-scope mode. Resets the bucket
 * filter to "all" so the user sees everything the scoped clip has
 * collected before re-narrowing (otherwise scoping to a clip with
 * no TTL actions while the bucket sits on "ttl" would land them on
 * an empty panel).
 */
async function setAuditClipScope(clipId: string): Promise<void> {
  if (!clipId) return;
  const preview = await previewForClipId(clipId);
  auditClipScope = { clipId, preview };
  auditFilter = "all";
  await renderAudit();
  // Scroll the audit panel into view so the new scope is obvious
  // even if the user alt-clicked from far down the list.
  const el = document.getElementById("audit-section");
  el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Scope-pill clicks: each pill is a clear-this-scope affordance.
 * `data-act` says which scope to wipe; the renderer rebuilds.
 */
auditScopeEl.addEventListener("click", async (e) => {
  const pill = (e.target as HTMLElement).closest(".audit-scope-pill") as
    | HTMLButtonElement
    | null;
  if (!pill) return;
  const act = pill.dataset.act || "";
  if (act === "clear-clip") auditClipScope = null;
  else if (act === "clear-window") auditWindow = "all";
  await renderAudit();
});

auditWindowEl.addEventListener("change", () => {
  const v = auditWindowEl.value;
  if (v === "all" || v === "7d" || v === "30d") {
    auditWindow = v;
    void renderAudit();
  }
});

/**
 * Right-click on an audit row → "Forget this action" confirm. Drops
 * a single entry from the privacy audit ring (via
 * `removePrivacyAuditEntry`). Re-renders the panel so the row vanishes
 * without a full refresh.
 *
 * Why right-click instead of a hover-X? The audit log is a privacy
 * receipt — surfacing a destructive affordance on every row would
 * make accidental clicks easy. Right-click signals "I mean this" and
 * the confirm dialog gives one more chance to back out.
 *
 * Day-header right-clicks fall through to the browser's native menu —
 * we don't want to intercept those since the header isn't a forgettable
 * action (it's a fold cue).
 */
auditList.addEventListener("contextmenu", async (e) => {
  const row = (e.target as HTMLElement).closest(".audit-row") as
    | HTMLElement
    | null;
  if (!row) return;
  const id = row.dataset.entryId || "";
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  // Pull a short subject for the confirm dialog so the user knows
  // exactly which row they're erasing.
  const subject =
    (row.querySelector(".audit-subject") as HTMLElement | null)?.textContent ||
    "";
  const kind =
    (row.querySelector(".audit-kind") as HTMLElement | null)?.textContent ||
    "action";
  const label = subject && subject !== "—" ? `${kind.toLowerCase()} · ${subject}` : kind.toLowerCase();
  if (!confirm(`Forget this audit row?\n\n  ${label}\n\nThe action still happened — this only erases the receipt.`)) {
    return;
  }
  const removed = await removePrivacyAuditEntry(id);
  if (!removed) {
    toast("Couldn't forget — entry already gone", "error");
    return;
  }
  toast("Forgot one audit row");
  await renderAudit();
});

auditClearBtn.addEventListener("click", async () => {
  if (!confirm("Clear the privacy audit log? This only wipes the log — your clips and settings stay untouched.")) return;
  await clearPrivacyAudit();
  await renderAudit();
  toast("Audit log cleared");
});

// Download just the audit ring as JSON — privacy receipt with NO
// clip content. Different from the full export bundle (which carries
// clips + settings + audit alongside). Useful for personal record
// keeping or for answering "what did this extension do with my
// data" without leaking the underlying snippets.
auditDownloadBtn.addEventListener("click", async () => {
  try {
    const [entries, settings] = await Promise.all([
      listPrivacyAudit(),
      getSettings(),
    ]);
    if (entries.length === 0) {
      toast("Audit log is empty — nothing to download", "error");
      return;
    }
    const env = buildAuditExport(entries, {
      retention: settings.privacyAuditRetention,
    });
    const text = stringifyAuditExport(env);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = auditExportFilename();
    a.click();
    URL.revokeObjectURL(url);
    toast(
      entries.length === 1
        ? "Downloaded 1 audit entry"
        : `Downloaded ${entries.length} audit entries`,
    );
  } catch (e) {
    console.error("[context-clipboard] audit download failed", e);
    toast("Audit download failed — see console", "error");
  }
});

/**
 * Live retention change. Lower → trim immediately so the user sees
 * the smaller log right away. Higher → just save; the log grows on
 * the next append (no back-fill, by design — past actions stay gone
 * once they've fallen off).
 *
 * We save inline rather than waiting for the user to back out of
 * settings (`saveSettingsFromForm` on close) so the change is
 * immediately durable + the slider's effect is visible without
 * extra clicks.
 */
auditRetentionEl.addEventListener("change", async () => {
  const v = Number(auditRetentionEl.value);
  if (v !== 10 && v !== 30 && v !== 60 && v !== 100) return;
  await saveSettings({ privacyAuditRetention: v as 10 | 30 | 60 | 100 });
  auditFootCap.textContent = String(v);
  const dropped = await trimPrivacyAuditToCap();
  await renderAudit();
  if (dropped > 0) {
    toast(`Audit retention set to ${v} (trimmed ${dropped})`);
  } else {
    toast(`Audit retention set to ${v}`);
  }
});

function trashRow(t: TrashedClip, liveClips: ClipItem[] = []): string {
  const previewText =
    t.kind === "image" ? t.preview || "Image" : t.preview || t.content;
  const left = Math.max(
    0,
    Math.ceil((t.deletedAt + TRASH_RETENTION_MS - Date.now()) / 86_400_000),
  );
  const src = [hostFrom(t.source.url), t.source.title]
    .filter(Boolean)
    .join(" · ");
  // Pinned-already? Restore-and-pin would be a no-op for those (the
  // restore path preserves the pinned flag), so we hide the combo and
  // keep just the plain restore. Saves a wasted click and keeps the
  // row tidy.
  const wasPinned = !!t.pinned;
  const wasLocked = t.locked === true;
  const pinBtn = wasPinned
    ? ""
    : `<button class="trash-restore-pin" data-act="restore-pin" title="Restore + pin — bring back and mark important">${icons.pin()}</button>`;
  // Restore + lock: companion to restore-pin for the "I almost lost
  // this — make sure I never do again" workflow. Hidden when the
  // clip was already locked at trash time (would be a clean no-op
  // since trash preserves the lock bit alongside the pin bit, just
  // like restore-pin hides for already-pinned clips). Different
  // intent from restore-pin: pin = "keep visible at top", lock =
  // "ask before delete next time". A clip the user just rescued is
  // a prime candidate for the lock affordance.
  const lockBtn = wasLocked
    ? ""
    : `<button class="trash-restore-lock" data-act="restore-lock" title="Restore + lock — bring back and require confirm-on-delete">${icons.lock()}</button>`;
  // Hover-preview tooltip: when a live re-capture exists with the
  // same hash, the user can purge this trash entry without losing
  // the content. Surface that so trash-housekeeping is risk-free
  // when it can be, and so the user knows when it ISN'T (no match
  // → "purging this is permanent"). Cheap: single pass over the
  // already-loaded live array via findLiveRecaptureForTrash.
  const match = findLiveRecaptureForTrash(t.hash, liveClips);
  const recaptureTooltip = formatTrashRecaptureTooltip({
    match,
    // Pass the trashed clip so its note (if any) tails the tooltip.
    // The note is the user's commentary on THIS specific clip — the
    // single highest-signal context at trash-housekeeping time.
    // Notes ride trash via db.trashClip spreading the full ClipItem
    // into the trash store, so the field is already on `t` here.
    trashed: t,
    now: Date.now(),
  });
  // Row-level title attr surfaces on hover anywhere outside the
  // child buttons (the buttons keep their own actionable titles).
  return `
    <div class="trash-row" data-id="${t.id}" title="${escapeHtml(recaptureTooltip)}">
      <div class="trash-body">
        <div class="trash-preview">${escapeHtml(previewText.slice(0, 90))}</div>
        <div class="trash-meta">${escapeHtml(src || "—")} · deleted ${timeAgo(t.deletedAt)} · ${left}d left</div>
      </div>
      ${pinBtn}
      ${lockBtn}
      <button class="trash-restore" data-act="restore" title="Restore">Restore</button>
    </div>
  `;
}

async function renderTrash(): Promise<void> {
  const items = await listTrash();
  // Pre-load the live clip list so each trash row can resolve its
  // hash-match without a per-row IDB read. Same `wide`-shaped pull
  // the daily list uses, capped large enough that the typical
  // 500-unpinned + pinned ceiling fits in one go.
  const live = await listClips({ limit: 5000 });
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
  // Per-kind purge buttons — hidden when the trash holds zero of that
  // kind, so the toolbar stays tidy. The label carries the count +
  // freed-bytes so the user sees the storage win before clicking.
  const breakdown = summarizeTrashByKind(items);
  const textLabel = formatPurgeButtonLabel(breakdown, "text");
  if (textLabel) {
    trashPurgeText.hidden = false;
    trashPurgeText.textContent = textLabel;
  } else {
    trashPurgeText.hidden = true;
    trashPurgeText.textContent = "";
  }
  const imageLabel = formatPurgeButtonLabel(breakdown, "image");
  if (imageLabel) {
    trashPurgeImage.hidden = false;
    trashPurgeImage.textContent = imageLabel;
  } else {
    trashPurgeImage.hidden = true;
    trashPurgeImage.textContent = "";
  }
  // Host rollup strip — chips for any host with 2+ trash rows give a
  // single-click "Restore N from host" reversal of an accidental
  // forget-host. Singles already have a Restore button per row.
  const buckets = groupTrashByHost(items);
  if (buckets.length === 0) {
    trashHostStrip.hidden = true;
    trashHostStrip.innerHTML = "";
  } else {
    trashHostStrip.hidden = false;
    trashHostStrip.innerHTML =
      `<span class="trash-host-label">Bulk-restore:</span>` +
      buckets
        .slice(0, 6)
        .map(
          (b) =>
            `<button type="button" class="trash-host-pill" data-host="${escapeHtml(b.host)}" title="Restore every trashed clip from ${escapeHtml(b.host)}">` +
              `<span class="trash-host-name">${escapeHtml(b.host)}</span>` +
              `<em class="trash-host-count">${b.count}</em>` +
              `</button>`,
        )
        .join("");
  }
  if (items.length === 0) {
    trashList.innerHTML = "";
    return;
  }
  trashList.innerHTML = items.slice(0, 50).map((t) => trashRow(t, live)).join("");
}

/**
 * Bulk-restore every trashed clip whose source.url host matches the
 * chip-clicked host. Confirms above 5 because anything bigger is
 * usually a forget-host reversal — surfacing the count is the safer
 * default. Below that, the restoration is cheap and the user picked
 * the host explicitly so we skip the confirm.
 *
 * Re-renders trash + the live list afterwards so the row count moves
 * in both panels without a manual refresh.
 */
async function restoreHostFromTrash(host: string): Promise<void> {
  if (!host) return;
  const target = host.toLowerCase().replace(/^www\./, "").trim();
  if (!target) return;
  // Peek at the count so we can confirm honestly (the lib helper
  // also counts internally, but the user wants the number BEFORE
  // they commit).
  const items = await listTrash();
  const matches = items.filter((t) => {
    const h = (t.source?.url || "").toLowerCase();
    if (!h) return false;
    return hostFrom(t.source.url) === target;
  });
  if (matches.length === 0) {
    toast("No trashed clips from this host", "error");
    return;
  }
  if (matches.length > 5) {
    const ok = confirm(
      `Restore ${matches.length} clip${matches.length === 1 ? "" : "s"} from ${target}?\n\nAll matching trash rows return to the live list.`,
    );
    if (!ok) return;
  }
  const { restored, matched } = await restoreAllFromHost(target);
  if (restored === 0) {
    toast(`Couldn't restore from ${target}`, "error");
    return;
  }
  // Honest partial-success messaging when restore fails for some
  // rows (very rare — the IDB ops are idempotent — but possible).
  if (restored < matched) {
    toast(`Restored ${restored} of ${matched} from ${target}`);
  } else {
    toast(
      restored === 1
        ? `Restored 1 from ${target}`
        : `Restored ${restored} from ${target}`,
    );
  }
  await renderTrash();
  await render();
}

trashHostStrip.addEventListener("click", async (e) => {
  const pill = (e.target as HTMLElement).closest(".trash-host-pill") as
    | HTMLButtonElement
    | null;
  if (!pill) return;
  const host = pill.dataset.host || "";
  if (!host) return;
  await restoreHostFromTrash(host);
});

trashList.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const row = target.closest(".trash-row") as HTMLElement | null;
  if (!row) return;
  const id = row.dataset.id!;
  const act =
    // closest() so the click on an inner SVG path still resolves to the
    // button — restore-pin renders an inline icon, so the click target
    // is often the <path>, not the <button>.
    (target.closest<HTMLElement>("[data-act]")?.dataset.act as string) ||
    target.dataset.act ||
    "";
  if (act === "restore") {
    const ok = await restoreClip(id);
    if (ok) toast("Restored");
    await renderTrash();
    await render();
    return;
  }
  if (act === "restore-pin") {
    // Restore the clip THEN pin it. Two operations, surfaced as one
    // click — the user wants the clip back AND marked important. We
    // toast a combined message + undo so a misclick is one Esc away
    // from being reversed (undo trashes the clip again; the pin bit
    // was the new state so it would just vanish with it — that's the
    // correct undo semantics since the user clicked "restore + pin"
    // as a single intent).
    const ok = await restoreClip(id);
    if (!ok) {
      toast("Couldn't restore", "error");
      return;
    }
    // togglePin on a freshly-restored unpinned clip flips it to pinned.
    // We don't worry about race conditions here because restoreClip
    // resolves before togglePin runs.
    const nowPinned = await togglePin(id);
    if (!nowPinned) {
      // togglePin returned false → clip ended up unpinned (or vanished).
      // Toast the partial state honestly so the user knows.
      toast("Restored — but couldn't pin", "error");
    } else {
      toast("Restored + pinned", "ok", {
        label: "Undo",
        fn: async () => {
          await trashClip(id);
          await renderTrash();
          await render();
        },
      });
    }
    await renderTrash();
    await render();
    return;
  }
  if (act === "restore-lock") {
    // Restore the clip THEN lock it. Two operations, one click —
    // the user wants the clip back AND marked irreplaceable so they
    // never almost-lose it again. Mirrors restore-pin's
    // single-intent surface but applies the lock bit (with the
    // proper lockedAt stamp from setLocked, so detail-view
    // breadcrumb reads "Locked just now").
    //
    // Toast carries a combined message + undo path so a misclick is
    // one Esc away from reversal (undo re-trashes the clip, taking
    // the freshly-set lock bit with it — correct undo semantics
    // because the user clicked "restore + lock" as a single intent).
    const ok = await restoreClip(id);
    if (!ok) {
      toast("Couldn't restore", "error");
      return;
    }
    // setLocked(id, true) is idempotent + stamps lockedAt on
    // transition. We use the explicit setter (not toggleLock) so an
    // edge case where the trash row reflected stale data
    // (impossibly: it was locked at trash time but the button still
    // showed) lands as a no-op + truthful "Restored + locked" toast,
    // not an accidental UN-lock.
    const nowLocked = await setLocked(id, true);
    if (!nowLocked) {
      toast("Restored — but couldn't lock", "error");
    } else {
      toast("Restored + locked", "ok", {
        label: "Undo",
        fn: async () => {
          await trashClip(id);
          await renderTrash();
          await render();
        },
      });
    }
    await renderTrash();
    await render();
    return;
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

/**
 * Per-kind trash purge — hard-delete only `text` or only `image`
 * trash. Mirrors the all-or-nothing Empty path but slices the trash
 * by kind so the user can free storage from a few huge images without
 * losing the text safety net (or vice versa). The plan is computed
 * up-front via the pure trash-purge-kind module, so the confirm
 * message can name the exact count + freed-bytes before commit.
 *
 * Skips the confirm path when the trash holds zero of that kind
 * (button is hidden in that case, but defense-in-depth in case it
 * gets clicked via DOM tooling).
 */
async function purgeTrashByKind(kind: "text" | "image"): Promise<void> {
  const items = await listTrash();
  const plan = planTrashPurge(items, kind);
  if (plan.count === 0) {
    toast(`No ${kind} clips in trash`);
    return;
  }
  if (!confirm(formatPurgeConfirm(plan))) return;
  const purged = await purgeTrashByIds(plan.ids);
  toast(`Purged ${purged} ${kind} clip${purged === 1 ? "" : "s"}`);
  await renderTrash();
}

trashPurgeText.addEventListener("click", () => void purgeTrashByKind("text"));
trashPurgeImage.addEventListener("click", () => void purgeTrashByKind("image"));

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
    // Refresh the cached "last forgotten host" pointer so the Cmd+K
    // command surfaces the rescue offer immediately (without waiting
    // for the next popup boot).
    void refreshLastForgottenHost();
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
  action: "listSiteRules" | "upsertSiteRule" | "removeSiteRule" | "replaceSiteRules",
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
  if (r.autoLock) bits.push(`<span class="rule-badge" title="Every capture from this host auto-locks (ask before delete)">lock</span>`);
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
  // Compute per-rule clip counts so the user can see which rules are
  // actually catching captures (and which are dead weight). Single
  // listClips read + a first-match-wins scan mirrors ingest exactly.
  // Bounded: scan up to 5000 clips — beyond that the count would
  // dominate render time and the badge stops being live anyway. We
  // pull richer usage stats (count + lastMatchedAt) so the badge can
  // also surface "last X ago" — kept under the same scan for free.
  const clipsForCount = await listClips({ limit: 5000 });
  const usages = usagesForRules(rules, clipsForCount);
  // Per-rule hover preview: top 3 most-recent matching clips. Same
  // first-match-wins matching as usagesForRules but a different
  // payload shape (we keep preview slice + kind for the inline thumb).
  // Pure module so this is just composition; the IDB pull is shared.
  const previews = previewClipsForRules(rules, clipsForCount, {
    limit: 3,
    hostFrom,
    matchesHostPattern,
  });
  siteRulesList.innerHTML = rules
    .map((r) => {
      const u = usages.get(r.id);
      const n = u?.count ?? 0;
      const ago = u?.lastMatchedAt ? ` · ${timeAgo(u.lastMatchedAt)}` : "";
      const exact = u?.lastMatchedAt
        ? ` (last match ${new Date(u.lastMatchedAt).toLocaleString()})`
        : "";
      const usageBadge =
        n > 0
          ? `<span class="rule-usage" title="${n} clip${n === 1 ? "" : "s"} captured under this rule${exact} — click to filter the list" data-act="filter" data-host="${escapeHtml(r.hostPattern)}">${n} clip${n === 1 ? "" : "s"}<span class="rule-usage-ago">${escapeHtml(ago)}</span></span>`
          : `<span class="rule-usage muted" title="No clips have matched this rule yet">unused</span>`;
      // Hover preview card — appears on row hover when the rule has
      // at least one match. Click an entry to jump to that clip's
      // detail-view; the row click handler routes via data-act="preview".
      const previewRows = previews.get(r.id) || [];
      const previewTitle = formatPreviewCardTitle(n, previewRows.length);
      const previewHtml =
        previewRows.length > 0 && previewTitle
          ? `<div class="rule-preview-card" aria-hidden="true">` +
            `<div class="rule-preview-title">${escapeHtml(previewTitle)}</div>` +
            previewRows
              .map((p) => {
                const tooltip = formatPreviewRowTooltip(p.preview, timeAgo(p.lastSeenAt));
                return (
                  `<button type="button" class="rule-preview-row${p.pinned ? " pinned" : ""}" data-act="preview" data-clip-id="${escapeHtml(p.clipId)}" title="${escapeHtml(tooltip)}">` +
                  `<span class="rule-preview-kind">${clipKindIcon(p.kind)}</span>` +
                  `<span class="rule-preview-text">${escapeHtml(p.preview || "(empty)")}</span>` +
                  `<span class="rule-preview-ago">${escapeHtml(timeAgo(p.lastSeenAt))}</span>` +
                  `</button>`
                );
              })
              .join("") +
            `</div>`
          : "";
      return (
        `<div class="site-rule-row${editingRuleId === r.id ? " editing" : ""}${previewRows.length > 0 ? " has-preview" : ""}" data-id="${escapeHtml(r.id)}" title="Click to edit">
          <div class="site-rule-host" title="${escapeHtml(r.hostPattern)}">${escapeHtml(r.hostPattern)}</div>
          <div class="site-rule-badges">${ruleBadges(r)}</div>
          ${usageBadge}
          <button class="site-rule-del" data-act="del" title="Remove rule">×</button>
          ${previewHtml}
        </div>`
      );
    })
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
  ruleLockInput.checked = !!rule.autoLock;
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
  // Surface the wildcard suggestion if the loaded rule is on a
  // multi-label apex (e.g. user added an exact `docs.github.com`
  // rule but might want `*.github.com` instead).
  renderHostSuggest();
}

function resetRuleForm(): void {
  editingRuleId = null;
  ruleHostInput.value = "";
  ruleTagsInput.value = "";
  rulePatternsInput.value = "";
  rulePinInput.checked = false;
  ruleLockInput.checked = false;
  ruleRedactInput.checked = false;
  ruleScrubInput.checked = false;
  ruleSkipInput.checked = false;
  ruleAddBtn.textContent = "Add rule";
  ruleCancelBtn.hidden = true;
  ruleFormTitle.textContent = "Add a rule";
  ruleAddBtn.closest(".site-rule-form")?.classList.remove("editing");
  renderRuleTest();
  // Drop any stale wildcard suggestion — the empty input shouldn't
  // surface a chip.
  ruleHostSuggest.hidden = true;
  ruleHostSuggest.innerHTML = "";
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
  const lock = ruleLockInput.checked;
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
  if (!skip && !pin && !lock && !redact && !scrub && tags.length === 0 && patterns.length === 0) {
    toast("Pick at least one effect", "error");
    return;
  }
  const resp = await rpcSiteRules("upsertSiteRule", {
    id: editingRuleId ?? undefined,
    hostPattern: host,
    autoTags: tags,
    autoPin: pin,
    autoLock: lock,
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
 * Render (or hide) the wildcard-suggestion chip below the rule-host
 * input. We only show it when extractHostPattern produced a wildcard
 * variant AND the input doesn't already match that wildcard — no
 * point offering `*.github.com` when the user just typed it.
 */
function renderHostSuggest(): void {
  const result = extractHostPattern(ruleHostInput.value);
  // Hide when there's nothing useful to suggest, OR when the current
  // input is already the wildcard (idempotent), OR when the current
  // input matches the wildcard's apex (user already typed the
  // narrower form on purpose).
  if (!result.wildcard) {
    ruleHostSuggest.hidden = true;
    ruleHostSuggest.innerHTML = "";
    return;
  }
  const current = ruleHostInput.value.trim().toLowerCase();
  if (current === result.wildcard) {
    ruleHostSuggest.hidden = true;
    ruleHostSuggest.innerHTML = "";
    return;
  }
  ruleHostSuggest.hidden = false;
  ruleHostSuggest.innerHTML =
    `<span class="rule-host-suggest-label">Try wildcard:</span>` +
    `<button type="button" class="rule-host-suggest-chip" data-pattern="${escapeHtml(result.wildcard)}" title="Match every subdomain of ${escapeHtml(result.wildcard.slice(2))}">${escapeHtml(result.wildcard)}</button>`;
}

/**
 * Paste handler: when the user pastes anything URL-shaped, replace
 * the input value with the extracted host before the browser's
 * default paste lands. Preserves the user's typed value if they pasted
 * a bare hostname (extractHostPattern's URL detection requires a
 * protocol or path separator — typing "github" or "example.com"
 * stays untouched).
 *
 * We let the suggestion chip render via the `input` event AFTER the
 * paste lands so the wildcard hint appears on the next tick.
 */
ruleHostInput.addEventListener("paste", (e) => {
  const data = e.clipboardData?.getData("text") || "";
  if (!data) return;
  if (!looksLikeUrl(data)) return;
  const result = extractHostPattern(data);
  if (!result.host) return;
  e.preventDefault();
  ruleHostInput.value = result.host;
  // Trigger the input event so the rest of the form (validators,
  // pattern-test rerender) sees the new value.
  ruleHostInput.dispatchEvent(new Event("input", { bubbles: true }));
  renderHostSuggest();
  // Place the caret at the end so a follow-up keystroke appends
  // rather than overwriting the start of the host.
  const end = ruleHostInput.value.length;
  ruleHostInput.setSelectionRange(end, end);
});

// Re-render the suggestion chip whenever the input changes (typing,
// paste replacement, programmatic clear). Cheap — synchronous string
// math, no IDB. Keeps the chip in sync without per-keystroke debouncing.
ruleHostInput.addEventListener("input", () => {
  renderHostSuggest();
});

ruleHostSuggest.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".rule-host-suggest-chip") as
    | HTMLButtonElement
    | null;
  if (!btn) return;
  const pattern = btn.dataset.pattern || "";
  if (!pattern) return;
  ruleHostInput.value = pattern;
  ruleHostInput.dispatchEvent(new Event("input", { bubbles: true }));
  ruleHostInput.focus();
  // Suggestion chip self-hides because renderHostSuggest detects the
  // value === wildcard match and bails. No manual hide needed.
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

// Site-rules import / export ---------------------------------------------
//
/**
 * State for the IO panel — whether we're showing the panel in export
 * or import mode (the textarea is read-only in export, editable in
 * import). Lives in module scope so the close/open routes can flip it.
 */
let rulesIoMode: "export" | "import" = "import";

/**
 * Open the IO panel in export mode. Pulls the current rule list,
 * serialises via `stringifyRules`, drops the JSON into the textarea
 * (read-only — the user can't edit an export — they Copy or close).
 * The Copy button writes to clipboard via navigator.clipboard.
 */
async function openRulesExport(): Promise<void> {
  const resp = await rpcSiteRules("listSiteRules");
  const rules = resp.rules ?? [];
  if (rules.length === 0) {
    toast("No rules to export", "error");
    return;
  }
  rulesIoMode = "export";
  const text = stringifyRules(rules);
  rulesIoTitle.textContent = `Export · ${rules.length} rule${rules.length === 1 ? "" : "s"}`;
  rulesIoText.value = text;
  rulesIoText.readOnly = true;
  rulesIoApply.hidden = true;
  rulesIoCopy.hidden = false;
  rulesIoStatus.textContent = "Copy + paste into the Import box on another device.";
  rulesIoPanel.hidden = false;
  // Select the text so Cmd+C grabs it immediately.
  rulesIoText.focus();
  rulesIoText.select();
}

/**
 * Open the IO panel in import mode — empty editable textarea, Apply
 * button visible, Copy hidden. The user pastes a bundle, picks a
 * merge mode, hits Apply.
 */
function openRulesImport(): void {
  rulesIoMode = "import";
  rulesIoTitle.textContent = "Import rules";
  rulesIoText.value = "";
  rulesIoText.readOnly = false;
  rulesIoApply.hidden = false;
  rulesIoCopy.hidden = true;
  rulesIoStatus.textContent = 'Paste a {"version":1,...} bundle and pick a mode.';
  rulesIoPanel.hidden = false;
  rulesIoText.focus();
}

function closeRulesIoPanel(): void {
  rulesIoPanel.hidden = true;
  rulesIoText.value = "";
  rulesIoStatus.textContent = "";
}

rulesExportBtn.addEventListener("click", () => void openRulesExport());
rulesImportBtn.addEventListener("click", () => openRulesImport());
rulesIoClose.addEventListener("click", () => closeRulesIoPanel());

rulesIoCopy.addEventListener("click", async () => {
  if (rulesIoMode !== "export") return;
  const text = rulesIoText.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast("Rules JSON copied to clipboard");
  } catch (e) {
    console.warn("[context-clipboard] rules export clipboard write failed", e);
    // Fallback: select + execCommand so even policy-restricted contexts
    // get *something* working. Most modern browsers honour the call
    // when triggered by a user gesture (which this is).
    rulesIoText.focus();
    rulesIoText.select();
    try {
      document.execCommand("copy");
      toast("Rules JSON copied to clipboard");
    } catch {
      toast("Couldn't copy — select + Cmd/Ctrl+C manually", "error");
    }
  }
});

rulesIoApply.addEventListener("click", async () => {
  if (rulesIoMode !== "import") return;
  const text = rulesIoText.value;
  const parsed = parseRulesJson(text);
  if (!parsed.ok || !parsed.rules) {
    rulesIoStatus.textContent = `Couldn't parse: ${parsed.reason}`;
    toast(`Import failed: ${parsed.reason}`, "error");
    return;
  }
  if (parsed.rules.length === 0) {
    rulesIoStatus.textContent = "Nothing to import — every row failed validation.";
    toast("Nothing to import", "error");
    return;
  }
  const modeInput = document.querySelector<HTMLInputElement>(
    'input[name="rules-io-mode"]:checked',
  );
  const mode: MergeMode = modeInput?.value === "replace" ? "replace" : "merge";
  // Read live rules, merge, ship back through the bulk RPC. We rebuild
  // the merge result in the popup (pure) so we can show the user an
  // honest "+3 / 2 updated" count BEFORE the IDB write — easier to
  // explain than a single bulk-write-and-pray.
  const liveResp = await rpcSiteRules("listSiteRules");
  const live = liveResp.rules ?? [];
  const merged = mergeRules(live, parsed.rules, mode);
  if (mode === "replace") {
    // Replace is destructive — confirm with a real count so an
    // accidental click can't wipe a rule list silently.
    const lostCount = live.length;
    const newCount = merged.next.length;
    const ok = confirm(
      `Replace ${lostCount} existing rule${lostCount === 1 ? "" : "s"} with ${newCount} from the bundle?\n\nExisting rules will be gone. This cannot be undone.`,
    );
    if (!ok) return;
  }
  const resp = await rpcSiteRules("replaceSiteRules", { rules: merged.next });
  if (!resp.ok) {
    rulesIoStatus.textContent = `Write failed: ${resp.error ?? "unknown"}`;
    toast(`Import failed: ${resp.error ?? "unknown"}`, "error");
    return;
  }
  // Build a terse summary so the user sees exactly what happened.
  const bits: string[] = [];
  if (merged.added) bits.push(`+${merged.added} added`);
  if (merged.updated) bits.push(`${merged.updated} updated`);
  if (merged.removed) bits.push(`-${merged.removed} removed`);
  if (parsed.dropped) bits.push(`${parsed.dropped} dropped (invalid)`);
  const summary = bits.length ? bits.join(", ") : "no change";
  rulesIoStatus.textContent = `Imported: ${summary}.`;
  toast(`Imported: ${summary}`);
  closeRulesIoPanel();
  await renderSiteRules();
});

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
  if (target.dataset.act === "filter") {
    e.stopPropagation();
    // Jump straight to the list filtered to the rule's host. Wildcard
    // patterns (`*.example.com`) lose the leading wildcard so the
    // host: operator (which doesn't grok globs) lands on the base
    // domain — better than no filter at all. Closes settings so the
    // user sees the result.
    const raw = (target.dataset.host || "").trim();
    const host = raw.replace(/^\*\./, "");
    if (!host) return;
    closeSettings();
    searchEl.value = `host:${host}`;
    searchEl.focus();
    activeIndex = 0;
    await render();
    return;
  }
  // Hover-card row click — jump to the clip's detail view. We close
  // settings first so the detail panel paints over the live list
  // rather than the settings pane (which is the wrong context).
  // The closest button check matches the inner SVG/span hits inside
  // the preview row too.
  const previewBtn = target.closest('[data-act="preview"]') as HTMLElement | null;
  if (previewBtn && previewBtn.dataset.clipId) {
    e.stopPropagation();
    const clipId = previewBtn.dataset.clipId;
    closeSettings();
    await openDetail(clipId);
    return;
  }
  // Row click (anywhere outside the × button or count badge): load this
  // rule back into the form for editing. Clicking the same row toggles
  // edit off so it acts like a quick \"never mind\".
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

// Keep the scroll-shadow edge fades honest as the user scrolls the chip
// strip sideways (trackpad / shift-wheel / drag). Passive listener — we
// only read metrics, never block the scroll.
quickChipsEl.addEventListener("scroll", refreshQuickChipsScrollShadow, {
  passive: true,
});
// Popup width can change (Firefox panel resize, zoom) — re-measure so a
// row that newly fits, or newly overflows, updates its fades.
window.addEventListener("resize", refreshQuickChipsScrollShadow);

// Saved searches --------------------------------------------------------
savedSearchesEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  // While editing, clicks on the rename input itself should NOT cause
  // chip apply (the input + chip share the same parent). Let the input
  // handle focus naturally.
  if (target.dataset.act === "rename-input") return;
  const chip = target.closest(
    ".saved-search-chip",
  ) as HTMLElement | null;
  if (!chip) return;
  const id = chip.dataset.id;
  if (!id) return;
  const entry = savedSearches.find((s) => s.id === id);
  if (!entry) return;
  if (target.dataset.act === "del") {
    e.stopPropagation();
    // Cancel rename mode if the user deletes the chip they were renaming.
    if (renamingSavedSearchId === id) renamingSavedSearchId = null;
    await removeSavedSearch(id);
    // Clear the last-applied id if it pointed at the just-deleted
    // chip so "Open my last saved search" doesn't surface a ghost.
    if (lastSavedSearchId === id) {
      lastSavedSearchId = "";
      await setLastSavedSearchId("");
    }
    await refreshSavedSearches();
    toast(`Removed "${entry.name}"`);
    await render();
    return;
  }
  // Apply (click on label): drop into search box, focus, render.
  // If we're CURRENTLY editing this chip, ignore the click — the label
  // is an input box, not a button.
  if (renamingSavedSearchId === id) return;
  searchEl.value = entry.query;
  activeIndex = 0;
  // Stamp BEFORE the render so a misbehaving render path can't
  // strand the muscle-memory bit (mirrors the send-to last-action
  // pattern). Fire-and-forget — never block the apply on a meta
  // write. The in-memory mirror updates synchronously so the next
  // palette open sees the new value without an IDB read.
  lastSavedSearchId = id;
  void setLastSavedSearchId(id);
  searchEl.focus();
  await render();
});

// Double-click on a saved-search chip label → enter inline rename mode.
// `dblclick` is the cleanest signal because single click is already
// committed to "apply this search"; the user wouldn't expect typing.
savedSearchesEl.addEventListener("dblclick", (e) => {
  const target = e.target as HTMLElement;
  if (target.dataset.act !== "apply") return;
  const chip = target.closest(".saved-search-chip") as HTMLElement | null;
  const id = chip?.dataset.id || null;
  if (!id) return;
  if (renamingSavedSearchId === id) return;
  renamingSavedSearchId = id;
  renderSavedSearches();
});

/**
 * Commit an inline rename. Empty / unchanged / name-collision attempts
 * all bail without writing. Always clears rename mode so the chip
 * snaps back to a button (we re-render either way).
 */
async function commitSavedSearchRename(input: HTMLInputElement): Promise<void> {
  const chip = input.closest(".saved-search-chip") as HTMLElement | null;
  const id = chip?.dataset.id || "";
  renamingSavedSearchId = null;
  if (!id) {
    renderSavedSearches();
    return;
  }
  const orig = savedSearches.find((s) => s.id === id);
  const next = (input.value || "").trim();
  if (!orig || !next || next === orig.name) {
    renderSavedSearches();
    return;
  }
  const updated = await renameSavedSearch(id, next);
  if (!updated) {
    toast("Name taken — pick another", "error");
    renderSavedSearches();
    return;
  }
  await refreshSavedSearches();
  toast(`Renamed to "${updated.name}"`);
  renderSavedSearches();
}

// Keydown inside the rename input: Enter commits, Esc cancels, Tab
// commits-and-moves-on. Caught at the strip level so we don't have to
// re-bind per chip.
savedSearchesEl.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.dataset.act !== "rename-input") return;
  const input = target as HTMLInputElement;
  if (e.key === "Enter") {
    e.preventDefault();
    void commitSavedSearchRename(input);
  } else if (e.key === "Escape") {
    e.preventDefault();
    renamingSavedSearchId = null;
    renderSavedSearches();
  } else if (e.key === "Tab") {
    e.stopPropagation();
    void commitSavedSearchRename(input);
  }
});

// Blur (focus lost): commit if the user clicked away. Captured at the
// strip so we catch blur on the inner <input> (focusout bubbles, but
// using capture phase makes the intent explicit — we never want to
// double-commit if Enter / Esc / Tab already ran).
savedSearchesEl.addEventListener(
  "blur",
  (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset.act !== "rename-input") return;
    if (renamingSavedSearchId == null) return;
    void commitSavedSearchRename(target as HTMLInputElement);
  },
  true,
);

saveSearchBtn.addEventListener("click", () => void handleSaveSearch());

// Drag-to-reorder saved-search chips ----------------------------------
//
// HTML5 drag-and-drop is the cheapest path here — no library, no pointer-
// event juggling. The chip carries `draggable="true"` (except during
// rename — see renderSavedSearches), and we track the dragged id +
// drop-target id at the strip level so handlers don't have to re-bind
// per chip after every re-render.
//
// Semantics:
//   - dragstart: stash the source chip id + add a `.dragging` class
//     for the muted-tilt visual; setDragImage to the chip so the
//     ghost matches what the user grabbed.
//   - dragover: preventDefault so drop fires, and visually mark the
//     hovered chip as the drop target with a left/right insertion
//     hint based on the cursor's x-position relative to the chip's
//     midpoint.
//   - drop: compute the new permutation, fire reorderSavedSearches,
//     re-render. The lib helper is no-op when nothing changed so
//     micro-jiggles don't write meta.
//   - dragend: always clear visual state (catches "drag, then drop
//     outside" path where drop never fires).
//
// We deliberately DON'T persist mid-drag — only at drop — so a
// cancelled drag (Esc, drop on the input, drop outside) leaves the
// existing order alone.
let savedSearchDragId: string | null = null;

savedSearchesEl.addEventListener("dragstart", (e) => {
  const chip = (e.target as HTMLElement).closest(".saved-search-chip") as
    | HTMLElement
    | null;
  if (!chip) return;
  // Don't start a drag from the X button or the rename input —
  // those targets have their own intent.
  const innerAct = (e.target as HTMLElement).dataset.act;
  if (innerAct === "del" || innerAct === "rename-input") {
    e.preventDefault();
    return;
  }
  const id = chip.dataset.id || "";
  if (!id) return;
  savedSearchDragId = id;
  chip.classList.add("dragging");
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    // Required for Firefox — at least one mime type must be set or
    // the drag never starts. The payload itself is unused; we read
    // from module state instead.
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch {
      // Some browsers throw on setData inside dragstart for stupid
      // reasons; harmless because we don't rely on the payload.
    }
  }
});

savedSearchesEl.addEventListener("dragover", (e) => {
  if (!savedSearchDragId) return;
  const chip = (e.target as HTMLElement).closest(".saved-search-chip") as
    | HTMLElement
    | null;
  if (!chip) return;
  if (chip.dataset.id === savedSearchDragId) return;
  e.preventDefault();
  // Mark insertion-edge so the user sees WHERE the chip will land.
  // Cursor on left half → drop BEFORE this chip; right half → AFTER.
  const rect = chip.getBoundingClientRect();
  const before = e.clientX < rect.left + rect.width / 2;
  // Clear stale hints on other chips so only one shows at a time.
  savedSearchesEl
    .querySelectorAll(".saved-search-chip.drop-before, .saved-search-chip.drop-after")
    .forEach((el) => el.classList.remove("drop-before", "drop-after"));
  chip.classList.add(before ? "drop-before" : "drop-after");
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
});

savedSearchesEl.addEventListener("dragleave", (e) => {
  const chip = (e.target as HTMLElement).closest(".saved-search-chip") as
    | HTMLElement
    | null;
  if (!chip) return;
  // Only clear when leaving the chip itself, not when the cursor
  // moves over an inner button (relatedTarget still inside).
  const into = e.relatedTarget as HTMLElement | null;
  if (into && chip.contains(into)) return;
  chip.classList.remove("drop-before", "drop-after");
});

savedSearchesEl.addEventListener("drop", async (e) => {
  if (!savedSearchDragId) return;
  const chip = (e.target as HTMLElement).closest(".saved-search-chip") as
    | HTMLElement
    | null;
  e.preventDefault();
  const srcId = savedSearchDragId;
  // Always clear visual state, regardless of whether the drop lands.
  savedSearchesEl
    .querySelectorAll(".dragging, .drop-before, .drop-after")
    .forEach((el) => el.classList.remove("dragging", "drop-before", "drop-after"));
  savedSearchDragId = null;
  if (!chip) return;
  const dstId = chip.dataset.id || "";
  if (!dstId || dstId === srcId) return;
  const rect = chip.getBoundingClientRect();
  const before = e.clientX < rect.left + rect.width / 2;
  // Build the new id order: take current list, drop the src, then
  // splice it in before/after the dst.
  const ids = savedSearches.map((s) => s.id);
  const fromIdx = ids.indexOf(srcId);
  if (fromIdx < 0) return;
  ids.splice(fromIdx, 1);
  let toIdx = ids.indexOf(dstId);
  if (toIdx < 0) return;
  if (!before) toIdx++;
  ids.splice(toIdx, 0, srcId);
  const next = await reorderSavedSearches(ids);
  if (!next) return;
  savedSearches = next;
  renderSavedSearches();
});

savedSearchesEl.addEventListener("dragend", () => {
  // Belt-and-braces cleanup — drop sometimes doesn't fire (cancelled
  // drag, drop outside the strip). Without this the .dragging
  // visual would persist on the chip until the next render.
  savedSearchesEl
    .querySelectorAll(".dragging, .drop-before, .drop-after")
    .forEach((el) => el.classList.remove("dragging", "drop-before", "drop-after"));
  savedSearchDragId = null;
});

// Recent search-history chips: HTML5 native DnD mirroring the saved-
// searches strip above. Lets the user promote a frequently-typed query
// LEFT without having to make it a full saved-search (the lighter-
// touch alternative to the hover-pin button). pushSearchHistory still
// bumps a typed query to position 0 on commit — drag-reorder only
// affects relative position of OLDER entries.
let searchHistoryDragQuery: string | null = null;

searchHistoryEl.addEventListener("dragstart", (e) => {
  const chip = (e.target as HTMLElement).closest(".recent-chip") as
    | HTMLElement
    | null;
  if (!chip) return;
  // Inner buttons have their own intent (apply / save / clear) — they
  // should never start a drag. Prevent the drag in that case so a
  // mis-aim doesn't strand the chip in dragging state.
  const innerAct = (e.target as HTMLElement).dataset.act;
  if (innerAct === "apply" || innerAct === "save") {
    e.preventDefault();
    return;
  }
  const q = chip.dataset.q || "";
  if (!q) return;
  searchHistoryDragQuery = q;
  chip.classList.add("dragging");
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    // Firefox needs a payload to start the drag; we don't read it.
    try {
      e.dataTransfer.setData("text/plain", q);
    } catch {
      /* harmless */
    }
  }
});

searchHistoryEl.addEventListener("dragover", (e) => {
  if (!searchHistoryDragQuery) return;
  const chip = (e.target as HTMLElement).closest(".recent-chip") as
    | HTMLElement
    | null;
  if (!chip) return;
  if (chip.dataset.q === searchHistoryDragQuery) return;
  e.preventDefault();
  // Mark insertion-edge so the user sees WHERE the chip will land.
  const rect = chip.getBoundingClientRect();
  const before = e.clientX < rect.left + rect.width / 2;
  searchHistoryEl
    .querySelectorAll(".recent-chip.drop-before, .recent-chip.drop-after")
    .forEach((el) => el.classList.remove("drop-before", "drop-after"));
  chip.classList.add(before ? "drop-before" : "drop-after");
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
});

searchHistoryEl.addEventListener("dragleave", (e) => {
  const chip = (e.target as HTMLElement).closest(".recent-chip") as
    | HTMLElement
    | null;
  if (!chip) return;
  const into = e.relatedTarget as HTMLElement | null;
  if (into && chip.contains(into)) return;
  chip.classList.remove("drop-before", "drop-after");
});

searchHistoryEl.addEventListener("drop", async (e) => {
  if (!searchHistoryDragQuery) return;
  const chip = (e.target as HTMLElement).closest(".recent-chip") as
    | HTMLElement
    | null;
  e.preventDefault();
  const srcQuery = searchHistoryDragQuery;
  searchHistoryEl
    .querySelectorAll(".dragging, .drop-before, .drop-after")
    .forEach((el) => el.classList.remove("dragging", "drop-before", "drop-after"));
  searchHistoryDragQuery = null;
  if (!chip) return;
  const dstQuery = chip.dataset.q || "";
  if (!dstQuery || dstQuery === srcQuery) return;
  const rect = chip.getBoundingClientRect();
  const before = e.clientX < rect.left + rect.width / 2;
  // Build new order from the live `searchHistory` cache (full
  // persisted list, not the filtered visible slice — dragging
  // shouldn't drop chips that happened to be hidden by dedup vs
  // saved-searches in this render). Splice src out, splice in
  // before/after dst, then persist.
  const order = searchHistory.slice();
  const fromIdx = order.indexOf(srcQuery);
  if (fromIdx < 0) return;
  order.splice(fromIdx, 1);
  let toIdx = order.indexOf(dstQuery);
  if (toIdx < 0) return;
  if (!before) toIdx++;
  order.splice(toIdx, 0, srcQuery);
  const next = await reorderSearchHistory(order);
  if (!next) return;
  searchHistory = next;
  renderSearchHistory();
});

searchHistoryEl.addEventListener("dragend", () => {
  searchHistoryEl
    .querySelectorAll(".dragging, .drop-before, .drop-after")
    .forEach((el) => el.classList.remove("dragging", "drop-before", "drop-after"));
  searchHistoryDragQuery = null;
});

// Search history (recent ghost chips) ----------------------------------
//
/**
 * Promote a Recent query to a saved-search chip. Shared by the
 * hover-pin button click and the right-click contextmenu so the two
 * affordances always behave the same way.
 */
async function saveRecentAsSearch(q: string): Promise<void> {
  const query = (q || "").trim();
  if (!query) return;
  const parsed = parseQuery(query);
  const fallback =
    parsed.freeText.split(/\s+/)[0] ||
    parsed.host ||
    parsed.tags[0] ||
    parsed.kind ||
    "Saved search";
  const name = prompt(
    `Save "${query.slice(0, 40)}" as a saved-search chip?\n\nGive it a short name:`,
    fallback.slice(0, 32),
  );
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast("Name required", "error");
    return;
  }
  const entry = await addSavedSearch(trimmed, query);
  if (!entry) {
    toast("Couldn't save", "error");
    return;
  }
  await refreshSavedSearches();
  toast(`Pinned "${entry.name}" — moved to saved searches`);
  await render();
}

searchHistoryEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("recent-clear")) {
    await clearSearchHistory();
    await refreshSearchHistory();
    renderSearchHistory();
    return;
  }
  // Resolve which inner button (apply vs pin) was hit. closest() so the
  // SVG path inside the pin icon still resolves to its parent button.
  const btn = target.closest<HTMLElement>("[data-act]");
  const act = btn?.dataset.act || "";
  const q = btn?.dataset.q || "";
  if (!q) return;
  if (act === "save") {
    e.stopPropagation();
    void saveRecentAsSearch(q);
    return;
  }
  if (act !== "apply") return;
  // Apply path — cancel pending debounce + dump into search box.
  if (historyDebounce != null) {
    clearTimeout(historyDebounce);
    historyDebounce = null;
  }
  searchEl.value = q;
  activeIndex = 0;
  await pushSearchHistory(q);
  await refreshSearchHistory();
  searchEl.focus();
  await render();
});

/**
 * Right-click a Recent chip → "Save as search" prompt. Same end state
 * as clicking the hover-pin button; discovers users who reach for
 * right-click instead of hovering for an icon.
 *
 * Stops the default context menu — the user invoked us, not the
 * native browser menu (which would offer "Inspect" et al on a chip
 * the user has no reason to ever inspect).
 */
searchHistoryEl.addEventListener("contextmenu", async (e) => {
  const chip = (e.target as HTMLElement).closest(".recent-chip") as
    | HTMLElement
    | null;
  if (!chip) return;
  const q = (chip.dataset.q || "").trim();
  if (!q) return;
  e.preventDefault();
  e.stopPropagation();
  await saveRecentAsSearch(q);
});

// List events -----------------------------------------------------------
listEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  // Empty-state "Show daily list" escape from archive view — strips
  // the is:archived operator from the search box and re-renders.
  // Cheap regex pass mirrors what toggleSearchOp does so we don't
  // accidentally take a wider chunk of the query with us.
  const exitAct = target.closest("button.empty-action[data-act=exit-archive]");
  if (exitAct) {
    const raw = searchEl.value;
    searchEl.value = raw.replace(/(?:^|\s)is:archived(?:\s|$)/, " ").replace(/\s+/g, " ").trim();
    activeIndex = 0;
    await render();
    return;
  }
  const clipEl = target.closest(".clip") as HTMLElement | null;
  if (!clipEl) return;
  const id = clipEl.dataset.id!;
  const act = (target.dataset.act as string) || "";
  const c = currentClips.find((x) => x.id === id);
  if (!c) return;

  const mouseEvt = e as MouseEvent;
  const clickedIdx = Number(clipEl.dataset.idx);

  // Shift+Click range-select: extend a contiguous run from the
  // anchor (last explicit toggle) to the clicked row. Adds the whole
  // span to the selection — extending is the gesture's only job, so
  // it never deselects.
  //
  // Gated on an ALREADY-ACTIVE selection (or Cmd/Ctrl held) so we
  // don't clobber the long-standing "Shift+Click = copy as Markdown"
  // shortcut for the no-selection case. The standard flow: Cmd-click
  // one row to start a selection (sets the anchor), THEN Shift-click
  // another row to fill in the range — exactly how Finder/Gmail work.
  // Action buttons (pin/copy/del) are excluded so Shift-clicking the
  // trash glyph still deletes.
  const inSelectionMode = selectedIds.size > 0 || mouseEvt.metaKey || mouseEvt.ctrlKey;
  if (mouseEvt.shiftKey && inSelectionMode && !act) {
    const range = computeRange(selectionAnchor, clickedIdx, currentClips.length);
    if (range) {
      const rangeIds = idsForRange(currentClips, range.indices);
      const toAdd = rangeIdsToAdd(rangeIds, selectedIds);
      for (const rid of toAdd) selectedIds.add(rid);
      // Anchor stays put so a subsequent shift-click re-extends from
      // the same origin (Finder/Gmail behavior).
      updateBulkBar();
      await render();
      return;
    }
  }

  const wantsSelect =
    mouseEvt.metaKey || mouseEvt.ctrlKey || selectedIds.size > 0;

  // In selection mode (or with cmd/ctrl), clicks toggle selection instead
  // of opening the clip. Action buttons (pin/copy/del) still work directly.
  if (wantsSelect && !act) {
    toggleSelected(id);
    // This is an explicit single-toggle — move the range anchor here
    // so a following Shift+Click spans from this row.
    if (Number.isFinite(clickedIdx)) selectionAnchor = clickedIdx;
    await render();
    return;
  }

  if (act === "del") {
    await trashWithLockGuard([id]);
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
      await trashWithLockGuard([id]);
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
  syncSearchClearBtn();
  scheduleHistoryPush(searchEl.value);
  render();
});

// Focusing the search box means the user has left list keyboard-nav, so
// retire the footer "row N of M" breadcrumb until they arrow back into
// the list. Cheap synchronous repaint of just the footer line — no full
// render needed.
searchEl.addEventListener("focus", () => {
  if (!listKeyboardActive) return;
  listKeyboardActive = false;
  renderFocusPosition();
});

/**
 * Show the inline clear (×) button only when the search box has
 * content. Keeps the search row clean in the common empty state and
 * gives a one-click escape from a long operator query without
 * dragging-to-select + Delete.
 */
function syncSearchClearBtn(): void {
  searchClearBtn.hidden = searchEl.value.length === 0;
}

/**
 * Clear the search box and re-render to the unfiltered list. Resets
 * the active-row cursor, hides the clear button, and returns focus to
 * the input so the user can immediately type a fresh query. Shared by
 * the × button click and the Esc-in-search keybinding.
 */
async function clearSearch(opts: { focus?: boolean } = {}): Promise<void> {
  if (searchEl.value === "") {
    if (opts.focus) searchEl.focus();
    return;
  }
  searchEl.value = "";
  activeIndex = 0;
  syncSearchClearBtn();
  await render();
  if (opts.focus !== false) searchEl.focus();
}

searchClearBtn.addEventListener("click", () => void clearSearch({ focus: true }));

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
  // Esc clears the search (when there's something to clear) and keeps
  // focus in the box for an immediate re-query. We handle it
  // explicitly rather than relying on type=search's native clear,
  // which is browser-inconsistent and never triggers our re-render /
  // clear-button sync. When the box is already empty, Esc falls
  // through to the global handler (which closes panels / selection).
  if (e.key === "Escape") {
    if (searchEl.value !== "") {
      e.preventDefault();
      e.stopPropagation();
      await clearSearch({ focus: true });
    }
    return;
  }
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
/**
 * Per-session memory for the note composer's "Pin this note" checkbox.
 * Survives across opens within the same popup session (so a user who
 * just pinned a note and immediately opens the composer again to drop
 * another related note doesn't have to re-check the box every time).
 *
 * In-memory only — per spec we don't persist this in IDB. The popup
 * closing resets the bit, which is the right granularity: pinning is
 * sticky for the duration of a focused note-taking burst, not
 * permanently. Matches how the audit day-collapse state persists for
 * the same reason.
 *
 * Initial value is `false` — first-ever open of the composer in a
 * fresh popup session shows the box unchecked (consistent with how
 * it's always behaved). We only START remembering after the user
 * EXPLICITLY toggles it.
 */
let notePinSticky = false;

async function openNoteComposer(): Promise<void> {
  noteText.value = "";
  noteTagsInput.value = "";
  // Restore the user's last in-session pin choice so a "pin a bunch
  // of related notes" workflow doesn't require re-checking the box
  // on every open. First open of the session = default false.
  notePinInput.checked = notePinSticky;
  // Pre-fill the textarea with a "Captured from <title>" stem when
  // we can read the active tab. This gives the user a starting frame
  // instead of a blank textarea — they edit / append / blow it away
  // (Cmd+A → type) rather than face the "what was I going to say?"
  // void. We DON'T auto-select-all on focus (documented anti-pattern;
  // loses the user's draft if they extend with a single keystroke).
  // Silent fallback to an empty textarea when:
  //   - api.tabs throws (chrome:// / about: / extension page)
  //   - the prefill resolves to "" (chrome:// has no title or host)
  //   - the user re-opened the composer mid-edit (textarea isn't
  //     empty) — shouldApplyNotePrefill guards against clobbering
  try {
    const [activeTab] = await api.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      const prefill = buildNotePrefill({
        title: activeTab.title,
        url: activeTab.url,
      });
      if (shouldApplyNotePrefill(noteText.value, prefill)) {
        noteText.value = prefill;
      }
    }
  } catch {
    // chrome://, about:, file:// scope: no tab access. Empty textarea
    // is the correct fallback — better than throwing inside
    // openNoteComposer and leaving the modal half-open.
  }
  await renderNoteTagSuggestions();
  refreshTemplateTokenPill();
  noteComposer.hidden = false;
  // After the panel paints — focus the textarea so typing lands there
  // instead of stealing focus from whatever the user just clicked.
  setTimeout(() => noteText.focus(), 0);
}

function closeNoteComposer(): void {
  noteComposer.hidden = true;
}

/**
 * Repaint the live {{token}} counter pill under the textarea.
 * Reads noteText.value, runs countTemplateTokens, hides the row
 * entirely when there are no tokens (mostly the time — a typical
 * note is plain text). When tokens exist, the pill shows a concise
 * label ("1 token: date", "3 tokens", "1 token × 5") and a tooltip
 * spelling out which tokens will expand.
 *
 * Idempotent and cheap — runs on every textarea `input` event plus
 * once at openNoteComposer time so paste / undo / programmatic
 * value reset all stay in sync.
 */
function refreshTemplateTokenPill(): void {
  const count = countTemplateTokens(noteText.value);
  const label = formatTokenPillLabel(count);
  if (!label) {
    noteTemplatePillRow.hidden = true;
    noteTemplatePill.textContent = "";
    noteTemplatePill.title = "";
    return;
  }
  noteTemplatePillRow.hidden = false;
  noteTemplatePill.textContent = label;
  const tip = formatTokenPillTooltip(count) || label;
  noteTemplatePill.title = tip;
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
// Stamp the sticky bit on every checkbox toggle (not just save) so a
// user who explicitly checks "Pin" mid-thought, then closes the
// composer without saving (Esc / backdrop / Cancel), still gets the
// pinned default on the NEXT open. Otherwise the "I'm in a pinning
// burst" mode would silently reset on every aborted draft.
notePinInput.addEventListener("change", () => {
  notePinSticky = notePinInput.checked;
});
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
  // Remember the pin choice for the next composer open (per-session).
  notePinSticky = pinned;
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
// Live token counter — refresh on every body mutation. `input` fires
// for typing, paste, cut, undo / redo, drag-drop, and IME composition
// commits, so this single listener covers every path that changes the
// textarea value. Pure + synchronous so no debounce needed — the
// regex scan is microseconds on a 5-row textarea.
noteText.addEventListener("input", refreshTemplateTokenPill);
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

/**
 * Open the link composer — a small modal for capturing a typed or
 * pasted URL as a kind=link clip. Pre-fills with whatever the
 * clipboard currently holds IF that text parses as a URL, so the
 * typical flow (Copy URL from Slack -> open popup -> click link
 * button -> Enter) is two clicks + one Enter.
 *
 * Pre-fill failures (no permission, garbage clipboard) silently
 * leave the input empty — the user types/pastes manually.
 */
async function openLinkComposer(): Promise<void> {
  linkUrlInput.value = "";
  linkStatusEl.textContent = "";
  linkStatusEl.className = "link-composer-status";
  linkSaveBtn.disabled = true;
  linkComposer.hidden = false;
  // Pre-fill from the clipboard when possible — the most common
  // workflow is "I just copied a URL from somewhere, now save it".
  // Failures are silent: user types it themselves.
  try {
    const clip = navigator.clipboard as unknown as { readText?: () => Promise<string> };
    if (clip.readText) {
      const text = (await clip.readText()).trim();
      if (text && parseQuickCaptureUrl(text)) {
        linkUrlInput.value = text;
        refreshLinkStatus();
      }
    }
  } catch {
    // Permission denied is the expected case; silent.
  }
  // After the panel paints — focus + select-all so the user can
  // type to replace or Enter to commit the prefilled value.
  setTimeout(() => {
    linkUrlInput.focus();
    linkUrlInput.select();
  }, 0);
}

function closeLinkComposer(): void {
  linkComposer.hidden = true;
}

/**
 * Live-validate the URL input on every keystroke. Updates the status
 * row with a green "host.com/path" preview when valid, red "Not a
 * valid http(s) URL" when invalid, blank when empty. Save button
 * toggles disabled in sync so the user can't fire on garbage.
 */
function refreshLinkStatus(): void {
  const raw = linkUrlInput.value;
  if (!raw.trim()) {
    linkStatusEl.textContent = "";
    linkStatusEl.className = "link-composer-status";
    linkSaveBtn.disabled = true;
    return;
  }
  const parsed = parseQuickCaptureUrl(raw);
  if (parsed) {
    linkStatusEl.textContent = parsed.preview;
    linkStatusEl.className = "link-composer-status ok";
    linkSaveBtn.disabled = false;
  } else {
    linkStatusEl.textContent = "Not a valid http(s) URL";
    linkStatusEl.className = "link-composer-status err";
    linkSaveBtn.disabled = true;
  }
}

/**
 * Commit the link composer input as a kind=link clip via the addLink
 * RPC. Re-validates inside this function so a manual click on the
 * Save button can't fire stale state. On success: close, toast, render.
 * On failure: keep open + show the error so the user can retry.
 */
async function saveLinkFromComposer(): Promise<void> {
  const raw = linkUrlInput.value;
  const parsed = parseQuickCaptureUrl(raw);
  if (!parsed) {
    refreshLinkStatus();
    return;
  }
  linkSaveBtn.disabled = true;
  try {
    const tags = buildQuickCaptureTags(parsed.host);
    const resp = await new Promise<{ ok: boolean; id?: string; error?: string }>(
      (resolve) => {
        api.runtime.sendMessage(
          {
            type: "cc-rpc",
            action: "addLink",
            payload: {
              url: parsed.url,
              preview: parsed.preview,
              title: parsed.title,
              tags,
            },
          },
          (r) => resolve(r),
        );
      },
    );
    if (!resp?.ok) {
      linkStatusEl.textContent = `Save failed: ${resp?.error || "unknown"}`;
      linkStatusEl.className = "link-composer-status err";
      linkSaveBtn.disabled = false;
      return;
    }
    closeLinkComposer();
    toast(`Captured: ${parsed.preview.length > 50 ? parsed.preview.slice(0, 47) + "…" : parsed.preview}`);
    await render();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    linkStatusEl.textContent = `Save failed: ${msg}`;
    linkStatusEl.className = "link-composer-status err";
    linkSaveBtn.disabled = false;
  }
}

linkCaptureBtn.addEventListener("click", () => void openLinkComposer());
linkCancelBtn.addEventListener("click", () => closeLinkComposer());
linkSaveBtn.addEventListener("click", () => void saveLinkFromComposer());
linkUrlInput.addEventListener("input", refreshLinkStatus);
linkUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    void saveLinkFromComposer();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeLinkComposer();
  }
});

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
  // Resolve the last-applied saved search (if any + still alive) so
  // the palette command can show its name AND skip rendering when
  // the id is stale or the chip strip is empty. The check is
  // synchronous against the cached `savedSearches` list — no IDB
  // hit on every palette open. `lastSavedSearchId` is refreshed at
  // popup boot + on each apply.
  const lastSavedSearch = lastSavedSearchId
    ? savedSearches.find((s) => s.id === lastSavedSearchId)
    : undefined;
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
      id: "open-last-saved-search",
      label: lastSavedSearch
        ? `Open last saved search · ${lastSavedSearch.name}`
        : "Open last saved search",
      hint: lastSavedSearch
        ? `Drop "${lastSavedSearch.query}" into the search box`
        : "No saved search has been applied yet",
      group: "Filter",
      keywords: "recall recent chip muscle bookmark last applied",
      available: !!lastSavedSearch,
      run: () => {
        closePalette();
        if (!lastSavedSearch) return;
        searchEl.value = lastSavedSearch.query;
        activeIndex = 0;
        // The chip click handler already stamps lastSavedSearchId on
        // every apply — mirror that here so the recency bit stays
        // truthful regardless of entry path.
        lastSavedSearchId = lastSavedSearch.id;
        void setLastSavedSearchId(lastSavedSearch.id);
        searchEl.focus();
        void render();
      },
    },
    {
      id: "show-last-forgotten-host",
      label: lastForgottenHost
        ? `Show last forgotten host · ${lastForgottenHost.host} (${formatAge(lastForgottenHost.at)})`
        : "Show last forgotten host",
      hint: lastForgottenHost
        ? `Open Trash + offer to restore everything from ${lastForgottenHost.host}`
        : "No forget-host action in the audit ring yet",
      group: "Privacy",
      keywords: "rescue restore undo forget host recover bulk",
      available: !!lastForgottenHost,
      run: () => {
        closePalette();
        if (!lastForgottenHost) return;
        // Route through openSettings so the trash panel is visible
        // before we kick off restoreHostFromTrash (which paints the
        // confirm dialog + repaints both trash + live list).
        void (async () => {
          await openSettings();
          // Defer a tick so settings panel paints first, then the
          // confirm dialog reads cleanly.
          setTimeout(() => {
            // restoreHostFromTrash already handles "no trashed
            // clips from this host" gracefully (audit row outlives
            // the 7-day trash retention).
            void restoreHostFromTrash(lastForgottenHost!.host);
          }, 50);
        })();
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
      keywords: "dense compact tight rows height density",
      run: async () => {
        closePalette();
        const next = !document.body.classList.contains("compact-rows");
        const nextDensity: Density = next ? "compact" : "comfortable";
        // Write BOTH the new density field and the mirrored boolean so
        // the radio + palette never diverge.
        await saveSettings({ density: nextDensity, compactRows: next });
        applyCompactRows(nextDensity);
        toast(next ? "Compact rows on" : "Compact rows off");
      },
    },
    {
      // Cycle the row density comfortable -> cozy -> compact -> ... in
      // one keystroke, for users who want the middle "cozy" tier the
      // boolean toggle above can't reach. Reads the live body class to
      // know where we are; writes both the density field + mirrored
      // boolean so every density consumer stays consistent.
      id: "cycle-row-density",
      label: "Cycle row density (comfortable / cozy / compact)",
      hint: "Step the clip-list density to the next tier",
      group: "Filter",
      keywords: "density cozy comfortable compact rows spacing tight roomy",
      run: async () => {
        closePalette();
        const cur: Density = document.body.classList.contains("compact-rows")
          ? "compact"
          : document.body.classList.contains("cozy-rows")
            ? "cozy"
            : "comfortable";
        const order: Density[] = ["comfortable", "cozy", "compact"];
        const nextDensity = order[(order.indexOf(cur) + 1) % order.length];
        await saveSettings({
          density: nextDensity,
          compactRows: densityToCompactBool(nextDensity),
        });
        applyCompactRows(nextDensity);
        toast(`Density: ${densityLabel(nextDensity)}`);
      },
    },
    {
      // Global default word-wrap for the detail body. The header
      // wrap button now sets a STICKY PER-CLIP override (plain click)
      // / clears it (Alt-click); this palette command is where the
      // GLOBAL default lives, so users who want "wrap off everywhere
      // by default" still have a one-action path. Available while a
      // text/link clip is open (so the change is visible immediately)
      // and re-applies the effective wrap to the open clip.
      id: "toggle-detail-wrap",
      label: detailWrapOn
        ? "Detail: default to scrolling long lines"
        : "Detail: default to wrapping long lines",
      hint: "Flip the GLOBAL detail word-wrap default (per-clip overrides still win)",
      group: "Detail",
      keywords: "wrap nowrap word wrap lines scroll horizontal tabular log code columns default global",
      available: !detailEl.hidden && !detailWrap.hidden,
      run: async () => {
        closePalette();
        detailWrapOn = !detailWrapOn;
        applyDetailWrap();
        try {
          await setDetailWrap(detailWrapOn);
        } catch (err) {
          console.debug("[context-clipboard] persist detail-wrap default failed", err);
        }
        toast(detailWrapOn ? "Default: wrap on" : "Default: wrap off");
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
      // Cycle through archived clips one-by-one without switching
      // the list filter. Useful for auditing cold pins (decide
      // unarchive / delete) without flipping the daily view into
      // is:archived mode and having to flip it back. Wraps at end.
      id: "next-archived",
      label: describeArchiveCycle(archivedCount).label,
      hint: describeArchiveCycle(archivedCount).hint,
      group: "Navigate",
      keywords:
        "next archived cycle wrap step jump cold pins audit through inbox review",
      available: archivedCount > 0,
      run: () => {
        closePalette();
        void jumpToNextArchived();
      },
    },
    {
      // Reverse companion to next-archived — same cycle, walked
      // backwards. Useful when the user overshot a cold pin with
      // ↓ and wants to step back without re-cycling through the
      // whole ring. Both commands share the same archivedCount cache.
      id: "prev-archived",
      label: describeArchiveCycleReverse(archivedCount).label,
      hint: describeArchiveCycleReverse(archivedCount).hint,
      group: "Navigate",
      keywords:
        "prev previous back archived cycle wrap step jump cold pins audit reverse backward",
      available: archivedCount > 0,
      run: () => {
        closePalette();
        void jumpToPrevArchived();
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
      id: "filter-links",
      label: "Show links only",
      hint: "is:link — link clips (parity with kind:link)",
      group: "Filter",
      keywords: "is:link kind:link url href",
      run: () => {
        closePalette();
        appendSearchOp("is:link");
      },
    },
    {
      id: "filter-no-templates",
      label: "Hide templates (plain clips only)",
      hint: "is:notemplate — drop {{token}} snippets from the view",
      group: "Filter",
      keywords: "is:notemplate plain non-template strip without tokens raw",
      run: () => {
        closePalette();
        appendSearchOp("is:notemplate");
      },
    },
    {
      // `is:locked` — surface every clip with the "ask before deleting"
      // bit set. Parity with the other is:* operators so users can audit
      // "what have I marked irreplaceable?" in one keystroke without
      // hunting through the list for the inline padlock badge.
      id: "filter-locked",
      label: "Show locked clips",
      hint: "is:locked — ask-before-deleting clips only",
      group: "Filter",
      keywords: "is:locked lock padlock irreplaceable ask delete protected",
      run: () => {
        closePalette();
        appendSearchOp("is:locked");
      },
    },
    {
      // `is:unlocked` — inverse twin of `is:locked`. The natural use
      // case is the "what should I lock?" review pass after auditing
      // is:locked clips: pair with `tag:irreplaceable` or `host:<x>`
      // to surface unlock candidates. Cheap parity — keeps users from
      // having to remember a custom negation operator.
      id: "filter-unlocked",
      label: "Show unlocked clips",
      hint: "is:unlocked — clips without the lock bit",
      group: "Filter",
      keywords: "is:unlocked unlock padlock missing lock candidates review",
      run: () => {
        closePalette();
        appendSearchOp("is:unlocked");
      },
    },
    {
      // `is:wrapoverride` — surface every clip pinned to its own
      // detail-body wrap state (deviating from the global default).
      // The review pass for the per-clip wrap feature: after pinning a
      // few wide TSV/log clips to nowrap, this answers "which ones did
      // I override?" without opening each to check the toggle dot. Live
      // count in the hint; greys (available:false) when nothing's
      // overridden so the palette doesn't offer an empty filter.
      id: "filter-wrap-override",
      label: "Show clips with a wrap override",
      hint:
        wrapOverrideCount > 0
          ? `is:wrapoverride — ${wrapOverrideCount} clip${wrapOverrideCount === 1 ? "" : "s"} pinned to their own wrap`
          : "is:wrapoverride — no clips override the global wrap yet",
      group: "Filter",
      keywords:
        "is:wrapoverride wrap nowrap override per-clip pinned deviate detail body lines",
      available: wrapOverrideCount > 0,
      run: () => {
        closePalette();
        appendSearchOp("is:wrapoverride");
      },
    },
    {
      // `is:noted` — surface every clip carrying a free-form note.
      // The note feature (shipped this tick) lets users attach a
      // caveat to a clip ("only for staging" / "needs login" /
      // "deprecated as of June"). This operator answers the natural
      // follow-up: "show me everything I've left a note on so I can
      // review the caveats". Pairs well with host:/tag:/before: for
      // scoped audit passes.
      id: "filter-noted",
      label: "Show noted clips",
      hint: "is:noted — clips with a free-form note in detail-view",
      group: "Filter",
      keywords: "is:noted note annotation caveat commentary memo annotated review",
      run: () => {
        closePalette();
        appendSearchOp("is:noted");
      },
    },
    {
      // `is:nonoted` — inverse twin of `is:noted`. Same review-pass
      // logic as `is:unlocked` for the lock family: after auditing
      // what HAS a note, flip to find candidates worth a note. Pair
      // with `is:locked` to surface "irreplaceable but uncommented"
      // — the highest-leverage place to leave a caveat. Pure
      // complement of `is:noted` so `is:noted is:nonoted` is empty
      // by AND-semantics, matching `is:template is:notemplate` and
      // `is:locked is:unlocked`.
      id: "filter-nonoted",
      label: "Hide noted clips (un-annotated only)",
      hint: "is:nonoted — clips WITHOUT a free-form note",
      group: "Filter",
      keywords: "is:nonoted no note un-annotated missing commentary review candidates without",
      run: () => {
        closePalette();
        appendSearchOp("is:nonoted");
      },
    },
    {
      // `is:hashtags` — narrower than `is:noted`. Surfaces clips
      // whose note carries at least one extractable `#hashtag`
      // token (same grammar as bulk Tag-from-notes + Cmd+K
      // hashtag-discovery — single source of truth). This is the
      // "ready-for-promotion" view: filtering down to clips where
      // running Tag-from-notes would actually do work. Pair with
      // `host:<x>` for per-site cleanup, or with `is:notenewer:7d`
      // to find this week's writeups that still have inline tags.
      id: "filter-hashtags",
      label: "Show clips with #hashtags in notes",
      hint: "is:hashtags — notes containing inline #hashtag tokens (promotion candidates)",
      group: "Filter",
      keywords: "is:hashtags hashtag inline tags promote candidates ready note",
      run: () => {
        closePalette();
        appendSearchOp("is:hashtags");
      },
    },
    {
      // `is:nohashtags` — inverse twin of `is:hashtags`. Different
      // semantic axis from `is:nonoted`: a clip with prose-only
      // notes passes BOTH `is:noted` AND `is:nohashtags` because
      // it has annotation but no inline tag pollution. Pair with
      // `is:noted` to surface the "clean" annotated subset:
      // "show me my real prose notes, filter out the messy
      // still-tagging-inline tail".
      id: "filter-nohashtags",
      label: "Hide clips with #hashtags in notes",
      hint: "is:nohashtags — notes without inline #hashtag tokens (prose-only or empty)",
      group: "Filter",
      keywords: "is:nohashtags no hashtag clean prose only inverse",
      run: () => {
        closePalette();
        appendSearchOp("is:nohashtags");
      },
    },
    {
      // `is:hostlocked` — cross-store join (site_rules × clips) that
      // surfaces clips whose HOST has a configured autoLock rule,
      // regardless of whether the per-clip `locked` bit is set yet.
      // Different lens than `is:locked`: this one asks "is this from
      // a site I've protected by RULE?" rather than "did I lock THIS
      // clip?". Pair with `is:unlocked` to surface drift (rule-
      // governed hosts whose clips somehow ended up unlocked, e.g.
      // a manual unlock after the rule shipped). Greys out when no
      // rules carry autoLock OR no clips fall under such a rule, so
      // the row never lies about an empty result. Label carries the
      // live count via the cached hostLockedCount for honest UX.
      id: "filter-hostlocked",
      label:
        hostLockedCount > 0
          ? `Show hostlocked clips (${hostLockedCount})`
          : "Show hostlocked clips",
      hint: (() => {
        if (hostLockedCount === 0) {
          return "is:hostlocked — no host site-rules with autoLock yet";
        }
        // autoLockedHostsForClips reads from the LIVE clip cache
        // (`currentClips` may be filtered; we want the unfiltered
        // set so the hint stays truthful across filter changes).
        // currentSiteRules is the live rules array. Cheap: same
        // single-pass predicate the count uses.
        const hostsList = autoLockedHostsForClips(
          currentSiteRules,
          currentClips,
        );
        const n = hostsList.length;
        const suffix = n === 1 ? "" : "s";
        return n > 0
          ? `is:hostlocked — clips from ${n} autoLock'd host${suffix} (rule-governed)`
          : "is:hostlocked — clips from autoLock'd hosts (rule-governed)";
      })(),
      group: "Filter",
      keywords:
        "is:hostlocked host site rule auto-lock autolock governed configured protected cross-store join drift",
      available: hostLockedCount > 0,
      run: () => {
        closePalette();
        appendSearchOp("is:hostlocked");
      },
    },
    {
      // `is:hostpinned` — companion to `is:hostlocked`. Different
      // lens than `is:pinned`: rule-presence vs current per-clip
      // bit. Useful for "which sites have I configured for auto-
      // pin?" review pass, or for verifying a freshly-added autoPin
      // rule (paired with `is:pinned` for alignment; combining with
      // a future negation operator would surface "rule says pin
      // but clip somehow isn't pinned" drift).
      id: "filter-hostpinned",
      label:
        hostPinnedCount > 0
          ? `Show hostpinned clips (${hostPinnedCount})`
          : "Show hostpinned clips",
      hint: (() => {
        if (hostPinnedCount === 0) {
          return "is:hostpinned — no host site-rules with autoPin yet";
        }
        const hostsList = flaggedHostsForClips(
          currentSiteRules,
          currentClips,
          "autoPin",
        );
        const n = hostsList.length;
        const suffix = n === 1 ? "" : "s";
        return n > 0
          ? `is:hostpinned — clips from ${n} autoPin'd host${suffix} (rule-governed)`
          : "is:hostpinned — clips from autoPin'd hosts (rule-governed)";
      })(),
      group: "Filter",
      keywords:
        "is:hostpinned host site rule auto-pin autopin sticky configured pinned cross-store join drift alignment",
      available: hostPinnedCount > 0,
      run: () => {
        closePalette();
        appendSearchOp("is:hostpinned");
      },
    },
    {
      // `is:hostredacted` — surfaces clips whose host carries an
      // autoRedact site rule. Distinct from `is:redacted` (per-clip
      // bit). Useful for "what sites am I redacting on?" audit + for
      // surfacing drift if a rule was added AFTER existing clips
      // landed (those won't carry the redacted bit because ingest
      // is the only place autoRedact applies — they'll match
      // `is:hostredacted` but not `is:redacted`, which is the exact
      // signal you want to find them and retroactively redact).
      id: "filter-hostredacted",
      label:
        hostRedactedCount > 0
          ? `Show hostredacted clips (${hostRedactedCount})`
          : "Show hostredacted clips",
      hint: (() => {
        if (hostRedactedCount === 0) {
          return "is:hostredacted — no host site-rules with autoRedact yet";
        }
        const hostsList = flaggedHostsForClips(
          currentSiteRules,
          currentClips,
          "autoRedact",
        );
        const n = hostsList.length;
        const suffix = n === 1 ? "" : "s";
        return n > 0
          ? `is:hostredacted — clips from ${n} autoRedact'd host${suffix} (rule-governed)`
          : "is:hostredacted — clips from autoRedact'd hosts (rule-governed)";
      })(),
      group: "Filter",
      keywords:
        "is:hostredacted host site rule auto-redact privacy pii configured cross-store join drift retroactive",
      available: hostRedactedCount > 0,
      run: () => {
        closePalette();
        appendSearchOp("is:hostredacted");
      },
    },
    {
      // `is:hostscrubbed` — surfaces clips whose host carries an
      // autoScrubOrigin site rule. The clip's source URL/title/
      // nearbyText are stripped on ingest, so a clip captured under
      // this rule will NOT have a source URL — `is:hostscrubbed`
      // is the cleanest way to find them (they fall out of `host:`
      // filters because their hostFrom() is empty post-scrub).
      id: "filter-hostscrubbed",
      label:
        hostScrubbedCount > 0
          ? `Show hostscrubbed clips (${hostScrubbedCount})`
          : "Show hostscrubbed clips",
      hint: (() => {
        if (hostScrubbedCount === 0) {
          return "is:hostscrubbed — no host site-rules with autoScrubOrigin yet";
        }
        const hostsList = flaggedHostsForClips(
          currentSiteRules,
          currentClips,
          "autoScrubOrigin",
        );
        const n = hostsList.length;
        const suffix = n === 1 ? "" : "s";
        return n > 0
          ? `is:hostscrubbed — clips from ${n} autoScrub'd host${suffix} (rule-governed)`
          : "is:hostscrubbed — clips from autoScrub'd hosts (rule-governed)";
      })(),
      group: "Filter",
      keywords:
        "is:hostscrubbed host site rule auto-scrub origin metadata privacy configured cross-store join drift",
      available: hostScrubbedCount > 0,
      run: () => {
        closePalette();
        appendSearchOp("is:hostscrubbed");
      },
    },
    {
      // `is:notelonger:N` — surfaces clips whose note is longer than
      // N chars. Default N=120 picks the prose-style notes (multi-
      // sentence caveats / context paragraphs) — distinct from the
      // sticky-note style. The user can edit N inline in the search
      // bar after the operator drops in. Greys when no clip in the
      // current view satisfies the threshold so the row never lies
      // about an empty result. Scans currentClips (the visible set)
      // rather than wide — the gate matters for what the user is
      // ACTUALLY seeing post-filter.
      id: "filter-notelonger",
      label: "Show long notes (>120 chars)",
      hint: "is:notelonger:120 — find the essay-style caveats",
      group: "Filter",
      keywords:
        "is:notelonger long note essay paragraph prose multi-line review trim verbose extensive thoughtful caveat",
      available: currentClips.some((c) => {
        if (typeof c.note !== "string") return false;
        return c.note.trim().length > 120;
      }),
      run: () => {
        closePalette();
        appendSearchOp("is:notelonger:120");
      },
    },
    {
      // `is:noteshorter:N` — companion to is:notelonger. Default
      // N=30 picks one-line reminders — good candidates to promote
      // into structured tags, since "todo" / "draft" / "deprecated"
      // notes are tags-in-disguise. Greys when no short notes
      // exist. The label hint nudges toward the triage workflow.
      id: "filter-noteshorter",
      label: "Show short notes (<30 chars)",
      hint: "is:noteshorter:30 — sticky-note style reminders",
      group: "Filter",
      keywords:
        "is:noteshorter short note brief tag reminder sticky one-line triage convert promote tagify",
      available: currentClips.some((c) => {
        if (typeof c.note !== "string") return false;
        const len = c.note.trim().length;
        return len > 0 && len < 30;
      }),
      run: () => {
        closePalette();
        appendSearchOp("is:noteshorter:30");
      },
    },
    {
      // `is:notenewer:Nd` — chronology filter over `noteUpdatedAt`
      // (NOT `lastSeenAt`, which gates re-copy recency not annotation
      // recency). Default 7d window matches the recently-noted Cmd+K
      // command's window. The user can edit the duration in the
      // search bar (e.g. `is:notenewer:1d`, `is:notenewer:30d`)
      // for any timeframe — same `Nd`/`Nh`/`Nw` grammar that
      // `before:`/`after:` accept. Greys when no clip in the current
      // view has been noted within 7 days so the row never lies
      // about an empty result.
      id: "filter-notenewer",
      label: "Show recently noted (last 7d)",
      hint: "is:notenewer:7d — notes written/updated in the last week",
      group: "Filter",
      keywords:
        "is:notenewer recent fresh note annotation week chronology review live current modified updated",
      available: (() => {
        const cutoff = Date.now() - 7 * 86_400_000;
        return currentClips.some(
          (c) =>
            typeof c.note === "string" &&
            c.note.trim().length > 0 &&
            typeof c.noteUpdatedAt === "number" &&
            Number.isFinite(c.noteUpdatedAt) &&
            c.noteUpdatedAt >= cutoff,
        );
      })(),
      run: () => {
        closePalette();
        appendSearchOp("is:notenewer:7d");
      },
    },
    {
      // `is:noteolder:Nd` — companion to is:notenewer. Default 30d
      // picks the "stale caveat" review pass: notes the user hasn't
      // touched in a month that might describe a state the codebase
      // has since moved past. Combine with `is:locked` to find
      // "locked clips with stale annotations" — the
      // highest-leverage review queue. Greys when no clip has a
      // note older than 30d (typical early-adopter case).
      id: "filter-noteolder",
      label: "Show stale notes (older than 30d)",
      hint: "is:noteolder:30d — notes that may describe a past state",
      group: "Filter",
      keywords:
        "is:noteolder stale old note annotation review past out-of-date deprecated forgotten",
      available: (() => {
        const cutoff = Date.now() - 30 * 86_400_000;
        return currentClips.some(
          (c) =>
            typeof c.note === "string" &&
            c.note.trim().length > 0 &&
            typeof c.noteUpdatedAt === "number" &&
            Number.isFinite(c.noteUpdatedAt) &&
            c.noteUpdatedAt <= cutoff,
        );
      })(),
      run: () => {
        closePalette();
        appendSearchOp("is:noteolder:30d");
      },
    },
    {
      // Chronology companion to `is:locked` — the everything-ever view
      // shows the FULL lock backlog (could be hundreds of items if the
      // user has been locking aggressively), while this one scopes to
      // the last 7 days of *lock decisions* (via `lockedAt`, NOT
      // `lastSeenAt` — see lib/recently-locked.ts for why these
      // diverge). Useful for the weekly "did I lock the right
      // things?" review pass. Uses search box, not a parser bit:
      // `is:locked` + a numeric `after:7d` would have the wrong
      // semantics (filters by re-copy, not by lock-decision). So the
      // command opens the chronology in the search box anyway, but
      // hands the user a query whose results are AT LEAST as broad as
      // the helper's strict cut — they'll see slightly more results
      // in the list than the count suggests because the search bar
      // can't express "lockedAt >= now - 7d" directly; the count is
      // the more precise number. Hint surfaces "Most recent: X ago"
      // so the user sees the chronology head before opening.
      id: "show-recently-locked",
      label: (() => {
        const lbl = formatRecentlyLockedLabel({
          count: recentlyLockedCount,
          freshestLockedAt: recentlyLockedFreshestAt,
          formatAge,
          windowDays: Math.floor(RECENTLY_LOCKED_DEFAULT_WINDOW_MS / 86_400_000),
        });
        return lbl.label;
      })(),
      hint: (() => {
        const lbl = formatRecentlyLockedLabel({
          count: recentlyLockedCount,
          freshestLockedAt: recentlyLockedFreshestAt,
          formatAge,
          windowDays: Math.floor(RECENTLY_LOCKED_DEFAULT_WINDOW_MS / 86_400_000),
        });
        return lbl.hint;
      })(),
      group: "Filter",
      keywords: "recently locked review week chronology fresh lock decisions audit irreplaceable",
      available: recentlyLockedCount > 0,
      run: () => {
        closePalette();
        // Drop into the locked filter so the list at least scopes to
        // locked clips. The user can refine further (host:x, tag:y)
        // — the palette count above tells them how many of those
        // clips were locked in the last 7 days specifically.
        appendSearchOp("is:locked");
      },
    },
    {
      // Chronology companion to `is:noted` — mirrors recently-locked
      // for the per-clip note family. The everything-ever view
      // (`is:noted`) shows every annotated clip ever; this one
      // scopes to the last 7 days of *annotation decisions* (via
      // `noteUpdatedAt`, NOT `lastSeenAt` — see lib/recently-noted.ts
      // for why those diverge). Useful for the weekly "did I write
      // the right caveats?" review pass. Same search-box-not-parser
      // trick recently-locked uses: `is:noted` + `after:7d` would
      // filter by re-copy not annotation-recency, so we drop into
      // `is:noted` and let the palette count + hint communicate the
      // tighter chronology window. The user will see slightly more
      // results in the list than the count suggests because the
      // search bar can't express "noteUpdatedAt >= now - 7d"
      // directly — the count is the more precise number. Hint
      // surfaces "Most recent: X ago" so the user sees the most
      // recent caveat before opening.
      id: "show-recently-noted",
      label: (() => {
        const lbl = formatRecentlyNotedLabel({
          count: recentlyNotedCount,
          freshestNoteUpdatedAt: recentlyNotedFreshestAt,
          formatAge,
          windowDays: Math.floor(RECENTLY_NOTED_DEFAULT_WINDOW_MS / 86_400_000),
        });
        return lbl.label;
      })(),
      hint: (() => {
        const lbl = formatRecentlyNotedLabel({
          count: recentlyNotedCount,
          freshestNoteUpdatedAt: recentlyNotedFreshestAt,
          formatAge,
          windowDays: Math.floor(RECENTLY_NOTED_DEFAULT_WINDOW_MS / 86_400_000),
        });
        return lbl.hint;
      })(),
      group: "Filter",
      keywords: "recently noted review week chronology fresh note decisions audit annotation caveat commentary memo annotated",
      available: recentlyNotedCount > 0,
      run: () => {
        closePalette();
        // Drop into the noted filter so the list scopes to noted
        // clips. The palette count above tells them how many of
        // those were noted in the last 7 days specifically.
        appendSearchOp("is:noted");
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
      // Bulk copy — proxies the bulk-bar button so palette + click
      // share the same join logic + toast. Label reflects how many of
      // the visible selected clips carry copyable text (images
      // skipped) so the keyboard route previews the outcome too.
      id: "copy-selection",
      label: (() => {
        const vis = currentClips.filter((c) => selectedIds.has(c.id));
        const plan = planBulkCopy(vis);
        if (!plan.hasContent) return "Copy selected as text";
        return `Copy ${plan.copied} selected as text`;
      })(),
      group: "Bulk",
      available: hasSelection,
      run: () => {
        closePalette();
        bulkCopy.click();
      },
    },
    {
      // Bulk copy-as-Markdown — palette twin of the copy-selection
      // command so keyboard-only users reach the structured copy too.
      // Label previews how many of the visible selected clips will
      // render to a Markdown block (the click handler reads the full
      // selection authoritatively at fire time).
      id: "copy-selection-md",
      label: (() => {
        const vis = currentClips.filter((c) => selectedIds.has(c.id));
        const plan = planBulkMarkdown(vis);
        if (!plan.hasContent) return "Copy selected as Markdown";
        return `Copy ${plan.rendered} selected as Markdown`;
      })(),
      group: "Bulk",
      available: hasSelection,
      run: () => {
        closePalette();
        bulkCopyMd.click();
      },
    },
    {
      // Bulk lock/unlock — proxies the bulk-bar button so the palette
      // route + click route share the same authoritative logic. The
      // label adapts to the selection's lock distribution: "Lock 3
      // selected" / "Unlock 5 selected" / "Toggle lock on selection"
      // when there's nothing to compute against (no selection).
      id: "lock-selection",
      label: (() => {
        const visibleSelected = currentClips.filter((c) => selectedIds.has(c.id));
        if (visibleSelected.length === 0) return "Toggle lock on selection";
        const intent = decideBulkLockIntent(visibleSelected);
        if (intent === null) return "Toggle lock on selection";
        const verb = intent === "lock" ? "Lock" : "Unlock";
        const n = countBulkLockWrites(visibleSelected, intent);
        if (n === 0) {
          return `${verb} selection (all already ${intent === "lock" ? "locked" : "unlocked"})`;
        }
        return `${verb} ${n} selected`;
      })(),
      hint: "Ask-before-deleting confirm gate for the batch",
      group: "Bulk",
      keywords: "lock unlock padlock irreplaceable ask delete protect selection batch",
      available: hasSelection,
      run: () => {
        closePalette();
        bulkLock.click();
      },
    },
    {
      // Bulk lock+pin combo — additive ("get them up top AND mark
      // irreplaceable"). Label shows the live projection so the user
      // sees the action's scope before pressing Enter. Available
      // gate matches the bulk-bar button's hidden state so the
      // palette + click routes agree about when the action is
      // meaningful (some-clip-needs-at-least-one-bit).
      id: "lockpin-selection",
      label: (() => {
        const visibleSelected = currentClips.filter((c) => selectedIds.has(c.id));
        if (visibleSelected.length === 0) return "Lock + pin selection";
        const plan = planBulkLockPin(visibleSelected);
        const changed = plan.total - plan.alreadyBoth;
        if (changed === 0) {
          return plan.total === 1
            ? "Lock + pin (already both)"
            : `Lock + pin (all ${plan.total} already both)`;
        }
        if (plan.alreadyBoth === 0) {
          return `Lock + pin ${changed} selected`;
        }
        return `Lock + pin ${changed} of ${plan.total} selected`;
      })(),
      hint: "Pin to top AND require ask-before-delete confirm — additive (won't unpin/unlock anything)",
      group: "Bulk",
      keywords: "lock pin selection batch combo irreplaceable both protect keep",
      available: (() => {
        if (!hasSelection) return false;
        const visibleSelected = currentClips.filter((c) => selectedIds.has(c.id));
        return isBulkLockPinActionable(visibleSelected);
      })(),
      run: () => {
        closePalette();
        bulkLockPin.click();
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
      // Palette mirror for the bulk-bar note button. Same handler;
      // the palette is just a keyboard-only path. Overwrite + clear
      // contract is documented on the click handler — the prompt
      // surfaces the replace-count warning before commit.
      id: "note-selection",
      label: "Add note to selection…",
      hint: "Apply one note to every selected clip — empty input clears existing notes",
      keywords: "note annotate caveat bulk commentary memo selection apply",
      group: "Bulk",
      available: hasSelection,
      run: () => {
        closePalette();
        bulkNote.click();
      },
    },
    {
      // Palette mirror for the bulk-bar "Tag from notes" button.
      // Same handler; the palette gives the action a keyboard path
      // in addition to the bulk-bar button (which is hidden when
      // the action would no-op so the user might not see it).
      // Available gate matches the button's visibility gate exactly:
      // at least one selected clip has at least one extractable
      // hashtag NOT already in its tag list.
      id: "tag-from-notes-selection",
      label: "Tag selection from #hashtags in notes",
      hint: "Promote inline #tags in notes into structured tags",
      keywords:
        "tag from notes hashtag inline promote extract bulk selection convert structure annotate",
      group: "Bulk",
      available:
        hasSelection &&
        isTagFromNotesActionable(
          [...selectedIds]
            .map((id) => currentClips.find((c) => c.id === id))
            .filter((c): c is NonNullable<typeof c> => !!c),
        ),
      run: () => {
        closePalette();
        bulkTagFromNotes.click();
      },
    },
    {
      // Palette mirror for the combo button. Distinct palette row
      // (not just a hidden mode on tag-from-notes) so the keyboard
      // user can discover the destructive variant separately. Same
      // confirm dialog as the button click, so accidental palette
      // fire is still gated.
      id: "tag-from-notes-and-clear-selection",
      label: "Tag selection from #hashtags + clear notes",
      hint: "Promote then wipe the source notes - destructive",
      keywords:
        "tag from notes hashtag clear erase clean promote combo destructive cleanup housekeeping",
      group: "Bulk",
      available:
        hasSelection &&
        isTagFromNotesAndClearActionable(
          [...selectedIds]
            .map((id) => currentClips.find((c) => c.id === id))
            .filter((c): c is NonNullable<typeof c> => !!c),
        ),
      run: () => {
        closePalette();
        bulkTagFromNotesClear.click();
      },
    },
    {
      // Bulk Strip-hashtags palette mirror. Distinct from
      // tag-from-notes (additive promote) and tag-from-notes-clear
      // (promote + wipe whole note): this one REMOVES the inline
      // `#tag` tokens while PRESERVING prose. Non-destructive of
      // annotation context. Lives in Bulk for selection-shape
      // discoverability alongside its destructive cousins.
      id: "strip-hashtags-selection",
      label: "Strip inline #tags from notes",
      hint: "Remove `#tag` tokens, keep prose - non-destructive cleanup",
      keywords:
        "strip remove hashtag tag note inline clean prose preserve cleanup post-promote bulk",
      group: "Bulk",
      available:
        hasSelection &&
        isBulkStripHashtagsActionable(
          [...selectedIds]
            .map((id) => currentClips.find((c) => c.id === id))
            .filter((c): c is NonNullable<typeof c> => !!c),
        ),
      run: () => {
        closePalette();
        bulkStripHashtags.click();
      },
    },
    {
      // "Find hashtags in notes" - discovery / triage command. Scans
      // the currently-visible clip set's notes for #hashtag tokens
      // and surfaces a sorted distribution via toast: "Found
      // #staging in 8 clips, #wip in 5, ..." Completes the loop the
      // OPPOSITE direction from tag-from-notes - the user can SEE
      // what hashtags they've left scattered across notes BEFORE
      // committing to a bulk promote. Different from "Tag selection
      // from #hashtags" (which writes) - this READS so the user can
      // decide whether to wipe noise (#wip), promote signal
      // (#staging), or just keep the discovery for awareness.
      //
      // Operates on currentClips (the visible set) so the hint can
      // honestly say "10 hashtags across 23 clips" reflecting what
      // the user actually sees. Pure discovery: no IDB writes, no
      // side effects.
      id: "discover-hashtags-in-notes",
      label: "Find hashtags in notes",
      hint: formatHashtagDiscoveryHint(
        discoverHashtagsInNotes(currentClips, { topN: 1 }),
      ),
      keywords:
        "find discover hashtag tag note inline distribution top frequency triage audit list",
      group: "Filter",
      // Always available - even an empty scan is a useful answer
      // ("no hashtags hiding in your notes"). Greyed only when no
      // clips at all.
      available: currentClips.length > 0,
      run: () => {
        closePalette();
        // Re-scan at click time (currentClips may have changed
        // between palette open and command run) with a generous
        // topN so the toast can include the headline list. The
        // hint already showed the high-signal preview.
        const report = discoverHashtagsInNotes(currentClips, { topN: 12 });
        toast(formatHashtagDiscoveryToast(report));
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
      // Cherry-pick JSON export from the bulk selection. Proxies the
      // bulk-bar button so the palette + click routes share one code
      // path. Different from "Export with current filter" (which uses
      // the Settings panel's format dropdown + filter UI + audit/
      // history fields) — this is the lightweight "send my 3 picks
      // to a friend" path.
      id: "export-selection",
      label: hasSelection
        ? `Export ${selectedIds.size} selected as JSON`
        : "Export selection as JSON",
      hint: "Cherry-pick JSON · pastes back through Settings → Import",
      group: "Bulk",
      keywords: "export selection json bundle cherry pick share backup partial",
      available: hasSelection,
      run: () => {
        closePalette();
        bulkExport.click();
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
    // Pin every clip captured from the popup's owning tab's host —
    // one-shot triage when the user's been researching a single site.
    // Non-toggle: already-pinned clips skip the loop so the user's
    // earlier explicit pins survive untouched. Label adapts to the
    // live state ("Pin 4 clips from github.com" / "All 12 already
    // pinned" / "No clips captured yet" / greyed out when there's
    // no http(s) host context). The IIFE keeps the label/hint/available
    // trio computed in one place so they can't drift apart.
    ((): PaletteAction => {
      const bits = formatPinFromHostLabel({
        host: activeTabHost,
        matched: activeHostMatched,
        pinnable: activeHostPinnable,
      });
      return {
        id: "pin-from-active-host",
        label: bits.label,
        hint: bits.hint,
        group: "Bulk",
        keywords:
          "pin host site source triage active tab same site current page batch",
        available: bits.available,
        run: async () => {
          closePalette();
          await pinAllFromActiveHost();
        },
      };
    })(),
    // Companion to pin-from-active-host: lock every clip from the
    // popup's owning tab's host with the "ask before deleting" gate.
    // Same shape, same matching rules, same active/greyed logic — just
    // the lock bit instead of pin. Surfaces orthogonally so a user
    // working on a sensitive site can both pin AND lock the captures
    // in two keystrokes.
    ((): PaletteAction => {
      const bits = formatLockFromHostLabel({
        host: activeTabHost,
        matched: activeHostMatched,
        lockable: activeHostLockable,
      });
      return {
        id: "lock-from-active-host",
        label: bits.label,
        hint: bits.hint,
        group: "Bulk",
        keywords:
          "lock host site padlock ask delete confirm protect irreplaceable triage active tab current page batch",
        available: bits.available,
        run: async () => {
          closePalette();
          await lockAllFromActiveHost();
        },
      };
    })(),
    // Completes the host-scoped triage trio (pin / lock / note).
    // Same active-tab anchoring as the pin + lock variants; same
    // 4-shape label matrix (no host / 0 matched / N matched). Apply
    // path prompts for a note value, then overwrites every matching
    // clip's note via setClipNote — same sanitiseClipNote pipeline
    // the detail editor + bulk-bar use, so the stored value is
    // identical across all three entry points. Empty input clears
    // existing notes (mirrors bulk-bar's "save empty" contract);
    // cancel (null prompt) is a clean no-op.
    ((): PaletteAction => {
      const bits = formatNoteFromHostLabel({
        host: activeTabHost,
        matched: activeHostMatched,
      });
      return {
        id: "note-from-active-host",
        label: bits.label,
        hint: bits.hint,
        group: "Bulk",
        keywords:
          "note host site annotate annotation commentary caveat memo triage active tab current page batch every clip prose",
        available: bits.available,
        run: async () => {
          closePalette();
          await noteAllFromActiveHost();
        },
      };
    })(),
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

  // Dynamic per-hashtag filter rows. Scans the visible clip set's
  // notes for inline `#hashtag` tokens and surfaces a palette row
  // per top-N hashtag, letting the user keyboard-pick one to filter
  // the list down. This is the "Hashtag report panel" follow-up
  // for the discovery command (which today is toast-only): instead
  // of opening a separate UI surface, we let each top hashtag have
  // its own discoverable palette row.
  //
  // Top-N cap: 8. The palette already has dozens of static rows;
  // surfacing 50 hashtag rows would bury everything else. 8 is the
  // sweet spot — covers most users' active hashtag set without
  // crowding the static commands. The "Find hashtags in notes"
  // command still exists for the FULL list (it scans with topN=12).
  const hashtagReport = discoverHashtagsInNotes(currentClips, { topN: 8 });
  for (const entry of hashtagReport.entries) {
    const filter = hashtagFilterActionFor(entry);
    if (!filter) continue;
    actions.push({
      // Per-tag id namespace keeps the palette's command-uniqueness
      // contract (each id must be distinct across the dynamic + static
      // sets). Hashtag bodies are lowercase + capped at 32 chars +
      // limited to [a-z0-9_-], so the id stays under control.
      id: `filter-hashtag-${entry.tag}`,
      label: filter.label,
      hint: filter.hint,
      group: "Filter",
      keywords: filter.keywords,
      // Always available when the entry exists — even an
      // already-tagged tag is worth filtering by (the user might
      // want to see the inline duplicates before running a strip).
      run: () => {
        closePalette();
        appendSearchOp(filter.searchOp);
      },
    });
  }
  // (Sort row tail intentionally moved above; everything after is
  // appended dynamically.)
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
 * Cmd+K "Jump to next archived clip" handler. Cycles through
 * archived clips newest-first, wrapping at the end. The detail view
 * is OPENED for the next clip (not the list filter changed), so the
 * user's daily-list view stays put.
 *
 * Pulls the full clip store at click time so the cycle reflects
 * fresh archives (e.g. the user just archived something while the
 * palette was open). We could read the cached `archivedCount` and
 * tee off the existing render-loaded `wide`, but the IDB read is
 * a single object-store getAll and the loop is microseconds — not
 * worth the risk of cycling against a stale snapshot.
 *
 * No-op + toast when the archive is genuinely empty (the palette
 * already gates this via `available: false`, but the handler stays
 * defensive in case a stale shortcut races the cache).
 */
async function jumpToNextArchived(): Promise<void> {
  const all = await listClips({ limit: 5000 });
  const cursor = detailId;
  const next = nextArchivedClipId(all, cursor);
  if (!next) {
    toast("No archived clips", "error");
    return;
  }
  // Toast the position so the user knows where they are in the cycle
  // (e.g. "Archived clip 3 of 12") — handy when stepping through a
  // long archive list. Computed against the same sorted slice the
  // helper used so the index is consistent.
  const sorted = all.filter((c) => c.archived === true);
  sorted.sort(
    (a, b) =>
      (b.lastSeenAt || 0) - (a.lastSeenAt || 0) ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
  const idx = sorted.findIndex((c) => c.id === next);
  if (idx >= 0 && sorted.length > 1) {
    toast(`Archived clip ${idx + 1} of ${sorted.length}`);
  }
  await openDetail(next);
}

/**
 * Reverse companion to jumpToNextArchived. Walks the archived cycle
 * backwards from the current detail cursor (or starts at the tail
 * when no cursor is set) — useful for stepping back after over-
 * shooting in the forward direction, or for browsing the oldest
 * archived clips first.
 *
 * Same listClips fetch pattern as the forward command so a fresh
 * archive (e.g. user just archived a clip while the palette was
 * open) shows up immediately. Toast uses identical "Archived clip
 * N of M" copy so the two directions feel like the same cycle just
 * navigated by intent.
 */
async function jumpToPrevArchived(): Promise<void> {
  const all = await listClips({ limit: 5000 });
  const cursor = detailId;
  const prev = prevArchivedClipId(all, cursor);
  if (!prev) {
    toast("No archived clips", "error");
    return;
  }
  const sorted = all.filter((c) => c.archived === true);
  sorted.sort(
    (a, b) =>
      (b.lastSeenAt || 0) - (a.lastSeenAt || 0) ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
  const idx = sorted.findIndex((c) => c.id === prev);
  if (idx >= 0 && sorted.length > 1) {
    toast(`Archived clip ${idx + 1} of ${sorted.length}`);
  }
  await openDetail(prev);
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
  if (targets.length > 25 && !confirm(buildBulkPreviewMessage(verb, targets.length, targets))) {
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
    listKeyboardActive = true;
    if (e.shiftKey && !inSearch) {
      await moveActiveWithRange(1);
    } else {
      activeIndex = Math.min(currentClips.length - 1, activeIndex + 1);
      await render();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    listKeyboardActive = true;
    if (e.shiftKey && !inSearch) {
      await moveActiveWithRange(-1);
    } else {
      activeIndex = Math.max(0, activeIndex - 1);
      await render();
    }
  } else if (e.key === "Enter") {
    const c = currentClips[activeIndex];
    if (!c) return;
    if (e.shiftKey) await copyAsMarkdown(c);
    else await copyToClipboard(c);
  } else if ((e.key === "Delete" || e.key === "Backspace") && !inSearch) {
    const c = currentClips[activeIndex];
    if (c) {
      await trashWithLockGuard([c.id]);
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
      // Keep the range anchor aligned with the keyboard cursor so a
      // following Shift+Click extends from the row the user just
      // toggled with X.
      if (Number.isFinite(activeIndex)) selectionAnchor = activeIndex;
      await render();
    }
  }
});

// Detail wiring ---------------------------------------------------------
detailBack.addEventListener("click", () => closeDetail());

detailPrev.addEventListener("click", () => void stepDetail(-1));
detailNext.addEventListener("click", () => void stepDetail(1));

// "Open all (N)" — start traversal mode through the snapshot of similar
// matches that was rendered into the row. We grab the ordered id list
// off the button's dataset (set by renderSimilarClips) so this handler
// doesn't re-run findSimilarClips; the user's snapshot is what they
// committed to. Opens the first match; subsequent prev/next cycle the
// stack.
detailSimilarTraverse.addEventListener("click", async () => {
  const idsRaw = detailSimilarTraverse.dataset.ids || "";
  const pivotId = detailSimilarTraverse.dataset.pivotId || "";
  if (!idsRaw || !pivotId) {
    toast("No similar clips to traverse");
    return;
  }
  const ids = idsRaw.split(",").filter(Boolean);
  const nav = buildSimilarNav(ids, pivotId);
  if (!nav) {
    toast("No similar clips to traverse");
    return;
  }
  similarNav = nav;
  await openDetail(nav.ids[0]);
  toast(`Traversing ${nav.ids.length} similar clip${nav.ids.length === 1 ? "" : "s"}`);
});

detailDelete.addEventListener("click", async () => {
  if (!detailId) return;
  const idForUndo = detailId;
  // Lock check happens BEFORE we close the detail panel — if the
  // user bails, the panel stays open so they can unlock first
  // without re-navigating. Cheaper than closing-then-reopening.
  const c = await getClip(idForUndo);
  if (c?.locked) {
    const previewText = c.preview || c.content || "";
    if (!confirm(formatLockedClipConfirm(previewText))) return;
  }
  closeDetail();
  // Pre-confirmed via the lock check above, so we can use the bare
  // trashWithUndo path here — no second prompt for the same intent.
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
        renderDetailTagChips();
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

// Word-wrap toggle for the detail body.
//
// PLAIN CLICK sets a STICKY PER-CLIP override: the open clip is pinned
// to the opposite of whatever it's currently showing, regardless of
// the global default — so a wide TSV/log clip stays nowrap even when
// the user's global preference is wrap-on (and vice versa). The choice
// rides on the clip (db.setWrapOverride) and survives re-opens.
//
// ALT/OPTION-CLICK clears the override: the clip drops back to
// following the global default. (The global default itself is flipped
// from the Cmd+K "Detail: set default wrapping" command, which keeps
// that capability without burdening the common per-clip case.)
detailWrap.addEventListener("click", async (e) => {
  if (!detailId) return;
  const alt = (e as MouseEvent).altKey === true;
  if (alt) {
    // Clear the per-clip override — follow the global again.
    if (!hasWrapOverride({ wrapOverride: detailWrapClipOverride })) {
      // Nothing to clear; the clip already follows the global. Echo the
      // state so the gesture isn't a silent no-op.
      toast(detailWrapOn ? "Following global \u2014 wrap on" : "Following global \u2014 wrap off");
      return;
    }
    detailWrapClipOverride = undefined;
    applyDetailWrap();
    try {
      await setWrapOverride(detailId, undefined);
    } catch (err) {
      console.debug("[context-clipboard] clear wrap override failed", err);
    }
    toast(detailWrapOn ? "Now following global \u2014 wrap on" : "Now following global \u2014 wrap off");
    return;
  }
  // Plain click — flip to a sticky per-clip override that's the
  // opposite of the currently-resolved wrap state.
  const currentlyWrapped = effectiveWrap(
    { wrapOverride: detailWrapClipOverride },
    detailWrapOn,
  );
  const next = !currentlyWrapped;
  detailWrapClipOverride = next;
  applyDetailWrap();
  try {
    await setWrapOverride(detailId, next);
  } catch (err) {
    console.debug("[context-clipboard] persist wrap override failed", err);
  }
  toast(next ? "Wrap on for this clip" : "Wrap off for this clip");
});

// Per-clip force-language control (lib/lang-override) — override the
// auto-detected syntax-tinting language, or force tinting off, when
// detectCodeLang guesses wrong or can't classify. Persists on the
// clip's langOverride field (db.setLangOverride; the normalizer maps
// "Auto-detect" back to undefined so a cleared override doesn't linger
// in the export). Re-opens the clip so the body re-tints with the new
// language immediately + the hint refreshes.
detailLang.addEventListener("change", async () => {
  if (!detailId) return;
  const stored = normalizeLangChoice(detailLang.value);
  try {
    await setLangOverride(detailId, stored);
  } catch (err) {
    console.debug("[context-clipboard] persist lang override failed", err);
  }
  // Re-render the open clip so the body re-tints + the control re-syncs.
  await openDetail(detailId);
  if (stored === OVERRIDE_NONE) toast("Syntax tinting off for this clip");
  else if (stored) toast(`Tinting as ${langLabel(stored)}`);
  else toast("Following auto-detection");
});

// Content-stats breadcrumb: click to copy the summary line itself
// ("1,240 chars · 198 words"). The breadcrumb is read-only signal the
// user often wants to paste into a PR / chat ("this file is 1.2k
// chars") — clicking it is the fastest path. We re-read the open clip
// and recompute the payload from the canonical formatter so the copied
// text always equals what's on screen, even if the clip changed shape
// under the panel. No-op for the hidden/empty state (no data-copyable).
detailStats.addEventListener("click", async (e) => {
  if (detailStats.hidden || !detailStats.dataset.copyable) return;
  if (!detailId) return;
  const c = await getClip(detailId);
  if (!c) return;
  // Alt/Option-click copies the Markdown stat line ("**1,240** chars ·
  // **198** words") for doc paste; a plain click copies the WYSIWYG
  // plain-text summary the breadcrumb shows. Both re-read the open clip
  // and recompute from the canonical formatter so the copied text can
  // never drift from what's on screen.
  const wantsMarkdown = (e as MouseEvent).altKey === true;
  const summary = wantsMarkdown ? formatContentStatsMarkdown(c) : contentStatsClipboard(c);
  if (!summary) return;
  try {
    await navigator.clipboard.writeText(summary);
    toast(wantsMarkdown ? "Copied as Markdown" : formatContentStatsCopyToast(summary));
  } catch (err) {
    console.error("[context-clipboard] stats copy failed", err);
    toast("Copy failed", "error");
  }
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
  // Refresh the promote chip - if the user manually typed a tag
  // that matches a hashtag in the note, the chip should now hide.
  paintNotePromoteChip(detailNote.value, tags);
  // Strip chip is independent of the structured tag list, so the
  // tag edit doesn't change it — but pass through the live value
  // defensively (a textarea autocomplete could collapse with this
  // handler in flight).
  paintNoteStripChip(detailNote.value);
  // Combo chip refreshes on tag edits since manually-added matching
  // tags reduce pending → can hide the combo.
  paintNotePromoteStripChip(detailNote.value, tags);
  // Repaint the tag chips to mirror the just-committed tag list.
  renderDetailTagChips();
  toast("Tags saved");
});
// Live refresh on input too (not just commit on change) so a user
// typing a new tag with autocomplete sees the chip update without
// having to blur the input.
detailTags.addEventListener("input", () => {
  const tags = detailTags.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  paintNotePromoteChip(detailNote.value, tags);
  // Strip chip unaffected by tag-list edits but repaint for
  // symmetry — if the textarea value changed concurrently we want
  // the latest count surfaced.
  paintNoteStripChip(detailNote.value);
  // Combo chip's promote gate moves when tag list changes — refresh.
  paintNotePromoteStripChip(detailNote.value, tags);
  // Live-mirror the chips as the user types/deletes in the raw input.
  renderDetailTagChips();
});

// Tag chip × — remove a single tag in one click. Rewrites the raw
// input from the pruned list (lib/tag-chips owns the set math), then
// commits via the same updateTags + render path the input's change
// handler uses, so the chip remove and the raw edit can never drift.
detailTagChips.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(
    "[data-act=remove-tag]",
  );
  if (!btn || !detailId) return;
  const tag = btn.dataset.tag || "";
  if (!tag) return;
  await removeDetailTag(tag);
});

// Tag chip keyboard UX (lib/tag-chip-nav) — the row is a roving-tabindex
// toolbar. ←/→/Home/End move focus between chips; Backspace/Delete on a
// focused chip removes it AND lands focus on a sensible neighbour so the
// user can keep deleting without reaching for the mouse. Mirrors the
// click-remove path exactly (same removeDetailTag), so keyboard + mouse
// removal can never drift.
detailTagChips.addEventListener("keydown", async (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>(
    ".detail-tag-chip",
  );
  if (!chip) return;
  const idx = Number(chip.dataset.chipIdx);
  if (!Number.isFinite(idx)) return;
  const count = detailTagChips.querySelectorAll(".detail-tag-chip").length;
  if (isChipNavKey(e.key)) {
    e.preventDefault();
    focusDetailTagChip(nextChipFocusIndex(count, idx, e.key));
    return;
  }
  if (isChipRemoveKey(e.key)) {
    if (!detailId) return;
    e.preventDefault();
    const tag = chip.dataset.tag || "";
    if (!tag) return;
    // Compute where focus should land BEFORE the row re-renders, then
    // restore it after removeDetailTag repaints the chips.
    const landing = focusIndexAfterRemove(count, idx);
    await removeDetailTag(tag);
    focusDetailTagChip(landing);
  }
});

// Per-clip note — auto-save on blur + Cmd/Ctrl+Enter. Input event
// only updates the char counter so the user gets live feedback
// without an IDB write per keystroke. Cmd+Enter is the explicit
// save shortcut for users who like keyboard-only flow.
detailNote.addEventListener("input", () => {
  updateNoteCount(detailNote.value);
  // Live-refresh the promote chip so it appears the moment the
  // user finishes typing a `#hashtag` token. detailTags.value
  // carries the latest comma-separated tag list, so even an
  // un-saved tag edit during the same detail session matches the
  // chip's case-insensitive check correctly.
  const liveTags = detailTags.value
    .split(/,\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  paintNotePromoteChip(detailNote.value, liveTags);
  // Strip chip lives next to promote — same live-refresh contract,
  // appears the moment the user types `#tag`.
  paintNoteStripChip(detailNote.value);
  // Combo chip live-updates on every keystroke too.
  paintNotePromoteStripChip(detailNote.value, liveTags);
});
detailNote.addEventListener("blur", () => {
  void saveDetailNote();
});
detailNote.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void saveDetailNote();
  }
});
detailNoteClear.addEventListener("click", async () => {
  if (!detailId) return;
  // Optimistic UI update — clear the textarea immediately so the
  // user sees the blank state, then save in the background.
  detailNote.value = "";
  updateNoteCount("");
  detailNoteClear.hidden = true;
  // Clearing the note also kills the promote chip - no note text
  // means no hashtags to promote.
  paintNotePromoteChip("", []);
  // ...and the strip chip too — empty note has nothing to strip.
  paintNoteStripChip("");
  // ...and the combo chip — no hashtags means no promotion AND no
  // strip work.
  paintNotePromoteStripChip("", []);
  await saveDetailNote();
});

/**
 * Click handler for the per-clip "Promote N #tags" chip.
 *
 * Reads the merged tag list from the chip's dataset (stashed by
 * paintNotePromoteChip so the click acts on the plan the user
 * SAW, not a fresh re-scan that may have drifted). Defensive
 * re-plan as a tie-break so a stale dataset can't promote
 * something the user already typed away.
 *
 * Single-clip variant of the bulk-bar Tag-from-notes click - same
 * db.updateTags path, same case-insensitive merge contract, same
 * pure module composition. The toast grammar is tighter ("Added
 * #x" vs "Added #x to N clips") because the action is per-clip.
 */
detailNotePromote.addEventListener("click", async () => {
  if (!detailId) return;
  const noteValue = detailNote.value;
  // Live tag list (mirrors what paintNotePromoteChip uses on
  // input). Defensive re-plan in case the textarea or the tag
  // input changed since the chip last painted.
  const liveTags = detailTags.value
    .split(/,\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  const plan = planNoteHashtagPromote({
    id: detailId,
    note: noteValue,
    tags: liveTags,
  });
  if (plan.pending.length === 0 || !plan.mergedTags) {
    // Stale chip click - no work to do. Hide the chip + toast a
    // gentle "already tagged" so the user doesn't think the click
    // missed.
    paintNotePromoteChip(noteValue, liveTags);
    toast(formatNoteHashtagPromoteToast(plan));
    return;
  }
  await updateTags(detailId, plan.mergedTags);
  // Refresh the visible tags input + the chip post-write so the
  // user sees the promotion land + the chip vanishes (every
  // hashtag is now structured).
  detailTags.value = plan.mergedTags.join(", ");
  renderDetailTagChips();
  paintNotePromoteChip(noteValue, plan.mergedTags);
  // The strip chip is UNCHANGED — `#tag` tokens are still in the
  // note (promote doesn't touch the note text). User can click
  // strip next to clean up the inline tokens. Repaint to refresh
  // the count defensively (textarea may have changed between the
  // promote click and now via a focus shift).
  paintNoteStripChip(noteValue);
  // Combo chip post-promote: hides because pending is now empty
  // (every hashtag is structured). Repaint reflects that.
  paintNotePromoteStripChip(noteValue, plan.mergedTags);
  toast(formatNoteHashtagPromoteToast(plan));
});

/**
 * Click handler for the per-clip "Strip N #tags" chip.
 *
 * Removes every `#hashtag` token from the note text while
 * preserving the surrounding prose. Independent of the promote
 * chip — does NOT touch the structured tag list. Two valid
 * workflows:
 *
 *   1. PROMOTE then STRIP (two clicks): get the structured tags
 *      AND clean up the inline tokens. Equivalent to the bulk-bar
 *      Tag-from-notes-clear combo, but per-clip + non-destructive
 *      of prose ("be careful #staging - check with $person first"
 *      becomes "be careful - check with $person first", tag list
 *      gains `staging`).
 *
 *   2. STRIP only (one click): the user already promoted the
 *      hashtags via the bulk-bar earlier, or they just want the
 *      inline `#tag` tokens gone WITHOUT structured-tag
 *      conversion (e.g. they used `#temp` as a writeup-time TODO
 *      marker, never intended to promote).
 *
 * Implementation: reads the live textarea value (defensive against
 * dataset drift — the chip's stashed count is for the toast, not
 * the action; the strip itself always operates on the LATEST
 * note text). Optimistic textarea update + saveDetailNote to
 * persist via the same IDB write path the auto-save uses.
 */
detailNoteStrip.addEventListener("click", async () => {
  if (!detailId) return;
  const noteValue = detailNote.value;
  const count = countStrippableHashtagsInNote(noteValue);
  if (count === 0) {
    // Stale chip click - nothing to strip. Hide the chip + toast
    // a defensive message; shouldn't normally reach this branch
    // because the chip hides when count is zero.
    paintNoteStripChip(noteValue);
    toast(formatStripHashtagsToast(0));
    return;
  }
  const stripped = stripHashtagsFromNote(noteValue);
  // Stripped result may be undefined (the note was JUST `#tag`
  // tokens with no surrounding prose - the strip empties it out).
  // setClipNote with undefined deletes the note field, same as
  // the Clear button. We mirror that contract explicitly.
  const newValue = stripped ?? "";
  detailNote.value = newValue;
  updateNoteCount(newValue);
  // Hide the Clear button when the strip emptied the note (same
  // visibility predicate the renderNoteRow + auto-save path use).
  detailNoteClear.hidden = newValue.trim().length === 0;
  // Refresh both chips against the cleaned note: promote should
  // now hide (no hashtags left), strip should hide (count is 0).
  const liveTags = detailTags.value
    .split(/,\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  paintNotePromoteChip(newValue, liveTags);
  paintNoteStripChip(newValue);
  // Combo chip refresh post-strip: hides because there are no
  // hashtags left to promote OR strip.
  paintNotePromoteStripChip(newValue, liveTags);
  // Persist via the same write path the auto-save uses — single
  // source of truth for the IDB write + the audit-log entry +
  // the noteUpdatedAt stamp.
  await saveDetailNote();
  toast(formatStripHashtagsToast(count));
});

/**
 * Click handler for the per-clip "Promote N #tags + strip" combo
 * chip.
 *
 * Runs the two-step "promote then strip" workflow in one click.
 * Result is BYTE-IDENTICAL to clicking the standalone promote chip
 * followed by the standalone strip chip (same merge contract via
 * mergedTagsForClip + same strip via stripHashtagsFromNote).
 *
 * Defensive re-plan at click time: the textarea may have changed
 * between paint and click (focus shifts, autocomplete). The stashed
 * dataset values are for the TOAST grammar only; the actual writes
 * always use the latest plan.
 *
 * Order: tag merge FIRST, note strip SECOND. Order is functionally
 * independent (different IDB fields, both atomic), but tag-first
 * matches the user's mental model ("promote, then clean up the
 * source").
 */
detailNotePromoteStrip.addEventListener("click", async () => {
  if (!detailId) return;
  const noteValue = detailNote.value;
  const liveTags = detailTags.value
    .split(/,\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  const plan = planPromoteAndStrip({
    id: detailId,
    note: noteValue,
    tags: liveTags,
  });
  if (plan.pending.length === 0 || !plan.mergedTags) {
    // Stale chip click - no work to do. Repaint defensively + toast
    // a gentle message so the user doesn't think the click missed.
    paintNotePromoteStripChip(noteValue, liveTags);
    toast(formatPromoteAndStripToast(plan));
    return;
  }
  // Step 1: promote — same updateTags path the standalone promote
  // chip uses.
  await updateTags(detailId, plan.mergedTags);
  detailTags.value = plan.mergedTags.join(", ");
  renderDetailTagChips();
  // Step 2: strip — same setClipNote path the standalone strip
  // chip uses. Refresh the textarea optimistically.
  const newNoteValue = plan.newNote ?? "";
  detailNote.value = newNoteValue;
  updateNoteCount(newNoteValue);
  detailNoteClear.hidden = newNoteValue.trim().length === 0;
  // Refresh all three chips against the cleaned state. Promote
  // hides (no pending), strip hides (no tokens), combo hides
  // (subset of promote's gate).
  paintNotePromoteChip(newNoteValue, plan.mergedTags);
  paintNoteStripChip(newNoteValue);
  paintNotePromoteStripChip(newNoteValue, plan.mergedTags);
  // Persist the note write via the same path the auto-save uses —
  // saveDetailNote sanitises + writes + appends the audit entry +
  // refreshes noteUpdatedAt.
  await saveDetailNote();
  toast(formatPromoteAndStripToast(plan));
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
  if (updated) {
    renderExpiryRow(updated);
    renderTtlBanner(updated);
  }
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

// TTL banner action buttons — "Keep" pins the clip (pin > TTL, so it
// stops the countdown without losing the deadline) and "Clear TTL"
// removes the expiresAt entirely. Both routes mirror the existing
// audit-log + render plumbing so the banner doesn't bypass any
// safety/privacy receipts.
detailTtlPin.addEventListener("click", async () => {
  if (!detailId) return;
  const id = detailId;
  const before = await getClip(id);
  if (!before) return;
  if (before.pinned) {
    // Defensive — the banner only shows for unpinned clips, but a
    // race could land us here. No-op + refresh.
    renderTtlBanner(before);
    return;
  }
  await togglePin(id);
  const after = await getClip(id);
  if (after) {
    renderTtlBanner(after);
    renderExpiryRow(after);
    detailPin.innerHTML = after.pinned ? icons.pinFilled() : icons.pin();
  }
  toast("Pinned · TTL paused");
  await render();
});

detailTtlClear.addEventListener("click", async () => {
  if (!detailId) return;
  const id = detailId;
  const before = await getClip(id);
  if (!before || typeof before.expiresAt !== "number") return;
  await new Promise<void>((resolve) => {
    api.runtime.sendMessage(
      { type: "cc-rpc", action: "setClipExpiry", payload: { id, expiresAt: null } },
      () => resolve(),
    );
  });
  const after = await getClip(id);
  if (after) {
    renderTtlBanner(after);
    renderExpiryRow(after);
  }
  void appendPrivacyAuditEntry({
    kind: "clear-ttl",
    clipId: id,
    host: hostFrom(before.source.url) || undefined,
  });
  toast("TTL cleared");
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

/**
 * Toggle the "ask before deleting" lock on the open clip. Returns
 * the new bit so we can paint the toggle + toast a meaningful
 * confirmation. No audit-log entry on lock/unlock — locking is a
 * UX concern, not a privacy action; bloating the audit ring with
 * every lock toggle would dilute the genuine entries.
 */
async function toggleDetailLock(): Promise<void> {
  if (!detailId) return;
  const id = detailId;
  const next = await toggleLock(id);
  if (next == null) {
    toast("Clip not found", "error");
    return;
  }
  // Repaint just the lock button + breadcrumb (cheap) instead of the
  // whole detail panel — the user's cursor + scroll position stay
  // intact. renderLockedRow handles both directions: shows the new
  // "Locked since just now" on lock, hides the row on unlock.
  const c = await getClip(id);
  if (c) {
    renderLockButton(c);
    renderLockedRow(c);
  }
  await render();
  toast(
    next
      ? "Locked — delete will confirm"
      : "Unlocked",
  );
}

detailLock.addEventListener("click", () => void toggleDetailLock());

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

/**
 * Keyboard nav inside the floating send-to menu. The dropdown lives
 * as a flat list of .send-row buttons — natural Tab order already
 * works (since they ARE buttons), but a power user expects ↑↓ to
 * step between rows without falling out of the menu, Home/End to
 * jump to the first/last row, type-ahead to focus the first row
 * starting with the typed letter, and Esc to close + restore focus
 * to the trigger button. Tab/Shift+Tab wrap inside the menu so the
 * focus ring never escapes silently (the menu is modal-ish while
 * open; clicking outside closes it, and we want the same containment
 * for the keyboard path).
 *
 * Enter on a focused row is handled natively by the browser (it's a
 * <button>), so we don't intercept it here.
 */
function onSendMenuKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    e.preventDefault();
    closeSendMenu();
    detailSend.focus();
    return;
  }
  const rows = Array.from(
    detailSendMenu.querySelectorAll<HTMLButtonElement>(".send-row"),
  );
  if (rows.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const idx = active ? rows.indexOf(active as HTMLButtonElement) : -1;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    // Wrap to top from the last row. If nothing focused yet (or focus
    // is somewhere outside the menu), land on the first row — that's
    // the muscle-memory expectation after pressing ↓ inside a menu.
    const next = idx < 0 || idx === rows.length - 1 ? 0 : idx + 1;
    rows[next].focus();
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    const prev = idx <= 0 ? rows.length - 1 : idx - 1;
    rows[prev].focus();
    return;
  }
  if (e.key === "Home") {
    e.preventDefault();
    e.stopPropagation();
    rows[0].focus();
    return;
  }
  if (e.key === "End") {
    e.preventDefault();
    e.stopPropagation();
    rows[rows.length - 1].focus();
    return;
  }
  if (e.key === "Tab") {
    // Trap focus inside the menu so Tab can't strand the user on the
    // page chrome behind a still-open dropdown. Shift+Tab wraps the
    // other way.
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      const prev = idx <= 0 ? rows.length - 1 : idx - 1;
      rows[prev].focus();
    } else {
      const next = idx < 0 || idx === rows.length - 1 ? 0 : idx + 1;
      rows[next].focus();
    }
    return;
  }
  // Type-ahead: single printable letter jumps focus to the first row
  // whose label starts with that letter (case-insensitive). Skips when
  // a modifier is held so we don't fight Cmd+F / Ctrl+R etc.
  if (
    e.key.length === 1 &&
    !e.altKey && !e.ctrlKey && !e.metaKey &&
    /^[a-zA-Z]$/.test(e.key)
  ) {
    const letter = e.key.toLowerCase();
    // Start the scan AFTER the currently-focused row so repeated
    // presses cycle through multiple rows starting with the same
    // letter (e.g. two "C"opy actions).
    const start = idx >= 0 ? (idx + 1) % rows.length : 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[(start + i) % rows.length];
      const label = (r.querySelector(".send-row-label")?.textContent || "")
        .trim()
        .toLowerCase();
      if (label.startsWith(letter)) {
        e.preventDefault();
        e.stopPropagation();
        r.focus();
        return;
      }
    }
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
    // Pass the per-clip note so the "Copy note as Markdown" row
    // gates correctly. Pure pipeline: hasClipNote → blockquote
    // formatter; the row stays hidden when note is undefined /
    // empty / whitespace-only.
    note: c.note,
    full: c,
  });
  // Promote the user's most-recently-picked action to the top so
  // muscle memory pays off. Pure reorder — every other row stays in
  // its natural position. Skipped silently when no last-pick is
  // remembered yet, when the saved id isn't in this clip's action
  // set, or when the saved action would be unavailable here (we
  // never bump a disabled row).
  const lastId = await getSendToLast();
  const ordered = reorderSendActionsByLast(actions, lastId);
  const available = ordered.filter((a) => a.available);
  if (available.length === 0) {
    toast("Nothing to send for this clip");
    return;
  }
  detailSendMenu.innerHTML = available
    .map((a) => {
      const hint = a.hint ? `<span class="send-row-hint">${escapeHtml(a.hint)}</span>` : "";
      const verb = a.kind === "copy" ? "copy" : a.kind === "incognito" ? "incognito" : "open";
      // Tag the row that was promoted by the last-used reorder so
      // the user gets a quiet "this is your most-recent pick" cue
      // (subtle accent dot — the row is at the top anyway, this
      // just explains why).
      const recent = lastId && a.id === lastId ? " send-row-recent" : "";
      const recentTitle = recent ? ` title="Most-recent send-to action"` : "";
      return (
        `<button type="button" class="send-row${recent}" role="menuitem" data-id="${escapeHtml(a.id)}" data-verb="${verb}"${recentTitle}>` +
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
    // Focus the first row so ↑↓/Enter work without an extra Tab.
    // Without this, focus stays on the trigger button and the first
    // ↓ has to move out of the button into the menu — a subtle but
    // jarring extra keystroke.
    const first = detailSendMenu.querySelector<HTMLButtonElement>(".send-row");
    first?.focus();
  }, 0);
}

detailSend.addEventListener("click", () => void openSendMenu());

/**
 * Detail-view "Show audit history" jumper. Mirror of alt-click from
 * an audit row (which scopes the panel TO that row's clip), but
 * starting from the detail side — useful when the user has the clip
 * open and wants to ask "what has happened to this exact snippet?"
 * without scrolling the global audit ring looking for the matching
 * clipId.
 *
 * Sequence: close any open send-menu (so the new audit scroll lands
 * cleanly), close the detail view (settings panel slides over it
 * either way), open settings, set the clip scope, render. The scope
 * defaults to bucket=all so a clip with only one kind of action
 * doesn't strand the panel empty.
 *
 * If the audit ring has zero rows for this clip the scope still
 * pivots (so the user sees "0 of N · clip: ..." instead of being
 * left on the global ring wondering whether the click worked); the
 * panel's auto-scope-away logic then triggers on the next scope
 * mutation. Honest empty-state beats silent no-op.
 */
async function showAuditForDetailClip(): Promise<void> {
  if (!detailId) return;
  const clipId = detailId;
  if (!detailSendMenu.hidden) closeSendMenu();
  closeDetail();
  await openSettings();
  // openSettings() resets auditClipScope to null on every open — we
  // must set the scope AFTER that boot completes, not before.
  await setAuditClipScope(clipId);
}

detailHistory.addEventListener("click", () => void showAuditForDetailClip());

/**
 * Refresh the "Show audit history" button's tooltip with the live
 * audit-row count for the currently open clip. Cheap (one IDB read
 * of the small ring) so we run it on every detail open. Race-safe:
 * a stale callback simply writes the same text — the worst case is
 * a tooltip that says "no actions yet" after a fresh forget-row,
 * resolved on the next openDetail.
 */
async function refreshDetailHistoryTitle(clipId: string): Promise<void> {
  try {
    const entries = await listPrivacyAudit();
    if (detailId !== clipId) return; // user navigated away mid-flight
    const pre = precheckAuditJump(clipId, entries);
    const hint = describeAuditJump(pre);
    detailHistory.title = hint || "Show this clip's audit history";
  } catch (e) {
    console.warn("[context-clipboard] detail-history title refresh failed", e);
  }
}

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
    // Same note pass-through as the menu-open buildSendActions
    // call — keeps the "note-md" row's gate consistent between
    // render-time and dispatch-time.
    note: c.note,
    full: c,
  });
  const action: SendAction | undefined = actions.find((a) => a.id === id);
  closeSendMenu();
  if (!action || !action.payload || !action.available) {
    toast("Action unavailable", "error");
    return;
  }
  // Persist the chosen action so the next Send-to menu (this clip
  // or another) opens with this row at the top. Fire-and-forget —
  // a failed write is harmless (worst case, the menu just doesn't
  // remember). We stamp it BEFORE the actual action so even a
  // misbehaving incognito/nav call doesn't drop the muscle-memory bit.
  void setSendToLast(action.id);
  if (action.kind === "incognito") {
    // chrome.windows.create with incognito:true. Two failure modes
    // worth handling out loud:
    //  1) The extension isn't enabled for incognito — windows.create
    //     throws and the user has no idea why nothing happened.
    //  2) The browser doesn't support a separate private window from
    //     an extension call (Firefox-on-Android, certain enterprise
    //     policies) — same throw.
    // Fall back to a normal new tab + toast so the user knows
    // private mode wasn't honored and can decide what to do.
    try {
      if (api.windows?.create) {
        await api.windows.create({ url: action.payload, incognito: true });
        return;
      }
      // No windows API at all (very rare) — fall through to nav path.
    } catch (err) {
      console.error(err);
      try {
        if (api.tabs?.create) await api.tabs.create({ url: action.payload });
        else window.open(action.payload, "_blank");
        toast("Opened in a normal tab — private mode unavailable", "error");
      } catch {
        toast("Couldn't open URL", "error");
      }
      return;
    }
    // Reached here when api.windows.create was absent. Try tabs.
    try {
      if (api.tabs?.create) await api.tabs.create({ url: action.payload });
      else window.open(action.payload, "_blank");
      toast("Opened in a normal tab — private mode unavailable", "error");
    } catch {
      toast("Couldn't open URL", "error");
    }
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
  if (action.kind === "bg-tab") {
    // Background tab: chrome.tabs.create with active:false so the new
    // tab loads without stealing focus. Lets the user triage a list of
    // link clips in a row (similar-clips panel, citations) without
    // bouncing back to the popup each time. Fallback is window.open
    // with no opts — that DOES steal focus, but the better-than-nothing
    // story matters more than the perfect focus behaviour on the rare
    // Firefox/no-tabs-API path.
    try {
      if (api.tabs?.create) {
        await api.tabs.create({ url: action.payload, active: false });
      } else {
        // window.open can't reliably open in background; do our best
        // and let the user know.
        window.open(action.payload, "_blank");
        toast("Opened in a normal tab — background tab unavailable", "error");
      }
    } catch (err) {
      console.error(err);
      try {
        window.open(action.payload, "_blank");
        toast("Opened in a normal tab — background tab unavailable", "error");
      } catch {
        toast("Couldn't open URL", "error");
      }
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

sDensity.addEventListener("change", () => {
  // Same live-preview pattern as blur — apply the picked density's body
  // class so the radio telegraphs the result immediately. The actual
  // setting persists on Save / Esc / back via saveSettingsFromForm.
  const v = sDensity.value;
  const d: Density =
    v === "comfortable" || v === "cozy" || v === "compact"
      ? (v as Density)
      : "comfortable";
  applyCompactRows(d);
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
      (resp: { ok: boolean; imported?: number; skippedId?: number; skippedHash?: number; auditMerged?: number; historyMerged?: number; error?: string }) => {
        if (resp?.ok) {
          const imp = resp.imported || 0;
          const skipId = resp.skippedId || 0;
          const skipHash = resp.skippedHash || 0;
          const auditMerged = resp.auditMerged || 0;
          const historyMerged = resp.historyMerged || 0;
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
          if (historyMerged > 0) {
            parts.push(`+ ${historyMerged} search${historyMerged === 1 ? "" : "es"}`);
          }
          toast(parts.join(" "));
          // Audit log changed under us if we imported any entries —
          // re-render the section so the Settings panel reflects the
          // merged ring without a manual refresh.
          if (auditMerged > 0) void renderAudit();
          // Search history changed — refresh in-memory + repaint the
          // "Recent" chip strip so restored history shows immediately.
          if (historyMerged > 0) {
            void refreshSearchHistory().then(() => renderSearchHistory());
          }
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
    bulkStorageDelta.hidden = true;
    bulkStorageDelta.textContent = "";
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
  // Storage delta — sum bytes for the selected clips we can see in
  // the current filter window. Selection can outlive the visible
  // filter (selecting under one filter then changing it doesn't
  // forget the earlier work), so we honestly distinguish "visible"
  // vs total. The label only includes what we can count concretely.
  const visibleSelected = currentClips.filter((c) => selectedIds.has(c.id));
  // Bulk-copy button title: reflect how many of the VISIBLE selected
  // clips carry copyable text (images skipped). Uses the visible
  // slice because that's what we can inspect synchronously here; the
  // click handler does its own authoritative read over the FULL
  // selection at fire time, so the toast count stays truthful even
  // when the selection extends past the filter window.
  bulkCopy.title = formatBulkCopyButtonTitle(planBulkCopy(visibleSelected));
  // Bulk-copy-as-Markdown title — same visible-slice contract as the
  // plain copy button; the click handler reads the full selection at
  // fire time so the toast count stays truthful past the filter window.
  bulkCopyMd.title = formatBulkMarkdownButtonTitle(planBulkMarkdown(visibleSelected));
  // Lock button title — adapts to the selection's current lock-state
  // distribution so a hover reveals what the click will do BEFORE
  // the user commits to it. Counts run over the FULL selection
  // (visible-or-not) because the lock action targets every selected
  // id, not just the visible ones — same contract as bulkPin/bulkDel.
  const selectedClipsForLock = currentClips.filter((c) => selectedIds.has(c.id));
  // When selection extends beyond the visible filter we can't know
  // the lock state of the off-screen rows without a re-read; the
  // title uses what we can see and the click handler does its own
  // authoritative read at fire time, so the button never lies about
  // what it will DO (only about the projected count, when ambiguous).
  const lockIntent = decideBulkLockIntent(selectedClipsForLock);
  const lockWrites = lockIntent
    ? countBulkLockWrites(selectedClipsForLock, lockIntent)
    : 0;
  bulkLock.title = formatBulkLockButtonTitle({
    intent: lockIntent,
    total: selectedClipsForLock.length,
    writes: lockWrites,
  });
  // Flip the icon when intent is unlock (mirror pin/pinFilled
  // convention — closed padlock = ready to lock, open padlock =
  // ready to unlock). Pure innerHTML swap; icons render via SVG
  // string so there's no race with the icon-init pass.
  bulkLock.innerHTML = lockIntent === "unlock" ? icons.lockOpen() : icons.lock();
  bulkLock.classList.toggle("active", lockIntent === "unlock");
  // Lock+pin combo button: visible only when at least one selected
  // clip needs at least one of the bits flipped (planBulkLockPin
  // → pinWrites>0 OR lockWrites>0). When every selected clip is
  // ALREADY both, the action would no-op so we hide the button
  // rather than show a dead chord. Title adapts to the live
  // projection so a hover shows the upcoming write count BEFORE
  // commit.
  const lockPinActionable = isBulkLockPinActionable(selectedClipsForLock);
  bulkLockPin.hidden = !lockPinActionable;
  if (lockPinActionable) {
    bulkLockPin.title = formatBulkLockPinButtonTitle(selectedClipsForLock);
  }
  // Bulk-note button title: adapts to the selection's note-state mix
  // so the hover reveals what the click will do BEFORE the user
  // commits — same pattern as the lock-pin combo. The handler
  // itself prompts for the note text and shows the post-action
  // toast; this label is selection-shape only.
  bulkNote.title = formatBulkNoteButtonTitle(selectedClipsForLock);
  // Tag-from-notes button: hidden when no clip in the selection has
  // ANY extractable hashtags (no point in offering an action that
  // would no-op). Title adapts to the live projection so a hover
  // shows the upcoming write shape ("Add #x to 4 clips" / "Add 6
  // tags across 3 clips" / "All already tagged"). Same scan
  // (planTagFromNotes) drives both gate + tooltip so they can't
  // disagree.
  const tagFromNotesActionable = isTagFromNotesActionable(selectedClipsForLock);
  bulkTagFromNotes.hidden = !tagFromNotesActionable;
  if (tagFromNotesActionable) {
    bulkTagFromNotes.title = formatTagFromNotesButtonTitle(selectedClipsForLock);
  }
  // Tag-from-notes-AND-clear combo button: same visibility gate as
  // the standalone Tag-from-notes (both need at least one new
  // hashtag to promote). When visible, the title surfaces the
  // additional destructive bit ("then clear N notes") so the user
  // sees the cost up front - the COMBO is more aggressive than the
  // standalone, and hover-preview matters more here than with the
  // additive-only standalone.
  const tagFromNotesClearActionable = isTagFromNotesAndClearActionable(
    selectedClipsForLock,
  );
  bulkTagFromNotesClear.hidden = !tagFromNotesClearActionable;
  if (tagFromNotesClearActionable) {
    bulkTagFromNotesClear.title = formatTagFromNotesAndClearButtonTitle(
      selectedClipsForLock,
    );
  }
  // Bulk Strip-hashtags button: hidden when NO selected clip has
  // any `#hashtag` token in its note. Different gate from
  // Tag-from-notes (which needs at least one NEW hashtag to
  // promote) — strip cares about presence, not promotion delta.
  // So a selection where every hashtag is already promoted shows
  // the strip button but hides Tag-from-notes: precisely the
  // cleanup-after-promotion workflow.
  const stripHashtagsActionable =
    isBulkStripHashtagsActionable(selectedClipsForLock);
  bulkStripHashtags.hidden = !stripHashtagsActionable;
  if (stripHashtagsActionable) {
    bulkStripHashtags.title =
      formatBulkStripHashtagsButtonTitle(selectedClipsForLock);
  }
  const label = buildStorageDeltaLabel(visibleSelected);
  if (!label) {
    bulkStorageDelta.hidden = true;
    bulkStorageDelta.textContent = "";
  } else {
    bulkStorageDelta.hidden = false;
    // When selection spans beyond the current filter, append a
    // small "of N visible" so the user knows the number isn't the
    // whole story. Otherwise the bare "Free 4.2 MB" reads tight.
    const offFilter = selectedIds.size - visibleSelected.length;
    bulkStorageDelta.textContent =
      offFilter > 0
        ? `${label} · ${visibleSelected.length} of ${selectedIds.size} shown`
        : label;
  }
}

function toggleSelected(id: string): void {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkBar();
}

function clearSelection(): void {
  if (selectedIds.size === 0) return;
  selectedIds.clear();
  selectionAnchor = null;
  updateBulkBar();
  void render();
}

/**
 * Keyboard range-extend: the Shift+↑/↓ companion to Shift+Click range
 * selection. Moves the active cursor one row in `direction` and grows
 * the selection to cover the span between the range anchor and the new
 * cursor row.
 *
 * Contract mirrors the additive Shift+Click gesture (lib/range-select):
 *   - The FIRST Shift+Arrow seeds the anchor at the current cursor and
 *     selects that origin row, so the range always has a real start.
 *   - Each step ADDS the anchor->cursor span to the selection; it never
 *     deselects on reversal. Extend-only keeps keyboard parity with the
 *     mouse gesture (the popup's Shift+Click is additive too) — a clean,
 *     non-surprising "grab this run" instead of Gmail's reverse-shrink.
 *   - The anchor stays put across steps so a long press-and-hold of
 *     Shift+Down keeps extending from the same origin.
 *
 * A no-op at the list edges (cursor already at row 0 / last row) leaves
 * the selection untouched — there's no new row to fold in.
 */
async function moveActiveWithRange(direction: -1 | 1): Promise<void> {
  if (currentClips.length === 0) return;
  // Seed the anchor on the first Shift+Arrow of a run, and pull the
  // origin row into the selection so the span has a concrete start.
  if (selectionAnchor == null || !Number.isFinite(selectionAnchor)) {
    selectionAnchor = activeIndex;
    const origin = currentClips[activeIndex];
    if (origin) selectedIds.add(origin.id);
  }
  const next =
    direction === 1
      ? Math.min(currentClips.length - 1, activeIndex + 1)
      : Math.max(0, activeIndex - 1);
  // Edge: nothing moved (already at top/bottom). Still ensure the
  // origin row we just seeded is reflected before bailing.
  if (next === activeIndex) {
    updateBulkBar();
    await render();
    return;
  }
  activeIndex = next;
  const range = computeRange(selectionAnchor, activeIndex, currentClips.length);
  if (range) {
    const rangeIds = idsForRange(currentClips, range.indices);
    const toAdd = rangeIdsToAdd(rangeIds, selectedIds);
    for (const rid of toAdd) selectedIds.add(rid);
  }
  updateBulkBar();
  await render();
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
  // We defer clearing the selection until after the lock-guard
  // resolves. If the user bails on the locked-confirm dialog,
  // their selection survives so they can try again or unlock first.
  // We can't easily distinguish "confirm bailed" from "ids vanished"
  // here, but the trashWithLockGuard internals already short-circuit
  // either path back to the caller without touching the store. So:
  // re-snapshot after the await and clear only the ids that actually
  // left the live store — survivors stay selected.
  await trashWithLockGuard(ids);
  // Drop any of our originally-selected ids that are no longer in
  // the live list (= they were trashed). Survivors (= confirm bailed)
  // stay selected so the user's batch is preserved.
  const liveIds = new Set(currentClips.map((c) => c.id));
  for (const id of ids) {
    if (!liveIds.has(id)) selectedIds.delete(id);
  }
  updateBulkBar();
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

// Bulk lock / unlock — mirror bulkPin's "if-all-then-undo" UX. The
// authoritative read happens here (not the cached title) so the
// action stays truthful even when selection extends past the visible
// filter. Two-phase:
//   1. Read every selected clip, decide intent + writes.
//   2. setLocked(id, want) for each entry that needs a flip;
//      already-in-target-state entries are no-ops (db.setLocked
//      short-circuits).
//
// Intentional: no per-id confirm even for the LOCK direction. Lock
// is a soft gate ("ask before deleting"), not a destructive action
// — bulk-applying it is the user's clear intent and there's nothing
// to undo other than re-running the same action.
bulkLock.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  // Fresh read — the click can fire long after the last render, and
  // the user might have toggled locks individually since.
  const items = await Promise.all(ids.map((id) => getClip(id)));
  const present = items.filter((c): c is NonNullable<typeof c> => !!c);
  if (present.length === 0) {
    toast("Selection vanished", "error");
    return;
  }
  const intent = decideBulkLockIntent(present);
  if (!intent) return;
  const want = intent === "lock";
  const writes = countBulkLockWrites(present, intent);
  // Sequential — mirrors togglePin / setLocked single-tx contract.
  // Skipping no-ops keeps the IDB write count honest.
  for (const c of present) {
    if (!!c.locked === want) continue;
    await setLocked(c.id, want);
  }
  toast(formatBulkLockToast({ intent, total: present.length, writes }));
  await render();
});

// Lock + pin combo — additive only (never UN-locks or UN-pins).
// Authoritative read of the selection so the action stays truthful
// even when selection extends past the visible filter. setPinned +
// setLocked both have no-op fast paths for clips already in the
// requested state, so an "already both" clip costs zero IDB writes.
// Strict gate on `c.locked === true` (matches the lock stack) and
// loose truthy for `c.pinned` (pinned is required boolean — no
// stray truthy non-booleans in the wild).
bulkLockPin.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  const items = await Promise.all(ids.map((id) => getClip(id)));
  const present = items.filter((c): c is NonNullable<typeof c> => !!c);
  if (present.length === 0) {
    toast("Selection vanished", "error");
    return;
  }
  const plan = planBulkLockPin(present);
  // No-op selection: every selected clip already has both bits. We
  // don't surface this as an error — the user clicked, they get a
  // truthful "Already locked+pinned" message. The button SHOULD have
  // been hidden by updateBulkBar in this state; this branch is a
  // safety net for fire-after-render-stale.
  if (plan.pinWrites === 0 && plan.lockWrites === 0) {
    toast(formatBulkLockPinToast(plan));
    return;
  }
  // Apply pin first then lock — order doesn't matter functionally
  // (both bits are independent) but pin-first reads as the simpler
  // intent ("get them up top, then mark irreplaceable").
  for (const c of present) {
    if (!c.pinned) await setPinned(c.id, true);
  }
  for (const c of present) {
    if (c.locked !== true) await setLocked(c.id, true);
  }
  toast(formatBulkLockPinToast(plan));
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

// Bulk-bar "Add note to selection" — overwrite semantics, not merge.
// Notes are prose so a merge would create unreadable franken-text;
// the planner counts how many EXISTING notes will be replaced so
// the consequences are visible in the toast.
//
// Empty input clears existing notes on the selection (mirrors
// detail-view's "save empty → clear" contract). When replacing 2+
// notes, the prompt warning + the post-action toast both surface
// the replaced count so a thumb-fumble doesn't silently nuke
// hand-written caveats.
//
// Same sanitisation pipeline as the single-clip path (sanitizeClipNote
// from lib/clip-note) — single source of truth means the bulk path
// and the editor produce identical stored values for the same input.
bulkNote.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  // Pull fresh records so the plan reflects current state (a
  // selection can sit across multiple renders; notes may have
  // changed via detail-view in between).
  const items = await Promise.all(ids.map((id) => getClip(id)));
  const present = items.filter((c): c is NonNullable<typeof c> => !!c);
  if (present.length === 0) {
    toast("Selection vanished", "error");
    return;
  }
  // Pre-prompt warning when the action would replace any existing
  // notes. We can compute "how many already have notes" without the
  // raw input — that count is the WORST-CASE replace number (any
  // text the user types lands on those clips). If they leave the
  // input empty, the same count becomes the cleared count.
  const alreadyNoted = present.filter((c) => hasClipNote(c)).length;
  const promptLabel =
    alreadyNoted > 0
      ? `Note for ${present.length} clip${present.length === 1 ? "" : "s"} (will REPLACE ${alreadyNoted} existing note${alreadyNoted === 1 ? "" : "s"} — empty to clear):`
      : `Note for ${present.length} clip${present.length === 1 ? "" : "s"} (empty to skip):`;
  const raw = prompt(promptLabel);
  // Cancel = null; we DO honour explicit empty (= clear notes on
  // selection that have them). Distinguish by null-check.
  if (raw === null) return;
  const plan = planBulkNote(present, raw);
  if (plan.total === 0 || plan.created + plan.replaced + plan.cleared === 0) {
    toast(formatBulkNoteToast(plan));
    return;
  }
  // Apply via the existing single-clip setClipNote so the
  // noteUpdatedAt stamp + IDB shape stay consistent. Sequential —
  // matches the bulk-tag / bulk-lock patterns; modest cost at
  // typical selection sizes (~5-50 clips).
  for (const c of present) {
    const currentSan = sanitizeClipNote(c.note);
    if (currentSan === plan.finalValue) continue; // no-op skip
    await setClipNote(c.id, plan.finalValue);
  }
  toast(formatBulkNoteToast(plan));
  await render();
});

// Bulk-bar "Tag from notes" - scan each selected clip's note for
// #hashtag tokens (e.g. "be careful — #staging #deprecated") and
// merge them into the clip's structured tag list. Lets the user
// promote inline note-style tagging into the structured tag schema
// that powers `tag:` search + the top-host pills + bulk-tag column.
//
// No prompt: the source of the new tags is the note text itself,
// not user input. The pre-action button title (live-projected via
// formatTagFromNotesButtonTitle) shows what's about to happen; the
// post-action toast confirms what actually shipped. Hidden entirely
// when no clip in the selection has any extractable hashtags (the
// gate in updateBulkBar handles visibility).
//
// Merge semantics: union with existing tags, case-insensitive
// matching, first-appearance-in-note order preserved for newly-
// added tags. Identical to the bulk-tag chain (db.updateTags
// dedups + trims) so no surprises.
bulkTagFromNotes.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  // Pull fresh records so the plan reflects current state (a
  // selection can sit across multiple renders; notes may have
  // changed in between).
  const items = await Promise.all(ids.map((id) => getClip(id)));
  const present = items.filter((c): c is NonNullable<typeof c> => !!c);
  if (present.length === 0) {
    toast("Selection vanished", "error");
    return;
  }
  const plan = planTagFromNotes(present);
  if (plan.changed === 0) {
    // Honest toast with the right shape (selection-has-no-notes vs
    // no-hashtags-found vs already-tagged) - the formatter handles
    // the disambiguation.
    toast(formatTagFromNotesToast(plan));
    return;
  }
  // Apply via db.updateTags so the existing trim+dedup contract +
  // any future tag-side-effects (e.g. tag-count cache invalidation)
  // run uniformly. mergedTagsForClip returns undefined for unchanged
  // clips so we skip those without an IDB write.
  for (const c of present) {
    const merged = mergedTagsForClip(c);
    if (!merged) continue;
    await updateTags(c.id, merged);
  }
  toast(formatTagFromNotesToast(plan));
  await render();
});

// Bulk-bar "Tag from notes + clear notes" combo - additive PLUS
// destructive in one click. Promotes #hashtag tokens into structured
// tags (same merge contract as standalone Tag-from-notes) AND wipes
// the source note text on every clip where promotion happened. The
// standalone Tag-from-notes button still exists for the keep-the-
// prose workflow; this combo is for users whose notes are
// hashtag-only ("#staging #wip" with no other context) where the
// note becomes redundant once the tags are structured.
//
// Pre-prompt confirm: we surface the count of notes that'll be
// cleared so the user can back out before commit. The standalone
// Tag-from-notes button has no confirm because it's additive-only -
// nothing to undo. This combo crosses into destructive territory,
// so the confirm gate exists even though Undo isn't on the
// roadmap.
bulkTagFromNotesClear.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  const items = await Promise.all(ids.map((id) => getClip(id)));
  const present = items.filter((c): c is NonNullable<typeof c> => !!c);
  if (present.length === 0) {
    toast("Selection vanished", "error");
    return;
  }
  const plan = planTagFromNotesAndClear(present);
  if (plan.promoteAndClear === 0) {
    // Same shape as standalone tag-from-notes when nothing to do -
    // honest toast, no destructive side-effects.
    toast(formatTagFromNotesAndClearToast(plan));
    return;
  }
  // Destructive confirm - the user is about to LOSE note text. The
  // promote half is additive (no loss), but the clear half wipes
  // prose context. Pre-confirm so a misclick on the combo button
  // (vs the standalone tag-from-notes one row over) doesn't
  // surprise-wipe notes.
  const noteNoun = plan.cleared === 1 ? "note" : "notes";
  const clipNoun = plan.promoteAndClear === 1 ? "clip" : "clips";
  const confirmMsg =
    plan.distinctNewTags.length === 1
      ? `Add #${plan.distinctNewTags[0]} to ${plan.promoteAndClear} ${clipNoun} AND clear ${plan.cleared} ${noteNoun}?`
      : `Add ${plan.totalAdded} tags across ${plan.promoteAndClear} ${clipNoun} AND clear ${plan.cleared} ${noteNoun}?`;
  if (!confirm(confirmMsg)) return;
  // Apply per-clip: tag merge first, then note clear. Order
  // doesn't matter functionally (independent writes) but
  // tag-first reads as the simpler intent ("promote, then clean
  // up the source").
  for (const c of present) {
    const action = perClipActionForCombo(c);
    if (!action || !action.mergedTags) continue;
    await updateTags(c.id, action.mergedTags);
    if (action.clearNote) {
      // setClipNote(undefined) → empty contract clears the field
      // entirely from IDB (same as detail-view Clear button).
      await setClipNote(c.id, undefined);
    }
  }
  toast(formatTagFromNotesAndClearToast(plan));
  await render();
});

// Bulk Strip-hashtags click. Removes inline `#tag` tokens from notes
// across the selection while preserving prose. Independent of
// structured tag list (no promotion, no tag merge). Mirrors the
// per-clip detail-view strip chip's behaviour but in batch shape.
//
// No confirm dialog: strip is destructive of INLINE tokens only,
// but the prose preservation contract means a misclick doesn't
// lose meaningful annotation. (Compare Tag-from-notes-clear combo
// which DOES need the confirm — it wipes the whole note text.)
// Edge case: notes that contain ONLY hashtags become empty after
// strip, deleting the note field. Toast surfaces this honestly
// via the "(N notes emptied)" tail so the user sees the
// destructive bit AFTER the action lands.
bulkStripHashtags.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  const items = await Promise.all(ids.map((id) => getClip(id)));
  const present = items.filter((c): c is NonNullable<typeof c> => !!c);
  if (present.length === 0) {
    toast("Selection vanished", "error");
    return;
  }
  const plan = planBulkStripHashtags(present);
  if (plan.modified === 0) {
    // Nothing to strip — honest toast, no IDB writes.
    toast(formatBulkStripHashtagsToast(plan));
    return;
  }
  // Apply per-clip via setClipNote. Each write is independent;
  // an error on one shouldn't block the rest. The strip helper is
  // deterministic so re-running over the same input produces the
  // same output (idempotent).
  for (const c of present) {
    const action = perClipActionForStrip(c);
    if (!action) continue;
    await setClipNote(c.id, action.newNote);
  }
  toast(formatBulkStripHashtagsToast(plan));
  await render();
});

// Bulk copy — join the selected clips' text bodies and write them to
// the system clipboard in one shot. The basic batch op the selection
// model was missing (pin/lock/tag/note/export existed; "copy all of
// these" didn't). Skips image clips (no pasteable text body) and
// copies template clips RAW (un-expanded) — see lib/bulk-clipboard
// for the rationale. Honours every id in selectedIds, in visible
// list order so the paste reads top-to-bottom.
bulkCopy.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  // Order the fetch by visible list position when possible so the
  // joined paste matches what the user sees; ids outside the visible
  // window fall to the end in selection order.
  const orderIndex = new Map<string, number>();
  currentClips.forEach((c, i) => orderIndex.set(c.id, i));
  const orderedIds = [...ids].sort((a, b) => {
    const ia = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER;
    const ib = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
  const items = await Promise.all(orderedIds.map((id) => getClip(id)));
  const plan = planBulkCopy(items);
  if (!plan.hasContent) {
    toast(formatBulkCopyToast(plan), "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(plan.text);
    toast(formatBulkCopyToast(plan));
  } catch (err) {
    console.error("[context-clipboard] bulk copy failed", err);
    toast("Copy failed", "error");
  }
});

// Bulk copy-as-Markdown — render the selected clips into a single
// Markdown document (per-clip grammar mirrors the detail "Copy as
// Markdown": fenced code, image/link syntax, cited blockquotes) and
// write it to the clipboard. The structured sibling of plain bulk-copy
// for users pasting a batch into a doc / PR / wiki. Same full-selection
// read + visible-list ordering as bulk-copy so the document reads
// top-to-bottom. Template clips render RAW (un-expanded) — see
// lib/bulk-markdown for the rationale.
bulkCopyMd.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  const orderIndex = new Map<string, number>();
  currentClips.forEach((c, i) => orderIndex.set(c.id, i));
  const orderedIds = [...ids].sort((a, b) => {
    const ia = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER;
    const ib = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
  const items = await Promise.all(orderedIds.map((id) => getClip(id)));
  const plan = planBulkMarkdown(items);
  if (!plan.hasContent) {
    toast(formatBulkMarkdownToast(plan), "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(plan.text);
    toast(formatBulkMarkdownToast(plan));
  } catch (err) {
    console.error("[context-clipboard] bulk markdown copy failed", err);
    toast("Copy failed", "error");
  }
});

// Bulk export — cherry-pick JSON download. Different from the Settings
// → Export path:
//   - source = selected ids only, not the whole store
//   - format = JSON only (no Markdown/CSV/encryption ceremony for a
//     transient cherry-pick)
//   - shape = importAll-compatible envelope so the recipient can
//     paste it into Settings → Import and get the same clips
//
// Fetches the FULL ClipItem records (not the SendableClip-shaped
// rows from currentClips) so pinned/tags/hitCount/hash/locked all
// round-trip. Selection can extend past the visible filter — we
// honour every id in selectedIds.
bulkExport.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  // Pull live records — selection survives filter changes and stale
  // entries in selectedIds (clips trashed since selection) are
  // silently dropped by bulkExport's defensive filter.
  const items = await Promise.all(ids.map((id) => getClip(id)));
  const present = items.filter((c): c is NonNullable<typeof c> => !!c);
  if (present.length === 0) {
    toast("Selection vanished — nothing to export", "error");
    return;
  }
  // Optional tag filter — empty input falls through to the
  // unfiltered export. Pure helper handles trim/case-fold so
  // "Secrets" matches "secrets" the way the rest of the codebase
  // treats tags. When a tag is supplied but no selected clip
  // carries it, we toast honestly and don't write a file.
  const tagFilter = bulkExportTag.value.trim();
  const filtered = tagFilter
    ? filterClipsByTag(present, tagFilter)
    : present;
  if (tagFilter && filtered.length === 0) {
    toast(
      formatBulkExportTagToast({
        exported: 0,
        selected: present.length,
        tag: tagFilter,
      }),
      "error",
    );
    return;
  }
  // bulkExportJson + bulkExportFilename + formatBulkExportToast all
  // share the same defensive filtering, so the toast count, filename
  // count, and JSON clip count are guaranteed to agree.
  const json = bulkExportJson(filtered, { version: 4 });
  if (!json) {
    toast("Nothing to export", "error");
    return;
  }
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = bulkExportFilename({ count: filtered.length });
    a.click();
    URL.revokeObjectURL(url);
    toast(
      tagFilter
        ? formatBulkExportTagToast({
            exported: filtered.length,
            selected: present.length,
            tag: tagFilter,
          })
        : formatBulkExportToast({ exported: filtered.length, selected: ids.length }),
    );
  } catch (e) {
    console.error(e);
    toast(e instanceof Error ? e.message : "Export failed", "error");
  }
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
  // Resolve density from the new field, migrating from the legacy
  // compactRows boolean for settings saved before this shipped.
  applyCompactRows(resolveDensity(s));
  // Restore the persisted sort mode BEFORE the first render so the list
  // doesn't flash in the wrong order.
  listSort = await getListSort();
  sortModeEl.value = listSort;
  sortModeEl.classList.toggle("changed", listSort !== "recent");
  sortModeEl.title = `Sort: ${sortLabel(listSort)}`;
  // Restore the persisted word-wrap preference so the first detail
  // open inherits it without a flash. Default true (wrap on).
  detailWrapOn = await getDetailWrap();
  await refreshSavedSearches();
  await refreshSearchHistory();
  // Mirror the last-applied saved search id from meta so the Cmd+K
  // "Open my last saved search" command can render its name + skip
  // when stale without an IDB read per palette open.
  lastSavedSearchId = await getLastSavedSearchId();
  // Cache the most-recent forget-host audit entry so the Cmd+K
  // "Show last forgotten host" rescue command can resolve its
  // target without a per-open IDB read.
  await refreshLastForgottenHost();
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

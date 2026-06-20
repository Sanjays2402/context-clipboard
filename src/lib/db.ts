import type { ClipItem, SearchQuery, Settings, SavedSearch, SiteRule, SortMode } from "./types";
import { DEFAULT_SETTINGS, SORT_MODES } from "./types";
import { hostFrom, redactPii, redactSensitivePreview } from "./util";

const DB_NAME = "context-clipboard";
const DB_VERSION = 4;
const STORE = "clips";
const META = "meta";
const FIELDS = "field_map";
const TRASH = "trash";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("lastSeenAt", "lastSeenAt");
        store.createIndex("pinned", "pinned");
        store.createIndex("kind", "kind");
        store.createIndex("hash", "hash", { unique: false });
      } else {
        const tx = req.transaction!;
        const store = tx.objectStore(STORE);
        if (!store.indexNames.contains("hash"))
          store.createIndex("hash", "hash", { unique: false });
        if (!store.indexNames.contains("lastSeenAt"))
          store.createIndex("lastSeenAt", "lastSeenAt");
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(FIELDS)) {
        const fs = db.createObjectStore(FIELDS, { keyPath: "id" });
        fs.createIndex("host", "host");
        fs.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(TRASH)) {
        const t = db.createObjectStore(TRASH, { keyPath: "id" });
        t.createIndex("deletedAt", "deletedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function clipsTx(mode: IDBTransactionMode) {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function metaTx(mode: IDBTransactionMode) {
  return openDB().then((db) => db.transaction(META, mode).objectStore(META));
}

function fieldsTx(mode: IDBTransactionMode) {
  return openDB().then((db) =>
    db.transaction(FIELDS, mode).objectStore(FIELDS),
  );
}

function trashTx(mode: IDBTransactionMode) {
  return openDB().then((db) => db.transaction(TRASH, mode).objectStore(TRASH));
}

export async function putFieldMap(
  entry: import("./types").FieldMapEntry,
): Promise<void> {
  const store = await fieldsTx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getFieldMap(
  host: string,
  fieldKey: string,
): Promise<import("./types").FieldMapEntry | undefined> {
  const store = await fieldsTx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(`${host}::${fieldKey}`);
    req.onsuccess = () =>
      resolve(req.result as import("./types").FieldMapEntry | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function listFieldMapsForHost(
  host: string,
): Promise<import("./types").FieldMapEntry[]> {
  const store = await fieldsTx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.index("host").getAll(host);
    req.onsuccess = () =>
      resolve((req.result as import("./types").FieldMapEntry[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getSettings(): Promise<Settings> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get("settings");
    req.onsuccess = () => {
      const row = req.result as { key: string; value: Settings } | undefined;
      resolve({ ...DEFAULT_SETTINGS, ...(row?.value || {}) });
    };
    req.onerror = () => resolve(DEFAULT_SETTINGS);
  });
}

export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...s };
  const store = await metaTx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put({ key: "settings", value: next });
    req.onsuccess = () => resolve(next);
    req.onerror = () => reject(req.error);
  });
}

export async function putClip(item: ClipItem): Promise<void> {
  const store = await clipsTx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getClip(id: string): Promise<ClipItem | undefined> {
  const store = await clipsTx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as ClipItem | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function findRecentByHash(
  hash: string,
  withinMs: number,
): Promise<ClipItem | undefined> {
  const store = await clipsTx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.index("hash").openCursor(IDBKeyRange.only(hash));
    const cutoff = Date.now() - withinMs;
    let best: ClipItem | undefined;
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(best);
      const v = cur.value as ClipItem;
      if (v.lastSeenAt >= cutoff && (!best || v.lastSeenAt > best.lastSeenAt)) {
        best = v;
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteClip(id: string): Promise<void> {
  const store = await clipsTx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Soft-delete: move a clip into the trash store with a `deletedAt` stamp.
 * Use this for any user-initiated delete so they can `restoreClip` within
 * the retention window. Pinned status is preserved; restored clips are
 * pinned exactly as they were.
 */
export async function trashClip(id: string): Promise<boolean> {
  const item = await getClip(id);
  if (!item) return false;
  const t = await trashTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = t.put({ ...item, deletedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  await deleteClip(id);
  return true;
}

export interface TrashedClip extends ClipItem {
  deletedAt: number;
}

export async function listTrash(): Promise<TrashedClip[]> {
  const store = await trashTx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.index("deletedAt").openCursor(null, "prev");
    const out: TrashedClip[] = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push(cur.value as TrashedClip);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function restoreClip(id: string): Promise<boolean> {
  const t = await trashTx("readwrite");
  const item = await new Promise<TrashedClip | undefined>((resolve, reject) => {
    const req = t.get(id);
    req.onsuccess = () => resolve(req.result as TrashedClip | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!item) return false;
  await new Promise<void>((resolve, reject) => {
    const req = t.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  // Strip deletedAt before putting back into the live clips store. Bump
  // lastSeenAt so it surfaces near the top instead of getting buried.
  const { deletedAt: _drop, ...rest } = item;
  void _drop;
  const restored: ClipItem = { ...rest, lastSeenAt: Date.now() };
  await putClip(restored);
  return true;
}

export async function emptyTrash(): Promise<number> {
  const all = await listTrash();
  const t = await trashTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = t.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return all.length;
}

export async function trashCount(): Promise<number> {
  const store = await trashTx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Hard-purge trash entries older than `maxAgeMs`. Called opportunistically
 * (e.g. from the background ingest path so it doesn't need its own alarm).
 */
export async function purgeOldTrash(maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const all = await listTrash();
  let n = 0;
  const t = await trashTx("readwrite");
  for (const item of all) {
    if (item.deletedAt < cutoff) {
      await new Promise<void>((resolve, reject) => {
        const req = t.delete(item.id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      n++;
    }
  }
  return n;
}

/**
 * Set or clear a clip's TTL. `expiresAt` is a Unix-ms deadline; pass
 * `null` to remove an existing TTL. Pinned clips are allowed to carry
 * a TTL but the GC will skip them (pin always wins over TTL).
 */
export async function setClipExpiry(
  id: string,
  expiresAt: number | null,
): Promise<boolean> {
  const item = await getClip(id);
  if (!item) return false;
  if (expiresAt == null) delete item.expiresAt;
  else item.expiresAt = expiresAt;
  await putClip(item);
  return true;
}

/**
 * Walk the live clips store and soft-delete any non-pinned clip whose
 * TTL has elapsed. Runs opportunistically from the ingest path — there's
 * no separate alarm because MV3 service workers don't need one for this
 * (worst case: clips linger until the next capture, which is fine).
 *
 * Returns the count of clips that were trashed this pass.
 */
export async function expireDueClips(): Promise<number> {
  const now = Date.now();
  const all = await listClips({ limit: 1_000_000 });
  let n = 0;
  for (const c of all) {
    if (c.pinned) continue;
    if (typeof c.expiresAt !== "number") continue;
    if (c.expiresAt > now) continue;
    const ok = await trashClip(c.id);
    if (ok) n++;
  }
  return n;
}

export async function togglePin(id: string): Promise<boolean> {
  const item = await getClip(id);
  if (!item) return false;
  item.pinned = !item.pinned;
  await putClip(item);
  return item.pinned;
}

export async function updateTags(id: string, tags: string[]): Promise<void> {
  const item = await getClip(id);
  if (!item) return;
  item.tags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  await putClip(item);
}

/**
 * Mask PII/secrets in this clip's stored content.
 * If the clip has remembered original content (manual redaction), we keep
 * it stashed so unredactClip() can restore. Image clips are no-ops.
 */
export async function redactClip(id: string): Promise<boolean> {
  const item = await getClip(id);
  if (!item) return false;
  if (item.kind === "image") return false;
  if (item.redacted) return true;
  item.originalContent = item.content;
  item.content = redactPii(item.content);
  item.preview = redactSensitivePreview(item.content);
  item.redacted = true;
  if (!item.tags.includes("redacted")) item.tags = [...item.tags, "redacted"];
  await putClip(item);
  return true;
}

/**
 * Restore the original content if it's still stashed.
 * Returns false when redaction was one-way (e.g. captured under auto-redact).
 */
export async function unredactClip(id: string): Promise<boolean> {
  const item = await getClip(id);
  if (!item) return false;
  if (!item.redacted) return true;
  if (item.originalContent == null) return false;
  item.content = item.originalContent;
  item.preview = redactSensitivePreview(item.content);
  delete item.originalContent;
  item.redacted = false;
  item.tags = item.tags.filter((t) => t !== "redacted");
  await putClip(item);
  return true;
}

export async function listClips(q: SearchQuery = {}): Promise<ClipItem[]> {
  const store = await clipsTx("readonly");
  const items: ClipItem[] = await new Promise((resolve, reject) => {
    const req = store.index("lastSeenAt").openCursor(null, "prev");
    const out: ClipItem[] = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push(cur.value as ClipItem);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  const needle = (q.q || "").toLowerCase().trim();
  return items
    .filter((c) => (q.pinnedOnly ? c.pinned : true))
    .filter((c) => (q.kind && q.kind !== "all" ? c.kind === q.kind : true))
    .filter((c) => (q.tag ? c.tags.includes(q.tag) : true))
    .filter((c) => {
      if (!needle) return true;
      const hay = [
        c.preview || c.content,
        c.source.title,
        c.source.url,
        c.source.nearbyText,
        c.tags.join(" "),
        c.ocrText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, q.limit ?? 200);
}

export async function clearUnpinned(): Promise<number> {
  const all = await listClips({ limit: 100_000 });
  let n = 0;
  for (const c of all) {
    if (!c.pinned) {
      await deleteClip(c.id);
      n++;
    }
  }
  return n;
}

/**
 * "Forget host": soft-delete every clip whose source URL matches `host`
 * exactly (after `www.` strip). Returns counts so callers can show a
 * meaningful confirmation. Clips go through the trash path so users get
 * the same 7-day grace window as any other delete; that's a deliberate
 * privacy choice — "Empty trash now" is one click away if they want it
 * gone immediately.
 *
 * Match uses `hostFrom(source.url)` so e.g. forget("github.com") catches
 * `www.github.com` too. Empty/unparseable hosts never match.
 */
export async function forgetHost(host: string): Promise<{
  /** How many clips matched (incl. pinned) before deletion. */
  matched: number;
  /** How many were soft-deleted (matched - pinned). */
  trashed: number;
  /** Pinned matches we skipped — the caller can decide to unpin first. */
  pinnedSkipped: number;
}> {
  const target = host.toLowerCase().replace(/^www\./, "").trim();
  if (!target) return { matched: 0, trashed: 0, pinnedSkipped: 0 };
  const all = await listClips({ limit: 1_000_000 });
  let matched = 0;
  let trashed = 0;
  let pinnedSkipped = 0;
  for (const c of all) {
    if (hostFrom(c.source.url) !== target) continue;
    matched++;
    if (c.pinned) {
      pinnedSkipped++;
      continue;
    }
    const ok = await trashClip(c.id);
    if (ok) trashed++;
  }
  return { matched, trashed, pinnedSkipped };
}

export async function clearAll(): Promise<void> {
  const store = await clipsTx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function pruneOldUnpinned(maxItems = 500): Promise<number> {
  const all = await listClips({ limit: 100_000 });
  const unpinned = all.filter((c) => !c.pinned);
  if (unpinned.length <= maxItems) return 0;
  const toDelete = unpinned.slice(maxItems);
  for (const c of toDelete) await deleteClip(c.id);
  return toDelete.length;
}

export async function exportAll(): Promise<{ version: number; clips: ClipItem[]; settings: Settings; exportedAt: number }> {
  const clips = await listClips({ limit: 1_000_000 });
  const settings = await getSettings();
  return { version: DB_VERSION, clips, settings, exportedAt: Date.now() };
}

export async function importAll(data: {
  clips?: ClipItem[];
  settings?: Partial<Settings>;
}): Promise<{ imported: number; skippedId: number; skippedHash: number }> {
  let imported = 0;
  let skippedId = 0;
  let skippedHash = 0;
  // Build a hash index of the live set ONCE so a 5k-clip import doesn't
  // do 5k IDB scans. We rebuild it lazily after each insert so a single
  // import file that contains its own dups also gets deduped against
  // earlier rows in the same file.
  const hashIndex = new Map<string, string>(); // hash -> existing clip id
  for (const live of await listClips({ limit: 1_000_000 })) {
    if (live.hash) hashIndex.set(live.hash, live.id);
  }
  for (const c of data.clips ?? []) {
    // 1) Exact id collision — assume the import is a re-export of the
    // same DB. Skip silently (the existing row is at least as fresh).
    const existing = await getClip(c.id);
    if (existing) {
      skippedId++;
      continue;
    }
    // 2) Hash collision — same content was captured under a different
    // id (e.g. on another browser or after a reset). Merge by bumping
    // hitCount + lastSeenAt on the existing row instead of inserting
    // a duplicate, so the live list doesn't grow stale dupes.
    if (c.hash) {
      const dupId = hashIndex.get(c.hash);
      if (dupId) {
        const live = await getClip(dupId);
        if (live) {
          live.hitCount = (live.hitCount || 1) + (c.hitCount || 1);
          live.lastSeenAt = Math.max(live.lastSeenAt, c.lastSeenAt || 0);
          // Union tags so imported tags don't get dropped.
          live.tags = Array.from(new Set([...(live.tags || []), ...(c.tags || [])]));
          // Pin sticks if either side is pinned.
          live.pinned = live.pinned || !!c.pinned;
          await putClip(live);
          skippedHash++;
          continue;
        }
      }
    }
    await putClip(c);
    imported++;
    if (c.hash) hashIndex.set(c.hash, c.id);
  }
  if (data.settings) await saveSettings(data.settings);
  return { imported, skippedId, skippedHash };
}

// Saved searches -----------------------------------------------------------
//
// Stored as a single meta row so we don't need an IDB schema bump. The list
// stays tiny in practice (typical user: <20 saved searches), so reading +
// rewriting the whole array per change is fine.

const SAVED_SEARCHES_KEY = "saved_searches";
const SEARCH_HISTORY_KEY = "search_history";
const SEARCH_HISTORY_MAX = 5;

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get(SAVED_SEARCHES_KEY);
    req.onsuccess = () => {
      const row = req.result as { key: string; value: SavedSearch[] } | undefined;
      const list = Array.isArray(row?.value) ? row.value : [];
      resolve(list);
    };
    req.onerror = () => resolve([]);
  });
}

async function writeSavedSearches(list: SavedSearch[]): Promise<void> {
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: SAVED_SEARCHES_KEY, value: list });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Add a named query. Trims + dedupes by lowercased name so the user
 * doesn't end up with three "github" chips. Returns the persisted row.
 */
export async function addSavedSearch(
  name: string,
  query: string,
): Promise<SavedSearch | null> {
  const trimmedName = name.trim();
  const trimmedQuery = query.trim();
  if (!trimmedName || !trimmedQuery) return null;
  const list = await listSavedSearches();
  const lower = trimmedName.toLowerCase();
  const existingIdx = list.findIndex((s) => s.name.toLowerCase() === lower);
  const entry: SavedSearch = {
    id:
      existingIdx >= 0
        ? list[existingIdx].id
        : `ss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: trimmedName,
    query: trimmedQuery,
    createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : Date.now(),
  };
  const next = existingIdx >= 0 ? [...list] : [...list, entry];
  if (existingIdx >= 0) next[existingIdx] = entry;
  // Cap at 24 so the chip row stays scannable.
  await writeSavedSearches(next.slice(-24));
  return entry;
}

export async function removeSavedSearch(id: string): Promise<boolean> {
  const list = await listSavedSearches();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  await writeSavedSearches(next);
  return true;
}

// Search history ---------------------------------------------------------
//
// Recently-typed queries (most recent first). Distinct from saved
// searches: history is auto-recorded, ephemeral-feeling, capped at 5,
// and dedupes against saved searches on read so the user never sees a
// chip twice. We persist after the user "commits" a query (debounced
// in the popup) so we don't pollute history with every keystroke.

export async function listSearchHistory(): Promise<string[]> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get(SEARCH_HISTORY_KEY);
    req.onsuccess = () => {
      const row = req.result as { key: string; value: string[] } | undefined;
      resolve(Array.isArray(row?.value) ? row.value.slice(0, SEARCH_HISTORY_MAX) : []);
    };
    req.onerror = () => resolve([]);
  });
}

async function writeSearchHistory(list: string[]): Promise<void> {
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: SEARCH_HISTORY_KEY, value: list });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Record a query string. No-op for blanks. Moves an existing match to the
 * front (most recent), keeps the list capped at SEARCH_HISTORY_MAX. Case-
 * sensitive matching on the trimmed string so "GitHub" and "github" stay
 * distinct — operators are usually lowercase anyway, but the free-text
 * portion may legitimately differ.
 */
export async function pushSearchHistory(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  const list = await listSearchHistory();
  const without = list.filter((q) => q !== trimmed);
  const next = [trimmed, ...without].slice(0, SEARCH_HISTORY_MAX);
  await writeSearchHistory(next);
}

export async function clearSearchHistory(): Promise<void> {
  await writeSearchHistory([]);
}

// Site rules ---------------------------------------------------------------

const SITE_RULES_KEY = "site_rules";

export async function listSiteRules(): Promise<SiteRule[]> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get(SITE_RULES_KEY);
    req.onsuccess = () => {
      const row = req.result as { key: string; value: SiteRule[] } | undefined;
      resolve(Array.isArray(row?.value) ? row.value : []);
    };
    req.onerror = () => resolve([]);
  });
}

async function writeSiteRules(list: SiteRule[]): Promise<void> {
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: SITE_RULES_KEY, value: list });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function upsertSiteRule(
  rule: Omit<SiteRule, "id" | "createdAt"> & { id?: string },
): Promise<SiteRule> {
  const list = await listSiteRules();
  const pattern = rule.hostPattern.trim().toLowerCase();
  if (!pattern) throw new Error("hostPattern required");
  const idx = rule.id
    ? list.findIndex((r) => r.id === rule.id)
    : list.findIndex((r) => r.hostPattern === pattern);
  const next: SiteRule = {
    id: rule.id ?? list[idx]?.id ?? `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    hostPattern: pattern,
    autoTags: rule.autoTags?.map((t) => t.trim()).filter(Boolean),
    autoPin: !!rule.autoPin,
    autoRedact: !!rule.autoRedact,
    skipCapture: !!rule.skipCapture,
    createdAt: idx >= 0 ? list[idx].createdAt : Date.now(),
  };
  const out = idx >= 0 ? [...list] : [...list, next];
  if (idx >= 0) out[idx] = next;
  await writeSiteRules(out);
  return next;
}

export async function removeSiteRule(id: string): Promise<boolean> {
  const list = await listSiteRules();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return false;
  await writeSiteRules(next);
  return true;
}

/**
 * Pure pattern test — no IO. Exact match, or `*.example.com` style
 * (one leading wildcard label). Empty / blank hosts never match.
 */
export function matchesHostPattern(pattern: string, host: string): boolean {
  if (!pattern || !host) return false;
  const p = pattern.toLowerCase();
  const h = host.toLowerCase().replace(/^www\./, "");
  if (p.startsWith("*.")) {
    const suffix = p.slice(2);
    if (!suffix) return false;
    return h === suffix || h.endsWith(`.${suffix}`);
  }
  return p === h;
}

/** Find the first matching site rule for `host`, or undefined. */
export async function findSiteRuleFor(host: string): Promise<SiteRule | undefined> {
  if (!host) return undefined;
  const rules = await listSiteRules();
  return rules.find((r) => matchesHostPattern(r.hostPattern, host));
}

// List sort mode -----------------------------------------------------------
//
// Persisted in `meta` under `list_sort` so the popup remembers what the
// user picked between opens. `recent` is the cron-baseline default and
// the fallback whenever the row is missing / corrupt.

const LIST_SORT_KEY = "list_sort";

export async function getListSort(): Promise<SortMode> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get(LIST_SORT_KEY);
    req.onsuccess = () => {
      const row = req.result as { key: string; value: string } | undefined;
      const v = row?.value;
      resolve(SORT_MODES.includes(v as SortMode) ? (v as SortMode) : "recent");
    };
    req.onerror = () => resolve("recent");
  });
}

export async function setListSort(mode: SortMode): Promise<void> {
  const next: SortMode = SORT_MODES.includes(mode) ? mode : "recent";
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: LIST_SORT_KEY, value: next });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

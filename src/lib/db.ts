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

/**
 * Flip the archive bit on a clip. Archived clips stay in IDB and stay
 * pinned if they were pinned (archive is orthogonal to pin) but get
 * filtered out of the default popup list. The user surfaces them by
 * typing `is:archived` or running the "Show archived" palette
 * command.
 *
 * Returns the NEW archive state so the caller can show a meaningful
 * confirmation. No-op when the clip is gone.
 */
export async function toggleArchive(id: string): Promise<boolean | null> {
  const item = await getClip(id);
  if (!item) return null;
  item.archived = !item.archived;
  // Bump lastSeenAt on UNarchive so the clip surfaces near the top of
  // the daily list — archiving is "tuck this away", unarchiving is
  // "I need this again". Archiving leaves lastSeenAt alone so the
  // archive list still orders by recency.
  if (!item.archived) item.lastSeenAt = Date.now();
  await putClip(item);
  return !!item.archived;
}

export async function updateTags(id: string, tags: string[]): Promise<void> {
  const item = await getClip(id);
  if (!item) return;
  item.tags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  await putClip(item);
}

/**
 * Scrub the source metadata off a clip while keeping the content,
 * tags, pin, and OCR. Used by the detail-view "scrub origin" button
 * and the Cmd+K palette command — handy when you want to keep a
 * snippet but lose every trace of where it came from (privacy
 * cleanup after copying from a sensitive page).
 *
 * Clears:
 *   - source.url
 *   - source.title
 *   - source.nearbyText (the surrounding paragraph)
 *   - source.favicon
 *
 * Keeps:
 *   - content, preview, kind, mime, tags, pinned, hitCount, bytes,
 *     hash, redacted bit, ocrText, template flag, expiresAt.
 *
 * Adds a `scrubbed` tag so users can `tag:scrubbed` to find what
 * they cleaned (and so the action is visible in the row). Idempotent:
 * scrubbing an already-scrubbed clip returns true without changes.
 */
export async function scrubClipOrigin(id: string): Promise<boolean> {
  const item = await getClip(id);
  if (!item) return false;
  const hadAny =
    !!item.source.url ||
    !!item.source.title ||
    !!item.source.nearbyText ||
    !!item.source.favicon;
  if (!hadAny && item.tags.includes("scrubbed")) return true;
  item.source = {};
  if (!item.tags.includes("scrubbed")) item.tags = [...item.tags, "scrubbed"];
  await putClip(item);
  return true;
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

/**
 * Bulk-restore every trashed clip whose `source.url` host matches
 * `host`. Sibling to `forgetHost` (which sends a host's LIVE clips
 * to the trash); this is the symmetric counterpart that pulls them
 * back. Useful when the user forget-host'd a domain by accident or
 * changed their mind during the 7-day retention window.
 *
 * Host matching mirrors forgetHost's normalisation — `www.` stripped,
 * lowercased — so `restoreAllFromHost("github.com")` catches rows
 * that were stored with `www.github.com`.
 *
 * Returns counts so callers can surface a single useful toast:
 *   - matched: how many trash rows had this host
 *   - restored: how many actually made it back to the live store
 *
 * Pinned bit on the trashed row is preserved by `restoreClip`, so a
 * forget-host'd pinned clip (which forgetHost skipped, so they'd
 * never be in trash anyway) is naturally a non-issue. Empty/
 * unparseable hosts never match.
 */
export async function restoreAllFromHost(host: string): Promise<{
  matched: number;
  restored: number;
}> {
  const target = host.toLowerCase().replace(/^www\./, "").trim();
  if (!target) return { matched: 0, restored: 0 };
  const all = await listTrash();
  let matched = 0;
  let restored = 0;
  for (const t of all) {
    if (hostFrom(t.source.url) !== target) continue;
    matched++;
    const ok = await restoreClip(t.id);
    if (ok) restored++;
  }
  return { matched, restored };
}

export async function clearAll(): Promise<void> {
  const store = await clipsTx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Merge clips that share a content hash but exist as separate rows
 * (because they were captured outside the dedup window). The most-
 * recently-seen row in each group becomes the survivor; we sum
 * `hitCount`, union `tags`, OR-merge `pinned`, keep the earliest
 * `createdAt`, latest `lastSeenAt`, and preserve any `template` or
 * `ocrText` from the survivor (the freshest signal wins). Losers
 * are soft-deleted via the trash path so the user has the standard
 * 7-day grace window if the merge ever feels wrong.
 *
 * Returns counts so callers can surface a meaningful toast:
 *   - groups: how many duplicate groups existed (>= 2 rows each)
 *   - merged: how many losing rows were trashed
 *   - hashesScanned: how many distinct hashes we saw across all clips
 *
 * Local-only; no network. Pinned losers are STILL merged (the survivor
 * inherits their pinned bit) — pinning is an intent that should
 * survive consolidation, but having two identical pinned clips isn't
 * useful storage.
 */
export async function mergeDuplicatesByHash(): Promise<{
  groups: number;
  merged: number;
  hashesScanned: number;
}> {
  const all = await listClips({ limit: 1_000_000 });
  const byHash = new Map<string, ClipItem[]>();
  for (const c of all) {
    if (!c.hash) continue;
    const arr = byHash.get(c.hash);
    if (arr) arr.push(c);
    else byHash.set(c.hash, [c]);
  }
  let groups = 0;
  let merged = 0;
  for (const [, members] of byHash) {
    if (members.length < 2) continue;
    groups++;
    // Survivor = most-recently-seen. Sort desc by lastSeenAt; ties
    // keep deterministic order via createdAt.
    members.sort(
      (a, b) =>
        (b.lastSeenAt || 0) - (a.lastSeenAt || 0) ||
        (b.createdAt || 0) - (a.createdAt || 0),
    );
    const survivor = members[0];
    const losers = members.slice(1);
    let earliestCreated = survivor.createdAt;
    let totalHits = survivor.hitCount || 1;
    let pinned = !!survivor.pinned;
    const tagSet = new Set(survivor.tags || []);
    for (const l of losers) {
      totalHits += l.hitCount || 1;
      pinned = pinned || !!l.pinned;
      if ((l.createdAt || 0) < earliestCreated) earliestCreated = l.createdAt;
      for (const t of l.tags || []) tagSet.add(t);
    }
    survivor.hitCount = totalHits;
    survivor.pinned = pinned;
    survivor.createdAt = earliestCreated;
    survivor.tags = Array.from(tagSet);
    await putClip(survivor);
    for (const l of losers) {
      const ok = await trashClip(l.id);
      if (ok) merged++;
    }
  }
  return { groups, merged, hashesScanned: byHash.size };
}

// Find duplicates (review-first) ---------------------------------------
//
// Sibling of mergeDuplicatesByHash that LISTS the duplicate groups
// without taking any destructive action. The detail-view caller renders
// them so the user can pick which group to merge, and which to leave
// alone (e.g. two clips with the same hash but captured intentionally
// at different times for archival reasons).
//
// Each group is sorted survivor-first (most-recently-seen) so the UI
// can label the first row "Will keep" and the rest "Will trash" with
// no extra computation. Pinned bit is OR'd across the group so the
// caller can flag "merging will inherit pinned" — surfaced as a small
// dot in the UI. Pure read; no IDB writes.

export interface DuplicateGroup {
  /** djb2 content hash shared by every member. */
  hash: string;
  /** Survivor (most-recently-seen) first, then losers desc. */
  members: ClipItem[];
  /** True when ANY member is pinned — surfaced in the UI. */
  pinnedInGroup: boolean;
  /** Total hits across the group (informational). */
  totalHits: number;
}

export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const all = await listClips({ limit: 1_000_000 });
  const byHash = new Map<string, ClipItem[]>();
  for (const c of all) {
    if (!c.hash) continue;
    const arr = byHash.get(c.hash);
    if (arr) arr.push(c);
    else byHash.set(c.hash, [c]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [hash, members] of byHash) {
    if (members.length < 2) continue;
    members.sort(
      (a, b) =>
        (b.lastSeenAt || 0) - (a.lastSeenAt || 0) ||
        (b.createdAt || 0) - (a.createdAt || 0),
    );
    let pinnedInGroup = false;
    let totalHits = 0;
    for (const m of members) {
      if (m.pinned) pinnedInGroup = true;
      totalHits += m.hitCount || 1;
    }
    groups.push({ hash, members, pinnedInGroup, totalHits });
  }
  // Largest groups first — the biggest wins come from collapsing huge
  // dupe clusters. Tie-break on freshness so two equal-size groups
  // still order deterministically.
  groups.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      (b.members[0]?.lastSeenAt || 0) - (a.members[0]?.lastSeenAt || 0),
  );
  return groups;
}

/**
 * Merge a single group identified by content hash. Same math as
 * mergeDuplicatesByHash but scoped — for review-first UX where the
 * user picks which groups to collapse. No-op when the hash isn't a
 * duplicate group anymore (e.g. another tab already merged it).
 *
 * Returns the count of losers trashed (0 when the group is gone).
 */
export async function mergeDuplicateGroup(hash: string): Promise<number> {
  if (!hash) return 0;
  const all = await listClips({ limit: 1_000_000 });
  const members = all.filter((c) => c.hash === hash);
  if (members.length < 2) return 0;
  members.sort(
    (a, b) =>
      (b.lastSeenAt || 0) - (a.lastSeenAt || 0) ||
      (b.createdAt || 0) - (a.createdAt || 0),
  );
  const survivor = members[0];
  const losers = members.slice(1);
  let earliestCreated = survivor.createdAt;
  let totalHits = survivor.hitCount || 1;
  let pinned = !!survivor.pinned;
  const tagSet = new Set(survivor.tags || []);
  for (const l of losers) {
    totalHits += l.hitCount || 1;
    pinned = pinned || !!l.pinned;
    if ((l.createdAt || 0) < earliestCreated) earliestCreated = l.createdAt;
    for (const t of l.tags || []) tagSet.add(t);
  }
  survivor.hitCount = totalHits;
  survivor.pinned = pinned;
  survivor.createdAt = earliestCreated;
  survivor.tags = Array.from(tagSet);
  await putClip(survivor);
  let trashed = 0;
  for (const l of losers) {
    const ok = await trashClip(l.id);
    if (ok) trashed++;
  }
  return trashed;
}

/**
 * Sweep every text clip in the live store and redact any whose body
 * still contains PII/secrets. Mirrors the auto-redact-at-capture path
 * but runs *retroactively* — useful when a user flips on
 * `autoRedactPii` after they've already accumulated a pile of clips
 * that pre-date the toggle.
 *
 * Honors the same rules as the capture path:
 *   - text clips only (binary blobs untouched)
 *   - already-redacted clips skipped
 *   - the original is stashed in `originalContent` so the user can
 *     unredact later (same as a manual redact). NOT one-way — that's
 *     only the on-capture path's contract.
 *
 * Returns counts so callers can surface a meaningful toast. Pure
 * over IDB; no network. Pinned status is preserved.
 */
export async function retroactiveAutoRedact(): Promise<{
  scanned: number;
  redacted: number;
  alreadyRedacted: number;
  noPii: number;
}> {
  const all = await listClips({ limit: 1_000_000 });
  let redacted = 0;
  let alreadyRedacted = 0;
  let noPii = 0;
  let scanned = 0;
  for (const c of all) {
    if (c.kind !== "text") continue;
    scanned++;
    if (c.redacted) {
      alreadyRedacted++;
      continue;
    }
    const rewritten = redactPii(c.content);
    if (rewritten === c.content) {
      noPii++;
      continue;
    }
    // Stash the original so the redact is reversible — different
    // contract than the on-capture path (which is one-way because
    // the original never lands on disk). Here the original is
    // already on disk, so reversibility costs nothing.
    c.originalContent = c.content;
    c.content = rewritten;
    c.preview = redactSensitivePreview(rewritten);
    c.redacted = true;
    if (!c.tags.includes("redacted")) c.tags = [...c.tags, "redacted"];
    await putClip(c);
    redacted++;
  }
  return { scanned, redacted, alreadyRedacted, noPii };
}

export async function pruneOldUnpinned(maxItems = 500): Promise<number> {
  const all = await listClips({ limit: 100_000 });
  const unpinned = all.filter((c) => !c.pinned);
  if (unpinned.length <= maxItems) return 0;
  const toDelete = unpinned.slice(maxItems);
  for (const c of toDelete) await deleteClip(c.id);
  return toDelete.length;
}

export async function exportAll(): Promise<{
  version: number;
  clips: ClipItem[];
  settings: Settings;
  exportedAt: number;
  /**
   * Privacy audit ring at the time of export. Additive — old export
   * bundles that don't carry this field are still valid. We export
   * a copy (not a reference) so a later in-memory mutation of the
   * audit log can't retroactively change a written bundle.
   *
   * Keeping the audit alongside clips means a user who imports a
   * backup on a fresh install gets their privacy-action history
   * back too — useful when they're auditing what they redacted /
   * scrubbed weeks ago and the new device's IDB is empty.
   */
  privacyAudit?: import("./db").PrivacyAuditEntry[];
  /**
   * Recent search history at export time (most-recent first, capped
   * at SEARCH_HISTORY_MAX). Additive — old bundles without the field
   * still import cleanly. Round-tripping search history means a user
   * restoring on a new device doesn't lose their "Recent" chip row,
   * which is small but surprisingly painful when it's gone (the
   * chips are the muscle-memory layer above saved searches).
   *
   * We export a snapshot copy so a later push to history doesn't
   * mutate the already-written bundle.
   */
  searchHistory?: string[];
}> {
  const clips = await listClips({ limit: 1_000_000 });
  const settings = await getSettings();
  // Read the audit ring once at export time. If the read fails (IDB
  // hiccup, missing meta row, etc.) we just omit the field — a missing
  // audit log is far better than a failed export.
  let privacyAudit: import("./db").PrivacyAuditEntry[] | undefined;
  try {
    const list = await listPrivacyAudit();
    privacyAudit = list.length > 0 ? list.slice() : undefined;
  } catch (e) {
    console.warn("[context-clipboard] export: audit read failed", e);
    privacyAudit = undefined;
  }
  // Same posture as the audit log: snapshot + omit-when-empty so a
  // user who's never typed in the search box doesn't ship an empty
  // [] in their backup.
  let searchHistory: string[] | undefined;
  try {
    const list = await listSearchHistory();
    searchHistory = list.length > 0 ? list.slice() : undefined;
  } catch (e) {
    console.warn("[context-clipboard] export: search history read failed", e);
    searchHistory = undefined;
  }
  return { version: DB_VERSION, clips, settings, exportedAt: Date.now(), privacyAudit, searchHistory };
}

export async function importAll(data: {
  clips?: ClipItem[];
  settings?: Partial<Settings>;
  privacyAudit?: PrivacyAuditEntry[];
  searchHistory?: string[];
}): Promise<{
  imported: number;
  skippedId: number;
  skippedHash: number;
  /** Audit entries actually written (after dedup against existing entries by id). */
  auditMerged: number;
  /** Search history entries added (after dedup against existing entries). */
  historyMerged: number;
}> {
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
  // Audit log: union-merge by id, newest-first, capped at PRIVACY_AUDIT_MAX.
  // Different shape from the per-action append path because here we're
  // importing a batch — we don't want to do 30 IDB writes when one will
  // do, AND we want to preserve the timeline order rather than re-stamping
  // imported entries with the import time. Drops any entry whose `kind` we
  // don't recognise so a forward-compatible export can't poison our ring
  // with stuff this build can't render.
  let auditMerged = 0;
  if (Array.isArray(data.privacyAudit) && data.privacyAudit.length > 0) {
    try {
      const existing = await listPrivacyAudit();
      const byId = new Map<string, PrivacyAuditEntry>();
      for (const e of existing) byId.set(e.id, e);
      const KNOWN: PrivacyAuditKind[] = [
        "redact",
        "unredact",
        "scrub-origin",
        "retro-redact",
        "forget-host",
        "set-ttl",
        "clear-ttl",
        "archive",
        "unarchive",
        "trash",
        "restore",
      ];
      const known = new Set<string>(KNOWN);
      for (const raw of data.privacyAudit) {
        if (!raw || typeof raw !== "object") continue;
        if (!raw.id || typeof raw.id !== "string") continue;
        if (!known.has(raw.kind)) continue;
        if (typeof raw.at !== "number" || !Number.isFinite(raw.at)) continue;
        if (byId.has(raw.id)) continue;
        byId.set(raw.id, {
          id: raw.id,
          kind: raw.kind,
          at: raw.at,
          clipId: typeof raw.clipId === "string" ? raw.clipId : "",
          host: typeof raw.host === "string" ? raw.host : undefined,
          detail: typeof raw.detail === "string" ? raw.detail.slice(0, 80) : undefined,
        });
        auditMerged++;
      }
      if (auditMerged > 0) {
        // On import, cap at the user's configured retention so the
        // import respects the same ceiling as live appends. We still
        // hard-cap at PRIVACY_AUDIT_MAX (100) as a safety net.
        const importCap = await getPrivacyAuditCap();
        const sorted = Array.from(byId.values())
          .sort((a, b) => b.at - a.at)
          .slice(0, importCap);
        const store = await metaTx("readwrite");
        await new Promise<void>((resolve, reject) => {
          const req = store.put({ key: PRIVACY_AUDIT_KEY, value: sorted });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch (e) {
      console.warn("[context-clipboard] import: audit merge failed", e);
    }
  }
  // Search history merge: union with existing history, imported entries
  // FIRST (they're newer-from-the-user's-POV in a backup restore scenario;
  // the existing device's typing has already moved to whatever they're
  // doing now). Same SEARCH_HISTORY_MAX cap as the live push path.
  //
  // Defensive: imported entries that aren't non-empty strings get
  // dropped silently — keeps a forward-compatible export from poisoning
  // the chip row with garbage. Trim to handle stray whitespace.
  let historyMerged = 0;
  if (Array.isArray(data.searchHistory) && data.searchHistory.length > 0) {
    try {
      const existing = await listSearchHistory();
      const seen = new Set<string>(existing);
      const additions: string[] = [];
      for (const raw of data.searchHistory) {
        if (typeof raw !== "string") continue;
        const q = raw.trim();
        if (!q) continue;
        if (seen.has(q)) continue;
        seen.add(q);
        additions.push(q);
      }
      historyMerged = additions.length;
      if (historyMerged > 0) {
        // Imported first so they show up in the chip row on the
        // freshly-restored device — that's the point of carrying
        // history across machines.
        const merged = [...additions, ...existing].slice(0, SEARCH_HISTORY_MAX);
        const store = await metaTx("readwrite");
        await new Promise<void>((resolve, reject) => {
          const req = store.put({ key: SEARCH_HISTORY_KEY, value: merged });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch (e) {
      console.warn("[context-clipboard] import: search history merge failed", e);
    }
  }
  return { imported, skippedId, skippedHash, auditMerged, historyMerged };
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

/**
 * Rename a saved-search row in place. Returns the updated entry on
 * success, or `null` for: missing id, blank name, or a name collision
 * with a DIFFERENT entry (so the chip strip stays uniquely-named).
 *
 * Renaming to the same name (case-preserving edit on the same row) is
 * always allowed — that's the typical "fix a typo" path.
 *
 * Used by the popup's inline-rename affordance (double-click chip label
 * → contenteditable input). Kept on the same lib/db surface as
 * `addSavedSearch` / `removeSavedSearch` so the popup never has to
 * reach into the meta store directly.
 */
export async function renameSavedSearch(
  id: string,
  name: string,
): Promise<SavedSearch | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const list = await listSavedSearches();
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const lower = trimmed.toLowerCase();
  // Reject if a DIFFERENT entry already uses this name (case-insensitive).
  // Allow if the same entry is just adjusting casing/whitespace.
  const collision = list.findIndex(
    (s, i) => i !== idx && s.name.toLowerCase() === lower,
  );
  if (collision >= 0) return null;
  const next = [...list];
  next[idx] = { ...list[idx], name: trimmed };
  await writeSavedSearches(next);
  return next[idx];
}

/**
 * Rewrite the saved-search list order. Used by the popup's drag-to-
 * reorder affordance so frequently-applied chips can float left.
 *
 * `orderedIds` should be a permutation of the existing list's ids:
 *  - missing ids are appended at the end in their original order
 *    (so a stale id-list from a debounced drag still produces a
 *    sane outcome — no entry gets dropped)
 *  - unknown ids are silently ignored (defensive against a stale
 *    drag fired after a delete)
 *  - duplicates within `orderedIds` keep the first occurrence
 *
 * Returns the new list on success, `null` when the input is empty
 * or when there's nothing to reorder. No-op when the resulting order
 * matches the existing one (no IDB write) so passive drag-end calls
 * stay cheap.
 */
export async function reorderSavedSearches(
  orderedIds: string[],
): Promise<SavedSearch[] | null> {
  const list = await listSavedSearches();
  if (list.length === 0) return null;
  // Filter input down to known ids, deduped, preserving the user's
  // intent order. Anything left over (existed before but absent from
  // input) keeps its relative tail position.
  const byId = new Map(list.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const head: SavedSearch[] = [];
  for (const id of orderedIds) {
    if (!id || seen.has(id)) continue;
    const hit = byId.get(id);
    if (!hit) continue;
    head.push(hit);
    seen.add(id);
  }
  const tail = list.filter((s) => !seen.has(s.id));
  const next = [...head, ...tail];
  // No-op when nothing actually changed — keeps a debounced drag from
  // writing meta on every micro-jiggle.
  let same = next.length === list.length;
  if (same) {
    for (let i = 0; i < next.length; i++) {
      if (next[i].id !== list[i].id) {
        same = false;
        break;
      }
    }
  }
  if (same) return list;
  await writeSavedSearches(next);
  return next;
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
  // Patterns are stored as cleaned regex sources (trimmed, dropped if
  // empty / invalid / too long). We compile each with the same flags
  // the runtime will use, so a bad pattern fails fast at save time
  // instead of silently being a no-op forever.
  const cleanPatterns = (rule.customPatterns ?? [])
    .map((s) => (s || "").trim())
    .filter((s) => {
      if (!s || s.length > 200) return false;
      try {
        new RegExp(s, "gi");
        return true;
      } catch {
        return false;
      }
    });
  const next: SiteRule = {
    id: rule.id ?? list[idx]?.id ?? `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    hostPattern: pattern,
    autoTags: rule.autoTags?.map((t) => t.trim()).filter(Boolean),
    autoPin: !!rule.autoPin,
    autoRedact: !!rule.autoRedact,
    skipCapture: !!rule.skipCapture,
    autoScrubOrigin: !!rule.autoScrubOrigin,
    customPatterns: cleanPatterns.length ? cleanPatterns : undefined,
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
 * Bulk-write the entire site-rules list. Used by the import path
 * (`mergeRules(...)` result → persisted in one shot) so we don't
 * fire N sequential `upsertSiteRule` calls and pay N IDB roundtrips
 * for a 30-rule paste.
 *
 * The caller is responsible for having already validated + deduped
 * the list (typically via `mergeRules`); this helper just persists
 * the array verbatim with one IDB write.
 */
export async function replaceSiteRules(rules: SiteRule[]): Promise<void> {
  // Defensive cap mirrors what the IO layer enforces — even if a
  // caller hands us a pathological array, we won't blow up IDB.
  await writeSiteRules(rules.slice(0, 200));
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

/**
 * Per-rule usage stat. `count` is the same first-match-wins count
 * `countClipsForRules` returns; `lastMatchedAt` is the most recent
 * `lastSeenAt` across the clips attributable to that rule (undefined
 * when count===0).
 *
 * Lets the popup render a richer "active" / "stale" cue alongside the
 * raw count - a rule that caught 12 clips three months ago is far less
 * interesting than one that's still firing weekly.
 */
export interface RuleUsage {
  count: number;
  /** Most recent lastSeenAt across attributable clips. Undefined when count=0. */
  lastMatchedAt?: number;
}

/**
 * Count, per site rule, how many clips in `clips` are attributable to
 * that rule under the first-match-wins semantics ingest uses. Mirrors
 * the background's `findSiteRuleFor` walk:
 *
 *   - For each clip, derive its host (hostFrom(source.url)).
 *   - Walk rules in list order; the FIRST one whose hostPattern
 *     matches the host owns this clip and gets the +1.
 *   - Clips with no host (notes, scrubbed) don't count toward any
 *     rule (the rule pipeline never saw them).
 *
 * Pure — no IO. Caller passes the rules + live clips array; this
 * keeps the helper testable and lets the popup batch it under a
 * single render pass. Returns a Map<ruleId, count> so callers can
 * cheaply look up per-rule counts without re-scanning.
 *
 * The first-match-wins matters: a clip on `docs.github.com` matched
 * by both `*.github.com` and `docs.github.com` rules counts ONLY for
 * the first one in the list (whichever was added/sorted higher). That
 * matches what ingest actually does, so the count is a true "how
 * many clips did THIS rule own" rather than "how many would match in
 * isolation".
 */
export function countClipsForRules(
  rules: SiteRule[],
  clips: ClipItem[],
): Map<string, number> {
  const counts = new Map<string, number>();
  if (rules.length === 0) return counts;
  // Pre-cache host per clip so the inner loop doesn't re-parse URLs
  // for every rule iteration.
  for (const c of clips) {
    const host = hostFrom(c.source.url);
    if (!host) continue;
    // First-match-wins matches background `findSiteRuleFor`. Walk
    // rules in order; bail as soon as one matches.
    for (const r of rules) {
      if (matchesHostPattern(r.hostPattern, host)) {
        counts.set(r.id, (counts.get(r.id) || 0) + 1);
        break;
      }
    }
  }
  return counts;
}

/**
 * Richer variant of `countClipsForRules` — returns both the count
 * AND the most-recent `lastSeenAt` per rule, so the popup can show
 * "12 clips · 3d ago" instead of just "12 clips". Same first-match-
 * wins semantics; identical host-cache layout. Cheap to compute
 * alongside the count (single scan, no extra IDB hit).
 *
 * Rules with zero clips are absent from the map (consistent with
 * `countClipsForRules`). Callers that want a "show 0 for inactive
 * rules" view fall back to `Map.get(id) ?? { count: 0 }`.
 *
 * Why a separate function instead of changing the existing one's
 * return shape? Backwards-compatibility — `countClipsForRules` is
 * exported and tested; bumping its shape would force a coordinated
 * update across every caller. The new helper composes the same scan
 * with one extra max-comparison, and we drop the old helper down to
 * a `usagesForRules(...).get(id)?.count ?? 0` shim if the popup ever
 * wants to deduplicate.
 */
export function usagesForRules(
  rules: SiteRule[],
  clips: ClipItem[],
): Map<string, RuleUsage> {
  const out = new Map<string, RuleUsage>();
  if (rules.length === 0) return out;
  for (const c of clips) {
    const host = hostFrom(c.source.url);
    if (!host) continue;
    for (const r of rules) {
      if (matchesHostPattern(r.hostPattern, host)) {
        const prev = out.get(r.id);
        if (prev) {
          prev.count += 1;
          if (c.lastSeenAt > (prev.lastMatchedAt ?? 0)) {
            prev.lastMatchedAt = c.lastSeenAt;
          }
        } else {
          out.set(r.id, { count: 1, lastMatchedAt: c.lastSeenAt });
        }
        break;
      }
    }
  }
  return out;
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

// Similar clips ---------------------------------------------------------
//
// Detail-view sidekick: given an open clip, find OTHER clips that share
// either its host or one of its tags. Useful for "show me the rest of
// what I copied from this docs page" or "show me other code clips".
//
// Pure ranking — no IO beyond the single listClips scan. The pivot
// clip is excluded from its own result. Trashed clips are ignored
// (listClips already excludes them).

export interface SimilarClipsOptions {
  /** Cap returned rows. Default 5. */
  limit?: number;
}

/**
 * Rank every other clip by similarity to `pivotId`. A clip earns:
 *   - 3 points per shared tag (capped at 9, so a 4-tag match doesn't
 *     dwarf a different-tags-but-same-host case)
 *   - 4 points if the host matches (single bonus — one host or none)
 *   - tie-break: more-recently-seen wins
 *
 * Returns the top `limit` matches with score > 0. Pinned clips don't
 * get a pin-bonus — pinning is about retention intent, not similarity.
 *
 * Local-only, bounded; safe to call on every detail open.
 */
export async function findSimilarClips(
  pivotId: string,
  opts: SimilarClipsOptions = {},
): Promise<ClipItem[]> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 5));
  const pivot = await getClip(pivotId);
  if (!pivot) return [];
  const pivotHost = hostFrom(pivot.source.url);
  const pivotTags = new Set((pivot.tags || []).map((t) => t.toLowerCase()));
  // We deliberately exclude noise tags so a `kind:image` clip doesn't
  // come back as "similar" to every other image. These are the auto-
  // tags that describe shape, not topic.
  const NOISE = new Set([
    "image",
    "link",
    "text",
    "url",
    "long",
    "redacted",
    "scrubbed",
    "quick-capture",
  ]);
  for (const n of NOISE) pivotTags.delete(n);

  const all = await listClips({ limit: 5_000 });
  type Scored = { clip: ClipItem; score: number };
  const scored: Scored[] = [];
  for (const c of all) {
    if (c.id === pivotId) continue;
    let score = 0;
    if (pivotHost && hostFrom(c.source.url) === pivotHost) score += 4;
    if (pivotTags.size > 0) {
      let tagHits = 0;
      for (const t of c.tags || []) {
        if (pivotTags.has(t.toLowerCase())) tagHits++;
      }
      score += Math.min(9, tagHits * 3);
    }
    if (score > 0) scored.push({ clip: c, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (b.clip.lastSeenAt || 0) - (a.clip.lastSeenAt || 0),
  );
  return scored.slice(0, limit).map((s) => s.clip);
}

// In-page palette last query --------------------------------------------
//
// Persists the most recent search string the user typed into the in-
// page palette (the Cmd+Shift+V overlay) so re-opening the chord pre-
// fills the input. Stored in IDB meta — survives popup reloads, restarts,
// and works in side-panel mode too. Capped at 200 chars + trimmed; empty
// strings clear the slot so a "I searched, then cleared, then closed"
// flow doesn't trap stale text.

const PALETTE_LAST_QUERY_KEY = "palette_last_query";
const PALETTE_LAST_QUERY_MAX = 200;

export async function getPaletteLastQuery(): Promise<string> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get(PALETTE_LAST_QUERY_KEY);
    req.onsuccess = () => {
      const row = req.result as { key: string; value: string } | undefined;
      resolve(typeof row?.value === "string" ? row.value.slice(0, PALETTE_LAST_QUERY_MAX) : "");
    };
    req.onerror = () => resolve("");
  });
}

export async function setPaletteLastQuery(query: string): Promise<void> {
  const next = (query || "").trim().slice(0, PALETTE_LAST_QUERY_MAX);
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: PALETTE_LAST_QUERY_KEY, value: next });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Send-to: remember the last picked action ----------------------------
//
// Tiny meta row so the next time the user opens the "Send to…" menu on
// a clip, their most-recent choice floats to the top. Pure UX — no
// behaviour change, just row order. Stored as the action id (a short
// stable string like "google" / "md-link" / "json"); empty when the
// user hasn't picked anything yet.
//
// Why per-user rather than per-clip? The point is muscle memory — if
// you almost always copy as Markdown link, every menu should bias
// toward that. Per-clip ordering would mean the menu shuffles between
// clips, which defeats the muscle-memory win.

const SEND_TO_LAST_KEY = "send_to_last";
const SEND_TO_ID_MAX = 32;

export async function getSendToLast(): Promise<string> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get(SEND_TO_LAST_KEY);
    req.onsuccess = () => {
      const row = req.result as { key: string; value: string } | undefined;
      resolve(typeof row?.value === "string" ? row.value.slice(0, SEND_TO_ID_MAX) : "");
    };
    req.onerror = () => resolve("");
  });
}

export async function setSendToLast(id: string): Promise<void> {
  const next = (id || "").trim().slice(0, SEND_TO_ID_MAX);
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: SEND_TO_LAST_KEY, value: next });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Last-applied saved-search id ----------------------------------------
//
// A muscle-memory crutch for the palette: "Open my last saved search"
// pulls the most-recently-applied chip back into the search box without
// scrolling the chip strip. Useful when the user has 15+ chips and the
// most-recent one is buried.
//
// Stored as the chip's stable id (ss_<ts>_<nonce>); empty string when
// nothing has been applied yet. Cleared if the underlying saved search
// is deleted (popup-side: removeSavedSearch path should null this if
// it matches — but the palette command also tolerates a stale id by
// checking against the live list before applying).

const LAST_SAVED_SEARCH_KEY = "last_saved_search";
const SAVED_SEARCH_ID_MAX = 64;

export async function getLastSavedSearchId(): Promise<string> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get(LAST_SAVED_SEARCH_KEY);
    req.onsuccess = () => {
      const row = req.result as { key: string; value: string } | undefined;
      resolve(typeof row?.value === "string" ? row.value.slice(0, SAVED_SEARCH_ID_MAX) : "");
    };
    req.onerror = () => resolve("");
  });
}

export async function setLastSavedSearchId(id: string): Promise<void> {
  const next = (id || "").trim().slice(0, SAVED_SEARCH_ID_MAX);
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: LAST_SAVED_SEARCH_KEY, value: next });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Privacy audit log ----------------------------------------------------
//
// Ring buffer of the user's last N privacy-impacting actions: per-clip
// redact / unredact / scrub-origin, retroactive PII sweeps, forget-host
// soft-deletes, per-clip TTL set, manual trash, etc. Used by the
// Settings panel to surface "what did I do?" so users can verify the
// extension's privacy posture without browsing IDB by hand.
//
// Stored as a single meta row to avoid an IDB schema bump. Capped at
// PRIVACY_AUDIT_MAX (default 30) — anything older falls off the back.
// Entries are intentionally small + structured: kind + clip-id-or-host
// + a tiny detail string + when. No clip content ever lands in the
// log (the whole point of these actions is privacy — a verbose log
// would defeat that).
//
// Writers in background.ts (redact/unredact/scrub/forget) call
// `appendPrivacyAuditEntry()` after the underlying op succeeds.
// Readers in popup settings call `listPrivacyAudit()` to paint.

export type PrivacyAuditKind =
  | "redact"
  | "unredact"
  | "scrub-origin"
  | "retro-redact"
  | "forget-host"
  | "set-ttl"
  | "clear-ttl"
  | "archive"
  | "unarchive"
  | "trash"
  | "restore";

export interface PrivacyAuditEntry {
  /** Stable id (timestamp + nonce) for React-style keys. */
  id: string;
  kind: PrivacyAuditKind;
  /** Capture time (ms since epoch). */
  at: number;
  /** Target clip id, or "" for non-clip actions (forget-host). */
  clipId: string;
  /** Optional host context — set for scrub/forget so the row reads well. */
  host?: string;
  /**
   * Free-form tail (short!). Examples: "12 clips" for retro-redact,
   * "in 7 days" for set-ttl, "from 4 clips" for forget-host. Capped
   * at 80 chars to keep the row scannable.
   */
  detail?: string;
}

const PRIVACY_AUDIT_KEY = "privacy_audit";
const PRIVACY_AUDIT_MAX = 100; // Hard ceiling — settings cap stays at-or-below.

/**
 * Resolve the user-configured retention cap, defaulting to 30 and
 * snapping any junk value back to a valid option. We snapshot the
 * setting on each call so the cap reflects the live preference (the
 * audit panel writes the change immediately on slider movement and
 * the next append picks it up).
 *
 * Returns at most PRIVACY_AUDIT_MAX (100) — the hard ceiling so a
 * future settings shape change can't suddenly request a 10k-entry
 * ring.
 */
async function getPrivacyAuditCap(): Promise<number> {
  try {
    const s = await getSettings();
    const v = s.privacyAuditRetention;
    if (v === 10 || v === 30 || v === 60 || v === 100) return v;
  } catch {
    // Settings read failed (very rare) — fall back to default.
  }
  return 30;
}

export async function listPrivacyAudit(): Promise<PrivacyAuditEntry[]> {
  const store = await metaTx("readonly");
  return new Promise((resolve) => {
    const req = store.get(PRIVACY_AUDIT_KEY);
    req.onsuccess = () => {
      const row = req.result as
        | { key: string; value: PrivacyAuditEntry[] }
        | undefined;
      resolve(Array.isArray(row?.value) ? row.value : []);
    };
    req.onerror = () => resolve([]);
  });
}

/**
 * Push one entry onto the head of the audit log and prune to
 * PRIVACY_AUDIT_MAX. Newest first so the settings view doesn't have
 * to reverse the array. Callers fire-and-forget; failures are logged
 * but never throw because audit-write should never block the underlying
 * privacy op from succeeding.
 */
export async function appendPrivacyAuditEntry(
  entry: Omit<PrivacyAuditEntry, "id" | "at">,
): Promise<void> {
  try {
    const [list, cap] = await Promise.all([
      listPrivacyAudit(),
      getPrivacyAuditCap(),
    ]);
    const next: PrivacyAuditEntry = {
      id: `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      clipId: entry.clipId || "",
      kind: entry.kind,
      host: entry.host,
      detail: entry.detail ? entry.detail.slice(0, 80) : undefined,
    };
    const trimmed = [next, ...list].slice(0, cap);
    const store = await metaTx("readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = store.put({ key: PRIVACY_AUDIT_KEY, value: trimmed });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[context-clipboard] audit append failed", e);
  }
}

/** Wipe the audit log. Used by the Settings "Clear" button. */
export async function clearPrivacyAudit(): Promise<void> {
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: PRIVACY_AUDIT_KEY, value: [] });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Drop a single audit entry by id. Used by the popup's per-row
 * "Forget this action" affordance (right-click on an audit row →
 * confirm → call this). Returns true when an entry was removed,
 * false when the id wasn't found (no-op).
 *
 * Why a single-entry path on top of `clearPrivacyAudit`? The audit
 * log is a privacy receipt — a user might want to clear ONE row
 * (e.g. a forget-host action they immediately regret surfacing) without
 * wiping the whole log. clearPrivacyAudit() is the nuke option;
 * this is the scalpel.
 */
export async function removePrivacyAuditEntry(id: string): Promise<boolean> {
  if (!id) return false;
  const list = await listPrivacyAudit();
  const next = list.filter((e) => e.id !== id);
  if (next.length === list.length) return false;
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: PRIVACY_AUDIT_KEY, value: next });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return true;
}

/**
 * Trim the audit log to the current settings retention cap. Called
 * by the Settings panel after the user lowers the retention slider
 * so the change is visible immediately — without this, a 100→10
 * lower-and-stop wouldn't shrink the log until the next append.
 *
 * Returns the number of entries dropped (0 when nothing was over the
 * cap). No-op when the log is already at-or-under the cap.
 */
export async function trimPrivacyAuditToCap(): Promise<number> {
  const [list, cap] = await Promise.all([
    listPrivacyAudit(),
    getPrivacyAuditCap(),
  ]);
  if (list.length <= cap) return 0;
  const trimmed = list.slice(0, cap);
  const store = await metaTx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key: PRIVACY_AUDIT_KEY, value: trimmed });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return list.length - trimmed.length;
}

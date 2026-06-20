import type { ClipItem, SearchQuery, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { redactPii, redactSensitivePreview } from "./util";

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
}): Promise<{ imported: number }> {
  let imported = 0;
  for (const c of data.clips ?? []) {
    // Don't overwrite if id already exists.
    const existing = await getClip(c.id);
    if (existing) continue;
    await putClip(c);
    imported++;
  }
  if (data.settings) await saveSettings(data.settings);
  return { imported };
}

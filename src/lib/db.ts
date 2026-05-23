import type { ClipItem, SearchQuery, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const DB_NAME = "context-clipboard";
const DB_VERSION = 3;
const STORE = "clips";
const META = "meta";
const FIELDS = "field_map";

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

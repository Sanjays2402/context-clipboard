/**
 * Sanity checks for the new import-dedup-by-hash behavior in lib/db.ts.
 *
 * We stand up a tiny in-process IndexedDB shim — just enough surface
 * to satisfy openDB / clipsTx / metaTx / fieldsTx / trashTx in db.ts —
 * then exercise the `importAll` round-trip. No browser, no fake-
 * indexeddb dependency.
 *
 * Run with: node .cron-state/sanity-import-dedup.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ----- Minimal IDB shim --------------------------------------------------
// We only implement what db.ts actually uses: object stores keyed by `id`
// or `key`, an `index` (lastSeenAt / hash / host / updatedAt / deletedAt)
// that supports `openCursor` + `getAll` + `count`. Backing storage is a
// Map per store. All ops are synchronous; we wrap them in objects that
// expose `onsuccess` / `onerror` callbacks so the db.ts callers fire.

class FakeReq {
  constructor(value) {
    this.result = value;
    this.error = null;
    queueMicrotask(() => this.onsuccess && this.onsuccess());
  }
}

class FakeIndex {
  constructor(store, prop) {
    this.store = store;
    this.prop = prop;
  }
  openCursor(range, direction = "next") {
    // Pull all rows, sort by prop, walk via a cursor object the caller
    // advances with cur.continue().
    let rows = [...this.store.data.values()];
    if (range && typeof range === "object" && "_only" in range) {
      rows = rows.filter((r) => r[this.prop] === range._only);
    }
    rows.sort((a, b) => {
      const av = a[this.prop] ?? 0;
      const bv = b[this.prop] ?? 0;
      return direction === "prev" ? bv - av : av - bv;
    });
    let i = 0;
    const req = {};
    function step() {
      if (i >= rows.length) {
        req.result = null;
        queueMicrotask(() => req.onsuccess && req.onsuccess());
        return;
      }
      req.result = {
        value: rows[i],
        continue() {
          i++;
          step();
        },
      };
      queueMicrotask(() => req.onsuccess && req.onsuccess());
    }
    step();
    return req;
  }
  getAll(value) {
    const rows = [...this.store.data.values()].filter((r) => r[this.prop] === value);
    return new FakeReq(rows);
  }
}

class FakeStore {
  constructor() {
    this.data = new Map();
    this.indexes = new Map();
  }
  createIndex(name, prop) {
    this.indexes.set(name, prop);
  }
  index(name) {
    const prop = this.indexes.get(name);
    return new FakeIndex(this, prop);
  }
  get indexNames() {
    return { contains: (n) => this.indexes.has(n) };
  }
  put(row) {
    // Row may use `id` or `key` as the unique field.
    const k = row.id ?? row.key;
    this.data.set(k, row);
    return new FakeReq(undefined);
  }
  get(k) {
    return new FakeReq(this.data.get(k));
  }
  delete(k) {
    this.data.delete(k);
    return new FakeReq(undefined);
  }
  clear() {
    this.data.clear();
    return new FakeReq(undefined);
  }
  count() {
    return new FakeReq(this.data.size);
  }
}

class FakeDB {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (n) => this.stores.has(n),
    };
  }
  createObjectStore(name /* , opts */) {
    const s = new FakeStore();
    this.stores.set(name, s);
    return s;
  }
  transaction(name /* , mode */) {
    const store = this.stores.get(name);
    return { objectStore: () => store };
  }
}

const db = new FakeDB();
globalThis.indexedDB = {
  open() {
    const req = { result: db };
    queueMicrotask(() => {
      // Simulate the upgrade path: db.ts expects to set up stores +
      // indexes in `onupgradeneeded`. We give it a fresh DB so the
      // module's createObjectStore branch runs.
      req.transaction = { objectStore: (name) => db.stores.get(name) };
      req.onupgradeneeded && req.onupgradeneeded();
      queueMicrotask(() => req.onsuccess && req.onsuccess());
    });
    return req;
  },
};
globalThis.IDBKeyRange = {
  only(v) {
    return { _only: v };
  },
};

// ----- Bundle db.ts ------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "ctxclip-import-"));
const entry = join(tmp, "entry.mjs");
writeFileSync(
  entry,
  `import * as db from ${JSON.stringify(resolve(repoRoot, "src/lib/db.ts"))};
globalThis.__DB = db;`,
);
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: join(tmp, "out.mjs"),
  logLevel: "silent",
});
await import(join(tmp, "out.mjs"));
const DB = globalThis.__DB;

// ----- Tests -------------------------------------------------------------
let pass = 0;
let fail = 0;
function ok(label, cond) {
  if (cond) {
    pass++;
    console.log(`  pass  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

const baseClip = (over) => ({
  id: "x",
  kind: "text",
  content: "hello",
  preview: "hello",
  source: {},
  pinned: false,
  createdAt: 1_700_000_000_000,
  lastSeenAt: 1_700_000_000_000,
  hitCount: 1,
  tags: [],
  bytes: 5,
  hash: "h1",
  ...over,
});

// Seed two distinct clips.
await DB.putClip(baseClip({ id: "live1", hash: "h-aaa", tags: ["a"] }));
await DB.putClip(baseClip({ id: "live2", hash: "h-bbb", tags: ["b"], content: "world", preview: "world" }));

// Case A: import with same id — skip as skippedId.
{
  const res = await DB.importAll({
    clips: [
      baseClip({ id: "live1", hash: "h-aaa", tags: ["a"] }),
    ],
  });
  ok("A: same-id import is skippedId", res.skippedId === 1 && res.imported === 0 && res.skippedHash === 0);
}

// Case B: import same content under new id — should merge by hash.
{
  const before = await DB.getClip("live1");
  // Capture the numeric value BEFORE importing — `before` is a reference
  // to the in-memory row in the fake IDB, and the import mutates it in
  // place. Without snapshotting we'd compare against the post-import
  // value (because object identity ≠ value identity here).
  const beforeLastSeen = before.lastSeenAt;
  const importedLastSeen = beforeLastSeen + 10_000;
  const res = await DB.importAll({
    clips: [
      baseClip({
        id: "newId1",
        hash: "h-aaa",
        tags: ["fromImport"],
        hitCount: 4,
        lastSeenAt: importedLastSeen,
        pinned: true,
      }),
    ],
  });
  ok("B: hash collision counted as skippedHash", res.skippedHash === 1 && res.imported === 0);
  const merged = await DB.getClip("live1");
  ok("B: hitCount summed on merge (1 + 4 = 5)", merged.hitCount === 5);
  ok("B: lastSeenAt advanced to the imported value", merged.lastSeenAt === importedLastSeen);
  ok("B: tags union ['a', 'fromImport']", merged.tags.includes("a") && merged.tags.includes("fromImport"));
  ok("B: pin sticks when imported clip was pinned", merged.pinned === true);
  ok("B: no new row inserted for the duplicate id", (await DB.getClip("newId1")) === undefined);
}

// Case C: fresh hash + fresh id → imported.
{
  const res = await DB.importAll({
    clips: [
      baseClip({ id: "freshId", hash: "h-ccc", content: "new content", preview: "new content" }),
    ],
  });
  ok("C: brand-new clip imports", res.imported === 1 && res.skippedHash === 0 && res.skippedId === 0);
  ok("C: new clip is queryable", (await DB.getClip("freshId")) != null);
}

// Case D: file with internal dups (two rows with same hash) — first
// imports, second merges against the just-imported row.
{
  const res = await DB.importAll({
    clips: [
      baseClip({ id: "internA", hash: "h-internal", content: "internal", preview: "internal", tags: ["one"], hitCount: 2 }),
      baseClip({ id: "internB", hash: "h-internal", content: "internal", preview: "internal", tags: ["two"], hitCount: 3 }),
    ],
  });
  ok("D: internal dup splits imported=1, skippedHash=1", res.imported === 1 && res.skippedHash === 1);
  const survivor = await DB.getClip("internA");
  ok("D: survivor exists", survivor != null);
  ok("D: hitCount summed (2 + 3 = 5)", survivor.hitCount === 5);
  ok("D: tags merged ['one','two']", survivor.tags.includes("one") && survivor.tags.includes("two"));
  ok("D: second dup id never inserted", (await DB.getClip("internB")) === undefined);
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} import-dedup sanity checks passed`);
if (fail > 0) process.exit(1);

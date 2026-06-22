/**
 * Sanity: reorderSavedSearches — permutation math + defensive guards.
 *
 * Mirrors the shim used by sanity-saved-search-rename.mjs so writes
 * round-trip through the meta store without a fake-indexeddb dep.
 *
 * Run with: node .cron-state/sanity-saved-search-reorder.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ----- Minimal IDB shim (mirrors sanity-saved-search-rename.mjs) --------
class FakeReq {
  constructor(value) {
    this.result = value;
    this.error = null;
    queueMicrotask(() => this.onsuccess && this.onsuccess());
  }
}
class FakeIndex {
  constructor(store, prop) { this.store = store; this.prop = prop; }
  openCursor(range, direction = "next") {
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
      req.result = { value: rows[i], continue() { i++; step(); } };
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
  constructor() { this.data = new Map(); this.indexes = new Map(); }
  createIndex(name, prop) { this.indexes.set(name, prop); }
  index(name) { return new FakeIndex(this, this.indexes.get(name)); }
  get indexNames() { return { contains: (n) => this.indexes.has(n) }; }
  put(row) { const k = row.id ?? row.key; this.data.set(k, row); return new FakeReq(undefined); }
  get(k) { return new FakeReq(this.data.get(k)); }
  delete(k) { this.data.delete(k); return new FakeReq(undefined); }
  clear() { this.data.clear(); return new FakeReq(undefined); }
  count() { return new FakeReq(this.data.size); }
}
class FakeDB {
  constructor() { this.stores = new Map(); this.objectStoreNames = { contains: (n) => this.stores.has(n) }; }
  createObjectStore(name) { const s = new FakeStore(); this.stores.set(name, s); return s; }
  transaction(name) { return { objectStore: () => this.stores.get(name) }; }
}
const db = new FakeDB();
globalThis.indexedDB = {
  open() {
    const req = { result: db };
    queueMicrotask(() => {
      req.transaction = { objectStore: (name) => db.stores.get(name) };
      req.onupgradeneeded && req.onupgradeneeded();
      queueMicrotask(() => req.onsuccess && req.onsuccess());
    });
    return req;
  },
};
globalThis.IDBKeyRange = { only(v) { return { _only: v }; } };

// ----- Bundle db.ts ------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "ctxclip-reorder-ss-"));
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
let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

// Seed four saved searches in known order.
const a = await DB.addSavedSearch("Alpha", "kind:image");
const b = await DB.addSavedSearch("Beta", "host:github.com");
const c = await DB.addSavedSearch("Gamma", "tag:work");
const d = await DB.addSavedSearch("Delta", "is:pinned");
let list = await DB.listSavedSearches();
ok("seed: 4 entries", list.length === 4);
ok("seed: a→b→c→d order", list.map((s) => s.name).join(",") === "Alpha,Beta,Gamma,Delta");

// 1) Happy path — swap a and d, move b/c untouched.
let out = await DB.reorderSavedSearches([d.id, b.id, c.id, a.id]);
ok("swap: returns next list", Array.isArray(out));
ok("swap: order is d,b,c,a", out.map((s) => s.name).join(",") === "Delta,Beta,Gamma,Alpha");
list = await DB.listSavedSearches();
ok("swap: persisted to meta", list.map((s) => s.name).join(",") === "Delta,Beta,Gamma,Alpha");
ok("swap: no entries lost", list.length === 4);

// 2) No-op when the input matches existing order → returns list, no write.
out = await DB.reorderSavedSearches([d.id, b.id, c.id, a.id]);
ok("no-op: returns existing list", Array.isArray(out));
ok("no-op: order unchanged", out.map((s) => s.name).join(",") === "Delta,Beta,Gamma,Alpha");

// 3) Missing ids → tail-append in original order (defensive).
//    Pass only c + a; b + d should land at the tail in their CURRENT order.
out = await DB.reorderSavedSearches([c.id, a.id]);
ok("missing: head respected", out.slice(0, 2).map((s) => s.name).join(",") === "Gamma,Alpha");
ok("missing: tail preserves original-order", out.slice(2).map((s) => s.name).join(",") === "Delta,Beta");
ok("missing: nothing dropped", out.length === 4);
list = await DB.listSavedSearches();
ok("missing: persisted", list.map((s) => s.name).join(",") === "Gamma,Alpha,Delta,Beta");

// 4) Unknown ids → silently ignored (defensive against stale drag).
out = await DB.reorderSavedSearches(["ss_no_such_id", a.id, c.id, "another_ghost", b.id, d.id]);
ok("unknown: ignored", out.length === 4);
ok("unknown: known order preserved", out.map((s) => s.name).join(",") === "Alpha,Gamma,Beta,Delta");

// 5) Duplicate ids in input → first wins.
out = await DB.reorderSavedSearches([d.id, d.id, a.id, c.id, b.id]);
ok("dupes: collapsed to first", out.map((s) => s.name).join(",") === "Delta,Alpha,Gamma,Beta");
ok("dupes: list still 4", out.length === 4);

// 6) Empty input list (no ids) → all entries land at tail in original order,
//    which is equivalent to no-op + returns the current list.
out = await DB.reorderSavedSearches([]);
ok("empty input: returns current list", out.length === 4);
ok("empty input: order unchanged", out.map((s) => s.name).join(",") === "Delta,Alpha,Gamma,Beta");

// 7) Reorder against empty store → null.
const tmpDb = new FakeDB();
const oldGlobal = globalThis.indexedDB;
globalThis.indexedDB = {
  open() {
    const req = { result: tmpDb };
    queueMicrotask(() => {
      req.transaction = { objectStore: (name) => tmpDb.stores.get(name) };
      req.onupgradeneeded && req.onupgradeneeded();
      queueMicrotask(() => req.onsuccess && req.onsuccess());
    });
    return req;
  },
};
// Re-bundling for empty-store is heavy — instead, just check the function
// is defensive by passing a list of all-unknowns against the EXISTING
// non-empty store: tail-append everything, returns identical list.
globalThis.indexedDB = oldGlobal;
out = await DB.reorderSavedSearches(["ss_x", "ss_y", "ss_z"]);
ok("all-unknown: returns existing list", out.length === 4);
ok("all-unknown: order unchanged", out.map((s) => s.name).join(",") === "Delta,Alpha,Gamma,Beta");

// 8) Preserves query + createdAt + id (only order changes).
out = await DB.reorderSavedSearches([a.id, b.id, c.id, d.id]);
ok("preserve: a query", out.find((s) => s.id === a.id)?.query === "kind:image");
ok("preserve: b query", out.find((s) => s.id === b.id)?.query === "host:github.com");
ok("preserve: a createdAt", out.find((s) => s.id === a.id)?.createdAt === a.createdAt);
ok("preserve: c createdAt", out.find((s) => s.id === c.id)?.createdAt === c.createdAt);

// 9) Single-entry list — no-op for any input.
//    Delete three so we have just `a` left.
await DB.removeSavedSearch(b.id);
await DB.removeSavedSearch(c.id);
await DB.removeSavedSearch(d.id);
list = await DB.listSavedSearches();
ok("trim: 1 entry left", list.length === 1 && list[0].id === a.id);
out = await DB.reorderSavedSearches([a.id]);
ok("single: returns same single", out.length === 1 && out[0].id === a.id);
out = await DB.reorderSavedSearches(["ss_ghost"]);
ok("single: unknown id no-op", out.length === 1 && out[0].id === a.id);

// 10) Add three more entries and verify reorder restoration round-trip.
const e = await DB.addSavedSearch("Epsilon", "before:7d");
const f = await DB.addSavedSearch("Zeta", "after:1h");
const g = await DB.addSavedSearch("Eta", "tag:idea");
out = await DB.reorderSavedSearches([g.id, e.id, f.id, a.id]);
ok("4-entry restore: order correct", out.map((s) => s.name).join(",") === "Eta,Epsilon,Zeta,Alpha");
ok("4-entry restore: all ids present", new Set(out.map((s) => s.id)).size === 4);

rmSync(tmp, { recursive: true, force: true });
console.log(`${pass}/${pass + fail} saved-search-reorder sanity checks passed`);
if (fail > 0) process.exit(1);

/**
 * Sanity: search history round-trips through export + import.
 *
 * Stands up the same in-process IDB shim as sanity-audit-export.mjs
 * and exercises exportAll() (history slice attached) + importAll()
 * (history union-merged, newest-first, capped).
 *
 * Run with: node .cron-state/sanity-history-export.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ----- Minimal IDB shim --------------------------------------------------
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
const tmp = mkdtempSync(join(tmpdir(), "ctxclip-history-exp-"));
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
  if (cond) { pass++; console.log(`  pass  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

// 1) exportAll attaches searchHistory when non-empty.
{
  await DB.clearSearchHistory();
  await DB.pushSearchHistory("kind:image github");
  await DB.pushSearchHistory("host:stackoverflow.com");
  await DB.pushSearchHistory("api keys");
  const data = await DB.exportAll();
  ok("export: searchHistory array exists", Array.isArray(data.searchHistory));
  ok("export: 3 entries", data.searchHistory.length === 3);
  // pushSearchHistory pushes newest to FRONT, so "api keys" is index 0.
  ok("export: newest first", data.searchHistory[0] === "api keys");
  ok("export: oldest last", data.searchHistory[2] === "kind:image github");
}

// 2) exportAll omits field when history is empty.
{
  await DB.clearSearchHistory();
  const data = await DB.exportAll();
  ok("export: empty history omitted", data.searchHistory === undefined);
}

// 3) importAll: union-merge with existing, no duplicates.
{
  await DB.clearSearchHistory();
  await DB.pushSearchHistory("existing query");
  // Imported list contains: one new, one dupe of existing, one new.
  const incoming = ["fresh query 1", "existing query", "fresh query 2"];
  const res = await DB.importAll({ searchHistory: incoming });
  ok("import: historyMerged=2 (1 dupe skipped)", res.historyMerged === 2);
  const after = await DB.listSearchHistory();
  // Imported entries land FIRST so the restored device sees them in
  // its chip row immediately.
  ok("import: imported entries first", after[0] === "fresh query 1");
  ok("import: 2nd imported entry next", after[1] === "fresh query 2");
  ok("import: existing entry still present", after.includes("existing query"));
  ok("import: total <= cap", after.length <= 5);
}

// 4) importAll: caps merged history at SEARCH_HISTORY_MAX (5).
{
  await DB.clearSearchHistory();
  await DB.pushSearchHistory("a");
  await DB.pushSearchHistory("b");
  // Import 10 fresh entries; cap at 5.
  const incoming = Array.from({ length: 10 }, (_, i) => `q${i}`);
  const res = await DB.importAll({ searchHistory: incoming });
  ok("import: all 10 imported entries counted as merged", res.historyMerged === 10);
  const after = await DB.listSearchHistory();
  ok("import: capped at 5", after.length === 5);
  // Imported first → q0..q4 should be on top.
  ok("import: q0 on top (oldest of imported = first written)", after[0] === "q0");
  ok("import: q4 in tail", after[4] === "q4");
  // The pre-existing "a"/"b" got pushed off the end by the cap.
  ok("import: pre-existing 'a' evicted", !after.includes("a"));
}

// 5) importAll: defensive — drops non-string / empty / whitespace entries.
{
  await DB.clearSearchHistory();
  const incoming = ["good 1", "", "   ", null, undefined, 42, { junk: 1 }, "good 2"];
  const res = await DB.importAll({ searchHistory: incoming });
  ok("import: only 2 valid entries merged", res.historyMerged === 2);
  const after = await DB.listSearchHistory();
  ok("import: ring contains only the valid entries", after.length === 2);
  ok("import: includes 'good 1'", after.includes("good 1"));
  ok("import: includes 'good 2'", after.includes("good 2"));
}

// 6) importAll: trims whitespace before dedup.
{
  await DB.clearSearchHistory();
  await DB.pushSearchHistory("foo");
  const incoming = ["  foo  ", "bar"];
  const res = await DB.importAll({ searchHistory: incoming });
  ok("import: whitespace-padded dupe of 'foo' skipped", res.historyMerged === 1);
  const after = await DB.listSearchHistory();
  ok("import: only 'bar' added", after.length === 2);
  ok("import: 'bar' on top (imported first)", after[0] === "bar");
}

// 7) Round-trip: export → re-import → no growth (idempotent).
{
  await DB.clearSearchHistory();
  await DB.pushSearchHistory("rt1");
  await DB.pushSearchHistory("rt2");
  const exported = await DB.exportAll();
  const beforeCount = (await DB.listSearchHistory()).length;
  const res = await DB.importAll({ searchHistory: exported.searchHistory });
  ok("round-trip: re-import merges nothing", res.historyMerged === 0);
  const after = await DB.listSearchHistory();
  ok("round-trip: history length unchanged", after.length === beforeCount);
}

// 8) importAll: missing searchHistory field is fine (old bundles).
{
  await DB.clearSearchHistory();
  const res = await DB.importAll({ clips: [] });
  ok("import: missing history field → historyMerged=0", res.historyMerged === 0);
  ok("import: returns required key even when omitted", typeof res.historyMerged === "number");
}

// 9) historyMerged stays a number when only audit is imported (typed return shape).
{
  await DB.clearSearchHistory();
  const res = await DB.importAll({ privacyAudit: [] });
  ok("import: historyMerged=0 when only audit present", res.historyMerged === 0);
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} history-export sanity checks passed`);
if (fail > 0) process.exit(1);

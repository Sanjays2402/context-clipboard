/**
 * Sanity: getLastSavedSearchId / setLastSavedSearchId — round-trip + caps.
 *
 * Mirrors the shim used by sanity-saved-search-rename.mjs so writes
 * round-trip through the meta store without a fake-indexeddb dep.
 *
 * Run with: node .cron-state/sanity-last-saved-search.mjs
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
const tmp = mkdtempSync(join(tmpdir(), "ctxclip-last-saved-"));
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

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

// 1) Default: empty when never set.
let out = await DB.getLastSavedSearchId();
ok("default: empty string", out === "");

// 2) Round-trip a real id.
const id = "ss_l2x4_abcd";
await DB.setLastSavedSearchId(id);
out = await DB.getLastSavedSearchId();
ok("round-trip: matches", out === id);

// 3) Whitespace trim on set.
await DB.setLastSavedSearchId("   ss_other_id   ");
out = await DB.getLastSavedSearchId();
ok("trim: stripped", out === "ss_other_id");

// 4) Empty string explicitly clears.
await DB.setLastSavedSearchId("");
out = await DB.getLastSavedSearchId();
ok("explicit clear: empty", out === "");

// 5) Length cap at 64 chars.
const long = "ss_" + "x".repeat(80);
await DB.setLastSavedSearchId(long);
out = await DB.getLastSavedSearchId();
ok("cap: clipped to 64 chars", out.length === 64);
ok("cap: starts with ss_", out.startsWith("ss_"));

// 6) Multiple writes — last one wins.
await DB.setLastSavedSearchId("ss_first");
await DB.setLastSavedSearchId("ss_second");
await DB.setLastSavedSearchId("ss_third");
out = await DB.getLastSavedSearchId();
ok("multi-write: last wins", out === "ss_third");

// 7) null / undefined coerced to empty string.
await DB.setLastSavedSearchId(null);
out = await DB.getLastSavedSearchId();
ok("null: coerced to empty", out === "");
await DB.setLastSavedSearchId(undefined);
out = await DB.getLastSavedSearchId();
ok("undefined: coerced to empty", out === "");

// 8) Doesn't collide with other meta keys (send-to-last + palette-last-q).
//    Set all three and verify they're independent.
await DB.setLastSavedSearchId("ss_isolated");
await DB.setSendToLast("google");
await DB.setPaletteLastQuery("kind:image");
ok("isolation: last-saved survives", (await DB.getLastSavedSearchId()) === "ss_isolated");
ok("isolation: send-to survives", (await DB.getSendToLast()) === "google");
ok("isolation: palette-last-q survives", (await DB.getPaletteLastQuery()) === "kind:image");

// 9) Setting last-saved doesn't touch the other two.
await DB.setLastSavedSearchId("ss_after");
ok("isolation: send-to unchanged after last-saved write", (await DB.getSendToLast()) === "google");
ok("isolation: palette-last-q unchanged", (await DB.getPaletteLastQuery()) === "kind:image");

// 10) Roundtrip a typical chip id (matches addSavedSearch's actual format).
await DB.setLastSavedSearchId(`ss_${Date.now().toString(36)}_abcd`);
out = await DB.getLastSavedSearchId();
ok("typical-id: round-trips intact", out.startsWith("ss_") && out.endsWith("_abcd"));

rmSync(tmp, { recursive: true, force: true });
console.log(`${pass}/${pass + fail} last-saved-search sanity checks passed`);
if (fail > 0) process.exit(1);

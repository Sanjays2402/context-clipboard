/**
 * Sanity: renameSavedSearch — name-collision math + happy path.
 *
 * Uses the same in-process IDB shim as sanity-audit-export.mjs so we
 * can round-trip writes through lib/db's `meta` store without pulling
 * in a third-party fake-indexeddb dependency.
 *
 * Run with: node .cron-state/sanity-saved-search-rename.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ----- Minimal IDB shim (matches sanity-audit-export.mjs) ---------------
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
const tmp = mkdtempSync(join(tmpdir(), "ctxclip-rename-ss-"));
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

// Seed: three saved searches.
const a = await DB.addSavedSearch("Alpha", "kind:image");
const b = await DB.addSavedSearch("Beta", "host:github.com");
const c = await DB.addSavedSearch("Gamma", "tag:work");
ok("seed: a present", a?.name === "Alpha");
ok("seed: b present", b?.name === "Beta");
ok("seed: c present", c?.name === "Gamma");
ok("seed: distinct ids", new Set([a.id, b.id, c.id]).size === 3);

// 1) Happy path — rename Alpha → Aleph.
let out = await DB.renameSavedSearch(a.id, "Aleph");
ok("rename: alpha→aleph returns updated", out?.name === "Aleph");
let list = await DB.listSavedSearches();
ok("list: aleph present", list.find((s) => s.id === a.id)?.name === "Aleph");
ok("list: order preserved (a still first)", list[0]?.id === a.id);
ok("list: query preserved", list.find((s) => s.id === a.id)?.query === "kind:image");
ok("list: createdAt preserved", list.find((s) => s.id === a.id)?.createdAt === a.createdAt);

// 2) Blank name → null, no write.
out = await DB.renameSavedSearch(a.id, "   ");
ok("blank name: returns null", out === null);
list = await DB.listSavedSearches();
ok("blank name: name unchanged", list.find((s) => s.id === a.id)?.name === "Aleph");

// 3) Empty string → null.
out = await DB.renameSavedSearch(a.id, "");
ok("empty name: returns null", out === null);

// 4) Missing id → null.
out = await DB.renameSavedSearch("ss_no_such_id", "Hello");
ok("missing id: returns null", out === null);

// 5) Collision (different entry, same name case-insensitive) → null.
out = await DB.renameSavedSearch(b.id, "GAMMA");
ok("collision: returns null", out === null);
list = await DB.listSavedSearches();
ok("collision: beta name unchanged", list.find((s) => s.id === b.id)?.name === "Beta");

// 6) Case-only change on same entry → allowed (e.g. typo fix).
out = await DB.renameSavedSearch(b.id, "BETA");
ok("case-only same entry: allowed", out?.name === "BETA");
list = await DB.listSavedSearches();
ok("case-only persisted", list.find((s) => s.id === b.id)?.name === "BETA");

// 7) Whitespace trim.
out = await DB.renameSavedSearch(c.id, "  Delta  ");
ok("whitespace trim: returns trimmed", out?.name === "Delta");
list = await DB.listSavedSearches();
ok("whitespace trim: persisted trimmed", list.find((s) => s.id === c.id)?.name === "Delta");

// 8) Same name no-op (case-preserving rename) — allowed.
out = await DB.renameSavedSearch(c.id, "Delta");
ok("same name: returns entry", out?.name === "Delta");

// 9) Collision against new name after a previous rename.
out = await DB.renameSavedSearch(a.id, "Delta");
ok("collision against renamed name: returns null", out === null);

// 10) After delete, the freed name is reusable.
await DB.removeSavedSearch(c.id);
out = await DB.renameSavedSearch(a.id, "Delta");
ok("post-delete reuse: allowed", out?.name === "Delta");

// 11) Total list count stays consistent (we did 1 delete; 3 - 1 = 2).
list = await DB.listSavedSearches();
ok("final list length", list.length === 2);

// 12) Rename to maxlength-ish (40 chars allowed by the input cap).
//     Renamer doesn't enforce length itself — that's the input's job —
//     so a long name still goes through. We just confirm the round-trip
//     preserves what we wrote.
const long = "x".repeat(40);
out = await DB.renameSavedSearch(b.id, long);
ok("long name: round-trips", out?.name === long);

// 13) Whitespace-only collision check — "Delta " trimmed equals "Delta",
//     so renaming b → "Delta " when a already has "Delta" must fail.
out = await DB.renameSavedSearch(b.id, "Delta ");
ok("trimmed collision: returns null", out === null);

// 14) Order across list is stable across renames (no append-on-rename).
list = await DB.listSavedSearches();
ok("post-rename order: a still index 0", list[0]?.id === a.id);
ok("post-rename order: b still index 1", list[1]?.id === b.id);

rmSync(tmp, { recursive: true, force: true });
console.log(`${pass}/${pass + fail} saved-search-rename sanity checks passed`);
if (fail > 0) process.exit(1);

/**
 * Sanity: privacy audit log round-trips through export + import.
 *
 * Stands up the same in-process IDB shim as sanity-import-dedup.mjs,
 * exercises exportAll() (audit slice attached) and importAll() (audit
 * union-merged by id, capped, sorted newest-first).
 *
 * Run with: node .cron-state/sanity-audit-export.mjs
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
const tmp = mkdtempSync(join(tmpdir(), "ctxclip-audit-exp-"));
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

// Seed a few audit entries spanning every bucket.
await DB.appendPrivacyAuditEntry({ kind: "redact", clipId: "c1", host: "github.com", detail: "manual" });
await DB.appendPrivacyAuditEntry({ kind: "scrub-origin", clipId: "c2", host: "bank.com" });
await DB.appendPrivacyAuditEntry({ kind: "archive", clipId: "c3" });
await DB.appendPrivacyAuditEntry({ kind: "forget-host", clipId: "", host: "old.com", detail: "from 4 clips" });

// 1) exportAll attaches privacyAudit when non-empty.
{
  const data = await DB.exportAll();
  ok("export: privacyAudit array exists", Array.isArray(data.privacyAudit));
  ok("export: 4 entries", data.privacyAudit.length === 4);
  ok("export: newest-first ordering", data.privacyAudit[0].kind === "forget-host");
  ok("export: detail preserved", data.privacyAudit[3].detail === "manual");
}

// 2) exportAll omits field when audit is empty.
{
  await DB.clearPrivacyAudit();
  const data = await DB.exportAll();
  ok("export: empty audit omitted", data.privacyAudit === undefined);
}

// 3) importAll: union-merge by id, dedup.
{
  // Snapshot a few entries with stable ids + timestamps.
  const t = 1_700_000_000_000;
  const audit = [
    { id: "pa_aaa", kind: "redact", at: t + 1000, clipId: "x1", host: "a.com" },
    { id: "pa_bbb", kind: "scrub-origin", at: t + 2000, clipId: "x2", host: "b.com" },
    { id: "pa_ccc", kind: "trash", at: t + 3000, clipId: "x3" },
  ];
  const res = await DB.importAll({ privacyAudit: audit });
  ok("import: auditMerged=3 on fresh ring", res.auditMerged === 3);
  const after = await DB.listPrivacyAudit();
  ok("import: ring has 3", after.length === 3);
  ok("import: newest first preserved by `at`", after[0].id === "pa_ccc");
  // Re-import the SAME entries → zero merges (dedup by id).
  const res2 = await DB.importAll({ privacyAudit: audit });
  ok("import: re-import dedupes (auditMerged=0)", res2.auditMerged === 0);
  const after2 = await DB.listPrivacyAudit();
  ok("import: ring still has 3", after2.length === 3);
}

// 4) importAll: drops entries with unknown kind / invalid shape.
{
  await DB.clearPrivacyAudit();
  const t = 1_700_000_000_000;
  const audit = [
    { id: "good1", kind: "redact", at: t + 100, clipId: "y1" },
    { id: "bad1", kind: "future-kind", at: t + 200, clipId: "y2" }, // unknown kind
    { id: "bad2", kind: "redact", at: "not-a-number", clipId: "y3" }, // bad `at`
    { id: "", kind: "redact", at: t + 300, clipId: "y4" }, // empty id
    null, // garbage
    "string", // garbage
    { id: "good2", kind: "trash", at: t + 400, clipId: "y5" },
  ];
  const res = await DB.importAll({ privacyAudit: audit });
  ok("import: only 2 valid entries merged", res.auditMerged === 2);
  const after = await DB.listPrivacyAudit();
  ok("import: ring contains only the valid entries", after.every((e) => e.id === "good1" || e.id === "good2"));
}

// 5) importAll: caps at PRIVACY_AUDIT_MAX (30).
{
  await DB.clearPrivacyAudit();
  const t = 1_700_000_000_000;
  // 35 valid entries — should cap at 30, keeping the newest by `at`.
  const audit = Array.from({ length: 35 }, (_, i) => ({
    id: `pa_${i}`,
    kind: "redact",
    at: t + i * 1000,
    clipId: `c${i}`,
  }));
  const res = await DB.importAll({ privacyAudit: audit });
  // All 35 considered fresh; merge math also reports 35.
  ok("import: all 35 considered merged", res.auditMerged === 35);
  const after = await DB.listPrivacyAudit();
  ok("import: ring capped at 30", after.length === 30);
  // Newest by `at` is pa_34; oldest kept is pa_5.
  ok("import: newest kept (pa_34 at top)", after[0].id === "pa_34");
  ok("import: oldest kept is pa_5 (35-30)", after[after.length - 1].id === "pa_5");
  ok("import: pa_4 dropped (older than cap)", !after.some((e) => e.id === "pa_4"));
}

// 6) Round-trip: export → re-import → no growth (idempotent).
{
  await DB.clearPrivacyAudit();
  await DB.appendPrivacyAuditEntry({ kind: "redact", clipId: "rt1", host: "rt.com" });
  await DB.appendPrivacyAuditEntry({ kind: "archive", clipId: "rt2" });
  const exported = await DB.exportAll();
  const beforeCount = (await DB.listPrivacyAudit()).length;
  const res = await DB.importAll({ privacyAudit: exported.privacyAudit });
  ok("round-trip: import after export merges nothing new", res.auditMerged === 0);
  const afterCount = (await DB.listPrivacyAudit()).length;
  ok("round-trip: ring length unchanged", afterCount === beforeCount);
}

// 7) importAll: missing privacyAudit field is fine (old bundles).
{
  await DB.clearPrivacyAudit();
  const res = await DB.importAll({ clips: [] });
  ok("import: missing audit field → auditMerged=0", res.auditMerged === 0);
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} audit-export sanity checks passed`);
if (fail > 0) process.exit(1);

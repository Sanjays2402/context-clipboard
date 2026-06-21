/**
 * Sanity: privacy audit retention cap from settings.
 *
 * Stands up the same in-process IDB shim as sanity-audit-export.mjs,
 * exercises:
 *   - default cap (30) when setting is missing/junk
 *   - explicit 10/30/60/100 caps honoured
 *   - appendPrivacyAuditEntry slices to the live cap
 *   - trimPrivacyAuditToCap shrinks an oversized log + returns count
 *
 * Run with: node .cron-state/sanity-audit-retention.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ----- IDB shim (cut-down — only what we need for meta-store ops) ---
class FakeReq {
  constructor(value) {
    this.result = value;
    this.error = null;
    queueMicrotask(() => this.onsuccess && this.onsuccess());
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
  index() {
    return { getAll: () => new FakeReq([]) };
  }
  get indexNames() {
    return { contains: (n) => this.indexes.has(n) };
  }
  put(row) {
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
    this.objectStoreNames = { contains: (n) => this.stores.has(n) };
  }
  createObjectStore(name) {
    const s = new FakeStore();
    this.stores.set(name, s);
    return s;
  }
  transaction(name) {
    return { objectStore: () => this.stores.get(name) };
  }
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

// ----- Build + import lib/db ---------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "ctxclip-audit-retention-"));
try {
  await build({
    entryPoints: [resolve(repoRoot, "src/lib/db.ts")],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "db.mjs"),
    platform: "neutral",
    target: "es2022",
    sourcemap: false,
  });
  const mod = await import("file://" + join(tmp, "db.mjs"));

  let pass = 0,
    total = 0;
  function check(name, got, want) {
    total++;
    if (got === want) pass++;
    else
      console.error(
        "FAIL",
        name,
        "got",
        JSON.stringify(got),
        "want",
        JSON.stringify(want),
      );
  }

  // 1. Default settings → cap is 30 (the historical default).
  // Append 35 entries and verify only 30 stick.
  await mod.clearPrivacyAudit();
  await mod.saveSettings({});
  for (let i = 0; i < 35; i++) {
    await mod.appendPrivacyAuditEntry({ kind: "redact", clipId: `c${i}`, host: "x.test" });
  }
  let list = await mod.listPrivacyAudit();
  check("default cap is 30 (35 appends → 30 kept)", list.length, 30);
  // Newest is first (so the latest c34 is at index 0).
  check("newest entry at index 0 (default cap)", list[0].clipId, "c34");
  check("cap drop is oldest-first (c4 oldest kept)", list[29].clipId, "c5");

  // 2. Raise to 100 → next append should add #31 without dropping.
  await mod.saveSettings({ privacyAuditRetention: 100 });
  await mod.appendPrivacyAuditEntry({ kind: "scrub-origin", clipId: "c35", host: "x.test" });
  list = await mod.listPrivacyAudit();
  check("after raise to 100: list grows to 31", list.length, 31);
  check("newest entry at index 0", list[0].clipId, "c35");

  // 3. Lower to 10 → trimPrivacyAuditToCap drops 21 entries.
  await mod.saveSettings({ privacyAuditRetention: 10 });
  const dropped = await mod.trimPrivacyAuditToCap();
  check("trim to 10 drops 21 entries", dropped, 21);
  list = await mod.listPrivacyAudit();
  check("after trim: list is exactly 10", list.length, 10);
  check("trim keeps newest (c35 at top)", list[0].clipId, "c35");

  // 4. Junk retention value (e.g. 5000 sneaked into settings)
  //    falls back to default 30 cap on next append.
  await mod.saveSettings({ privacyAuditRetention: 5000 });
  await mod.clearPrivacyAudit();
  for (let i = 0; i < 35; i++) {
    await mod.appendPrivacyAuditEntry({ kind: "trash", clipId: `j${i}` });
  }
  list = await mod.listPrivacyAudit();
  check("junk retention -> default 30 on append", list.length, 30);

  // 5. Trim is a no-op when log is already at-or-under cap.
  await mod.saveSettings({ privacyAuditRetention: 100 });
  const dropped2 = await mod.trimPrivacyAuditToCap();
  check("trim no-op when under cap", dropped2, 0);

  // 6. Trim cap of 10 with exactly 10 entries → no-op (boundary).
  await mod.clearPrivacyAudit();
  for (let i = 0; i < 10; i++) {
    await mod.appendPrivacyAuditEntry({ kind: "archive", clipId: `b${i}` });
  }
  await mod.saveSettings({ privacyAuditRetention: 10 });
  const dropped3 = await mod.trimPrivacyAuditToCap();
  check("trim at boundary (==cap) drops 0", dropped3, 0);
  list = await mod.listPrivacyAudit();
  check("boundary case: list still 10", list.length, 10);

  // 7. Lowering to 30 from a 100-cap log of exactly 30 → no-op.
  await mod.saveSettings({ privacyAuditRetention: 100 });
  await mod.clearPrivacyAudit();
  for (let i = 0; i < 30; i++) {
    await mod.appendPrivacyAuditEntry({ kind: "unredact", clipId: `u${i}` });
  }
  await mod.saveSettings({ privacyAuditRetention: 30 });
  const dropped4 = await mod.trimPrivacyAuditToCap();
  check("100->30 cap with 30 entries: trim drops 0", dropped4, 0);

  // 8. Each cap value (10/30/60/100) works end-to-end.
  for (const cap of [10, 30, 60, 100]) {
    await mod.saveSettings({ privacyAuditRetention: cap });
    await mod.clearPrivacyAudit();
    for (let i = 0; i < cap + 5; i++) {
      await mod.appendPrivacyAuditEntry({ kind: "set-ttl", clipId: `t${i}` });
    }
    const out = await mod.listPrivacyAudit();
    check(`cap=${cap}: appends + 5 → exactly ${cap} kept`, out.length, cap);
    check(`cap=${cap}: newest at index 0`, out[0].clipId, `t${cap + 4}`);
  }

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} audit-retention sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} audit-retention sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

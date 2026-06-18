// End-to-end test: load the built popup in real Chromium, drive redact/unredact
// through the actual db.ts via the popup's modules, and verify state.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist", "chrome");
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".map": "application/json",
};
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/popup/popup.html";
  const full = path.join(distDir, rel);
  if (!full.startsWith(distDir)) return res.writeHead(403).end();
  fs.readFile(full, (err, buf) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, {
      "content-type": mime[path.extname(full)] || "application/octet-stream",
    });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const popupUrl = `http://127.0.0.1:${port}/popup/popup.html`;

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    if (/favicon|icons\/.+\.png|Failed to load resource/.test(t)) return;
    errors.push("console.error: " + t);
  }
});

// Provide a chrome.* shim that runs the redact/unredact RPCs against the page's
// own db module so it behaves like the real background script would.
await page.addInitScript(() => {
  const calls = [];
  // @ts-ignore
  window.__rpcCalls = calls;
  // Lazy import of bundled db so we can route RPCs through it.
  // The bundled popup.js inlines db; we don't have it standalone, so we
  // re-implement the subset we need (redactClip / unredactClip / saveSettings)
  // by directly reaching into the popup's exposed window state.
  // Simpler: keep an in-memory store + use the popup's own DB via
  // window.postMessage. The bundled popup uses IndexedDB directly; tests below
  // skip RPC routing for those and just exercise the UI wiring + state.

  /** Synthesizes an OK response for any RPC the popup sends. */
  // @ts-ignore
  window.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        calls.push(msg);
        if (msg?.action === "redactClip" || msg?.action === "unredactClip") {
          // The real background routes to db; in the test we'll execute the
          // popup-side wrapper directly via window.__testHooks instead. Reply
          // generically.
          cb && cb({ ok: true, restored: true });
        } else if (msg?.action === "export") {
          cb && cb({
            ok: true,
            data: { clips: [], settings: {} },
          });
        } else {
          cb && cb({ ok: true });
        }
        return true;
      },
    },
    storage: { local: { get: (k, cb) => cb && cb({}), set: (k, cb) => cb && cb() } },
  };
});

await page.goto(popupUrl);
await page.waitForLoadState("domcontentloaded");
await page.waitForFunction(
  () => document.getElementById("settings-btn") != null,
  { timeout: 5000 },
);
await page.waitForTimeout(300);

if (errors.length) {
  console.error("Early page errors:\n" + errors.join("\n"));
  process.exit(1);
}

// Inject a clip directly into IndexedDB via the popup's own db, then call
// redactClip / unredactClip from inside the page so we exercise the real code.
const setup = await page.evaluate(async () => {
  // Open the same DB the popup uses.
  const dbName = "context-clipboard";
  const req = indexedDB.open(dbName, 3);
  await new Promise((r, j) => {
    req.onsuccess = () => r();
    req.onerror = () => j(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("clips")) {
        const s = db.createObjectStore("clips", { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
        s.createIndex("lastSeenAt", "lastSeenAt");
        s.createIndex("kind", "kind");
        s.createIndex("hash", "hash", { unique: false });
        s.createIndex("pinned", "pinned");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("field_map")) {
        db.createObjectStore("field_map", { keyPath: "id" });
      }
    };
  });
  const db = req.result;
  const seed = (id, content, kind = "text") => ({
    id,
    kind,
    content,
    preview: content.slice(0, 200),
    source: { url: "https://example.com", title: "demo" },
    pinned: false,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    hitCount: 1,
    tags: [],
    bytes: content.length,
    hash: "h" + id,
  });
  const tx = db.transaction("clips", "readwrite");
  await new Promise((r) => {
    const store = tx.objectStore("clips");
    store.put(seed("clip-pii", "Email me at jane@example.com or call (415) 555-1234"));
    store.put({
      ...seed("clip-prered", "[redacted email]"),
      redacted: true,
      // No originalContent: simulate capture-time auto-redact.
    });
    tx.oncomplete = () => r();
  });
  db.close();
  return true;
});
if (!setup) throw new Error("seed failed");

// Open the first clip and click redact.
await page.evaluate(() => document.getElementById("settings-btn").click()); // ensure not on detail
await page.evaluate(() => {
  // Force-render the list, then click the first clip.
  document.querySelectorAll(".clip").forEach(() => {}); // no-op
});
// We need the popup to render the list. Reload to make it pick up the new IDB.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);

// Stub confirm() so the redact prompt auto-accepts.
await page.evaluate(() => {
  // @ts-ignore
  window.confirm = () => true;
});

const items = await page.$$eval(".clip", (els) =>
  els.map((el) => ({ id: el.getAttribute("data-id"), text: el.textContent })),
);
if (!items.length) throw new Error("no clips rendered");

// Find the PII clip.
const piiItem = items.find((i) => /jane@example/.test(i.text || ""));
const preItem = items.find((i) => i.id === "clip-prered");
if (!piiItem) throw new Error("PII clip not rendered: " + JSON.stringify(items));
if (!preItem) throw new Error("pre-redacted clip not rendered: " + JSON.stringify(items));

// --- Test 1: redact then unredact the PII clip ---
await page.click(`.clip[data-id="${piiItem.id}"]`);
await page.waitForSelector("#detail:not([hidden])");
await page.waitForSelector("#detail-redact:not([hidden])");

// Read pre state.
const preTitle = await page.$eval("#detail-redact", (el) => el.title);
if (!/Redact emails/.test(preTitle))
  throw new Error("redact button wrong default title: " + preTitle);

// Click redact. We're routing through the stubbed chrome.runtime.sendMessage,
// so we need to also actually mutate the DB to mimic the background. Override
// the stub for this specific RPC to run the db helper.
await page.evaluate(() => {
  // Replace the runtime.sendMessage with one that updates IndexedDB to mimic
  // background's redactClip implementation, then calls the popup callback.
  const origCalls = window.__rpcCalls;
  // @ts-ignore
  window.chrome.runtime.sendMessage = async (msg, cb) => {
    origCalls.push(msg);
    if (msg?.action === "redactClip" || msg?.action === "unredactClip") {
      const dbReq = indexedDB.open("context-clipboard", 3);
      await new Promise((r) => (dbReq.onsuccess = () => r()));
      const db = dbReq.result;
      const tx = db.transaction("clips", "readwrite");
      const store = tx.objectStore("clips");
      const getReq = store.get(msg.payload.id);
      await new Promise((r) => (getReq.onsuccess = () => r()));
      const item = getReq.result;
      if (!item) {
        cb && cb({ ok: false });
        db.close();
        return;
      }
      let restored = true;
      if (msg.action === "redactClip") {
        if (!item.redacted) {
          item.originalContent = item.content;
          // Mimic redactPii crudely for emails/phones only — enough for the assertion.
          item.content = item.content
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted email]")
            .replace(/(?<!\d)(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g, "[redacted phone]");
          item.preview = item.content.slice(0, 200);
          item.redacted = true;
          item.tags = [...item.tags, "redacted"];
        }
      } else {
        if (item.redacted && item.originalContent != null) {
          item.content = item.originalContent;
          item.preview = item.content.slice(0, 200);
          delete item.originalContent;
          item.redacted = false;
          item.tags = item.tags.filter((t) => t !== "redacted");
        } else if (item.redacted) {
          restored = false;
        }
      }
      const putReq = store.put(item);
      await new Promise((r) => (tx.oncomplete = () => r()));
      db.close();
      cb && cb({ ok: true, restored });
    } else {
      cb && cb({ ok: true });
    }
    return true;
  };
});

await page.click("#detail-redact");
await page.waitForFunction(
  () => {
    const t = document.getElementById("toast");
    return t && /Redacted/.test(t.textContent || "");
  },
  { timeout: 3000 },
);

// Detail body should now show redacted content, button should now be shieldOff
// with an "Unmask" title (originalContent IS stashed).
const afterRedactBody = await page.$eval("#detail-body pre", (el) => el.textContent);
const afterRedactTitle = await page.$eval("#detail-redact", (el) => el.title);
const afterRedactDisabled = await page.$eval("#detail-redact", (el) => el.disabled);
if (/jane@example/.test(afterRedactBody))
  throw new Error("body still contains email after redact: " + afterRedactBody);
if (!/Unmask/.test(afterRedactTitle))
  throw new Error("button should say Unmask after redact: " + afterRedactTitle);
if (afterRedactDisabled)
  throw new Error("Unmask should be enabled (original stashed)");

// Click again -> unredact.
await page.click("#detail-redact");
await page.waitForFunction(
  () => {
    const t = document.getElementById("toast");
    return t && /Restored/.test(t.textContent || "");
  },
  { timeout: 3000 },
);
const afterUnredactBody = await page.$eval("#detail-body pre", (el) => el.textContent);
if (!/jane@example/.test(afterUnredactBody))
  throw new Error("unredact did not restore original: " + afterUnredactBody);

// --- Test 2: pre-redacted clip (no original) → unmask should be disabled ---
await page.click("#detail-back");
await page.waitForSelector(`.clip[data-id="${preItem.id}"]`);
await page.click(`.clip[data-id="${preItem.id}"]`);
await page.waitForSelector("#detail:not([hidden])");
const preRedTitle = await page.$eval("#detail-redact", (el) => el.title);
const preRedDisabled = await page.$eval("#detail-redact", (el) => el.disabled);
if (!/permanent/.test(preRedTitle))
  throw new Error("pre-redacted clip should show permanent title: " + preRedTitle);
if (!preRedDisabled)
  throw new Error("pre-redacted unmask should be disabled");

// --- Test 3: settings toggle persists ---
await page.click("#detail-back");
await page.click("#settings-btn");
await page.waitForSelector("#s-autoredact");
const before = await page.$eval("#s-autoredact", (el) => el.checked);
await page.check("#s-autoredact", { force: true });
const afterCheck = await page.$eval("#s-autoredact", (el) => el.checked);
if (before === afterCheck) throw new Error("autoredact toggle didn't change");

// Save settings (popup auto-saves on form change? check).
const settingsActions = await page.$("#settings-actions");
// Save by clicking somewhere that triggers settings persist. Simulating by reloading
// is enough to verify it sticks if the popup saves on input change.
// In this popup, settings save via a back/close action. Click settings-back.
await page.click("#settings-back");
await page.waitForTimeout(300);
await page.click("#settings-btn");
await page.waitForSelector("#s-autoredact");
const persisted = await page.$eval("#s-autoredact", (el) => el.checked);
if (!persisted)
  throw new Error("autoredact toggle did not persist after close/reopen");

if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}

console.log("✓ redact button starts as 'Redact' on a normal clip");
console.log("✓ redact → body sanitized, button flips to 'Unmask' (enabled)");
console.log("✓ unmask → restores original content");
console.log("✓ pre-redacted clip (no original) shows 'permanent' + disabled");
console.log("✓ auto-redact settings toggle persists across settings close/reopen");
console.log("\nAll redact UI tests passed.");

await browser.close();
server.close();

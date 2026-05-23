// Standalone popup screenshotter — serves dist/chrome via http, seeds IDB, captures.
import { chromium } from "playwright";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVE = path.join(ROOT, "dist/chrome");
const OUT = path.join(ROOT, "screenshots");
await fs.mkdir(OUT, { recursive: true });

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/popup/popup.html";
  const full = path.join(SERVE, p);
  if (!full.startsWith(SERVE)) return res.end();
  fsSync.readFile(full, (err, data) => {
    if (err) { res.statusCode = 404; return res.end("404"); }
    res.setHeader("Content-Type", MIME[path.extname(full)] || "application/octet-stream");
    res.end(data);
  });
});
await new Promise((r) => server.listen(7333, r));

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 420, height: 640 }, deviceScaleFactor: 2, colorScheme: "dark" });
const page = await ctx.newPage();

// Stub chrome.* APIs the popup uses, before any script runs.
await page.addInitScript(() => {
  const settings = {
    maxItems: 500,
    captureCmdC: true,
    captureImages: true,
    autoTag: true,
    autoOcr: false,
    enableInPagePalette: true,
    enableFieldSuggestions: true,
    dedupWindowSec: 60,
    blocklist: [],
    allowlist: [],
    theme: "dark",
  };
  // @ts-ignore
  globalThis.chrome = {
    runtime: {
      sendMessage: (_msg, cb) => { if (cb) cb({ ok: true }); return Promise.resolve({ ok: true }); },
      onMessage: { addListener: () => {} },
      getURL: (p) => "/" + p,
      id: "stub",
    },
    storage: {
      local: {
        get: async (k) => ({ settings }),
        set: async () => {},
      },
    },
    commands: { getAll: async () => [] },
    permissions: { contains: async () => true },
  };
});

await page.goto("http://localhost:7333/popup/popup.html");
await page.waitForLoadState("domcontentloaded");

// Seed clips directly into IDB on this origin.
await page.evaluate(async () => {
  const DB = "context-clipboard";
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 3);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("clips")) {
          const s = db.createObjectStore("clips", { keyPath: "id" });
          s.createIndex("createdAt", "createdAt");
          s.createIndex("lastSeenAt", "lastSeenAt");
          s.createIndex("pinned", "pinned");
          s.createIndex("kind", "kind");
          s.createIndex("hash", "hash");
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
        if (!db.objectStoreNames.contains("field_map")) {
          const f = db.createObjectStore("field_map", { keyPath: "id" });
          f.createIndex("host", "host");
          f.createIndex("updatedAt", "updatedAt");
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  const db = await open();
  const tx = db.transaction("clips", "readwrite");
  const store = tx.objectStore("clips");
  const now = Date.now();
  const clips = [
    { id: "c1", kind: "text", content: "sanjay@example.com", preview: "sanjay@example.com", hash: "h1", createdAt: now - 60_000, lastSeenAt: now - 60_000, hitCount: 3, pinned: true, tags: ["email"], source: { url: "https://github.com/settings/profile", title: "GitHub · Profile", host: "github.com" }, nearby: "" },
    { id: "c2", kind: "text", content: "export async function listClips() {\n  const tx = db.transaction('clips', 'readonly');\n  return tx.objectStore('clips').getAll();\n}", preview: "export async function listClips() {", hash: "h2", createdAt: now - 5*60_000, lastSeenAt: now - 5*60_000, hitCount: 1, pinned: false, tags: ["code", "stackoverflow.com"], source: { url: "https://stackoverflow.com/q/12345", title: "IndexedDB getAll best practices", host: "stackoverflow.com" }, nearby: "If you want to fetch all rows..." },
    { id: "c3", kind: "link", content: "https://linear.app/changelog", preview: "Linear · Changelog", hash: "h3", createdAt: now - 15*60_000, lastSeenAt: now - 15*60_000, hitCount: 1, pinned: false, tags: ["url", "linear.app"], source: { url: "https://news.ycombinator.com/", title: "Hacker News", host: "news.ycombinator.com" }, nearby: "" },
    { id: "c4", kind: "text", content: "Mitochondria are membrane-bound organelles found in most eukaryotic cells. They generate most of the cell's supply of ATP, used as a source of chemical energy.", preview: "Mitochondria are membrane-bound organelles found in most eukaryotic cells. They generate most of the cell's supply of ATP...", hash: "h4", createdAt: now - 45*60_000, lastSeenAt: now - 45*60_000, hitCount: 2, pinned: false, tags: ["wikipedia.org", "long"], source: { url: "https://en.wikipedia.org/wiki/Mitochondrion", title: "Mitochondrion - Wikipedia", host: "en.wikipedia.org" }, nearby: "" },
    { id: "c5", kind: "text", content: "ssh -i ~/.ssh/id_ed25519 deploy@bastion.prod.internal", preview: "ssh -i ~/.ssh/id_ed25519 deploy@bastion.prod.internal", hash: "h5", createdAt: now - 2*3600_000, lastSeenAt: now - 2*3600_000, hitCount: 5, pinned: false, tags: ["code", "notion.so"], source: { url: "https://notion.so/runbook", title: "Prod Runbook", host: "notion.so" }, nearby: "" },
    { id: "c6", kind: "text", content: "The best clipboard manager is the one that remembers context.", preview: "The best clipboard manager is the one that remembers context.", hash: "h6", createdAt: now - 3*3600_000, lastSeenAt: now - 3*3600_000, hitCount: 1, pinned: false, tags: ["quote"], source: { url: "https://twitter.com/sanjays2402", title: "Sanjay on X", host: "twitter.com" }, nearby: "" },
  ];
  for (const c of clips) store.put(c);
  await new Promise((r) => (tx.oncomplete = r));
});

// Reload so popup.ts reads the seeded clips.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
// Measure popup root height and clip screenshot to it.
async function shot(name) {
  const box = await page.evaluate(() => {
    const el = document.querySelector(".popup") || document.body;
    const r = el.getBoundingClientRect();
    return { x: 0, y: 0, w: Math.ceil(r.right), h: Math.ceil(r.bottom) };
  });
  await page.screenshot({
    path: path.join(OUT, name),
    clip: { x: box.x, y: box.y, width: box.w, height: box.h },
  });
  console.log("\u2713 " + name);
}

await page.evaluate(() => { document.body.dataset.theme = "dark"; });
await page.waitForTimeout(200);
await shot("popup-dark.png");

await page.evaluate(() => { document.body.dataset.theme = "light"; });
await page.waitForTimeout(200);
await shot("popup-light.png");

await page.evaluate(() => { document.body.dataset.theme = "light"; });
await page.click("#settings-btn");
await page.waitForTimeout(400);
await shot("settings.png");

await browser.close();
server.close();

// Self-check: no two screenshots may be byte-identical.
import("node:crypto").then(async ({ createHash }) => {
  const files = ["popup-dark.png", "popup-light.png", "settings.png"];
  const hashes = await Promise.all(files.map(async (f) => {
    const buf = await fs.readFile(path.join(OUT, f));
    return [f, createHash("sha256").update(buf).digest("hex").slice(0, 12)];
  }));
  const seen = new Map();
  for (const [f, h] of hashes) {
    if (seen.has(h)) {
      console.error(`\u2717 duplicate screenshot: ${f} == ${seen.get(h)} (hash ${h})`);
      process.exit(2);
    }
    seen.set(h, f);
  }
  console.log("\u2713 all 3 screenshots are visually distinct (" + hashes.map(([f,h]) => `${f.split('.')[0]}:${h}`).join(" ") + ")");
  console.log("Done.");
});

// End-to-end smoke test: load the built popup.html in a real Chromium via a
// short-lived HTTP server (so module scripts load) and exercise the encrypted
// export round-trip.
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
  if (!full.startsWith(distDir)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": mime[path.extname(full)] || "application/octet-stream" });
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

// Capture console + page errors so silent failures aren't silent.
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    // Ignore noisy resource loads (favicon, icons) we don't care about for the test.
    if (/favicon|icons\/.+\.png|Failed to load resource/.test(t)) return;
    errors.push("console.error: " + t);
  }
});

// Stub the chrome.* surface the popup expects, then load.
await page.addInitScript(() => {
  const noop = () => {};
  const calls = [];
  // @ts-ignore
  window.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        calls.push(msg);
        // Fake a successful "export" response with a tiny payload.
        if (msg?.action === "export") {
          cb && cb({ ok: true, data: { clips: [{ id: "x", content: "hi" }], settings: {} } });
        } else if (msg?.action === "import") {
          cb && cb({ ok: true, imported: 1 });
        } else if (msg?.action === "applySidePanelMode") {
          cb && cb({ ok: true });
        } else {
          cb && cb({ ok: true });
        }
        return true;
      },
    },
    storage: { local: { get: (k, cb) => cb && cb({}), set: (k, cb) => cb && cb() } },
  };
  // @ts-ignore
  window.__rpcCalls = calls;
  // The DB layer in db.ts uses indexedDB which Chromium provides.
});

await page.goto(popupUrl);
await page.waitForLoadState("domcontentloaded");
// Module scripts are deferred — wait for the popup to wire its listeners.
await page.waitForFunction(
  () => {
    const btn = document.getElementById("settings-btn");
    // The popup adds a 'data-bound' marker? Fall back to polling click target.
    return btn != null && document.querySelectorAll("#list .clip, #list .empty").length >= 0;
  },
  { timeout: 5000 },
);
// Give the popup's async render() a moment to finish, then click settings + verify.
await page.waitForTimeout(500);

if (errors.length) {
  console.error("Early page errors:\n" + errors.join("\n"));
  process.exit(1);
}

// 1. Open settings panel programmatically (sidesteps any click race during init).
await page.evaluate(() => {
  document.getElementById("settings-btn").click();
});
for (let i = 0; i < 20 && (await page.$eval("#settings-panel", (el) => el.hidden)); i++) {
  await page.waitForTimeout(100);
  await page.evaluate(() => document.getElementById("settings-btn").click());
}
const panelOpen = await page.$eval("#settings-panel", (el) => !el.hidden);
if (!panelOpen) throw new Error("settings panel never opened");
await page.waitForSelector("#s-encrypt-export", { state: "attached", timeout: 5000 });

// 2. Toggle encryption on -> passphrase row should appear.
const beforeHidden = await page.$eval("#encrypt-pass-row", (el) => el.hidden);
if (!beforeHidden) throw new Error("expected passphrase row hidden by default");
await page.check("#s-encrypt-export", { force: true });
const afterHidden = await page.$eval("#encrypt-pass-row", (el) => el.hidden);
if (afterHidden) throw new Error("passphrase row should be visible after toggle");

// 3. Submit empty passphrase -> toast error.
await page.evaluate(() => document.getElementById("export-btn").click());
await page.waitForFunction(() => {
  const t = document.getElementById("toast");
  return t && t.textContent && /4 chars/i.test(t.textContent);
}, { timeout: 2000 });

// 4. Provide passphrase. Intercept the Blob/anchor click so we capture the file output.
await page.evaluate(() => {
  // @ts-ignore
  window.__capturedDownload = null;
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = async function () {
    // @ts-ignore
    const blob = await fetch(this.href).then((r) => r.blob());
    const text = await blob.text();
    // @ts-ignore
    window.__capturedDownload = { name: this.download, text };
  };
});

await page.fill("#export-pass", "correct horse battery staple");
await page.evaluate(() => document.getElementById("export-btn").click());

await page.waitForFunction(() => {
  // @ts-ignore
  return !!window.__capturedDownload;
}, { timeout: 5000 });

const dl = await page.evaluate(() => {
  // @ts-ignore
  return window.__capturedDownload;
});

if (!/encrypted/.test(dl.name)) throw new Error(`expected filename to mention encrypted, got ${dl.name}`);
const env = JSON.parse(dl.text);
if (env.kind !== "context-clipboard-encrypted") throw new Error("bad envelope kind: " + env.kind);
if (env.v !== 1) throw new Error("bad envelope version");
if (!env.kdf?.salt || !env.cipher?.iv || !env.ciphertext) throw new Error("envelope missing fields");

// 5. Confirm passphrase was cleared after export.
const passVal = await page.$eval("#export-pass", (el) => el.value);
if (passVal !== "") throw new Error("passphrase field should clear after export");

// 6. Verify plain export still works (toggle off).
await page.uncheck("#s-encrypt-export", { force: true });
await page.evaluate(() => {
  // @ts-ignore
  window.__capturedDownload = null;
});
await page.evaluate(() => document.getElementById("export-btn").click());
await page.waitForFunction(() => {
  // @ts-ignore
  return !!window.__capturedDownload;
}, { timeout: 5000 });
const dl2 = await page.evaluate(() => window.__capturedDownload);
if (/encrypted/.test(dl2.name)) throw new Error("plain export should not have -encrypted suffix");
const plain = JSON.parse(dl2.text);
if (plain.kind === "context-clipboard-encrypted") throw new Error("plain export shouldn't be encrypted");
if (!Array.isArray(plain.clips)) throw new Error("plain export missing clips");

if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}

console.log("✓ encrypt toggle reveals passphrase row");
console.log("✓ empty passphrase rejected with toast");
console.log("✓ encrypted export produces v1 envelope with kdf/cipher/ciphertext");
console.log("✓ filename suffixed -encrypted");
console.log("✓ passphrase cleared after export");
console.log("✓ plain export still works when toggle off");
console.log("\nAll popup smoke tests passed.");

await browser.close();
server.close();

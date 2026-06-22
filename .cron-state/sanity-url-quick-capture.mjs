// Sanity for lib/url-quick-capture.ts
//   parseQuickCaptureUrl(raw) -> {url, host, preview, title} | null
//   buildQuickCaptureTags(host) -> string[] (always includes "quick-capture")

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const src = join(repo, "src/lib/url-quick-capture.ts");
const tmp = mkdtempSync(join(tmpdir(), "uqc-"));
const outFile = join(tmp, "out.mjs");
execSync(`node_modules/.bin/esbuild --bundle --format=esm --platform=neutral --target=es2022 --outfile=${outFile} ${src}`, {
  cwd: repo,
  stdio: ["ignore", "ignore", "inherit"],
});
const { parseQuickCaptureUrl, buildQuickCaptureTags } = await import(outFile);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL ${name}: ${detail || ""}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

// --- parseQuickCaptureUrl: defensive --------------------------------
eq("null",        parseQuickCaptureUrl(null), null);
eq("undefined",   parseQuickCaptureUrl(undefined), null);
eq("number",      parseQuickCaptureUrl(42), null);
eq("object",      parseQuickCaptureUrl({}), null);
eq("empty",       parseQuickCaptureUrl(""), null);
eq("whitespace",  parseQuickCaptureUrl("   \n\t "), null);

// --- parseQuickCaptureUrl: scheme whitelist -------------------------
eq("javascript:",  parseQuickCaptureUrl("javascript:alert(1)"), null);
eq("data:",        parseQuickCaptureUrl("data:text/html,<h1>x</h1>"), null);
eq("file:",        parseQuickCaptureUrl("file:///etc/passwd"), null);
eq("chrome:",      parseQuickCaptureUrl("chrome://settings"), null);
eq("about:",       parseQuickCaptureUrl("about:blank"), null);
eq("blob:",        parseQuickCaptureUrl("blob:https://example.com/abc"), null);
eq("ftp:",         parseQuickCaptureUrl("ftp://example.com/file"), null);
eq("ws:",          parseQuickCaptureUrl("ws://example.com"), null);
eq("custom:",      parseQuickCaptureUrl("myapp://open?x=1"), null);

// --- parseQuickCaptureUrl: garbage --------------------------------
eq("plain word",   parseQuickCaptureUrl("hello"), null);
eq("number text",  parseQuickCaptureUrl("12345"), null);
eq("phrase",       parseQuickCaptureUrl("not a url at all"), null);
eq("http://",      parseQuickCaptureUrl("http://"), null);

// --- parseQuickCaptureUrl: valid URLs --------------------------------
const got = parseQuickCaptureUrl("https://github.com/sanjays/repo");
ok("full url result", got && got.url === "https://github.com/sanjays/repo");
ok("full url host", got && got.host === "github.com");
ok("full url preview", got && got.preview === "github.com/sanjays/repo");
ok("full url title", got && got.title === "repo");

const got2 = parseQuickCaptureUrl("http://example.org/");
ok("root path normalised", got2 && got2.preview === "example.org");

const got3 = parseQuickCaptureUrl("https://www.example.com/foo");
ok("www stripped from host", got3 && got3.host === "example.com");
ok("www stripped from preview", got3 && got3.preview === "example.com/foo");

// --- parseQuickCaptureUrl: scheme-less coercion --------------------
const got4 = parseQuickCaptureUrl("github.com/foo");
ok("scheme coerced github.com/foo", got4 && got4.url === "https://github.com/foo");
ok("scheme coerced host", got4 && got4.host === "github.com");

const got5 = parseQuickCaptureUrl("docs.python.org");
ok("scheme coerced bare host", got5 && got5.url === "https://docs.python.org/");

const got6 = parseQuickCaptureUrl("example.com:8080/path?q=1");
ok("scheme coerced with port", got6 && got6.host === "example.com");
ok("scheme coerced port path", got6 && got6.url.startsWith("https://example.com:8080/"));

// --- parseQuickCaptureUrl: query + fragment preserved -------------
const got7 = parseQuickCaptureUrl("https://app.com/path?x=1&y=2#frag");
ok("query preserved in url", got7 && got7.url.includes("?x=1&y=2"));
ok("fragment preserved in url", got7 && got7.url.endsWith("#frag"));
ok("query stripped from preview", got7 && got7.preview === "app.com/path");

// --- parseQuickCaptureUrl: title derivation ------------------------
const got8 = parseQuickCaptureUrl("https://blog.example.com/2024/01/great-post-title");
ok("title from last segment", got8 && got8.title === "great post title");

const got9 = parseQuickCaptureUrl("https://files.example.com/My%20Document.pdf");
ok("title %20 decoded", got9 && got9.title.includes("My Document"));

const got10 = parseQuickCaptureUrl("https://example.com/");
ok("title falls back to host on bare root", got10 && got10.title === "example.com");

const got11 = parseQuickCaptureUrl("https://example.com");
ok("title falls back to host no path", got11 && got11.title === "example.com");

// --- parseQuickCaptureUrl: long path truncation --------------------
const longSeg = "a".repeat(150);
const got12 = parseQuickCaptureUrl(`https://example.com/${longSeg}`);
ok("preview truncated 80", got12 && got12.preview.length === 80);
ok("preview truncated has ellipsis", got12 && got12.preview.endsWith("…"));
ok("title truncated 80", got12 && got12.title.length === 80);

// --- parseQuickCaptureUrl: trim whitespace -------------------------
const got13 = parseQuickCaptureUrl("   https://example.com/foo   ");
ok("whitespace trim url", got13 && got13.url === "https://example.com/foo");

// --- parseQuickCaptureUrl: case insensitive scheme -----------------
const got14 = parseQuickCaptureUrl("HTTPS://EXAMPLE.COM/Path");
ok("uppercase scheme accepted", got14 && got14.url.toLowerCase().startsWith("https://"));
ok("uppercase host lowered", got14 && got14.host === "example.com");

// --- buildQuickCaptureTags ------------------------------------------
eq("tags empty host",     buildQuickCaptureTags(""),             ["quick-capture"]);
eq("tags null host",      buildQuickCaptureTags(null),           ["quick-capture"]);
eq("tags undefined host", buildQuickCaptureTags(undefined),      ["quick-capture"]);
eq("tags simple host",    buildQuickCaptureTags("github.com"),   ["quick-capture", "github.com"]);
eq("tags www stripped",   buildQuickCaptureTags("www.example.com"), ["quick-capture", "example.com"]);
eq("tags trim host",      buildQuickCaptureTags("  github.com  "), ["quick-capture", "github.com"]);
eq("tags upper host",     buildQuickCaptureTags("GitHub.com"),   ["quick-capture", "github.com"]);
eq("tags non-string",     buildQuickCaptureTags(42),             ["quick-capture"]);

// --- realistic end-to-end inputs the user would paste --------------
const realistic = [
  ["github.com/anthropics/claude-code",
    { host: "github.com", preview: "github.com/anthropics/claude-code", title: "claude code" }],
  ["https://news.ycombinator.com/item?id=123456",
    { host: "news.ycombinator.com", preview: "news.ycombinator.com/item", title: "item" }],
  ["https://en.wikipedia.org/wiki/TypeScript",
    { host: "en.wikipedia.org", preview: "en.wikipedia.org/wiki/TypeScript", title: "TypeScript" }],
  ["https://www.example.com",
    { host: "example.com", preview: "example.com", title: "example.com" }],
  ["http://localhost:3000/dev",
    { host: "localhost", preview: "localhost/dev", title: "dev" }],
];
for (const [raw, want] of realistic) {
  const g = parseQuickCaptureUrl(raw);
  ok(`realistic ${raw} host`, g && g.host === want.host);
  ok(`realistic ${raw} preview`, g && g.preview === want.preview);
  ok(`realistic ${raw} title`, g && g.title === want.title);
}

rmSync(tmp, { recursive: true, force: true });
console.log(`url-quick-capture sanity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

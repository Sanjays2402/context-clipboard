/**
 * Sanity: extractHostPattern + looksLikeUrl — URL extraction math.
 *
 * Pure helpers — no IDB, no DOM. Bundle with esbuild and exercise
 * against fixtures.
 *
 * Run with: node .cron-state/sanity-host-pattern.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-host-pattern-"));
const entry = join(tmp, "entry.mjs");
writeFileSync(
  entry,
  `import * as m from ${JSON.stringify(resolve(repoRoot, "src/lib/host-pattern.ts"))};
globalThis.__M = m;`,
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
const M = globalThis.__M;

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

// ----- looksLikeUrl ------------------------------------------------------
ok("looksLikeUrl: http", M.looksLikeUrl("http://github.com") === true);
ok("looksLikeUrl: https", M.looksLikeUrl("https://github.com/foo") === true);
ok("looksLikeUrl: protocol-relative", M.looksLikeUrl("//cdn.example.com/x") === true);
ok("looksLikeUrl: bare host with path", M.looksLikeUrl("github.com/foo") === true);
ok("looksLikeUrl: bare host no path", M.looksLikeUrl("github.com") === false);
ok("looksLikeUrl: single label", M.looksLikeUrl("localhost") === false);
ok("looksLikeUrl: word", M.looksLikeUrl("github") === false);
ok("looksLikeUrl: empty", M.looksLikeUrl("") === false);
ok("looksLikeUrl: whitespace", M.looksLikeUrl("   ") === false);
ok("looksLikeUrl: capital HTTPS", M.looksLikeUrl("HTTPS://github.com") === true);

// ----- extractHostPattern: URL inputs ------------------------------------
let r = M.extractHostPattern("https://github.com/foo/bar");
ok("url: host=github.com", r.host === "github.com");
ok("url: no wildcard (apex 2-label)", r.wildcard === undefined);
ok("url: fromUrl=true", r.fromUrl === true);

r = M.extractHostPattern("https://docs.github.com/en/foo");
ok("subdomain: host=docs.github.com", r.host === "docs.github.com");
ok("subdomain: wildcard=*.github.com", r.wildcard === "*.github.com");
ok("subdomain: fromUrl=true", r.fromUrl === true);

r = M.extractHostPattern("https://api.stripe.com/v1/charges?id=abc#frag");
ok("query+hash: host=api.stripe.com", r.host === "api.stripe.com");
ok("query+hash: wildcard=*.stripe.com", r.wildcard === "*.stripe.com");

r = M.extractHostPattern("https://example.co.uk/foo");
ok("psl: host=example.co.uk", r.host === "example.co.uk");
ok("psl: wildcard=*.co.uk (caller can override — left as known limitation)", r.wildcard === "*.co.uk");

r = M.extractHostPattern("https://a.b.c.d.example.com/page");
ok("deep subdomain: host kept intact", r.host === "a.b.c.d.example.com");
ok("deep subdomain: wildcard takes apex two", r.wildcard === "*.example.com");

// ----- extractHostPattern: protocol stripping ----------------------------
r = M.extractHostPattern("HTTPS://GITHUB.COM/FOO");
ok("uppercase: lowercased host", r.host === "github.com");

r = M.extractHostPattern("//cdn.example.com/script.js");
ok("protocol-relative: host=cdn.example.com", r.host === "cdn.example.com");
ok("protocol-relative: wildcard", r.wildcard === "*.example.com");
ok("protocol-relative: fromUrl=true", r.fromUrl === true);

r = M.extractHostPattern("github.com/foo");
ok("no-protocol with path: host=github.com", r.host === "github.com");
ok("no-protocol: fromUrl=true (has path slash)", r.fromUrl === true);

// ----- extractHostPattern: www stripping ---------------------------------
r = M.extractHostPattern("https://www.github.com/foo");
ok("www: stripped to github.com", r.host === "github.com");
ok("www: no wildcard once stripped (2-label)", r.wildcard === undefined);

r = M.extractHostPattern("www.example.com");
ok("bare www: stripped", r.host === "example.com");

// ----- extractHostPattern: ports + auth ---------------------------------
r = M.extractHostPattern("http://localhost:3000/page");
ok("port: host=localhost", r.host === "localhost");
ok("port: no wildcard (single label)", r.wildcard === undefined);

r = M.extractHostPattern("https://user:pass@private.example.com/dashboard");
ok("auth: host=private.example.com", r.host === "private.example.com");
ok("auth: wildcard=*.example.com", r.wildcard === "*.example.com");

// ----- extractHostPattern: IP addresses ---------------------------------
r = M.extractHostPattern("http://192.168.1.1/admin");
ok("ipv4: host=192.168.1.1", r.host === "192.168.1.1");
ok("ipv4: no wildcard (IP)", r.wildcard === undefined);

r = M.extractHostPattern("http://10.0.0.1:8080/path");
ok("ipv4 port: host=10.0.0.1", r.host === "10.0.0.1");
ok("ipv4 port: no wildcard", r.wildcard === undefined);

// ----- extractHostPattern: edge cases -----------------------------------
ok("empty input: host=''", M.extractHostPattern("").host === "");
ok("empty input: fromUrl=false", M.extractHostPattern("").fromUrl === false);
ok("whitespace input: host=''", M.extractHostPattern("   ").host === "");

r = M.extractHostPattern("github.com");
ok("bare host: kept", r.host === "github.com");
ok("bare host: fromUrl=false", r.fromUrl === false);
ok("bare host: no wildcard (2-label)", r.wildcard === undefined);

r = M.extractHostPattern("docs.github.com");
ok("bare 3-label: host kept", r.host === "docs.github.com");
ok("bare 3-label: wildcard suggested", r.wildcard === "*.github.com");

r = M.extractHostPattern("localhost");
ok("localhost bare: host=localhost", r.host === "localhost");
ok("localhost bare: no wildcard", r.wildcard === undefined);

// ----- extractHostPattern: trailing dot stripping -----------------------
r = M.extractHostPattern("https://github.com./foo");
ok("trailing dot: stripped", r.host === "github.com");

// ----- extractHostPattern: malformed URLs still useful ------------------
r = M.extractHostPattern("https://");
ok("empty after protocol: host=''", r.host === "");

r = M.extractHostPattern("not a url");
ok("plain text: returns input as-is", r.host === "not a url");
ok("plain text: fromUrl=false", r.fromUrl === false);

// ----- extractHostPattern: data URLs --------------------------------------
r = M.extractHostPattern("data:text/plain;base64,SGVsbG8=");
ok("data URL: host=''", r.host === "");

// ----- extractHostPattern: file:// ----------------------------------------
r = M.extractHostPattern("file:///home/user/index.html");
ok("file: host=''", r.host === "");

rmSync(tmp, { recursive: true, force: true });
console.log(`${pass}/${pass + fail} host-pattern sanity checks passed`);
if (fail > 0) process.exit(1);

// Sanity: lib/send-to domainForClip + "domain" row wiring.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-domain-"));
const out = join(dir, "send-to.mjs");
await build({ entryPoints: ["src/lib/send-to.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { domainForClip, buildSendActions } = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) pass++;
  else { fail++; console.error(`FAIL ${msg}: got ${A} want ${B}`); }
};

// text clip: host from source.url, www trimmed, path/query dropped
eq(domainForClip({ kind: "text", content: "x", source: { url: "https://docs.github.com/a/b?q=1" } }), "docs.github.com", "deep url -> host");
eq(domainForClip({ kind: "text", content: "x", source: { url: "https://www.example.com/" } }), "example.com", "www trimmed");
// link clip: host from body
eq(domainForClip({ kind: "link", content: "https://stackoverflow.com/q/1", source: {} }), "stackoverflow.com", "link body host");
// non-http / scrubbed / image / bad -> undefined
eq(domainForClip({ kind: "text", content: "x", source: { url: "file:///tmp" } }), undefined, "file: undef");
eq(domainForClip({ kind: "text", content: "x", source: {} }), undefined, "no url undef");
eq(domainForClip({ kind: "link", content: "not-a-url", source: {} }), undefined, "bad link undef");

// row wiring: present + available for text with url, gated without
const acts = buildSendActions({ id: "1", kind: "text", content: "x", source: { url: "https://docs.github.com/a" } });
const d = acts.find((a) => a.id === "domain");
eq(!!d, true, "domain row exists");
eq(d.available, true, "domain available");
eq(d.payload, "docs.github.com", "domain payload");
const none = buildSendActions({ id: "2", kind: "text", content: "x", source: {} });
eq(none.find((a) => a.id === "domain").available, false, "domain hidden hostless");

rmSync(dir, { recursive: true, force: true });
console.log(`domain sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);

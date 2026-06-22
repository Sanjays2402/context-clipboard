// Sanity for lib/rule-preview.ts
//   previewClipsForRules(rules, clips, {limit, hostFrom, matchesHostPattern}) -> Map<ruleId, RulePreviewClip[]>
//   formatPreviewCardTitle(totalCount, previewLength) -> "Last X of Y captured" / "All N captured" / null
//   formatPreviewRowTooltip(fullPreview, timeAgoLabel) -> string

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const src = join(repo, "src/lib/rule-preview.ts");
const tmp = mkdtempSync(join(tmpdir(), "rp-"));
const outFile = join(tmp, "out.mjs");
execSync(`node_modules/.bin/esbuild --bundle --format=esm --platform=neutral --target=es2022 --outfile=${outFile} ${src}`, {
  cwd: repo,
  stdio: ["ignore", "ignore", "inherit"],
});
const { previewClipsForRules, formatPreviewCardTitle, formatPreviewRowTooltip } = await import(outFile);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL ${name}: ${detail || ""}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

// Fake hostFrom + matchesHostPattern that mirror the real ones.
const hostFrom = (url) => {
  if (!url || typeof url !== "string") return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
const matchesHostPattern = (pattern, host) => {
  if (!pattern || !host) return false;
  const p = pattern.toLowerCase();
  const h = host.toLowerCase().replace(/^www\./, "");
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return h === base || h.endsWith("." + base);
  }
  return h === p;
};

// --- previewClipsForRules: defensive --------------------------------
ok("preview empty rules", previewClipsForRules([], [{id:"c"}], {hostFrom, matchesHostPattern}).size === 0);
ok("preview empty clips", previewClipsForRules([{id:"r1", hostPattern:"x.com"}], [], {hostFrom, matchesHostPattern}).size === 0);
ok("preview non-array rules", previewClipsForRules(null, [{id:"c"}], {hostFrom, matchesHostPattern}).size === 0);
ok("preview non-array clips", previewClipsForRules([{id:"r"}], null, {hostFrom, matchesHostPattern}).size === 0);

// --- previewClipsForRules: basic match ------------------------------
const rules1 = [{ id: "r-gh", hostPattern: "github.com" }];
const clips1 = [
  { id: "c1", kind: "text", preview: "p1", content: "p1", source: { url: "https://github.com/a" }, lastSeenAt: 100 },
  { id: "c2", kind: "text", preview: "p2", content: "p2", source: { url: "https://github.com/b" }, lastSeenAt: 200 },
  { id: "c3", kind: "image", preview: "Image", content: "data:image/png;base64,xxx", source: { url: "https://github.com/c" }, lastSeenAt: 50 },
  { id: "c-other", kind: "text", preview: "other", source: { url: "https://example.com/" }, lastSeenAt: 999 },
];
const r1 = previewClipsForRules(rules1, clips1, {hostFrom, matchesHostPattern});
ok("r1 size", r1.size === 1);
const ghPrev = r1.get("r-gh");
ok("r1 gh entries 3", ghPrev && ghPrev.length === 3);
// Sorted lastSeenAt desc: c2(200), c1(100), c3(50)
ok("r1 sort order", ghPrev[0].clipId === "c2" && ghPrev[1].clipId === "c1" && ghPrev[2].clipId === "c3");

// --- previewClipsForRules: limit cap --------------------------------
const r1cap = previewClipsForRules(rules1, clips1, {limit: 2, hostFrom, matchesHostPattern});
const ghCap = r1cap.get("r-gh");
ok("r1 cap 2", ghCap && ghCap.length === 2);
ok("r1 cap drops oldest", ghCap[0].clipId === "c2" && ghCap[1].clipId === "c1");

// --- previewClipsForRules: limit defaults to 3 ----------------------
const rDefault = previewClipsForRules(rules1, clips1, {hostFrom, matchesHostPattern});
ok("default cap 3", rDefault.get("r-gh").length === 3);

// --- previewClipsForRules: first-match-wins -------------------------
const rules2 = [
  { id: "r-docs", hostPattern: "docs.github.com" },
  { id: "r-all", hostPattern: "*.github.com" },
];
const clips2 = [
  { id: "c-docs", kind: "text", preview: "docs page", source: { url: "https://docs.github.com/topic" }, lastSeenAt: 100 },
  { id: "c-blog", kind: "text", preview: "blog post", source: { url: "https://blog.github.com/post" }, lastSeenAt: 200 },
];
const r2 = previewClipsForRules(rules2, clips2, {hostFrom, matchesHostPattern});
// docs.github.com hits r-docs first; blog.github.com falls through to r-all
ok("r2 docs to first-match", r2.get("r-docs")[0].clipId === "c-docs");
ok("r2 blog to wildcard", r2.get("r-all")[0].clipId === "c-blog");

// --- previewClipsForRules: skip clips without url ------------------
const clipsNoUrl = [
  { id: "ok", kind: "text", preview: "ok", source: { url: "https://x.com/" }, lastSeenAt: 100 },
  { id: "no-url", kind: "text", preview: "lost", source: {}, lastSeenAt: 200 },
  { id: "missing-source", kind: "text", preview: "lost2", lastSeenAt: 300 },
];
const rules3 = [{ id: "r-x", hostPattern: "x.com" }];
const r3 = previewClipsForRules(rules3, clipsNoUrl, {hostFrom, matchesHostPattern});
ok("only matched clip survives", r3.get("r-x").length === 1 && r3.get("r-x")[0].clipId === "ok");

// --- previewClipsForRules: rules without matches absent -------------
const rules4 = [
  { id: "r-yes", hostPattern: "github.com" },
  { id: "r-no",  hostPattern: "nowhere.com" },
];
const r4 = previewClipsForRules(rules4, clips1, {hostFrom, matchesHostPattern});
ok("absent when no matches", r4.has("r-no") === false);
ok("present when matches", r4.has("r-yes") === true);

// --- previewClipsForRules: preview truncation -----------------------
const long = "x".repeat(150);
const clipsLong = [{ id: "long", kind: "text", preview: long, source: { url: "https://x.com/" }, lastSeenAt: 100 }];
const rules5 = [{ id: "r-x", hostPattern: "x.com" }];
const r5 = previewClipsForRules(rules5, clipsLong, {hostFrom, matchesHostPattern});
ok("preview truncated 80", r5.get("r-x")[0].preview.length === 80);
ok("preview has ellipsis", r5.get("r-x")[0].preview.endsWith("…"));

// --- previewClipsForRules: preview whitespace collapse --------------
const clipsWs = [{ id: "ws", kind: "text", preview: "  hello  \n\n  world  \t  ", source: { url: "https://x.com/" }, lastSeenAt: 100 }];
const r6 = previewClipsForRules(rules5, clipsWs, {hostFrom, matchesHostPattern});
ok("preview ws collapsed", r6.get("r-x")[0].preview === "hello world");

// --- previewClipsForRules: image kind preview fallback --------------
const clipsImg = [{ id: "img", kind: "image", source: { url: "https://x.com/" }, lastSeenAt: 100 }];
const r7 = previewClipsForRules(rules5, clipsImg, {hostFrom, matchesHostPattern});
ok("image fallback preview", r7.get("r-x")[0].preview === "Image");

// --- previewClipsForRules: limit floor + non-finite -----------------
const r8 = previewClipsForRules(rules1, clips1, {limit: 0, hostFrom, matchesHostPattern});
ok("limit 0 coerced to default 3", r8.get("r-gh").length === 3);
const r9 = previewClipsForRules(rules1, clips1, {limit: -5, hostFrom, matchesHostPattern});
ok("limit negative coerced to default 3", r9.get("r-gh").length === 3);
const r10 = previewClipsForRules(rules1, clips1, {limit: NaN, hostFrom, matchesHostPattern});
ok("limit NaN coerced to default 3", r10.get("r-gh").length === 3);
const rInf = previewClipsForRules(rules1, clips1, {limit: Infinity, hostFrom, matchesHostPattern});
ok("limit Infinity coerced to default 3", rInf.get("r-gh").length === 3);
const r11 = previewClipsForRules(rules1, clips1, {limit: 2.7, hostFrom, matchesHostPattern});
ok("limit 2.7 floored to 2", r11.get("r-gh").length === 2);

// --- previewClipsForRules: pinned flag ------------------------------
const clipsPinned = [
  { id: "p1", kind: "text", preview: "pinned", pinned: true, source: { url: "https://x.com/" }, lastSeenAt: 100 },
  { id: "p2", kind: "text", preview: "regular", pinned: false, source: { url: "https://x.com/" }, lastSeenAt: 200 },
];
const r12 = previewClipsForRules(rules5, clipsPinned, {hostFrom, matchesHostPattern});
ok("pinned flag preserved", r12.get("r-x")[0].pinned === false);
ok("pinned flag preserved 2", r12.get("r-x")[1].pinned === true);

// --- formatPreviewCardTitle ------------------------------------------
eq("title null total",  formatPreviewCardTitle(0, 3), null);
eq("title null preview", formatPreviewCardTitle(5, 0), null);
eq("title NaN",         formatPreviewCardTitle(NaN, 3), null);
eq("title 1 of 1",      formatPreviewCardTitle(1, 1), "1 captured");
eq("title all 3",       formatPreviewCardTitle(3, 3), "All 3 captured");
eq("title all 12",      formatPreviewCardTitle(12, 12), "All 12 captured");
eq("title last 3 of 12", formatPreviewCardTitle(12, 3), "Last 3 of 12 captured");
eq("title last 1 of 5",  formatPreviewCardTitle(5, 1), "Last 1 of 5 captured");

// --- formatPreviewRowTooltip ----------------------------------------
eq("tip simple", formatPreviewRowTooltip("hello world", "2m ago"), "hello world\n2m ago");
eq("tip empty preview", formatPreviewRowTooltip("", "5m ago"), "5m ago");
eq("tip null preview", formatPreviewRowTooltip(null, "5m ago"), "5m ago");
const longTip = "x".repeat(300);
const tipResult = formatPreviewRowTooltip(longTip, "1d ago");
ok("tip truncated", tipResult.startsWith("x".repeat(199) + "…") && tipResult.endsWith("\n1d ago"));

// --- Realistic 5-rule, 25-clip mixed scenario -----------------------
const realRules = [
  { id: "github",     hostPattern: "github.com" },
  { id: "githubdocs", hostPattern: "docs.github.com" },
  { id: "twitter",    hostPattern: "twitter.com" },
  { id: "wildcard",   hostPattern: "*.example.com" },
  { id: "unused",     hostPattern: "noresult.com" },
];
const realClips = [];
for (let i = 0; i < 5; i++) realClips.push({ id: `gh-${i}`, kind: "text", preview: `gh ${i}`, source: { url: "https://github.com/foo" }, lastSeenAt: 1000 + i });
for (let i = 0; i < 4; i++) realClips.push({ id: `docs-${i}`, kind: "text", preview: `docs ${i}`, source: { url: "https://docs.github.com/topic" }, lastSeenAt: 2000 + i });
for (let i = 0; i < 8; i++) realClips.push({ id: `tw-${i}`, kind: "text", preview: `tw ${i}`, source: { url: "https://twitter.com/user" }, lastSeenAt: 3000 + i });
for (let i = 0; i < 3; i++) realClips.push({ id: `sub-${i}`, kind: "text", preview: `sub ${i}`, source: { url: `https://api${i}.example.com/` }, lastSeenAt: 4000 + i });
realClips.push({ id: "lone", kind: "text", preview: "lone", source: { url: "https://other.com/" }, lastSeenAt: 5000 });

const rReal = previewClipsForRules(realRules, realClips, {hostFrom, matchesHostPattern});
ok("real github first-match", rReal.get("github").length === 3);
ok("real githubdocs separate", rReal.get("githubdocs").length === 3);
ok("real github capped", rReal.get("github")[0].clipId === "gh-4");  // newest first
ok("real twitter 3 of 8", rReal.get("twitter").length === 3 && rReal.get("twitter")[0].clipId === "tw-7");
ok("real wildcard 3 of 3", rReal.get("wildcard").length === 3 && rReal.get("wildcard")[0].clipId === "sub-2");
ok("real unused absent", rReal.has("unused") === false);

rmSync(tmp, { recursive: true, force: true });
console.log(`rule-preview sanity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

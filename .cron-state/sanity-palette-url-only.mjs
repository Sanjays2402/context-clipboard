// Sanity: urlOnlyFor (in-page palette Alt+Enter "Copy URL only").
//
// Inline copy of the closure helper from src/content.ts since the
// function is scoped inside openPalette() and not exported. Covers
// the link vs text/image extraction paths, http(s) gating, defensive
// nullish handling, and trim semantics.

function urlOnlyFor(c) {
  if (c.kind === "link") {
    const raw = (c.content || "").trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return null;
    return raw;
  }
  const u = (c.source?.url || "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return u;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. Link clip: content IS the URL ------------------------------------
check("link clip http",
  urlOnlyFor({ kind: "link", content: "http://example.com" }),
  "http://example.com");
check("link clip https",
  urlOnlyFor({ kind: "link", content: "https://example.com/page" }),
  "https://example.com/page");
check("link clip with query+fragment",
  urlOnlyFor({ kind: "link", content: "https://example.com/page?q=1#x" }),
  "https://example.com/page?q=1#x");
check("link clip trimmed",
  urlOnlyFor({ kind: "link", content: "  https://example.com  " }),
  "https://example.com");
check("link clip case-insensitive protocol",
  urlOnlyFor({ kind: "link", content: "HTTPS://EXAMPLE.com" }),
  "HTTPS://EXAMPLE.com");

// --- 2. Link clip rejections ---------------------------------------------
check("link clip empty → null",
  urlOnlyFor({ kind: "link", content: "" }),
  null);
check("link clip whitespace → null",
  urlOnlyFor({ kind: "link", content: "   " }),
  null);
check("link clip non-http → null (data:)",
  urlOnlyFor({ kind: "link", content: "data:text/plain,foo" }),
  null);
check("link clip non-http → null (file:)",
  urlOnlyFor({ kind: "link", content: "file:///tmp/x" }),
  null);
check("link clip non-http → null (chrome:)",
  urlOnlyFor({ kind: "link", content: "chrome://extensions" }),
  null);
check("link clip non-http → null (about:)",
  urlOnlyFor({ kind: "link", content: "about:blank" }),
  null);
check("link clip non-http → null (javascript:)",
  urlOnlyFor({ kind: "link", content: "javascript:alert(1)" }),
  null);
check("link clip bare host → null",
  urlOnlyFor({ kind: "link", content: "example.com" }),
  null);

// --- 3. Text clip: source.url is the URL ---------------------------------
check("text clip http source",
  urlOnlyFor({ kind: "text", content: "snippet", source: { url: "http://example.com/article" } }),
  "http://example.com/article");
check("text clip https source",
  urlOnlyFor({ kind: "text", content: "snippet", source: { url: "https://docs.github.com/x" } }),
  "https://docs.github.com/x");
check("text clip source trimmed",
  urlOnlyFor({ kind: "text", content: "snippet", source: { url: "  https://e.com  " } }),
  "https://e.com");

// --- 4. Text clip rejections ---------------------------------------------
check("text clip no source → null",
  urlOnlyFor({ kind: "text", content: "snippet" }),
  null);
check("text clip empty source → null",
  urlOnlyFor({ kind: "text", content: "snippet", source: {} }),
  null);
check("text clip undefined url → null",
  urlOnlyFor({ kind: "text", content: "snippet", source: { url: undefined } }),
  null);
check("text clip non-http source → null (file:)",
  urlOnlyFor({ kind: "text", content: "snippet", source: { url: "file:///tmp/x" } }),
  null);
check("text clip non-http source → null (chrome:)",
  urlOnlyFor({ kind: "text", content: "snippet", source: { url: "chrome://newtab" } }),
  null);

// --- 5. Image clip: source.url is the URL --------------------------------
check("image clip http source",
  urlOnlyFor({ kind: "image", content: "data:image/png;base64,xx", source: { url: "https://e.com/img.png" } }),
  "https://e.com/img.png");
check("image clip with no source → null",
  urlOnlyFor({ kind: "image", content: "data:image/png;base64,xx" }),
  null);
// NOTE: For image clips, content is data:... which is NOT a valid url-only;
// we always look at source.url. So a data: in content but missing
// source.url returns null (not the data:).
check("image clip content is data: but source missing → null",
  urlOnlyFor({ kind: "image", content: "data:image/png;base64,xxx" }),
  null);

// --- 6. Defensive null/undefined inputs ---------------------------------
check("link clip null content → null",
  urlOnlyFor({ kind: "link", content: null }),
  null);
check("link clip undefined content → null",
  urlOnlyFor({ kind: "link", content: undefined }),
  null);

// --- 7. Realistic captures -----------------------------------------------
// Text clip captured from a docs page
check("realistic: text from docs",
  urlOnlyFor({
    kind: "text",
    content: "Lorem ipsum dolor sit amet",
    source: { url: "https://docs.example.com/page", title: "Docs · Example" },
  }),
  "https://docs.example.com/page");

// Link clip from a chat
check("realistic: link from chat",
  urlOnlyFor({
    kind: "link",
    content: "https://github.com/owner/repo/issues/123",
    source: { url: "https://chat.example.com", title: "Chat" },
  }),
  "https://github.com/owner/repo/issues/123");

// Image clip captured from a CDN
check("realistic: image from CDN",
  urlOnlyFor({
    kind: "image",
    content: "data:image/jpeg;base64,longdataurl...",
    source: { url: "https://cdn.example.com/photo.jpg", title: "Photo" },
  }),
  "https://cdn.example.com/photo.jpg");

console.log(`palette-url-only sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);

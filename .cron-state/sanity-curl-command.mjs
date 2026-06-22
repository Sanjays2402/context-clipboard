// Sanity: curl-command — single-line `curl '...'` builder for any
// clip with an http(s) URL.
//
// The transform is small but the shell-quoting is subtle. This file
// inlines the module under test (no bundler) and covers:
//
//   1. shellSingleQuote — pass-through, embedded `'`, embedded `$`,
//      backtick, spaces, multi-quote, empty input.
//   2. shareableUrl logic via curlCommandForClip — link/text/image
//      kinds + scheme gates (http/https only).
//   3. canCurlClip mirrors curlCommandForClip's gate exactly.
//   4. Round-trip safety: the quoted command, when re-parsed by a
//      shell-like single-quote unescaper, yields the original URL.

// --- Module under test (inlined) -----------------------------------------

function shareableUrl(c) {
  if (c.kind === "link") {
    const raw = (c.content || "").trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return null;
    return raw;
  }
  const u = (c.source?.url || "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return u;
}

function shellSingleQuote(s) {
  const escaped = s.split("'").join("'\\''");
  return `'${escaped}'`;
}

function curlCommandForClip(c) {
  const url = shareableUrl(c);
  if (!url) return undefined;
  return `curl ${shellSingleQuote(url)}`;
}

function canCurlClip(c) {
  return curlCommandForClip(c) !== undefined;
}

// --- Shell-quote round-trip helper ---------------------------------------
// POSIX single-quote semantics: everything inside `'...'` is literal
// except a literal `'`, which can't appear. The escape sequence
// `'\''` is interpreted as: close-quote, literal-backslash-quote,
// open-quote — net effect: a single `'` inside the resulting word.
// We mirror that here so tests can assert that our output, when run
// through a POSIX shell, would yield the original URL.
function shellSingleUnquote(s) {
  if (s.length < 2 || s[0] !== "'" || s[s.length - 1] !== "'") {
    throw new Error(`not single-quoted: ${s}`);
  }
  const inner = s.slice(1, -1);
  // Replace the close-reopen-escape sequence with a literal single quote.
  return inner.split("'\\''").join("'");
}

// --- Test harness --------------------------------------------------------

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}
function checkContains(name, hay, needle) {
  total++;
  const ok = typeof hay === "string" && hay.includes(needle);
  if (ok) pass++;
  else console.error("FAIL", name, "in", JSON.stringify(hay), "missing", JSON.stringify(needle));
}

// --- 1. shellSingleQuote edge cases --------------------------------------
check("quote: plain url passes through",
  shellSingleQuote("https://example.com"),
  "'https://example.com'");
check("quote: empty string still wrapped",
  shellSingleQuote(""),
  "''");
check("quote: single quote uses close-reopen-escape",
  shellSingleQuote("it's"),
  "'it'\\''s'");
check("quote: two quotes",
  shellSingleQuote("a'b'c"),
  "'a'\\''b'\\''c'");
check("quote: $variable kept literal",
  shellSingleQuote("path/$HOME"),
  "'path/$HOME'");
check("quote: backtick kept literal",
  shellSingleQuote("path/`whoami`"),
  "'path/`whoami`'");
check("quote: ampersand kept literal",
  shellSingleQuote("?q=1&r=2"),
  "'?q=1&r=2'");
check("quote: spaces kept literal",
  shellSingleQuote("hello world.com"),
  "'hello world.com'");
check("quote: newline kept (one-line input though)",
  shellSingleQuote("a\nb"),
  "'a\nb'");
check("quote: leading quote",
  shellSingleQuote("'start"),
  "''\\''start'");
check("quote: trailing quote",
  shellSingleQuote("end'"),
  "'end'\\'''");
check("quote: only-quotes",
  shellSingleQuote("'''"),
  "''\\'''\\'''\\'''");

// --- 2. shareableUrl gating via curlCommandForClip -----------------------

// Link clip: content is the URL.
const link = { id: "l1", kind: "link", content: "https://github.com/foo", source: {} };
check("curl: link clip uses content",
  curlCommandForClip(link),
  "curl 'https://github.com/foo'");

// Text clip with source.url.
const text = { id: "t1", kind: "text", content: "snippet", source: { url: "https://example.com/page" } };
check("curl: text clip uses source.url",
  curlCommandForClip(text),
  "curl 'https://example.com/page'");

// Image clip with source.url — still gets a curl (image bytes).
const image = { id: "i1", kind: "image", content: "data:image/png;base64,xxx", source: { url: "https://cdn.example.com/img.png" } };
check("curl: image clip uses source.url, not data: content",
  curlCommandForClip(image),
  "curl 'https://cdn.example.com/img.png'");

// Scrubbed: no source URL.
check("curl: scrubbed text → undefined",
  curlCommandForClip({ id: "x", kind: "text", content: "snip", source: {} }),
  undefined);

// Link clip with data: scheme.
check("curl: link clip with data: scheme → undefined",
  curlCommandForClip({ id: "x", kind: "link", content: "data:text/plain,foo", source: {} }),
  undefined);

// Link clip with file: scheme.
check("curl: link clip with file: scheme → undefined",
  curlCommandForClip({ id: "x", kind: "link", content: "file:///tmp/page.html", source: {} }),
  undefined);

// Link clip with javascript: scheme.
check("curl: link clip with javascript: → undefined",
  curlCommandForClip({ id: "x", kind: "link", content: "javascript:alert(1)", source: {} }),
  undefined);

// Link clip with chrome: scheme.
check("curl: link clip with chrome: → undefined",
  curlCommandForClip({ id: "x", kind: "link", content: "chrome://extensions", source: {} }),
  undefined);

// Text clip with file:// source — should be excluded.
check("curl: text clip with file:// source → undefined",
  curlCommandForClip({ id: "x", kind: "text", content: "snip", source: { url: "file:///etc/hosts" } }),
  undefined);

// Empty URL string.
check("curl: empty content link → undefined",
  curlCommandForClip({ id: "x", kind: "link", content: "", source: {} }),
  undefined);

// Whitespace-only URL.
check("curl: whitespace-only url → undefined (trim)",
  curlCommandForClip({ id: "x", kind: "link", content: "   ", source: {} }),
  undefined);

// URL with leading/trailing whitespace — trimmed.
check("curl: trims whitespace around url",
  curlCommandForClip({ id: "x", kind: "link", content: "  https://example.com  ", source: {} }),
  "curl 'https://example.com'");

// Case-insensitive scheme check.
check("curl: HTTPS:// uppercase scheme accepted",
  curlCommandForClip({ id: "x", kind: "link", content: "HTTPS://example.com", source: {} }),
  "curl 'HTTPS://example.com'");

// --- 3. URL with shell-sensitive characters ------------------------------

// Query string with `&` survives quoting.
check("curl: url with ampersand query",
  curlCommandForClip({ id: "x", kind: "link", content: "https://example.com/?q=1&r=2", source: {} }),
  "curl 'https://example.com/?q=1&r=2'");

// URL with `$` in path — would be interpolated if double-quoted.
check("curl: url with $variable in path stays literal",
  curlCommandForClip({ id: "x", kind: "link", content: "https://example.com/$HOME/file", source: {} }),
  "curl 'https://example.com/$HOME/file'");

// URL with backtick — would execute if double-quoted.
check("curl: url with backtick stays literal",
  curlCommandForClip({ id: "x", kind: "link", content: "https://example.com/`whoami`", source: {} }),
  "curl 'https://example.com/`whoami`'");

// URL with apostrophe in path — needs the close-reopen-escape.
check("curl: url with single quote in path",
  curlCommandForClip({ id: "x", kind: "link", content: "https://example.com/it's/page", source: {} }),
  "curl 'https://example.com/it'\\''s/page'");

// URL with fragment.
check("curl: url with fragment",
  curlCommandForClip({ id: "x", kind: "link", content: "https://example.com/page#section", source: {} }),
  "curl 'https://example.com/page#section'");

// URL with parentheses (e.g. Wikipedia disambiguators).
check("curl: url with parens",
  curlCommandForClip({ id: "x", kind: "link", content: "https://en.wikipedia.org/wiki/Foo_(bar)", source: {} }),
  "curl 'https://en.wikipedia.org/wiki/Foo_(bar)'");

// --- 4. canCurlClip mirrors curlCommandForClip ---------------------------
check("canCurl: link → true", canCurlClip(link), true);
check("canCurl: text → true", canCurlClip(text), true);
check("canCurl: image with url → true", canCurlClip(image), true);
check("canCurl: scrubbed → false", canCurlClip({ id: "x", kind: "text", content: "snip", source: {} }), false);
check("canCurl: data: scheme → false", canCurlClip({ id: "x", kind: "link", content: "data:text/plain,x", source: {} }), false);
check("canCurl: empty → false", canCurlClip({ id: "x", kind: "link", content: "", source: {} }), false);

// --- 5. Output shape contracts -------------------------------------------
const cmd = curlCommandForClip(link);
checkContains("shape: starts with 'curl '", cmd, "curl ");
check("shape: single-line", /\r|\n/.test(cmd), false);
check("shape: URL is single-quoted", cmd.endsWith("'"), true);
check("shape: starts curl + single quote on URL",
  cmd.startsWith("curl '"), true);

// --- 6. Round-trip: extracting the URL back yields the original ---------
const tricky = "https://example.com/it's/page?q=$HOME&r=`whoami`";
const trickyClip = { id: "x", kind: "link", content: tricky, source: {} };
const trickyCmd = curlCommandForClip(trickyClip);
// Strip the leading "curl " then unquote.
const quoted = trickyCmd.slice("curl ".length);
const roundTripped = shellSingleUnquote(quoted);
check("round-trip: shell-unquote yields original URL", roundTripped, tricky);

// Round-trip for plain URL.
const plainCmd = curlCommandForClip(link);
const plainRound = shellSingleUnquote(plainCmd.slice("curl ".length));
check("round-trip: plain URL", plainRound, "https://github.com/foo");

// --- 7. Defensive guards -------------------------------------------------
check("defensive: null content → undefined",
  curlCommandForClip({ id: "x", kind: "link", content: null, source: {} }),
  undefined);
check("defensive: undefined content → undefined",
  curlCommandForClip({ id: "x", kind: "link", content: undefined, source: {} }),
  undefined);
check("defensive: null source → undefined for text clip",
  curlCommandForClip({ id: "x", kind: "text", content: "snip", source: null }),
  undefined);

console.log(`curl-command sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);

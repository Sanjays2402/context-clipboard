// Sanity: send-to URL builders + buildSendActions matrix.
//
// Bundles src/lib/send-to.ts via esbuild and probes each builder
// + the combined buildSendActions() output against a handful of
// representative clips. Pure module — no DOM, no IO.

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'ctxclip-sendto-'));
try {
  await build({
    entryPoints: ['src/lib/send-to.ts'],
    bundle: true,
    format: 'esm',
    outfile: join(dir, 'sendto.mjs'),
    platform: 'neutral',
    target: 'es2022',
    sourcemap: false,
  });
  const mod = await import('file://' + join(dir, 'sendto.mjs'));

  let pass = 0, total = 0;
  function check(name, got, want) {
    total++;
    if (got === want) pass++;
    else console.error('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want));
  }
  function checkTruthy(name, got) {
    total++;
    if (got) pass++;
    else console.error('FAIL', name, 'got', JSON.stringify(got));
  }
  function checkContains(name, hay, needle) {
    total++;
    if (typeof hay === 'string' && hay.includes(needle)) pass++;
    else console.error('FAIL', name, 'hay', JSON.stringify(hay), 'missing', JSON.stringify(needle));
  }

  // Fixture clips
  const textClip = {
    id: 't1',
    kind: 'text',
    content: 'function hello() {\n  return 42;\n}',
    preview: 'function hello() { return 42; }',
    source: { url: 'https://github.com/foo/bar', title: 'Foo - GitHub' },
  };
  const linkClip = {
    id: 'l1',
    kind: 'link',
    content: 'https://example.com/article',
    preview: 'A great article',
    source: { url: 'https://example.com/article', title: 'Great Article' },
  };
  const imageClip = {
    id: 'i1',
    kind: 'image',
    content: 'data:image/png;base64,iVBORw0K...',
    preview: 'Image · 800×600',
    source: { url: 'https://imgur.com/foo', title: 'Imgur' },
  };
  const scrubbedClip = {
    id: 's1',
    kind: 'text',
    content: 'some lonely text',
    preview: 'some lonely text',
    source: {}, // origin scrubbed
  };
  const emptyClip = {
    id: 'e1',
    kind: 'text',
    content: '',
    source: {},
  };
  const noteClip = {
    id: 'n1',
    kind: 'text',
    content: 'shopping list:\n- bread\n- milk',
    preview: 'shopping list',
    source: { title: 'Manual note' }, // no URL
  };

  // urlForOpenSource
  check('open: text with https url',
    mod.urlForOpenSource(textClip), 'https://github.com/foo/bar');
  check('open: image with url', mod.urlForOpenSource(imageClip), 'https://imgur.com/foo');
  check('open: scrubbed -> undefined', mod.urlForOpenSource(scrubbedClip), undefined);
  check('open: data: url -> undefined',
    mod.urlForOpenSource({ ...textClip, source: { url: 'data:text/plain;base64,foo' } }), undefined);
  check('open: chrome:// -> undefined',
    mod.urlForOpenSource({ ...textClip, source: { url: 'chrome://newtab' } }), undefined);

  // urlForGoogleSearch
  checkTruthy('google: text -> URL', mod.urlForGoogleSearch(textClip));
  checkContains('google: encoded query',
    mod.urlForGoogleSearch(textClip), 'function%20hello');
  check('google: image -> undefined', mod.urlForGoogleSearch(imageClip), undefined);
  check('google: empty body -> undefined', mod.urlForGoogleSearch(emptyClip), undefined);
  // Cap at 200 chars
  const longClip = { id: 'L', kind: 'text', content: 'x'.repeat(500), source: {} };
  const googleLong = mod.urlForGoogleSearch(longClip);
  // 200 'x' chars URL-encoded = 200 chars (each 'x' is one literal char)
  checkContains('google: long body caps at 200 (no 500)', googleLong, 'x'.repeat(200));
  check('google: cap drops the rest',
    googleLong.includes('x'.repeat(201)), false);

  // urlForSiteSearch
  checkContains('site: github text', mod.urlForSiteSearch(textClip), 'site%3Agithub.com');
  check('site: scrubbed -> undefined', mod.urlForSiteSearch(scrubbedClip), undefined);
  check('site: image -> undefined', mod.urlForSiteSearch(imageClip), undefined);
  // Test www-stripping
  const wwwClip = { ...textClip, source: { url: 'https://www.example.com/foo', title: '' } };
  checkContains('site: www stripped', mod.urlForSiteSearch(wwwClip), 'site%3Aexample.com');

  // mailtoForClip
  checkContains('mail: text starts with mailto:',
    mod.mailtoForClip(textClip), 'mailto:?subject=');
  checkContains('mail: subject from source.title', mod.mailtoForClip(textClip), 'Foo%20-%20GitHub');
  check('mail: image -> undefined', mod.mailtoForClip(imageClip), undefined);
  check('mail: empty -> undefined', mod.mailtoForClip(emptyClip), undefined);
  // 1500 char body cap
  const giantBody = { id: 'g', kind: 'text', content: 'a'.repeat(3000), source: { title: 'T' } };
  const mailGiant = mod.mailtoForClip(giantBody);
  // 'a'.repeat(1500) URL-encodes to the same length (1500 chars).
  checkContains('mail: body capped at 1500', mailGiant, 'a'.repeat(1500));
  check('mail: body cap drops the rest',
    mailGiant.includes('a'.repeat(1501)), false);

  // markdownLinkForClip
  checkContains('md-link: text uses source url',
    mod.markdownLinkForClip(textClip), '(https://github.com/foo/bar)');
  checkContains('md-link: text uses title as anchor', mod.markdownLinkForClip(textClip), '[Foo - GitHub]');
  checkContains('md-link: link clip uses content',
    mod.markdownLinkForClip(linkClip), '(https://example.com/article)');
  check('md-link: scrubbed text -> undefined', mod.markdownLinkForClip(scrubbedClip), undefined);
  check('md-link: note clip no url -> undefined', mod.markdownLinkForClip(noteClip), undefined);
  // Closing paren escaping
  const parenUrl = { ...textClip, source: { url: 'https://example.com/foo(bar)', title: 'Paren' } };
  checkContains('md-link: escapes closing paren', mod.markdownLinkForClip(parenUrl), '%29');

  // fencedCodeForClip
  checkContains('fence: detects language', mod.fencedCodeForClip(textClip), '```javascript');
  checkContains('fence: wraps body', mod.fencedCodeForClip(textClip), 'function hello()');
  check('fence: image -> undefined', mod.fencedCodeForClip(imageClip), undefined);
  check('fence: empty -> undefined', mod.fencedCodeForClip(emptyClip), undefined);
  // Plain text (non-code) gets empty lang
  const plainClip = { id: 'p', kind: 'text', content: 'just plain words here', source: {} };
  checkContains('fence: plain text -> bare fence', mod.fencedCodeForClip(plainClip), '```\n');

  // buildSendActions matrix
  const textActs = mod.buildSendActions(textClip);
  // json-line was added after json → curl added after url-only →
  // bg-tab added between incognito and site-search → 14 total.
  // Then `note-md` added (15) → `clip-note-md` added (16) →
  // `curl-note` added between `curl` and `fenced-code` (17) →
  // `weight` (chars + words + bytes) appended (18) → `weight-md`
  // (bold-number Markdown variant) appended last (19).
  // Each row is gated by its own availability check so adding new rows
  // here only matters for the total-count assertion.
  total++; if (textActs.length === 19) pass++;
  else console.error('FAIL textActs.length got', textActs.length);

  // The new weight row is present + available for a text clip with a body.
  const weightAct = textActs.find((a) => a.id === 'weight');
  check('actions: weight row present', !!weightAct, true);
  check('actions: weight is a copy row', weightAct && weightAct.kind, 'copy');
  check('actions: weight available for text', weightAct && weightAct.available, true);

  const openAct = textActs.find((a) => a.id === 'open-source');
  check('actions: open-source available for text+url', openAct.available, true);

  const scrubbedActs = mod.buildSendActions(scrubbedClip);
  const openScrub = scrubbedActs.find((a) => a.id === 'open-source');
  check('actions: open-source unavailable for scrubbed', openScrub.available, false);

  const siteScrub = scrubbedActs.find((a) => a.id === 'site-search');
  check('actions: site-search unavailable for scrubbed', siteScrub.available, false);

  const mdScrub = scrubbedActs.find((a) => a.id === 'md-link');
  check('actions: md-link unavailable for scrubbed text', mdScrub.available, false);

  const imageActs = mod.buildSendActions(imageClip);
  const googleImg = imageActs.find((a) => a.id === 'google');
  check('actions: google unavailable for image', googleImg.available, false);

  const fenceImg = imageActs.find((a) => a.id === 'fenced-code');
  check('actions: fence unavailable for image', fenceImg.available, false);

  const openImg = imageActs.find((a) => a.id === 'open-source');
  check('actions: open-source still available for image', openImg.available, true);

  // Link clip — md-link should use content (which IS the URL)
  const linkActs = mod.buildSendActions(linkClip);
  const mdLink = linkActs.find((a) => a.id === 'md-link');
  check('actions: md-link available for link clip', mdLink.available, true);
  checkContains('actions: link md-link uses content url', mdLink.payload, 'https://example.com/article');

  // Note clip (no URL) — copy actions unavailable, fence still works
  const noteActs = mod.buildSendActions(noteClip);
  const openNote = noteActs.find((a) => a.id === 'open-source');
  check('actions: open unavailable for note (no url)', openNote.available, false);

  const fenceNote = noteActs.find((a) => a.id === 'fenced-code');
  check('actions: fence available for note', fenceNote.available, true);

  const mailNote = noteActs.find((a) => a.id === 'email');
  check('actions: email available for note (no URL needed)', mailNote.available, true);

  // --- new in this tick: JSON envelope row ---
  //
  // The envelope is shaped to round-trip through importAll — same fields
  // (clips, version, exportedAt) and an extra "source" marker so we can
  // distinguish a 1-clip send-to from a full export. Image clips work
  // here too because the data URL lives inside content. Empty clips
  // (no body) drop the row entirely so users never copy an envelope
  // with no payload.

  // --- incognito open row ---
  //
  // Mirrors urlForOpenSource availability (no http(s) -> no incognito).
  // Routed by the popup through chrome.windows.create({incognito:true})
  // with a tabs.create fallback when private mode is disabled.

  check('incognito: text+url -> URL', mod.urlForIncognitoOpen(textClip), 'https://github.com/foo/bar');
  check('incognito: scrubbed -> undefined', mod.urlForIncognitoOpen(scrubbedClip), undefined);
  check('incognito: chrome:// -> undefined',
    mod.urlForIncognitoOpen({ ...textClip, source: { url: 'chrome://newtab' } }), undefined);
  check('incognito: data: -> undefined',
    mod.urlForIncognitoOpen({ ...textClip, source: { url: 'data:text/plain;base64,foo' } }), undefined);
  check('incognito: image+url -> URL', mod.urlForIncognitoOpen(imageClip), 'https://imgur.com/foo');
  check('incognito: note (no url) -> undefined', mod.urlForIncognitoOpen(noteClip), undefined);

  const incogText = textActs.find((a) => a.id === 'open-incognito');
  checkTruthy('actions: incognito row exists', incogText);
  check('actions: incognito kind is "incognito"', incogText.kind, 'incognito');
  check('actions: incognito available for text+url', incogText.available, true);
  check('actions: incognito payload matches open-source',
    incogText.payload, textActs.find((a) => a.id === 'open-source').payload);

  const incogScrub = scrubbedActs.find((a) => a.id === 'open-incognito');
  check('actions: incognito unavailable for scrubbed', incogScrub.available, false);

  const incogImg = imageActs.find((a) => a.id === 'open-incognito');
  check('actions: incognito available for image (has url)', incogImg.available, true);

  const incogNote = noteActs.find((a) => a.id === 'open-incognito');
  check('actions: incognito unavailable for note (no url)', incogNote.available, false);

  // Row order: incognito sits right after open-source for muscle memory
  // (open vs open-private side by side).
  check('actions: incognito follows open-source in row order',
    textActs.findIndex((a) => a.id === 'open-incognito') - textActs.findIndex((a) => a.id === 'open-source'),
    1);

  // --- bg-tab (open in background tab) ---
  //
  // Same URL math as urlForOpenSource (no http(s) -> no row), routed
  // through chrome.tabs.create({ active: false }) by the popup so the
  // new tab loads without stealing focus. Useful for triaging multiple
  // link clips in a row (similar-clips panel, citations) without
  // bouncing back to the popup each time.

  check('bg-tab: text+url -> URL', mod.urlForBackgroundTabOpen(textClip), 'https://github.com/foo/bar');
  check('bg-tab: scrubbed -> undefined', mod.urlForBackgroundTabOpen(scrubbedClip), undefined);
  check('bg-tab: chrome:// -> undefined',
    mod.urlForBackgroundTabOpen({ ...textClip, source: { url: 'chrome://newtab' } }), undefined);
  check('bg-tab: data: -> undefined',
    mod.urlForBackgroundTabOpen({ ...textClip, source: { url: 'data:text/plain;base64,foo' } }), undefined);
  check('bg-tab: file: -> undefined',
    mod.urlForBackgroundTabOpen({ ...textClip, source: { url: 'file:///tmp/x.txt' } }), undefined);
  check('bg-tab: image+url -> URL', mod.urlForBackgroundTabOpen(imageClip), 'https://imgur.com/foo');
  check('bg-tab: note (no url) -> undefined', mod.urlForBackgroundTabOpen(noteClip), undefined);

  const bgText = textActs.find((a) => a.id === 'open-bg-tab');
  checkTruthy('actions: bg-tab row exists', bgText);
  check('actions: bg-tab kind is "bg-tab"', bgText.kind, 'bg-tab');
  check('actions: bg-tab available for text+url', bgText.available, true);
  check('actions: bg-tab payload matches open-source',
    bgText.payload, textActs.find((a) => a.id === 'open-source').payload);

  const bgScrub = scrubbedActs.find((a) => a.id === 'open-bg-tab');
  check('actions: bg-tab unavailable for scrubbed', bgScrub.available, false);

  const bgImg = imageActs.find((a) => a.id === 'open-bg-tab');
  check('actions: bg-tab available for image (has url)', bgImg.available, true);

  const bgNote = noteActs.find((a) => a.id === 'open-bg-tab');
  check('actions: bg-tab unavailable for note (no url)', bgNote.available, false);

  // Row order: bg-tab sits right after incognito for muscle memory
  // (open / open-private / open-bg-tab cluster).
  check('actions: bg-tab follows open-incognito in row order',
    textActs.findIndex((a) => a.id === 'open-bg-tab') - textActs.findIndex((a) => a.id === 'open-incognito'),
    1);
  check('actions: open / incognito / bg-tab are first three rows',
    [textActs[0].id, textActs[1].id, textActs[2].id].join(','),
    'open-source,open-incognito,open-bg-tab');

  const json1 = mod.jsonEnvelopeForClip(textClip);
  checkTruthy('json: returns non-empty string for text', json1);
  const parsed1 = JSON.parse(json1);
  check('json: envelope has clips array of length 1', Array.isArray(parsed1.clips) && parsed1.clips.length === 1, true);
  check('json: envelope.source marker', parsed1.source, 'send-to-json');
  check('json: envelope has version field', typeof parsed1.version, 'number');
  check('json: envelope has exportedAt', typeof parsed1.exportedAt, 'number');
  check('json: clip payload has content', parsed1.clips[0].content, 'function hello() {\n  return 42;\n}');

  // Empty clip → undefined
  check('json: empty -> undefined', mod.jsonEnvelopeForClip(emptyClip), undefined);

  // Image clip carries data URL through
  const jsonImg = mod.jsonEnvelopeForClip(imageClip);
  checkTruthy('json: image returns envelope (data URL is content)', jsonImg);
  checkContains('json: image clip preserves data URL', jsonImg, 'data:image/png');

  // `full` override is round-tripped untouched — the popup passes the
  // entire stored ClipItem so the JSON carries hitCount / pinned / tags
  // / hash / archived / template etc. through importAll cleanly.
  const fullClip = {
    id: 'f1',
    kind: 'text',
    content: 'short',
    source: { url: 'https://x.com' },
    full: {
      id: 'f1',
      kind: 'text',
      content: 'short',
      preview: 'short',
      source: { url: 'https://x.com', title: 'X' },
      pinned: true,
      tags: ['extra'],
      createdAt: 1700000000000,
      lastSeenAt: 1700000000000,
      hitCount: 7,
      bytes: 5,
      hash: 'abc123',
      archived: false,
    },
  };
  const jsonFull = mod.jsonEnvelopeForClip(fullClip);
  const parsedFull = JSON.parse(jsonFull);
  check('json: full override carries pinned bit', parsedFull.clips[0].pinned, true);
  check('json: full override carries hitCount', parsedFull.clips[0].hitCount, 7);
  check('json: full override carries hash', parsedFull.clips[0].hash, 'abc123');
  check('json: full override carries tags', Array.isArray(parsedFull.clips[0].tags) && parsedFull.clips[0].tags[0] === 'extra', true);

  // No `full` → fallback shape carries SendableClip fields
  const noFull = { id: 'x', kind: 'text', content: 'hello', source: {} };
  const jsonNoFull = JSON.parse(mod.jsonEnvelopeForClip(noFull));
  check('json: no-full fallback has id', jsonNoFull.clips[0].id, 'x');
  check('json: no-full fallback has content', jsonNoFull.clips[0].content, 'hello');

  // JSON action row
  const jsonAct = textActs.find((a) => a.id === 'json');
  checkTruthy('actions: json row exists', jsonAct);
  check('actions: json kind is "copy"', jsonAct.kind, 'copy');
  check('actions: json available for text', jsonAct.available, true);
  check('actions: json available for image', imageActs.find((a) => a.id === 'json').available, true);
  check('actions: json unavailable for empty', mod.buildSendActions(emptyClip).find((a) => a.id === 'json').available, false);

  // --- raw-text (strip {{tokens}}) ---
  //
  // Returns the body unchanged for template clips so the user can
  // copy the LITERAL template (with token braces intact) — useful
  // for editing the template offline. Hidden for non-template clips
  // since it would duplicate the default Copy action.

  const tmplClip = {
    id: 'tm1',
    kind: 'text',
    content: 'Order #{{uuid}} placed on {{date}} for {{title|customer}}',
    preview: 'Order #...',
    source: { url: 'https://shop.example/orders/123', title: 'Order' },
  };
  // Non-template text clip — should NOT surface the raw-text row.
  const plainText = {
    id: 'p1',
    kind: 'text',
    content: 'just plain text, no tokens here',
    preview: 'just plain text',
    source: { url: 'https://example.com' },
  };

  // The pure builder
  check('raw-text: template body returned untouched',
    mod.rawTextForClip(tmplClip), 'Order #{{uuid}} placed on {{date}} for {{title|customer}}');
  check('raw-text: plain text -> undefined (no tokens)',
    mod.rawTextForClip(plainText), undefined);
  check('raw-text: empty body -> undefined', mod.rawTextForClip(emptyClip), undefined);
  check('raw-text: image -> undefined', mod.rawTextForClip(imageClip), undefined);
  // Edge: tokens with only digits / weird syntax shouldn't match
  check('raw-text: {{ 123 }} not a token -> undefined',
    mod.rawTextForClip({ ...plainText, content: 'price {{ 123 }} only' }), undefined);
  check('raw-text: {{date|fallback}} IS a token -> returns body',
    mod.rawTextForClip({ ...plainText, content: 'when: {{date|today}}' }),
    'when: {{date|today}}');

  // The matrix
  const tmplActs = mod.buildSendActions(tmplClip);
  const plainActs = mod.buildSendActions(plainText);
  const rawTmpl = tmplActs.find((a) => a.id === 'raw-text');
  const rawPlain = plainActs.find((a) => a.id === 'raw-text');
  const rawImg = imageActs.find((a) => a.id === 'raw-text');
  const rawEmpty = mod.buildSendActions(emptyClip).find((a) => a.id === 'raw-text');
  checkTruthy('actions: raw-text row exists in template clip', rawTmpl);
  check('actions: raw-text kind is "copy"', rawTmpl.kind, 'copy');
  check('actions: raw-text available for template clip', rawTmpl.available, true);
  check('actions: raw-text payload preserves tokens',
    rawTmpl.payload, 'Order #{{uuid}} placed on {{date}} for {{title|customer}}');
  check('actions: raw-text unavailable for plain text', rawPlain.available, false);
  check('actions: raw-text unavailable for image', rawImg.available, false);
  check('actions: raw-text unavailable for empty', rawEmpty.available, false);
  // Row order: raw-text sits between fenced-code and json (between
  // the other copy actions). Confirmed so the menu reads as a
  // tight "copy variants" cluster.
  check('actions: raw-text follows fenced-code',
    tmplActs.findIndex((a) => a.id === 'raw-text') - tmplActs.findIndex((a) => a.id === 'fenced-code'),
    1);
  check('actions: raw-text comes before table-row',
    tmplActs.findIndex((a) => a.id === 'table-row') - tmplActs.findIndex((a) => a.id === 'raw-text'),
    1);
  check('actions: table-row comes before json',
    tmplActs.findIndex((a) => a.id === 'json') - tmplActs.findIndex((a) => a.id === 'table-row'),
    1);

  // --- url-only ---
  //
  // "Copy URL only" — bare URL for sharing the page (not the snippet).
  // For link clips, the body IS the URL. For text/image clips, use
  // source.url. Skips clips with no http(s) URL anywhere.

  // Text clip with source URL → returns source.url
  check('url-only: text clip returns source.url',
    mod.urlOnlyForClip({
      id: 'u1', kind: 'text', content: 'snippet body',
      source: { url: 'https://example.com/article' },
    }),
    'https://example.com/article');

  // Image clip with source URL → returns source.url
  check('url-only: image clip returns source.url',
    mod.urlOnlyForClip({
      id: 'u2', kind: 'image', content: 'data:image/png;base64,xxx',
      source: { url: 'https://cdn.example.com/pic.png' },
    }),
    'https://cdn.example.com/pic.png');

  // Link clip → URL is the body, NOT source.url
  check('url-only: link clip returns content (the URL)',
    mod.urlOnlyForClip({
      id: 'u3', kind: 'link', content: 'https://news.ycombinator.com/item?id=1',
      source: { url: 'https://news.ycombinator.com' },
    }),
    'https://news.ycombinator.com/item?id=1');

  // Empty link content → undefined
  check('url-only: empty link content -> undefined',
    mod.urlOnlyForClip({
      id: 'u4', kind: 'link', content: '',
      source: { url: 'https://example.com' },
    }),
    undefined);

  // No source URL at all → undefined (scrubbed clip, note)
  check('url-only: text clip with no source url -> undefined',
    mod.urlOnlyForClip({
      id: 'u5', kind: 'text', content: 'note text', source: {},
    }),
    undefined);

  // Non-http(s) source URL → undefined (data:/file:/chrome:)
  check('url-only: data: URL -> undefined',
    mod.urlOnlyForClip({
      id: 'u6', kind: 'text', content: 'x',
      source: { url: 'data:text/plain,hi' },
    }),
    undefined);
  check('url-only: file: URL -> undefined',
    mod.urlOnlyForClip({
      id: 'u7', kind: 'text', content: 'x',
      source: { url: 'file:///tmp/local.txt' },
    }),
    undefined);
  check('url-only: chrome: URL -> undefined',
    mod.urlOnlyForClip({
      id: 'u8', kind: 'text', content: 'x',
      source: { url: 'chrome://settings' },
    }),
    undefined);

  // Link clip with non-http(s) body → undefined
  check('url-only: link clip with mailto body -> undefined',
    mod.urlOnlyForClip({
      id: 'u9', kind: 'link', content: 'mailto:foo@example.com',
      source: {},
    }),
    undefined);

  // Whitespace-only source url → undefined
  check('url-only: whitespace source url -> undefined',
    mod.urlOnlyForClip({
      id: 'u10', kind: 'text', content: 'x',
      source: { url: '   ' },
    }),
    undefined);

  // The action matrix
  const urlOnlyText = textActs.find((a) => a.id === 'url-only');
  const urlOnlyImg = imageActs.find((a) => a.id === 'url-only');
  const urlOnlyEmpty = mod.buildSendActions(emptyClip).find((a) => a.id === 'url-only');
  checkTruthy('actions: url-only row exists in text clip', urlOnlyText);
  check('actions: url-only kind is "copy"', urlOnlyText.kind, 'copy');
  check('actions: url-only available for text-with-url', urlOnlyText.available, true);
  check('actions: url-only available for image-with-url', urlOnlyImg.available, true);
  // emptyClip has no source url, so unavailable
  check('actions: url-only unavailable for empty (no source url)', urlOnlyEmpty.available, false);
  // Row order: url-only sits between md-link and the new curl row so
  // the URL cluster (md-link → url-only → curl) stays adjacent, then
  // copy-format cluster (fenced-code / raw-text / table-row / json /
  // json-line) follows.
  check('actions: url-only follows md-link',
    textActs.findIndex((a) => a.id === 'url-only') - textActs.findIndex((a) => a.id === 'md-link'),
    1);
  check('actions: curl follows url-only',
    textActs.findIndex((a) => a.id === 'curl') - textActs.findIndex((a) => a.id === 'url-only'),
    1);
  // `curl-note` now slots between curl and fenced-code; fenced-code
  // is 2 rows past curl, 1 row past curl-note.
  check('actions: curl-note follows curl',
    textActs.findIndex((a) => a.id === 'curl-note') - textActs.findIndex((a) => a.id === 'curl'),
    1);
  check('actions: fenced-code follows curl-note',
    textActs.findIndex((a) => a.id === 'fenced-code') - textActs.findIndex((a) => a.id === 'curl-note'),
    1);

  // --- curl row ----------------------------------------------------------
  const curlText = textActs.find((a) => a.id === 'curl');
  const curlImg = imageActs.find((a) => a.id === 'curl');
  const curlLink = linkActs.find((a) => a.id === 'curl');
  const curlScrub = scrubbedActs.find((a) => a.id === 'curl');
  const curlNote = noteActs.find((a) => a.id === 'curl');
  const curlEmpty = mod.buildSendActions(emptyClip).find((a) => a.id === 'curl');
  checkTruthy('actions: curl row exists in text clip', curlText);
  check('actions: curl kind is "copy"', curlText.kind, 'copy');
  check('actions: curl available for text-with-url', curlText.available, true);
  // Image clips with a source URL still get a curl command (you can
  // curl the original image URL — fetches the bytes, useful for save
  // / inspection workflows).
  check('actions: curl available for image-with-url', curlImg.available, true);
  // Link clip uses content (which IS the URL).
  check('actions: curl available for link clip', curlLink.available, true);
  // Scrubbed clip has no URL at all → hidden.
  check('actions: curl unavailable for scrubbed', curlScrub.available, false);
  // Note clip has no URL.
  check('actions: curl unavailable for note (no url)', curlNote.available, false);
  // Empty clip with no source.
  check('actions: curl unavailable for empty (no source url)', curlEmpty.available, false);
  // Payload shape: starts with `curl ` and contains the URL single-quoted.
  checkContains('actions: curl payload starts with "curl "', curlText.payload, 'curl ');
  checkContains('actions: curl payload single-quotes the url',
    curlText.payload, "'https://github.com/foo/bar'");
  check('actions: curl payload is single-line',
    /\r|\n/.test(curlText.payload), false);

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} send-to sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} send-to sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

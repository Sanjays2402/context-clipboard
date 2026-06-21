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
  total++; if (textActs.length === 8) pass++;
  else console.error('FAIL textActs.length got', textActs.length);

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

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} send-to sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} send-to sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

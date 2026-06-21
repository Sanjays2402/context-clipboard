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
  total++; if (textActs.length === 6) pass++;
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

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} send-to sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} send-to sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

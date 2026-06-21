// Sanity: archive bit + is:archived parser semantics.
//
// Bundles src/lib/search.ts via esbuild then probes parseQuery +
// applyQuery against a small fixture. Two big invariants:
//   - default search HIDES archived clips
//   - is:archived FLIPS the polarity (only archived clips surface)

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'ctxclip-archive-'));
try {
  await build({
    entryPoints: ['src/lib/search.ts'],
    bundle: true,
    format: 'esm',
    outfile: join(dir, 'search.mjs'),
    platform: 'neutral',
    target: 'es2022',
    sourcemap: false,
  });
  const mod = await import('file://' + join(dir, 'search.mjs'));

  let pass = 0;
  let total = 0;
  function check(name, got, want) {
    total++;
    if (JSON.stringify(got) === JSON.stringify(want)) pass++;
    else console.error('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want));
  }

  // Fixture: three clips — two regular, one archived.
  const now = Date.now();
  const clips = [
    {
      id: 'a',
      kind: 'text',
      content: 'fresh apple',
      preview: 'fresh apple',
      source: { url: 'https://example.com' },
      pinned: false,
      lastSeenAt: now,
      createdAt: now,
      hitCount: 1,
      tags: ['fruit'],
      bytes: 11,
      hash: 'h1',
    },
    {
      id: 'b',
      kind: 'text',
      content: 'stored banana',
      preview: 'stored banana',
      source: { url: 'https://example.com' },
      pinned: true,
      lastSeenAt: now,
      createdAt: now,
      hitCount: 1,
      tags: ['fruit'],
      bytes: 13,
      hash: 'h2',
      archived: true,
    },
    {
      id: 'c',
      kind: 'text',
      content: 'cold cherry',
      preview: 'cold cherry',
      source: { url: 'https://other.com' },
      pinned: false,
      lastSeenAt: now,
      createdAt: now,
      hitCount: 1,
      tags: ['fruit'],
      bytes: 11,
      hash: 'h3',
      archived: true,
    },
  ];

  // 1. Default (empty) query — archived clips drop out.
  {
    const parsed = mod.parseQuery('');
    check('default: archivedOnly false', parsed.archivedOnly, false);
    const ids = mod.applyQuery(clips, parsed).map((c) => c.id);
    check('default: hides archived', ids.sort(), ['a']);
  }

  // 2. is:archived → only archived clips surface.
  {
    const parsed = mod.parseQuery('is:archived');
    check('is:archived: archivedOnly true', parsed.archivedOnly, true);
    const ids = mod.applyQuery(clips, parsed).map((c) => c.id);
    check('is:archived: surfaces only archived', ids.sort(), ['b', 'c']);
  }

  // 3. is:archived + tag:fruit → both still archived.
  {
    const parsed = mod.parseQuery('is:archived tag:fruit');
    const ids = mod.applyQuery(clips, parsed).map((c) => c.id);
    check('is:archived + tag:fruit', ids.sort(), ['b', 'c']);
  }

  // 4. is:archived + free-text "cherry" → only one match.
  {
    const parsed = mod.parseQuery('is:archived cherry');
    const ids = mod.applyQuery(clips, parsed).map((c) => c.id);
    check('is:archived + cherry', ids, ['c']);
  }

  // 5. is:pinned WITHOUT is:archived → archived pinned clip still hidden.
  {
    const parsed = mod.parseQuery('is:pinned');
    const ids = mod.applyQuery(clips, parsed).map((c) => c.id);
    check('is:pinned hides archived pinned', ids, []);
  }

  // 6. is:archived is:pinned → archived AND pinned both required.
  {
    const parsed = mod.parseQuery('is:archived is:pinned');
    const ids = mod.applyQuery(clips, parsed).map((c) => c.id);
    check('is:archived + is:pinned', ids, ['b']);
  }

  // 7. describeQuery includes "archived" suffix.
  {
    const parsed = mod.parseQuery('is:archived');
    const desc = mod.describeQuery(parsed);
    check('describe: contains archived', desc.includes('archived'), true);
  }

  // 8. Empty / unknown is: value falls through as freeText, archived bit untouched.
  {
    const parsed = mod.parseQuery('is:bogus');
    check('unknown is:* archivedOnly false', parsed.archivedOnly, false);
    check('unknown is:* preserves token', parsed.freeText, 'is:bogus');
  }

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} archive sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} archive sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

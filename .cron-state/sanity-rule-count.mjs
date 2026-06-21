// Sanity: countClipsForRules — per-rule clip-count math.
//
// Bundles src/lib/db.ts via esbuild and probes the pure
// countClipsForRules() helper. No IDB needed because the function
// is pure (rules + clips arrays in, Map out).
//
// We don't run an in-memory IDB shim here because the helper sits
// above the storage layer — the popup feeds it `await listClips()`,
// and we want to verify the FIRST-MATCH-WINS contract holds across
// wildcard + exact + no-match + scrubbed-clip cases.

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'ctxclip-rulecount-'));
try {
  await build({
    entryPoints: ['src/lib/db.ts'],
    bundle: true,
    format: 'esm',
    outfile: join(dir, 'db.mjs'),
    platform: 'neutral',
    target: 'es2022',
    sourcemap: false,
  });
  const mod = await import('file://' + join(dir, 'db.mjs'));

  let pass = 0, total = 0;
  function check(name, got, want) {
    total++;
    if (got === want) pass++;
    else console.error('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want));
  }

  const clip = (id, url) => ({
    id, kind: 'text', content: 'x',
    source: url ? { url } : {},
    pinned: false, tags: [], createdAt: 0, lastSeenAt: 0,
    hitCount: 1, bytes: 1, hash: id,
  });

  // 1) Empty rules -> empty map regardless of clip set
  let counts = mod.countClipsForRules([], [clip('a', 'https://github.com/x')]);
  check('empty rules: map size 0', counts.size, 0);

  // 2) Empty clips -> map exists but every rule sits at 0 (not in map)
  const r1 = { id: 'r1', hostPattern: 'github.com', createdAt: 0 };
  counts = mod.countClipsForRules([r1], []);
  check('empty clips: r1 count', counts.get('r1') || 0, 0);

  // 3) Exact host match
  counts = mod.countClipsForRules([r1], [
    clip('a', 'https://github.com/x'),
    clip('b', 'https://www.github.com/y'), // www stripped by hostFrom -> github.com
    clip('c', 'https://example.com/z'),    // no match
  ]);
  check('exact host: r1 count', counts.get('r1'), 2);

  // 4) Wildcard rule catches subdomains
  const r2 = { id: 'r2', hostPattern: '*.github.com', createdAt: 0 };
  counts = mod.countClipsForRules([r2], [
    clip('a', 'https://github.com/x'),
    clip('b', 'https://docs.github.com/y'),
    clip('c', 'https://api.github.com/z'),
    clip('d', 'https://example.com/w'),
  ]);
  check('wildcard: r2 count includes subdomains', counts.get('r2'), 3);

  // 5) First-match-wins: more specific rule listed FIRST gets its clips,
  //    wildcard fallback catches the rest.
  const r3 = { id: 'r3', hostPattern: 'docs.github.com', createdAt: 0 };
  const r4 = { id: 'r4', hostPattern: '*.github.com', createdAt: 0 };
  counts = mod.countClipsForRules([r3, r4], [
    clip('a', 'https://docs.github.com/x'), // matches r3 first
    clip('b', 'https://api.github.com/y'),  // r3 misses, r4 catches
    clip('c', 'https://github.com/z'),      // r3 misses, r4 catches (apex)
    clip('d', 'https://example.com/w'),     // neither
  ]);
  check('first-match: r3 count', counts.get('r3'), 1);
  check('first-match: r4 count', counts.get('r4'), 2);

  // 6) ORDER MATTERS: same rules with wildcard listed first sweeps every
  //    github.com clip into r4; r3 ends up with zero.
  counts = mod.countClipsForRules([r4, r3], [
    clip('a', 'https://docs.github.com/x'),
    clip('b', 'https://api.github.com/y'),
    clip('c', 'https://github.com/z'),
  ]);
  check('order swap: r3 starved', counts.get('r3') || 0, 0);
  check('order swap: r4 catches all', counts.get('r4'), 3);

  // 7) Clips with no host (notes, scrubbed) don't count toward any rule
  counts = mod.countClipsForRules([r1], [
    clip('note', undefined),         // no URL
    { id: 'scrub', kind: 'text', content: 'x', source: {}, pinned: false, tags: [], createdAt: 0, lastSeenAt: 0, hitCount: 1, bytes: 1, hash: 's' },
    clip('ok', 'https://github.com/'),
  ]);
  check('no-host clips skipped', counts.get('r1'), 1);

  // 8) Bare wildcard "*." is invalid (matchesHostPattern returns false)
  const rBad = { id: 'bad', hostPattern: '*.', createdAt: 0 };
  counts = mod.countClipsForRules([rBad], [
    clip('a', 'https://github.com/'),
  ]);
  check('bare *. wildcard never matches', counts.get('bad') || 0, 0);

  // 9) Map carries only rules that had hits — unused rules stay absent
  //    (caller defaults to 0 via `counts.get(id) || 0`)
  counts = mod.countClipsForRules([r1, r2], [
    clip('a', 'https://github.com/'),
  ]);
  check('hit rule present in map', counts.has('r1'), true);
  check('non-matched rule absent from map (caller defaults)', counts.has('r2'), false);

  // 10) Apex match with leading-www on rule pattern strips to base
  //     ("*.github.com" matches "github.com" — wildcard label is optional
  //     because the implementation falls into "equal to suffix" path).
  const r5 = { id: 'r5', hostPattern: '*.github.com', createdAt: 0 };
  counts = mod.countClipsForRules([r5], [
    clip('a', 'https://github.com/'), // apex, should still match
  ]);
  check('wildcard catches apex', counts.get('r5'), 1);

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} rule-count sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} rule-count sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

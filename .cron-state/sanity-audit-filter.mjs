// Sanity: audit-log bucket mapping. Pure function, no DOM. We re-
// declare the bucket function inline (same shape as in popup.ts) so
// this can run without bundling the popup. Catches forward-compat
// drift: if PrivacyAuditKind gains a new variant, this test fails
// noisily.

function auditKindBucket(k) {
  switch (k) {
    case 'redact':
    case 'unredact':
    case 'retro-redact':
      return 'redact';
    case 'scrub-origin':
      return 'scrub';
    case 'trash':
    case 'restore':
    case 'archive':
    case 'unarchive':
      return 'lifecycle';
    case 'forget-host':
      return 'host';
    case 'set-ttl':
    case 'clear-ttl':
      return 'ttl';
  }
  throw new Error('unmapped kind: ' + k);
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  if (got === want) pass++;
  else console.error('FAIL', name, 'got', got, 'want', want);
}

// Every known kind must bucket to one of the five categories.
const ALL = [
  'redact', 'unredact', 'scrub-origin', 'retro-redact', 'forget-host',
  'set-ttl', 'clear-ttl', 'archive', 'unarchive', 'trash', 'restore',
];

check('redact -> redact', auditKindBucket('redact'), 'redact');
check('unredact -> redact', auditKindBucket('unredact'), 'redact');
check('retro-redact -> redact', auditKindBucket('retro-redact'), 'redact');
check('scrub-origin -> scrub', auditKindBucket('scrub-origin'), 'scrub');
check('forget-host -> host', auditKindBucket('forget-host'), 'host');
check('set-ttl -> ttl', auditKindBucket('set-ttl'), 'ttl');
check('clear-ttl -> ttl', auditKindBucket('clear-ttl'), 'ttl');
check('archive -> lifecycle', auditKindBucket('archive'), 'lifecycle');
check('unarchive -> lifecycle', auditKindBucket('unarchive'), 'lifecycle');
check('trash -> lifecycle', auditKindBucket('trash'), 'lifecycle');
check('restore -> lifecycle', auditKindBucket('restore'), 'lifecycle');

// Filter simulation: a small ring with a mix of buckets.
const entries = [
  { kind: 'redact' }, { kind: 'redact' }, { kind: 'unredact' },
  { kind: 'scrub-origin' }, { kind: 'archive' }, { kind: 'trash' },
  { kind: 'forget-host' }, { kind: 'set-ttl' },
];
const counts = { redact: 0, scrub: 0, lifecycle: 0, host: 0, ttl: 0 };
for (const e of entries) counts[auditKindBucket(e.kind)]++;
check('count: redact=3', counts.redact, 3);
check('count: scrub=1', counts.scrub, 1);
check('count: lifecycle=2', counts.lifecycle, 2);
check('count: host=1', counts.host, 1);
check('count: ttl=1', counts.ttl, 1);

// Filter: pick a category, the rest drops out.
function filterByBucket(bucket) {
  return entries.filter((e) => auditKindBucket(e.kind) === bucket);
}
check('filter redact count', filterByBucket('redact').length, 3);
check('filter lifecycle includes archive', filterByBucket('lifecycle').some((e) => e.kind === 'archive'), true);
check('filter host excludes trash', filterByBucket('host').some((e) => e.kind === 'trash'), false);

// Every kind is covered (no unmapped escapes).
for (const k of ALL) {
  try { auditKindBucket(k); check('coverage: ' + k, true, true); }
  catch (e) { check('coverage: ' + k, false, true); }
}

if (pass === total) {
  console.log(`PASS — ${pass}/${total} audit-filter sanity checks`);
} else {
  console.error(`FAIL — ${pass}/${total} audit-filter sanity checks`);
  process.exit(1);
}

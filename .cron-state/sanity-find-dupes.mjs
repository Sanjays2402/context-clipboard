// Sanity: findDuplicateGroups() shape + ordering.
//
// Replays the grouping logic in-process so we can validate the
// largest-first ordering, pinnedInGroup OR, totalHits sum, and the
// survivor-first member order without spinning up IDB.

function findDuplicateGroupsSync(clips) {
  const byHash = new Map();
  for (const c of clips) {
    if (!c.hash) continue;
    const arr = byHash.get(c.hash);
    if (arr) arr.push(c);
    else byHash.set(c.hash, [c]);
  }
  const groups = [];
  for (const [hash, members] of byHash) {
    if (members.length < 2) continue;
    members.sort(
      (a, b) =>
        (b.lastSeenAt || 0) - (a.lastSeenAt || 0) ||
        (b.createdAt || 0) - (a.createdAt || 0),
    );
    let pinnedInGroup = false;
    let totalHits = 0;
    for (const m of members) {
      if (m.pinned) pinnedInGroup = true;
      totalHits += m.hitCount || 1;
    }
    groups.push({ hash, members, pinnedInGroup, totalHits });
  }
  groups.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      (b.members[0]?.lastSeenAt || 0) - (a.members[0]?.lastSeenAt || 0),
  );
  return groups;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// 1. Empty + single-member hashes → no groups.
{
  const g = findDuplicateGroupsSync([
    { id: "a", hash: "h1", lastSeenAt: 1 },
    { id: "b", hash: "h2", lastSeenAt: 2 },
  ]);
  check("no-groups: length", g.length, 0);
}

// 2. Survivor = most-recently-seen.
{
  const g = findDuplicateGroupsSync([
    { id: "old", hash: "h", lastSeenAt: 100, createdAt: 100, hitCount: 1, pinned: false },
    { id: "new", hash: "h", lastSeenAt: 500, createdAt: 200, hitCount: 1, pinned: false },
    { id: "mid", hash: "h", lastSeenAt: 300, createdAt: 150, hitCount: 1, pinned: false },
  ]);
  check("survivor: groups", g.length, 1);
  check("survivor: first member id", g[0].members[0].id, "new");
  check("survivor: second member id", g[0].members[1].id, "mid");
  check("survivor: third member id", g[0].members[2].id, "old");
}

// 3. pinnedInGroup OR: any pinned member flips the flag.
{
  const g = findDuplicateGroupsSync([
    { id: "a", hash: "h", lastSeenAt: 2, hitCount: 1, pinned: false },
    { id: "b", hash: "h", lastSeenAt: 1, hitCount: 1, pinned: true },
  ]);
  check("pinned: flag", g[0].pinnedInGroup, true);
  check("pinned: totalHits", g[0].totalHits, 2);
}

// 4. Largest-group-first ordering across multiple groups.
{
  const g = findDuplicateGroupsSync([
    // small group (2)
    { id: "s1", hash: "small", lastSeenAt: 10, hitCount: 1 },
    { id: "s2", hash: "small", lastSeenAt: 11, hitCount: 1 },
    // big group (4)
    { id: "b1", hash: "big", lastSeenAt: 1, hitCount: 1 },
    { id: "b2", hash: "big", lastSeenAt: 2, hitCount: 1 },
    { id: "b3", hash: "big", lastSeenAt: 3, hitCount: 1 },
    { id: "b4", hash: "big", lastSeenAt: 4, hitCount: 1 },
  ]);
  check("order: count", g.length, 2);
  check("order: biggest first", g[0].hash, "big");
  check("order: smaller second", g[1].hash, "small");
}

// 5. hitCount sum across multiple members.
{
  const g = findDuplicateGroupsSync([
    { id: "a", hash: "h", lastSeenAt: 1, hitCount: 3 },
    { id: "b", hash: "h", lastSeenAt: 2, hitCount: 5 },
    { id: "c", hash: "h", lastSeenAt: 3, hitCount: 7 },
  ]);
  check("hitCount: sum", g[0].totalHits, 15);
}

// 6. Tie on group-size → tie-break on freshness of survivor.
{
  const g = findDuplicateGroupsSync([
    { id: "x1", hash: "x", lastSeenAt: 100, hitCount: 1 },
    { id: "x2", hash: "x", lastSeenAt: 99, hitCount: 1 },
    { id: "y1", hash: "y", lastSeenAt: 200, hitCount: 1 },
    { id: "y2", hash: "y", lastSeenAt: 199, hitCount: 1 },
  ]);
  check("tie: y first (newer survivor)", g[0].hash, "y");
  check("tie: x second", g[1].hash, "x");
}

// 7. Missing hash → group skipped entirely.
{
  const g = findDuplicateGroupsSync([
    { id: "a", lastSeenAt: 1 },
    { id: "b", lastSeenAt: 2 },
    { id: "c", hash: "real", lastSeenAt: 3, hitCount: 1 },
    { id: "d", hash: "real", lastSeenAt: 4, hitCount: 1 },
  ]);
  check("no-hash skipped: groups", g.length, 1);
  check("no-hash skipped: real survives", g[0].hash, "real");
}

if (pass === total) {
  console.log(`PASS — ${pass}/${total} find-dupes sanity checks`);
} else {
  console.error(`FAIL — ${pass}/${total} find-dupes sanity checks`);
  process.exit(1);
}

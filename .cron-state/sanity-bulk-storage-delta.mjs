// Sanity: sumClipBytes + formatBytes + buildStorageDeltaLabel.
//
// Inline copies of src/lib/bulk-storage-delta.ts. Covers the bytes
// reducer (defensive against undefined/NaN/Infinity/negative bytes),
// the formatBytes B/KB/MB/GB tiers, and the label composer with its
// "no-show on 0 bytes" guard.

function sumClipBytes(clips) {
  let total = 0;
  for (const c of clips) {
    const b = c.bytes;
    if (typeof b !== "number") continue;
    if (!Number.isFinite(b)) continue;
    if (b <= 0) continue;
    total += b;
  }
  return total;
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.floor(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function buildStorageDeltaLabel(clips) {
  const bytes = sumClipBytes(clips);
  if (bytes <= 0) return null;
  return `Free ${formatBytes(bytes)}`;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. sumClipBytes happy + defensive --------------------------------
check("sum: empty array = 0", sumClipBytes([]), 0);
check("sum: single clip", sumClipBytes([{ bytes: 100 }]), 100);
check("sum: three clips", sumClipBytes([{ bytes: 10 }, { bytes: 20 }, { bytes: 30 }]), 60);
check("sum: skips undefined bytes",
  sumClipBytes([{ bytes: 100 }, { bytes: undefined }, { bytes: 50 }]),
  150);
check("sum: skips missing bytes field",
  sumClipBytes([{ bytes: 100 }, {}, { bytes: 50 }]),
  150);
check("sum: skips string bytes (non-number)",
  sumClipBytes([{ bytes: 100 }, { bytes: "200" }, { bytes: 50 }]),
  150);
check("sum: skips null bytes",
  sumClipBytes([{ bytes: 100 }, { bytes: null }, { bytes: 50 }]),
  150);
check("sum: skips NaN", sumClipBytes([{ bytes: 100 }, { bytes: NaN }, { bytes: 50 }]), 150);
check("sum: skips Infinity",
  sumClipBytes([{ bytes: 100 }, { bytes: Infinity }, { bytes: 50 }]),
  150);
check("sum: skips negative bytes (defensive)",
  sumClipBytes([{ bytes: 100 }, { bytes: -50 }, { bytes: 50 }]),
  150);
check("sum: skips zero bytes (zero contributes nothing)",
  sumClipBytes([{ bytes: 100 }, { bytes: 0 }, { bytes: 50 }]),
  150);
check("sum: large mixed (real-world-ish)",
  sumClipBytes([
    { bytes: 1024 }, { bytes: 2048 }, { bytes: 512 },
    { bytes: undefined }, { bytes: 4096 },
  ]),
  7680);

// --- 2. formatBytes tiers ---------------------------------------------
check("format: 0 → '0 B'", formatBytes(0), "0 B");
check("format: 1 → '1 B'", formatBytes(1), "1 B");
check("format: 742 → '742 B'", formatBytes(742), "742 B");
check("format: 1023 → '1023 B' (just under KB)", formatBytes(1023), "1023 B");
check("format: 1024 → '1.0 KB'", formatBytes(1024), "1.0 KB");
check("format: 1536 → '1.5 KB'", formatBytes(1536), "1.5 KB");
check("format: 1024*1023 just under MB → KB",
  formatBytes(1024 * 1023),
  "1023.0 KB");
check("format: 1 MB", formatBytes(1024 * 1024), "1.0 MB");
check("format: 4.2 MB",
  formatBytes(Math.round(4.2 * 1024 * 1024)),
  "4.2 MB");
check("format: 1 GB", formatBytes(1024 * 1024 * 1024), "1.00 GB");
check("format: 1.07 GB",
  formatBytes(Math.round(1.07 * 1024 * 1024 * 1024)),
  "1.07 GB");
check("format: negative → '0 B'", formatBytes(-100), "0 B");
check("format: NaN → '0 B'", formatBytes(NaN), "0 B");
check("format: Infinity → '0 B'", formatBytes(Infinity), "0 B");
check("format: fractional bytes get floor'd",
  formatBytes(742.7), "742 B");

// --- 3. buildStorageDeltaLabel ----------------------------------------
check("label: empty → null", buildStorageDeltaLabel([]), null);
check("label: all-zero → null", buildStorageDeltaLabel([{ bytes: 0 }, { bytes: 0 }]), null);
check("label: all-missing → null",
  buildStorageDeltaLabel([{}, {}, { bytes: undefined }]),
  null);
check("label: positive bytes",
  buildStorageDeltaLabel([{ bytes: 1024 * 1024 * 4.2 }]),
  "Free 4.2 MB");
check("label: small KB",
  buildStorageDeltaLabel([{ bytes: 2048 }]),
  "Free 2.0 KB");
check("label: very small B",
  buildStorageDeltaLabel([{ bytes: 50 }, { bytes: 100 }]),
  "Free 150 B");
check("label: mixed defensive → still computes from valid bytes",
  buildStorageDeltaLabel([
    { bytes: 1024 }, { bytes: undefined }, { bytes: -100 }, { bytes: 1024 },
  ]),
  "Free 2.0 KB");
check("label: GB tier",
  buildStorageDeltaLabel([{ bytes: 1024 * 1024 * 1024 * 2.5 }]),
  "Free 2.50 GB");

// --- 4. Realistic clip shapes (matches ClipItem) ----------------------
const realisticClips = [
  { id: "c1", kind: "text", bytes: 256, pinned: false },
  { id: "c2", kind: "image", bytes: Math.floor(1024 * 1024 * 3.4), pinned: false },
  { id: "c3", kind: "link", bytes: 128, pinned: true },
  { id: "c4", kind: "text", bytes: 512, pinned: false },
];
const realisticTotal = sumClipBytes(realisticClips);
check("realistic: sum matches manual math",
  realisticTotal,
  256 + Math.floor(1024 * 1024 * 3.4) + 128 + 512,
);
check("realistic: label MB tier",
  buildStorageDeltaLabel(realisticClips),
  `Free ${formatBytes(realisticTotal)}`,
);

// --- 5. Single tier consistency with popup.ts formatBytes -------------
// (The popup has an inline formatBytes that this module mirrors. The
// label MUST match what the storage panel would show for the same
// byte count, otherwise a user comparing the two would be confused.)
check("consistency: 12,345 B → KB form",
  formatBytes(12_345),
  "12.1 KB",
);
check("consistency: 12.5 MB",
  formatBytes(Math.round(12.5 * 1024 * 1024)),
  "12.5 MB",
);

console.log(`bulk-storage-delta sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);

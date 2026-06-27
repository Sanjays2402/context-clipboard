// Sanity: settings density-preview model (lib/density-preview).
//
// The Row-density control pairs with a live preview swatch — stub clip
// rows rendered at the chosen density so the abstract dropdown choice is
// concrete. This tick adds a 4th IMAGE stub row carrying `image: true`,
// so the swatch shows the thumb-shrink (42->28px) compact buys, not just
// the text tightening. This harness exercises the pure row model + the
// class/caption mappings (inline copies, bundler-free).
//
// Coverage:
//   1. four stub rows, last one is the image row.
//   2. exactly ONE image row; the first three are text (no image flag).
//   3. every row has non-empty title/meta/tag.
//   4. densityPreviewClass mapping (comfortable base / cozy / compact /
//      unknown -> comfortable).
//   5. densityPreviewCaption names the density.

function normalise(d) {
  return d === "cozy" || d === "compact" ? d : "comfortable";
}
function densityPreviewRows() {
  return [
    { title: "useEffect cleanup pattern", meta: "github.com - 2m ago", tag: "code" },
    { title: "Standup notes - shipping Friday", meta: "notion.so - 1h ago", tag: "work" },
    { title: "https://news.ycombinator.com", meta: "link - yesterday", tag: "read" },
    { title: "Screenshot - dashboard mock", meta: "figma.com - 2d ago", tag: "design", image: true },
  ];
}
function densityPreviewClass(d) {
  const den = normalise(d);
  return den === "comfortable" ? "density-preview" : `density-preview density-preview--${den}`;
}
function densityPreviewCaption(d) {
  const den = normalise(d);
  switch (den) {
    case "compact":
      return "Compact - tightest rows, tags hidden, ~30+ per screen";
    case "cozy":
      return "Cozy - trimmer rows, keeps the tag row and full thumb";
    case "comfortable":
    default:
      return "Comfortable - the roomy default, full spacing";
  }
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

const rows = densityPreviewRows();

// 1. four rows, last is the image row
ck("four stub rows", rows.length, 4);
ck("last row is the image row", rows[3].image === true, true);

// 2. exactly one image row; first three are text
const imageRows = rows.filter((r) => r.image === true);
ck("exactly one image row", imageRows.length, 1);
ck("row 0 is not an image", !rows[0].image, true);
ck("row 1 is not an image", !rows[1].image, true);
ck("row 2 is not an image", !rows[2].image, true);

// 3. every row has non-empty content
let allFilled = true;
for (const r of rows) {
  if (!r.title || !r.meta || !r.tag) allFilled = false;
}
ck("every row has title/meta/tag", allFilled, true);

// 4. class mapping
ck("comfortable -> base class", densityPreviewClass("comfortable"), "density-preview");
ck("cozy -> cozy modifier", densityPreviewClass("cozy"), "density-preview density-preview--cozy");
ck("compact -> compact modifier", densityPreviewClass("compact"), "density-preview density-preview--compact");
ck("unknown -> comfortable base", densityPreviewClass("bogus"), "density-preview");
ck("null -> comfortable base", densityPreviewClass(null), "density-preview");

// 5. captions name the density
ck("compact caption mentions compact", densityPreviewCaption("compact").toLowerCase().includes("compact"), true);
ck("cozy caption mentions cozy", densityPreviewCaption("cozy").toLowerCase().includes("cozy"), true);
ck("comfortable caption mentions comfortable", densityPreviewCaption("comfortable").toLowerCase().includes("comfortable"), true);

console.log(`density-preview sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
